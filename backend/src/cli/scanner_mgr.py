import base64
import contextlib
import logging
import multiprocessing as mp
import traceback
import typing
import uuid

import httpx
import pydantic
import redis
import redis.exceptions
import src.models as models
import src.redis_client as redis_client
import src.utils.hals.readers.qrcode_serial as qrcode_serial

logger = logging.getLogger(__name__)
processes: dict[str, mp.Process] = {}
ERROR_MSG_DIVIDER = "==================== Error while scanning QR code ({}) ====================\n"


def print_exc(e: Exception) -> None:
    logger.warning(f"{ERROR_MSG_DIVIDER.format(e.__class__.__name__)}{traceback.format_exception(e)}")


def b64_to_uuid(in_str: str) -> uuid.UUID:
    in_str += "=" * (4 - len(in_str) % 4)
    return uuid.UUID(bytes=base64.urlsafe_b64decode(in_str + "=="))


def set_session_order(shortened_order_id: str) -> None:
    httpx.put(url=f"http://localhost:28000/session/order?order_id={b64_to_uuid(shortened_order_id)}")


def qr_scanner_handler(block_path: str) -> None:
    try:
        device = qrcode_serial.SerialInfo(port=block_path)
        device.retrieve_and_exec(callback=set_session_order)
    except Exception as e:
        print_exc(e)


def scanner_manager(redis_dsn: str) -> None:
    redis_cli: redis_client.RedisClient = redis_client.RedisClient(dsn=redis_dsn)
    with redis_cli.sync_session as redis_session:
        pubsub = redis_session.pubsub(ignore_subscribe_messages=True)
        try:
            pubsub.subscribe(redis_client.RedisKey.PUBSUB_CHANNEL)
            prev_msg: models.AppState | None = None
            while True:
                msg: models.AppState | None = None
                if (msg := pubsub.get_message(ignore_subscribe_messages=True, timeout=1)) and msg["type"] == "message":
                    with contextlib.suppress(pydantic.ValidationError):
                        msg = models.AppState.model_validate_json(json_data=msg["data"])
                else:
                    try:
                        state_json = redis_session.get(redis_client.RedisKey.PUBSUB_CHANNEL)
                        msg = models.AppState.model_validate_json(json_data=state_json)
                    except pydantic.ValidationError:
                        msg = models.AppState()

                if prev_msg == msg:
                    continue

                prev_msg = msg
                for cdc_path, process in processes.items():
                    if cdc_path not in [d.cdc_path for d in msg.readers] and process.is_alive():
                        process.join()
                        del processes[cdc_path]

                for reader in msg.readers:
                    if reader.cdc_path not in processes:
                        processes[reader.cdc_path] = mp.Process(target=qr_scanner_handler, args=(reader.cdc_path,))
                        processes[reader.cdc_path].start()
        except redis.exceptions.ConnectionError as e:
            print(f"Redis connection error: {e}")
        finally:
            pubsub.unsubscribe(redis_client.RedisKey.PUBSUB_CHANNEL)


cli_patterns: list[typing.Callable] = [scanner_manager]
