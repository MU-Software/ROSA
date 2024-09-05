import asyncio
import contextlib

import fastapi
import pydantic
import redis.asyncio.client as aioredis_client
from src.dependencies import querier, redisDI
from src.models import AppState
from src.redis_client import RedisKey

router = fastapi.APIRouter(prefix="")


async def is_websocket_connected(websocket: fastapi.WebSocket) -> bool:
    with contextlib.suppress(fastapi.WebSocketDisconnect):
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(websocket.receive_bytes(), timeout=0.01)
        return True
    return False


@router.websocket(path="/ws")
async def ws_session_status(websocket: fastapi.WebSocket, redis_cli: redisDI) -> None:
    """현재 상태 조회 Websocket API"""
    pubsub_client: aioredis_client.PubSub = redis_cli.pubsub()
    await pubsub_client.subscribe(RedisKey.PUBSUB_CHANNEL)
    await websocket.accept()

    with contextlib.suppress(fastapi.WebSocketDisconnect):
        while await is_websocket_connected(websocket):
            if (msg := await pubsub_client.get_message(ignore_subscribe_messages=True, timeout=1)) and msg[
                "type"
            ] == "message":
                with contextlib.suppress(pydantic.ValidationError):
                    msg = AppState.model_validate_json(json_data=msg["data"])
                    await websocket.send_json(msg.model_dump(mode="json"))
            else:
                await websocket.send_json(data=(await querier(redis_cli=redis_cli)).model_dump(mode="json"))

    await pubsub_client.unsubscribe(RedisKey.PUBSUB_CHANNEL)
    with contextlib.suppress(RuntimeError):
        await websocket.close()
