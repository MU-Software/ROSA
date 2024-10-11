import contextlib
import datetime
import http
import logging
import traceback
import typing
import uuid

import fastapi
import playwright.async_api
import pydantic
import redis.asyncio as aioredis
import src.models as models
import src.redis_client as redis_client
import src.utils.stdlibs.str_utils as str_utils

logger = logging.getLogger(__name__)


async def browser(request: fastapi.Request = None, websocket: fastapi.WebSocket = None) -> playwright.async_api.Browser:
    fastapi_app: fastapi.FastAPI = request.app if request else websocket.app
    return fastapi_app.state.browser


browserDI = typing.Annotated[playwright.async_api.Browser, fastapi.Depends(browser)]


async def redis_session_di(request: fastapi.Request = None, websocket: fastapi.WebSocket = None) -> aioredis.Redis:
    fastapi_app: fastapi.FastAPI = request.app if request else websocket.app
    redis_cli: redis_client.RedisClient = fastapi_app.state.redis_client
    return await redis_cli.async_session


redisDI = typing.Annotated[aioredis.Redis, fastapi.Depends(redis_session_di)]


async def get_session_id(
    x_session_id: typing.Annotated[str | None, fastapi.Header()] = None,
    session_id: typing.Annotated[str | None, fastapi.Query()] = None,
) -> uuid.UUID | None:
    if sid := x_session_id or session_id:
        if not str_utils.UUID_REGEX.match(sid):
            raise fastapi.HTTPException(status_code=http.HTTPStatus.UNAUTHORIZED)
        return uuid.UUID(sid)
    return None


sessionIDDI = typing.Annotated[uuid.UUID | None, fastapi.Depends(get_session_id)]


async def query_app_state(redis_cli: redisDI) -> models.AppState:
    with contextlib.suppress(pydantic.ValidationError):
        json_data = await redis_cli.get(redis_client.RedisKey.PUBSUB_CHANNEL)
        return models.AppState.model_validate_json(json_data)
    return models.AppState()


appStateQuerierDI = typing.Annotated[models.AppState, fastapi.Depends(query_app_state)]


async def query_session(app: appStateQuerierDI, session_id: sessionIDDI) -> models.SessionInfo:
    if session := app.sessions.get(session_id):
        return session
    raise fastapi.HTTPException(status_code=http.HTTPStatus.UNAUTHORIZED)


sessionInfoQuerierDI = typing.Annotated[models.SessionInfo, fastapi.Depends(query_session)]


async def get_and_commit_app_state_with_lock(
    redis_cli: redisDI,
    used_as_dependency: bool = True,
    broadcast: bool = True,
) -> typing.AsyncGenerator[models.AppState, None]:
    async with redis_cli.lock(redis_client.RedisKey.APP_STATE_WRITE_LOCK):
        app_state = await query_app_state(redis_cli=redis_cli)
        try:
            yield app_state
        except Exception as e:
            logger.error(f"Error occurred while processing app state\n{''.join(traceback.format_exception(e))}")
            if used_as_dependency:
                raise
        finally:
            result = app_state.model_dump_json()
            await redis_cli.set(redis_client.RedisKey.PUBSUB_CHANNEL, result)
            if broadcast:
                await redis_cli.publish(redis_client.RedisKey.PUBSUB_CHANNEL, result)


locked_app_state_context = contextlib.asynccontextmanager(get_and_commit_app_state_with_lock)
lockedAppStateDI = typing.Annotated[models.AppState, fastapi.Depends(get_and_commit_app_state_with_lock)]


async def get_and_commit_session_info_with_lock(
    redis_cli: redisDI,
    session_id: sessionIDDI,
    used_as_dependency: bool = True,
    broadcast: bool = True,
) -> typing.AsyncGenerator[models.SessionInfo, None]:
    async with locked_app_state_context(redis_cli=redis_cli, broadcast=broadcast) as app_state:
        if not (session_info := app_state.sessions.get(session_id)):
            raise fastapi.HTTPException(status_code=http.HTTPStatus.UNAUTHORIZED)
        try:
            yield session_info
        except Exception as e:
            logger.error(f"Error occurred while processing session info\n{''.join(traceback.format_exception(e))}")
            if used_as_dependency:
                raise
        finally:
            if broadcast:
                session_info.state.commit_id = uuid.uuid4()
                session_info.ping_at = datetime.datetime.now()


locked_session_info_context = contextlib.asynccontextmanager(get_and_commit_session_info_with_lock)
lockedSessionInfoDI = typing.Annotated[models.SessionInfo, fastapi.Depends(get_and_commit_session_info_with_lock)]
