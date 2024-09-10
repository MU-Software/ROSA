import fastapi
import pydantic
from src.dependencies import committerDI, querierDI
from src.models import AppState, Config, Devices
from src.utils.hals import list_usb_devices, retrieve_usb_devices

router = fastapi.APIRouter(prefix="/config")


@router.put(path="/domain")
async def set_config(state: querierDI, committer: committerDI, payload: Config.ShopAPIConfig) -> AppState:
    """상점 API 설정 API"""
    if state.shop_api.domain != payload.domain:
        state.order = None
        state.handled_order = []
    state.shop_api = payload
    return await committer(state)


@router.get(path="/domain/check-connectivity")
async def check_connectivity(state: querierDI) -> dict[str, bool]:
    """상점 API 연결 확인 API"""
    return {"status": await state.shop_api.can_communicate()}


class SetDeviceRequestDTO(pydantic.BaseModel):
    reader_names: list[str] = pydantic.Field(default_factory=list)
    printer_names: list[str] = pydantic.Field(default_factory=list)

    @pydantic.computed_field  # type: ignore[misc]
    @property
    def printers(self) -> list[Devices.USBDevice]:
        return [Devices.USBDevice(**d) for d in retrieve_usb_devices(self.printer_names)]

    @pydantic.computed_field  # type: ignore[misc]
    @property
    def readers(self) -> list[Devices.USBDevice]:
        return [Devices.USBDevice(**d) for d in retrieve_usb_devices(self.reader_names)]


@router.put(path="/devices")
async def set_devices(state: querierDI, committer: committerDI, payload: SetDeviceRequestDTO) -> AppState:
    """장치 정보 설정 API"""
    state.readers = payload.readers
    state.printers = payload.printers
    return await committer(state)


@router.get(path="/devices/possibles")
async def list_possible_devices(state: querierDI) -> list[Devices.USBDevice]:
    """등록 가능한 장치 목록 조회 API"""
    registered_names: list[str] = [device.name for device in state.readers + state.printers]
    return [Devices.USBDevice(**d) for d in list_usb_devices() if d["name"] not in registered_names]
