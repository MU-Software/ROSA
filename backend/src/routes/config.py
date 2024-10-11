import fastapi
import src.dependencies as deps
import src.models as models
import src.utils.hals as hals

router = fastapi.APIRouter(prefix="/config")


@router.put(path="/session-state")
def set_session_config(session: deps.lockedSessionInfoDI, payload: models.SessionStateConfig) -> models.SessionState:
    """세션 설정 API"""
    session.state = session.state.model_copy(update=payload.model_dump())
    return session.state


@router.put(path="/shop-domain")
async def set_shop_domain_config(app_state: deps.lockedAppStateDI, payload: models.ShopAPIConfig) -> models.AppState:
    """상점 API 설정 API"""
    if app_state.shop_api.domain != payload.domain:
        for session in app_state.sessions.values():
            session.state.order = None
            session.state.handled_order = []
    app_state.shop_api = payload
    return app_state


@router.get(path="/shop-domain/check-connectivity")
async def check_connectivity(app_state: deps.appStateQuerierDI) -> dict[str, bool]:
    """상점 API 연결 확인 API"""
    return {"status": await app_state.shop_api.can_communicate()}


@router.get(path="/devices/possibles")
async def list_possible_devices(app_state: deps.appStateQuerierDI) -> list[models.USBDevice]:
    """등록 가능한 장치 목록 조회 API"""
    used_block_paths: list[str] = []
    for s in app_state.sessions.values():
        device_list: list[models.USBDevice] = [d for d in (s.state.printer, s.state.reader) if d]
        for d in device_list:
            used_block_paths.append(d.block_path)
    return [models.USBDevice(**d) for d in hals.list_usb_devices() if d["block_path"] not in used_block_paths]
