import asyncio
import contextlib
import datetime
import uuid

import fastapi
import src.dependencies as deps
import src.models as models
import src.redis_client as redis_client

router = fastapi.APIRouter(prefix="")


async def is_websocket_connected(websocket: fastapi.WebSocket) -> bool:
    with contextlib.suppress(fastapi.WebSocketDisconnect, RuntimeError):
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(websocket.receive_bytes(), timeout=0.01)
        return True
    return False


@router.websocket(path="/ws")
async def ws_subscriber(websocket: fastapi.WebSocket, redis_cli: deps.redisDI, session_id: deps.sessionIDDI) -> None:
    if not session_id:
        raise fastapi.HTTPException(status_code=fastapi.status.HTTP_401_UNAUTHORIZED)

    pubsub = redis_cli.pubsub()
    await pubsub.subscribe(redis_client.RedisKey.PUBSUB_CHANNEL)
    await websocket.accept()

    commit_id: uuid.UUID | None = None
    with contextlib.suppress(Exception):
        while await is_websocket_connected(websocket):
            # 아래의 경우에 클라이언트로 session_info.state를 전송합니다.
            # 1. PubSub 메시지가 있을 때
            # 2. 마지막으로 메시지를 보낸지 30초가 지났을 때
            # 3. 마지막으로 보낸 메시지의 commit_id와 쿼리한 commit_id가 다를 때
            should_broadcast = True if await pubsub.get_message(ignore_subscribe_messages=True, timeout=1) else False
            async with deps.locked_session_info_context(
                redis_cli=redis_cli,
                session_id=session_id,
                used_as_dependency=False,
                broadcast=False,  # 여기서 broadcast를 하게되면 항상 PubSub 메시지가 있게 되므로, 여기서는 broadcast를 하지 않습니다.
            ) as session_info:
                if (
                    not should_broadcast
                    and session_info.ping_at + models.SESSION_REFRESH_REQUIRED_DELTA > datetime.datetime.now()
                    and commit_id == session_info.state.commit_id
                ):
                    continue

                # commit_id는 실제로 정보를 수정하는 곳에서만 변경해야 하므로, 여기서는 commit_id를 변경하지 않습니다.
                session_info.ping_at = datetime.datetime.now()
                commit_id = session_info.state.commit_id
                await websocket.send_json(session_info.state.model_dump(mode="json"))

    # Unsubscribe from PubSub Channel
    await pubsub.unsubscribe(redis_client.RedisKey.PUBSUB_CHANNEL)

    with contextlib.suppress(RuntimeError):
        await websocket.close()
