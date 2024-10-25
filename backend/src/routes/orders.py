import asyncio
import datetime
import http
import io
import logging
import traceback

import fastapi
import httpx
import PIL.Image
import src.dependencies as deps
import src.models as models
import src.utils.stdlibs.str_utils as str_utils

logger = logging.getLogger(__name__)
router = fastapi.APIRouter(prefix="/session/my/order")
WAITING_TIME = datetime.timedelta(seconds=6)


@router.put(path="")
async def set_session_order(session: deps.lockedSessionInfoDI, order_id: str | None = None) -> models.SessionState:
    """세션 주문정보 정보 설정 API"""
    session.state.order = await session.state.app.shop_api.get_order(order_id=order_id) if order_id else None
    return session.state


@router.get(path="")
async def search_order(app_state: deps.appStateQuerierDI, custom_responses: str | None = None) -> list[models.OrderDTO]:
    """주문 정보 검색 API"""
    return await app_state.shop_api.search_orders(keywords=(custom_responses or "").split(","))


@router.patch(path="")
async def modify_order(session: deps.lockedSessionInfoDI, payload: models.OrderModifyRequestDTO) -> models.SessionState:
    """주문 정보 수정 API"""
    session.state.check_order_available()
    session.state.order = await session.state.app.shop_api.modify_order(order_id=session.state.order.id, data=payload)
    return session.state


@router.delete(path="")
async def refund_order(session: deps.lockedSessionInfoDI, otp: str | None = None) -> models.SessionState:
    """주문 정보 환불 API"""
    session.state.check_order_available()

    if not (isinstance(otp, str) and otp.isdigit()):
        raise fastapi.exceptions.HTTPException(status_code=http.HTTPStatus.UNAUTHORIZED, detail="OTP는 필수입니다.")

    try:
        await session.state.app.shop_api.refund_order(order_id=session.state.order.id, otp=otp)
    except httpx.HTTPStatusError as e:
        return fastapi.Response(status_code=e.response.status_code, content=e.response.text.encode("utf-8"))
    session.state.order = await session.state.app.shop_api.get_order(order_id=session.state.order.id)
    return session.state


@router.put(path="/automated")
async def handle_automated_session_order(
    redis_cli: deps.redisDI,
    session: deps.sessionInfoQuerierDI,
    browser: deps.browserDI,
    order_id: str | None = None,
) -> models.SessionState:
    """세션에 주문정보를 설정할 시 라벨을 출력하고 주문을 해제하는 API"""
    state = session.state

    if not (order_id and str_utils.UUID_REGEX.match(order_id)):
        raise fastapi.exceptions.HTTPException(
            status_code=http.HTTPStatus.UNPROCESSABLE_ENTITY, detail="order_id는 필수입니다."
        )

    order_data = await state.app.shop_api.get_order(order_id=order_id)
    async with deps.locked_session_info_context(
        redis_cli=redis_cli, session_id=state.id, used_as_dependency=False
    ) as tmp_session:
        tmp_session.state.order = state.order = order_data
        # TODO: FIXME: 지금이야 단건 주문만 가능하지만, 만약 여러 상품을 한번에 주문할 수 있는 경우 수정 필요
        ticket_opr = order_data.products[0]
        if order_data.current_status not in ("completed", "partial_refunded") or ticket_opr.status != "paid":
            tmp_session.state.automated = False

    async with deps.locked_session_info_context(
        redis_cli=redis_cli, session_id=state.id, used_as_dependency=False
    ) as tmp_session:
        # TODO: FIXME: 지금이야 단건 주문만 가능하지만, 만약 여러 상품을 한번에 주문할 수 있는 경우 수정 필요
        tmp_session.state.order = state.order = await session.state.app.shop_api.modify_order(
            order_id=session.state.order.id,
            data=models.OrderModifyRequestDTO(products=[{"id": state.order.products[0].id, "status": "used"}]),
        )

    start_time = datetime.datetime.now()
    ctx = state.printer.label.model_dump(mode="json") if state.printer else {"width": "960", "height": "410"}
    images: list[bytes]
    if state.print_priced_option_label:
        images = await state.order.get_all_rendered_label_images(browser, ctx)
    else:
        images = [await state.order.get_rendered_nameplate_label_image(browser, ctx)]

    for image_bytes in images:
        with io.BytesIO(image_bytes) as image_io:
            if printer := state.printer:
                try:
                    printer.print_image(image=PIL.Image.open(image_io))
                except Exception as e:
                    logger.error("Failed to print label:\n", traceback.format_exception(e))

    end_time = datetime.datetime.now()
    took_time = end_time - start_time
    await asyncio.sleep((WAITING_TIME - took_time).seconds)

    async with deps.locked_session_info_context(
        redis_cli=redis_cli, session_id=state.id, used_as_dependency=False
    ) as tmp_session:
        tmp_session.state.order = None
        return tmp_session.state
