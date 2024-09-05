import contextlib
import typing
import uuid

import fastapi
import playwright.async_api
import pydantic
import redis.asyncio as aioredis
import src.models as models
import src.redis_client as redis_client


async def browser(request: fastapi.Request = None, websocket: fastapi.WebSocket = None) -> playwright.async_api.Browser:
    fastapi_app: fastapi.FastAPI = request.app if request else websocket.app
    return fastapi_app.state.browser


browserDI = typing.Annotated[playwright.async_api.Browser, fastapi.Depends(browser)]


async def redis_session_di(request: fastapi.Request = None, websocket: fastapi.WebSocket = None) -> aioredis.Redis:
    fastapi_app: fastapi.FastAPI = request.app if request else websocket.app
    redis_cli: redis_client.RedisClient = fastapi_app.state.redis_client
    return await redis_cli.async_session


redisDI = typing.Annotated[aioredis.Redis, fastapi.Depends(redis_session_di)]


async def commit(redis_cli: aioredis.Redis, state: models.AppState) -> models.AppState:
    result = state.model_dump_json()
    await redis_cli.set(redis_client.RedisKey.PUBSUB_CHANNEL, result)
    await redis_cli.publish(redis_client.RedisKey.PUBSUB_CHANNEL, result)
    return state


async def committer(redis_cli: redisDI) -> typing.Callable[[models.AppState], typing.Awaitable[models.AppState]]:
    async def _commit(state: models.AppState) -> models.AppState:
        state.commit_id = uuid.uuid4()
        return await commit(redis_cli=redis_cli, state=state)

    return _commit


async def querier(redis_cli: redisDI) -> models.AppState:
    with contextlib.suppress(pydantic.ValidationError):
        state_json = await redis_cli.get(redis_client.RedisKey.PUBSUB_CHANNEL)
        return models.AppState.model_validate_json(json_data=state_json)
    return await (await committer(redis_cli=redis_cli))(state=models.AppState())


committerDI = typing.Annotated[typing.Callable[[models.AppState], models.AppState], fastapi.Depends(committer)]
querierDI = typing.Annotated[models.AppState, fastapi.Depends(querier)]
