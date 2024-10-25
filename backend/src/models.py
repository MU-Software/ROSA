from __future__ import annotations

import asyncio
import contextlib
import datetime
import http
import itertools
import pathlib
import typing
import uuid

import fastapi
import httpx
import playwright.async_api
import pydantic
import src.utils.hals.printers.escp as escp_utils
import src.utils.hals.printers.tspl as tspl_utils
import src.utils.renderers.html_renderer as html_renderer
import src.utils.stdlibs.str_utils as str_utils

DeskStatus = typing.Literal["idle", "registering", "closed", "automated"]
PaymentHistoryStatus = typing.Literal["pending", "completed", "partial_refunded", "refunded"]
OrderProductStatus = typing.Literal["pending", "paid", "used", "refunded"]
PrinterCmdType = typing.Literal["ESCP", "TSPL"]

SESSION_REFRESH_REQUIRED_DELTA = datetime.timedelta(seconds=30)
SESSION_EXPIRED_DELTA = datetime.timedelta(minutes=5)

PRINTER_SUPPORTS: dict[PrinterCmdType, type] = {
    "TSPL": tspl_utils.TSPL,
    "ESCP": escp_utils.ESCP,
}


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

    async def get_rendered_nameplate_label_image(
        self,
        browser: playwright.async_api.Browser,
        additional_context: dict[str, str],
    ) -> bytes:
        # TODO: FIXME: 지금이야 단건 주문만 가능하지만, 만약 여러 상품을 한번에 주문할 수 있는 경우 수정 필요
        ticket_opr = self.products[0]
        user_name = ticket_opr.get_option_by_name("성함").custom_response or ""
        user_org = ticket_opr.get_option_by_name("소속").custom_response or ""
        template_path_str = (
            "src/templates/nameplate_label_for_volunteer.html"
            if user_org == "자원봉사자"
            else "src/templates/nameplate_label.html"
        )
        return html_renderer.image_to_bw(
            image=await html_renderer.render_html(
                browser=browser,
                template=pathlib.Path(template_path_str).read_text(),
                context={
                    "user_name": user_name,
                    "user_org": user_org,
                    "qrcode_data": str_utils.uuid_to_b64(self.id),
                }
                | additional_context,
                element="#container",
            )
        )

    def _get_exchange_ticket_label_images_coroutine(
        self,
        browser: playwright.async_api.Browser,
        additional_context: dict[str, str],
    ) -> list[typing.Awaitable[bytes]]:
        contexts = itertools.chain.from_iterable(
            [
                [
                    {
                        "option_name": o.product_option_group.name,
                        "option_value": o.product_option.name or o.custom_response or "",
                        "qrcode_data": str_utils.uuid_to_b64(self.id),
                    }
                    | additional_context
                    for o in opr.options
                    if o.product_option and o.product_option.additional_price > 0
                ]
                for opr in self.products
            ]
        )
        return [
            html_renderer.render_html(
                browser=browser,
                template=pathlib.Path("src/templates/exchange_ticket_label.html").read_text(),
                context=context,
                element="#container",
            )
            for context in contexts
        ]

    async def get_rendered_exchange_ticket_label_images(
        self,
        browser: playwright.async_api.Browser,
        additional_context: dict[str, str],
    ) -> list[bytes]:
        images = await asyncio.gather(*self._get_exchange_ticket_label_images_coroutine(browser, additional_context))
        return [html_renderer.image_to_bw(image=image) for image in images]

    async def get_all_rendered_label_images(
        self,
        browser: playwright.async_api.Browser,
        additional_context: dict[str, str],
    ) -> list[bytes]:
        return [
            html_renderer.image_to_bw(image=image)
            for image in await asyncio.gather(
                self.get_rendered_nameplate_label_image(browser, additional_context),
                *self._get_exchange_ticket_label_images_coroutine(browser, additional_context),
            )
        ]


class USBDevice(pydantic.BaseModel):
    bus: int
    device: int
    block_path: str
    cdc_path: str
    name: str
    serial_number: str | None = None

    model_config = pydantic.ConfigDict(frozen=True)


class Printer(USBDevice, pydantic.BaseModel):
    class Label(pydantic.BaseModel):
        width: int = 960  # px
        height: int = 410  # px

    cmd_type: PrinterCmdType = "ESCP"
    label: Label = pydantic.Field(default_factory=Label)

    @property
    def driver(self) -> type[tspl_utils.TSPL | escp_utils.ESCP]:
        return PRINTER_SUPPORTS[self.cmd_type]

    def print_image(self, image: bytes) -> None:
        driver_ctx = self.driver()
        with driver_ctx as driver:
            with driver.page as page:
                page.write_image(image=image)
        driver_ctx.print(self.cdc_path)


class SessionStateConfig(pydantic.BaseModel):
    automated: bool = False
    print_priced_option_label: bool = False


class SessionState(SessionStateConfig, pydantic.BaseModel):
    id: uuid.UUID = pydantic.Field(default_factory=uuid.uuid4)
    desk_status: DeskStatus = "closed"

    order: OrderDTO | None = None
    handled_order: list[OrderDTO] = pydantic.Field(default_factory=list)

    commit_id: uuid.UUID = pydantic.Field(default_factory=uuid.uuid4)
    app: AppState | None = pydantic.Field(default=None, exclude=True)

    reader: USBDevice | None = None
    printer: Printer | None = None

    @pydantic.computed_field  # type: ignore[misc]
    @property
    def app_state(self) -> dict:
        return (self.app or AppState()).model_dump(mode="json", exclude={"sessions"})

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
            response = await client.request(**(SHOP_V1_API_MAP["search"](query=query_params)))
            response.raise_for_status()
            return [OrderDTO.model_validate(order) for order in response.json()]

    async def get_order(self, order_id: str) -> OrderDTO:
        async with self.client as client:
            response = await client.request(**(SHOP_V1_API_MAP["retrieve"](order_id=order_id)))
            response.raise_for_status()
            return OrderDTO.model_validate(response.json())

    async def modify_order(self, order_id: str, data: OrderModifyRequestDTO) -> OrderDTO:
        async with self.client as client:
            response = await client.request(
                **(SHOP_V1_API_MAP["modify"](order_id=order_id)),
                json=data.model_dump(exclude_none=True, exclude_unset=True, exclude_defaults=True, mode="json"),
            )
            response.raise_for_status()
            return OrderDTO.model_validate(response.json())

    async def refund_order(self, order_id: str, otp: str) -> None:
        async with self.client as client:
            response = await client.request(**(SHOP_V1_API_MAP["refund"](order_id=order_id, query={"otp": otp})))
            response.raise_for_status()
            return None


class SessionInfo(pydantic.BaseModel):
    ping_at: datetime.datetime = pydantic.Field(default_factory=datetime.datetime.now)
    state: SessionState


class AppState(pydantic.BaseModel):
    shop_api: ShopAPIConfig = pydantic.Field(default_factory=ShopAPIConfig)
    sessions: dict[uuid.UUID, SessionInfo] = pydantic.Field(default_factory=dict)

    @pydantic.model_validator(mode="after")
    def validate(self) -> typing.Self:
        for session in self.sessions.values():
            session.state.app = self
        return self

    def create_session(self) -> SessionInfo:
        session_info = SessionInfo(state=SessionState(app=self))
        self.sessions[session_info.state.id] = session_info
        return session_info
