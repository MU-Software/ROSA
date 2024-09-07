from __future__ import annotations

import contextlib
import http
import typing
import uuid

import fastapi
import httpx
import pydantic

DeskStatus = typing.Literal["idle", "registering", "closed"]
PaymentHistoryStatus = typing.Literal["pending", "completed", "partial_refunded", "refunded"]
OrderProductStatus = typing.Literal["pending", "paid", "used", "refunded"]


class APIDef(pydantic.BaseModel):
    method: typing.Literal["GET", "POST", "PATCH", "DELETE"]
    path: str

    def __call__(self, **kwargs: str | dict[str, str]) -> dict:
        path = self.path.format(**kwargs)
        if "query" in kwargs and isinstance(kwargs["query"], dict):
            path += "?" + "&".join(f"{key}={value}" for key, value in kwargs["query"].items())
        return {"method": self.method, "url": path}


SHOP_V1_API_MAP = {
    "search": APIDef(method="GET", path=""),
    "retrieve": APIDef(method="GET", path="{order_id}/"),
    "modify": APIDef(method="PATCH", path="{order_id}/"),
    "refund": APIDef(method="DELETE", path="{order_id}/"),
}


class OrderModifyRequestDTO(pydantic.BaseModel):
    class OrderProductRelationModify(pydantic.BaseModel):
        class OrderProductOptionRelationModify(pydantic.BaseModel):
            id: pydantic.UUID4
            custom_response: str

        id: pydantic.UUID4
        status: OrderProductStatus | None = None
        options: list[OrderProductOptionRelationModify] = pydantic.Field(default_factory=list)

    products: list[OrderProductRelationModify]


class OrderDTO(pydantic.BaseModel):
    class PaymentHistoryDTO(pydantic.BaseModel):
        status: PaymentHistoryStatus
        price: int
        created_at: str

    class OrderProductRelationDTO(pydantic.BaseModel):
        class OrderProductOptionRelationDTO(pydantic.BaseModel):
            class OptionGroupDTO(pydantic.BaseModel):
                id: pydantic.UUID4
                name: str
                is_custom_response: bool
                custom_response_pattern: str | None

            class OptionDTO(pydantic.BaseModel):
                id: pydantic.UUID4
                name: str
                additional_price: int

            id: pydantic.UUID4
            product_option_group: OptionGroupDTO
            product_option: OptionDTO | None
            custom_response: str | None

        class ProductDTO(pydantic.BaseModel):
            id: pydantic.UUID4
            name: str
            price: int

        id: pydantic.UUID4
        price: int
        donation_price: int
        status: OrderProductStatus
        product: ProductDTO
        options: list[OrderProductOptionRelationDTO]

        def get_option_by_name(self, name: str) -> OrderProductOptionRelationDTO | None:
            for option in self.options:
                if option.product_option_group.name == name:
                    return option

            return None

    class UserDTO(pydantic.BaseModel):
        id: int
        username: str
        email: str

    id: pydantic.UUID4
    first_paid_price: int
    first_paid_at: str
    current_paid_price: int
    current_status: PaymentHistoryStatus
    payment_histories: list[PaymentHistoryDTO]
    products: list[OrderProductRelationDTO]
    user: UserDTO

    def __eq__(self, other: object) -> bool:
        return self.id == other.id if isinstance(other, OrderDTO) else False


class Devices(pydantic.BaseModel):
    class USBDevice(pydantic.BaseModel):
        bus: int
        device: int
        block_path: str
        name: str

    readers: list[USBDevice] = pydantic.Field(default_factory=list)
    printers: list[USBDevice] = pydantic.Field(default_factory=list)


class Config(pydantic.BaseModel):
    class ShopAPIConfig(pydantic.BaseModel):
        api_key: str = "registration_desk"
        api_secret: str = "api_key_registration_desk"
        domain: pydantic.HttpUrl = "http://localhost:8000"

        @property
        def client(self) -> httpx.AsyncClient:
            return httpx.AsyncClient(
                base_url=str(self.domain), headers={"X-API-KEY": self.api_key, "X-API-SECRET": self.api_secret}
            )

        async def can_communicate(self) -> bool:
            with contextlib.suppress(httpx.HTTPError):
                async with self.client as client:
                    return (await client.request(**(SHOP_V1_API_MAP["search"]()))).is_success
            return False

        async def search_orders(self, keywords: typing.Iterable[str]) -> list[OrderDTO]:
            async with self.client as client:
                query_params: dict[str, str] = {"custom_responses": ",".join(keywords)}
                response: httpx.Response = await client.request(**(SHOP_V1_API_MAP["search"](query=query_params)))
                response.raise_for_status()
                return [OrderDTO.model_validate(order) for order in response.json()]

        async def get_order(self, order_id: str) -> OrderDTO:
            async with self.client as client:
                response: httpx.Response = await client.request(**(SHOP_V1_API_MAP["retrieve"](order_id=order_id)))
                response.raise_for_status()
                return OrderDTO.model_validate(response.json())

        async def modify_order(self, order_id: str, data: OrderModifyRequestDTO) -> OrderDTO:
            async with self.client as client:
                response: httpx.Response = await client.request(
                    **(SHOP_V1_API_MAP["modify"](order_id=order_id)),
                    json=data.model_dump(exclude_none=True, exclude_unset=True, exclude_defaults=True, mode="json"),
                )
                response.raise_for_status()
                return OrderDTO.model_validate(response.json())

        async def refund_order(self, order_id: str, otp: str) -> None:
            async with self.client as client:
                response: httpx.Response = await client.request(
                    **(SHOP_V1_API_MAP["refund"](order_id=order_id, query={"otp": otp}))
                )
                response.raise_for_status()
                return None

    shop_api: ShopAPIConfig = ShopAPIConfig()


class AppState(Devices, Config, pydantic.BaseModel):
    desk_status: DeskStatus = "closed"

    order: OrderDTO | None = None
    handled_order: list[OrderDTO] = pydantic.Field(default_factory=list)

    commit_id: uuid.UUID = pydantic.Field(default_factory=uuid.uuid4)

    CONFIG_COLUMNS: typing.ClassVar[set[str]] = {"shop_api", "reader", "printer"}

    @pydantic.model_validator(mode="after")
    def validate_model_after(self) -> typing.Self:
        if not self.order:
            if self.desk_status == "registering":
                self.desk_status = "idle"
            return self

        if self.order in self.handled_order:
            self.handled_order.remove(self.order)
        self.handled_order.append(self.order)
        self.desk_status = "registering"
        return self

    def check_order_available(self) -> None:
        status_code = http.HTTPStatus.UNPROCESSABLE_ENTITY
        if not self.order:
            raise fastapi.HTTPException(status_code=status_code, detail="주문 정보가 없습니다.")
        if not self.order.products:
            raise fastapi.HTTPException(status_code=status_code, detail="상품 정보가 없습니다.")
