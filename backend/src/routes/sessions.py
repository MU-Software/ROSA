import datetime
import pathlib

import fastapi
import fastapi.exceptions
import pydantic
import src.dependencies as deps
import src.models as models
import src.utils.hals as hals

router = fastapi.APIRouter(prefix="/session")


@router.get(path="")
async def get_sessions(app_state: deps.appStateQuerierDI) -> list[models.SessionState]:
    """세션 목록 조회 API"""
    return [info.state for info in app_state.sessions.values()]


@router.post(path="")
async def create_session(app_state: deps.lockedAppStateDI, session_id: deps.sessionIDDI) -> models.SessionState:
    """
    세션 생성 API
    만약 session_id가 주어진 상황에서 세션이 존재하고, 세션 만료까지 남은 시간이 15초 이상이라면 기존 세션을 반환하고, 그 외에는 새 세션을 생성합니다.
    """
    expire_threshold = datetime.datetime.now() - models.SESSION_EXPIRED_DELTA + models.SESSION_REFRESH_REQUIRED_DELTA
    if session_id and (s := app_state.sessions.get(session_id)) and s.ping_at > expire_threshold:
        return s.state
    return app_state.create_session().state


@router.get(path="/my")
async def get_my_session(session: deps.sessionInfoQuerierDI) -> models.SessionState:
    """내 세션 정보 조회 API"""
    return session.state


@router.put(path="/my/desk")
async def set_my_desk_status(
    session: deps.lockedSessionInfoDI, status: models.DeskStatus | None
) -> models.SessionState:
    """데스크 상태 설정 API"""
    if not status:
        raise fastapi.exceptions.ValidationException(errors=["Desk status is required."])

    if session.state.order:
        if status != "registering":
            session.state.order = None
            session.state.desk_status = status
    else:
        session.state.desk_status = status if status != "registering" else "idle"

    return session.state


class SetDeviceRequestPayload(pydantic.BaseModel):
    cdc_path: pydantic.FilePath

    @pydantic.field_validator("cdc_path", mode="before")
    @classmethod
    def validate_cdc_path(cls, v: pathlib.Path) -> pathlib.Path:
        if not hals.retrieve_usb_device(v.as_posix()):
            raise pydantic.ValidationError("CDC path must be a block device.")
        return v

    def as_model(self) -> models.USBDevice:
        return models.USBDevice(**hals.retrieve_usb_device(self.cdc_path.as_posix()))


class SetPrinterRequestPayload(SetDeviceRequestPayload, pydantic.BaseModel):
    cmd_mode: models.PrinterCmdType

    def as_model(self) -> models.Printer:
        return models.Printer(**hals.retrieve_usb_device(self.cdc_path.as_posix()), cmd_type=self.cmd_mode)


@router.put(path="/my/devices/reader")
async def register_reader(session: deps.lockedSessionInfoDI, payload: SetDeviceRequestPayload) -> models.SessionState:
    """QR코드 리더기 정보 설정 API"""
    session.state.reader = payload.as_model()
    return session.state


@router.delete(path="/my/devices/reader")
async def unregister_reader(session: deps.lockedSessionInfoDI) -> models.SessionState:
    """QR코드 리더기 정보 해제 API"""
    session.state.reader = None
    return session.state


@router.put(path="/my/devices/printer")
async def register_printer(session: deps.lockedSessionInfoDI, payload: SetPrinterRequestPayload) -> models.SessionState:
    """프린터 정보 설정 API"""
    session.state.printer = payload.as_model()
    return session.state


@router.delete(path="/my/devices/printer")
async def unregister_printer(session: deps.lockedSessionInfoDI) -> models.SessionState:
    """프린터 정보 해제 API"""
    session.state.printer = None
    return session.state
