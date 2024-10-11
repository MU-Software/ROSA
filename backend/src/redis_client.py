import logging
import typing

import pydantic
import redis
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)


class RedisKey:
    APP_STATE_WRITE_LOCK = "app_state_write_lock"
    PUBSUB_CHANNEL = "global_status"


class RedisClient(pydantic.BaseModel):
    dsn: pydantic.RedisDsn
    sync_connection_pool: redis.ConnectionPool = pydantic.Field(default=None, validate_default=True)
    async_connection_pool: aioredis.ConnectionPool = pydantic.Field(default=None, validate_default=True)

    model_config = pydantic.ConfigDict(arbitrary_types_allowed=True)

    @pydantic.field_validator("sync_connection_pool", mode="before")
    @classmethod
    def set_sync_connection_pool(cls, value: None, info: pydantic.ValidationInfo) -> redis.ConnectionPool:
        return redis.ConnectionPool.from_url(url=str(info.data["dsn"]))

    @pydantic.field_validator("async_connection_pool", mode="before")
    @classmethod
    def set_async_connection_pool(cls, value: None, info: pydantic.ValidationInfo) -> aioredis.ConnectionPool:
        return aioredis.ConnectionPool.from_url(url=str(info.data["dsn"]))

    @pydantic.model_validator(mode="after")
    def validate_connection(self) -> typing.Self:
        with redis.Redis(connection_pool=self.sync_connection_pool) as client:
            client.ping()
            logger.info("Redis connection established")
        return self

    async def close(self) -> None:
        self.sync_connection_pool.disconnect(inuse_connections=True)
        await self.async_connection_pool.disconnect(inuse_connections=True)
        logger.info("Redis connection closed")

    @property
    def async_session(self) -> aioredis.Redis:
        return aioredis.Redis(connection_pool=self.async_connection_pool)

    @property
    def sync_session(self) -> redis.Redis:
        return redis.Redis(connection_pool=self.sync_connection_pool)
