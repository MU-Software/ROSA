from __future__ import annotations

import collections as cl
import platform
import re
import subprocess as sp  # nosec B404
import typing

DEV_BLK_INFO_EXTRACTOR = re.compile(r"\/dev\/bus\/usb\/(?P<bus>\d)+\/(?P<device>\d)+")
LSUSB_INFO_EXTRACTOR = re.compile(r"Bus (?P<bus>\d)+ Device (?P<device>\d)+: ID (?P<usb_id>[0-9a-fA-F:]+) (?P<name>.*)")
EXCLUDE_MAGIC_KEYWORD = (
    "virtual",
    "video",
    "v3d",
    "hdmi",
    "gpu",
    "soc",
    "mmc",
    "media",
    "watchdog",
    "pwr_button",
    "gpio",
    "i2c",
    "spi",
    "serial",
    "ethernet",
)


class DeviceResult(typing.TypedDict):
    bus: str
    device: str
    block_path: str


class LSUSBResult(typing.TypedDict):
    bus: str
    device: str
    usb_id: str
    name: str


class Device(typing.TypedDict):
    bus: str
    device: str
    block_path: str
    cdc_path: str | None
    usb_id: str
    name: str


DeviceInfoType = cl.defaultdict[str, cl.defaultdict[str, Device]]


def get_dev_udevadm_path_map() -> dict[str, str]:
    result: dict[str, str] = {}

    dev_paths = sp.run(["find", "/dev"], stdout=sp.PIPE).stdout.decode().splitlines()  # nosec B603, B607
    for dev_path in dev_paths:
        if any(k in dev_path for k in ("by-id", "by-path", "char")):
            continue

        udevadm_result = (
            sp.run(  # nosec B603, B607
                ["udevadm", "info", "-q", "path", "-n", dev_path],
                stdout=sp.PIPE,
                stderr=sp.PIPE,
            )
            .stdout.decode()
            .strip()
        )
        if not udevadm_result or any(k in udevadm_result for k in EXCLUDE_MAGIC_KEYWORD):
            continue

        result[dev_path] = udevadm_result

    return result


def list_usb_devices() -> list[Device]:
    device_base_path = "/dev" if platform.system() == "Darwin" else "/dev/bus/"
    dev_infos: list[DeviceResult] = [
        info | {"block_path": z}  # type: ignore[misc]
        for z in sp.run(args=["find", device_base_path], stdout=sp.PIPE).stdout.decode().splitlines()  # nosec B603
        if (extracted := DEV_BLK_INFO_EXTRACTOR.match(z))
        and (info := extracted.groupdict())
        and (DeviceResult.__required_keys__ - {"block_path"} == info.keys())
    ]
    lsusb_infos: list[LSUSBResult] = [
        info  # type: ignore[misc]
        for z in sp.run(args=["lsusb"], stdout=sp.PIPE).stdout.decode().splitlines()  # nosec B603
        if (extracted := LSUSB_INFO_EXTRACTOR.match(z))
        and (info := extracted.groupdict())
        and (LSUSBResult.__required_keys__ == info.keys())
        and "root hub" not in info["name"]
    ]

    cdc_path_map = get_dev_udevadm_path_map()
    usbinfo: DeviceInfoType = cl.defaultdict(lambda: cl.defaultdict(Device))  # type: ignore[arg-type,typeddict-item]
    for d_info in dev_infos:
        usbinfo[d_info["bus"]][d_info["device"]] |= d_info  # type: ignore[assignment]

        block_path = d_info["block_path"]
        if block_real_path := cdc_path_map.get(block_path, None):
            for cdc_path, real_path in cdc_path_map.items():
                if block_real_path in real_path and block_real_path != real_path:
                    usbinfo[d_info["bus"]][d_info["device"]]["cdc_path"] = cdc_path
    for l_info in lsusb_infos:
        usbinfo[l_info["bus"]][l_info["device"]] |= l_info  # type: ignore[assignment]

    dev_list: list[Device] = []
    for bus_infos in usbinfo.values():
        for device_infos in bus_infos.values():
            if device_infos and Device.__required_keys__ == device_infos.keys():
                dev_list.append(device_infos)

    return dev_list


def retrieve_usb_device(cdc_path: str) -> Device | None:
    return next((dev for dev in list_usb_devices() if dev["cdc_path"] == cdc_path), None)


def retrieve_usb_devices(cdc_paths: list[str]) -> list[Device]:
    return [dev for dev in list_usb_devices() if dev["cdc_path"] in cdc_paths]
