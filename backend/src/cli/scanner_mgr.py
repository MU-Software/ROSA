import contextlib
import functools
import logging
import multiprocessing as mp
import traceback
import typing

import httpx
import pydantic
import redis
import redis.exceptions
import src.models as models
import src.redis_client as redis_client
import src.utils.hals.readers.qrcode_serial as qrcode_serial
import src.utils.stdlibs.str_utils as str_utils

logger = logging.getLogger(__name__)
processes: dict[models.Devices.USBDevice, mp.Process] = {}
ERROR_MSG_DIVIDER = "==================== Error while scanning QR code ({}) ====================\n"


def print_exc(e: Exception) -> None:
    logger.warning(f"{ERROR_MSG_DIVIDER.format(e.__class__.__name__)}{''.join(traceback.format_exception(e))}")


def set_session_order(shortened_order_id: str, port: int) -> None:
    try:
        order_id = shortened_order_id
        if not str_utils.UUID_REGEX.match(shortened_order_id):
            order_id = str_utils.b64_to_uuid(shortened_order_id)

        print(f"Order ID: {order_id}")
        httpx.put(url=f"http://localhost:{port}/session/order?order_id={order_id}")
    except Exception as e:
        print_exc(e)


def qr_scanner_handler(usb_dev: models.Devices.USBDevice, port: int) -> None:
    try:
        callback = functools.partial(set_session_order, port=port)
        device = qrcode_serial.SerialInfo(port=usb_dev.cdc_path)
        device.retrieve_and_exec(callback=callback)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print_exc(e)


def scanner_manager(redis_dsn: str, port: int = 8000) -> None:
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
                for reader, process in list(processes.items()):
                    if reader not in msg.readers:
                        if process.is_alive():
                            process.terminate()
                        del processes[reader]

                for reader in msg.readers:
                    if reader not in processes:
                        processes[reader] = mp.Process(target=qr_scanner_handler, args=(reader, port))
                        processes[reader].start()

                for reader, process in list(processes.items()):
                    if not process.is_alive():
                        del processes[reader]
                        msg.readers.remove(reader)
                        redis_session.set(redis_client.RedisKey.PUBSUB_CHANNEL, msg.model_dump_json())
        except redis.exceptions.ConnectionError as e:
            print(f"Redis connection error: {e}")
        except KeyboardInterrupt:
            for process in processes.values():
                process.terminate()
        finally:
            pubsub.unsubscribe(redis_client.RedisKey.PUBSUB_CHANNEL)


cli_patterns: list[typing.Callable] = [scanner_manager]
