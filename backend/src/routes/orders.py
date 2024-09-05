import http

import fastapi
import httpx
from src.dependencies import committerDI, querierDI
from src.models import AppState, OrderDTO, OrderModifyRequestDTO

router = fastapi.APIRouter(prefix="/session/order")


@router.put(path="")
async def set_session_order(state: querierDI, committer: committerDI, order_id: str | None = None) -> AppState:
    """세션 주문정보 정보 설정 API"""
    state.order = await state.shop_api.get_order(order_id=order_id) if order_id else None
    return await committer(state)


@router.get(path="")
async def search_order(state: querierDI, custom_responses: str | None = None) -> list[OrderDTO]:
    """주문 정보 검색 API"""
    return await state.shop_api.search_orders(keywords=(custom_responses or "").split(","))


@router.patch(path="")
async def modify_order(state: querierDI, committer: committerDI, payload: OrderModifyRequestDTO) -> AppState:
    """주문 정보 수정 API"""
    state.check_order_available()
    state.order = await state.shop_api.modify_order(order_id=state.order.id, data=payload)
    return await committer(state)


@router.delete(path="")
async def refund_order(state: querierDI, committer: committerDI, otp: str | None = None) -> AppState:
    """주문 정보 환불 API"""
    state.check_order_available()

    if not (isinstance(otp, str) and otp.isdigit()):
        raise fastapi.exceptions.HTTPException(status_code=http.HTTPStatus.UNAUTHORIZED, detail="OTP는 필수입니다.")

    try:
        await state.shop_api.refund_order(order_id=state.order.id, otp=otp)
    except httpx.HTTPStatusError as e:
        return fastapi.Response(status_code=e.response.status_code, content=e.response.text.encode("utf-8"))
    state.order = await state.shop_api.get_order(order_id=state.order.id)
    return await committer(state)
