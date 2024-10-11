import contextlib
import functools
import logging
import multiprocessing as mp
import os
import traceback
import typing

import httpx
import src.models as models
import src.redis_client as redis_client
import src.utils.hals.readers.qrcode_serial as qrcode_serial
import src.utils.stdlibs.str_utils as str_utils

logger = logging.getLogger(__name__)
processes: dict[models.USBDevice, mp.Process] = {}
ERROR_MSG_DIVIDER = "==================== Error while scanning QR code ({}) ====================\n"


def print_exc(e: Exception) -> None:
    logger.warning(f"{ERROR_MSG_DIVIDER.format(e.__class__.__name__)}{''.join(traceback.format_exception(e))}")


def set_session_order(shortened_order_id: str, port: int, automated: bool) -> None:
    try:
        order_id = shortened_order_id
        if not str_utils.UUID_REGEX.match(shortened_order_id):
            order_id = str_utils.b64_to_uuid(shortened_order_id)

        print(f"Order ID: {order_id}")
        main_path = f"http://localhost:{port}/session/my/order"
        sub_path = f"/automated?order_id={order_id}" if automated else f"?order_id={order_id}"
        url = main_path + sub_path
        print(f"Request to {url=}")
        httpx.put(url=url)
    except Exception as e:
        print_exc(e)


def qr_scanner_handler(usb_dev: models.USBDevice, port: int, automated: bool) -> None:
    try:
        callback = functools.partial(set_session_order, port=port, automated=automated)
        device = qrcode_serial.SerialInfo(port=usb_dev.cdc_path)
        device.retrieve_and_exec(callback=callback)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print_exc(e)


def scanner_manager(redis_dsn: str | None = None, port: int | None = None) -> None:
    redis_dsn = redis_dsn or os.getenv("REDIS_DSN") or "redis://localhost:6379/0"
    port = port or int(os.getenv("PORT")) or 8000

    with redis_client.RedisClient(dsn=redis_dsn).sync_session as redis_session:
        while True:
            try:
                app_state_json: str = redis_session.get(redis_client.RedisKey.PUBSUB_CHANNEL)
                app_state: models.AppState = models.AppState.model_validate_json(json_data=app_state_json)
                readers: list[models.USBDevice] = [
                    s.state.reader for s in app_state.sessions.values() if s.state.reader
                ]
                for reader in readers:
                    if reader not in processes:
                        logger.info(f"Starting process for {reader.name}")
                        processes[reader] = mp.Process(target=qr_scanner_handler, args=(reader, port))
                        processes[reader].start()

                    if not processes[reader].is_alive():
                        with contextlib.suppress(Exception):
                            processes[reader].terminate()
                        logger.info(f"Process for {reader.name} is dead. Restarting...")
                        processes[reader] = mp.Process(target=qr_scanner_handler, args=(reader, port))
                        processes[reader].start()

                for reader, process in list(processes.items()):
                    if reader not in readers:
                        logger.info(f"Terminating process for {reader.name} as it is not in use.")
                        with contextlib.suppress(Exception):
                            process.terminate()
                        del processes[reader]
            except KeyboardInterrupt:
                break
            except Exception as e:
                print_exc(e)

        for process in processes.values():
            process.terminate()


cli_patterns: list[typing.Callable] = [scanner_manager]
