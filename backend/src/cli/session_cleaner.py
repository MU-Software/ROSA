import datetime
import logging
import os
import time
import typing

import pydantic
import src.models as models
import src.redis_client as redis_client

logging.basicConfig(level=os.environ.get("LOGLEVEL", "INFO").upper())
logger = logging.getLogger(__name__)


def session_cleaner(redis_dsn: str | None = None) -> None:
    redis_dsn = redis_dsn or os.getenv("REDIS_DSN") or "redis://localhost:6379/0"

    redis_session = redis_client.RedisClient(dsn=redis_dsn).sync_session
    logger.info("Session cleaner started.")
    while True:
        time.sleep(30)
        with redis_session.lock(redis_client.RedisKey.APP_STATE_WRITE_LOCK):
            logger.info("Lock acquired.")
            try:
                app_state_data = redis_session.get(redis_client.RedisKey.PUBSUB_CHANNEL)
                app_state = models.AppState.model_validate_json(app_state_data)
            except pydantic.ValidationError:
                logger.info("Failed to validate app state.")
                continue

            if not (
                expired_session_ids := [
                    sid
                    for sid, info in app_state.sessions.items()
                    if info.ping_at + models.SESSION_EXPIRED_DELTA < datetime.datetime.now()
                ]
            ):
                logger.info("No sessions to clean.")
                continue

            for sid in expired_session_ids:
                del app_state.sessions[sid]

            redis_session.set(redis_client.RedisKey.PUBSUB_CHANNEL, app_state.model_dump_json())
            redis_session.publish(redis_client.RedisKey.PUBSUB_CHANNEL, app_state.model_dump_json())
            logger.info(f"Cleaned {len(expired_session_ids)} sessions.")
        logger.info("Lock released.")


cli_patterns: list[typing.Callable] = [session_cleaner]
