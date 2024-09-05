import fastapi
import fastapi.exceptions
from src.dependencies import committerDI, querierDI
from src.models import AppState, DeskStatus

router = fastapi.APIRouter(prefix="/session")


@router.get(path="")
async def get_session(state: querierDI, committer: committerDI) -> AppState:
    """세션 정보 조회 API"""
    return await committer(state)


@router.delete(path="")
async def clear_session(state: querierDI, committer: committerDI) -> AppState:
    """세션 정보 초기화 API"""
    new_state = AppState(**state.model_dump(include=state.CONFIG_COLUMNS))
    return await committer(new_state)


@router.put(path="/desk")
async def set_desk_status(state: querierDI, committer: committerDI, status: DeskStatus | None = None) -> AppState:
    """데스크 상태 설정 API"""
    if not status:
        raise fastapi.exceptions.ValidationException(errors=["Desk status is required."])

    if state.order:
        if status != "registering":
            state.order = None
            state.desk_status = status
    else:
        state.desk_status = status if status != "registering" else "idle"

    return await committer(state)
