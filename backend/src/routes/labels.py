import base64
import http
import io
import logging
import traceback

import fastapi
import PIL.Image
import src.dependencies as deps
import src.models as models
import src.utils.hals.printers.escp as escp_utils
import src.utils.hals.printers.tspl as tspl_utils

PRINTER_SUPPORTS: dict[models.PrinterCmdType, type] = {
    "TSPL": tspl_utils.TSPL,
    "ESCP": escp_utils.ESCP,
}

logger = logging.getLogger(__name__)
router = fastapi.APIRouter(prefix="/label")


@router.get(
    path="/preview",
    responses={
        http.HTTPStatus.OK: {"description": "출력될 이미지 목록 데이터"},
        http.HTTPStatus.UNPROCESSABLE_ENTITY: {"description": "고객 정보가 없습니다."},
        http.HTTPStatus.INTERNAL_SERVER_ERROR: {"description": "미리보기 생성 중 오류가 발생했습니다."},
    },
)
async def preview_labels(session_info: deps.sessionInfoQuerierDI, browser: deps.browserDI) -> list[str]:
    """라벨 출력 미리보기 API"""
    session_info.state.check_order_available()

    additional_context = {"width": "960", "height": "410"}
    if session_info.state.printer:
        additional_context.update(session_info.state.printer.label.model_dump(mode="json"))

    images: list[bytes]
    if session_info.state.print_priced_option_label:
        images = await session_info.state.order.get_all_rendered_label_images(browser, additional_context)
    else:
        images = [await session_info.state.order.get_rendered_nameplate_label_image(browser, additional_context)]

    return [base64.b64encode(image).decode("utf-8") for image in images]


@router.post(path="/print")
async def print_label(session_info: deps.sessionInfoQuerierDI, browser: deps.browserDI) -> models.AppState:
    """라벨 출력 API"""
    session_info.state.check_order_available()

    additional_context = {"width": "960", "height": "410"}
    if session_info.state.printer:
        additional_context.update(session_info.state.printer.label.model_dump(mode="json"))

    images: list[bytes]
    if session_info.state.print_priced_option_label:
        images = await session_info.state.order.get_all_rendered_label_images(browser, additional_context)
    else:
        images = [await session_info.state.order.get_rendered_nameplate_label_image(browser, additional_context)]

    for image_bytes in images:
        with io.BytesIO(image_bytes) as image_io:
            if printer := session_info.state.printer:
                try:
                    printer.print_image(image=PIL.Image.open(image_io))
                except Exception as e:
                    logger.error("Failed to print label:\n", traceback.format_exception(e))

    return session_info
