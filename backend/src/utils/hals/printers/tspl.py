from __future__ import annotations

import pathlib
import re
import types
import typing

import numpy as np
import PIL.Image
import pydantic

ContextExitArgType = tuple[type[BaseException], BaseException, typing.Optional[types.TracebackType]]
PrinterDetectMode = typing.Literal[b"AUTO", b"GAP", b"BLINE"] | None

BLUR_KERNEL_SIZE = 127
BIT_8_CUTTER: re.Pattern[str] = re.compile(pattern="........")


def align_to_pixelperfect(x: int, y: int, w: int, h: int) -> tuple[int, int, int, int]:
    if x % 2:
        x -= 1
        w += 1
    if y % 2:
        y -= 1
        h += 1

    w += bit_leftover if (bit_leftover := 8 - (w % 8)) else 0
    h += bit_leftover if (bit_leftover := 8 - (h % 8)) else 0
    return x, y, w, h


class TSPL(pydantic.BaseModel):
    """
    TSPL Script Generator

    Usage:
        tspl = TSPL(...)
        with tspl as printer:
            with printer.page as page:
                with page.image_buffer as img_buf:
                    img_buf.write(image)  # pillow Image

        tspl.cmdlist  # list of TSPL commands
        tspl.print()  # send TSPL commands to printer
    """

    class TSPLCommandContextManager(pydantic.BaseModel):
        tspl_context: TSPL

        model_config = pydantic.ConfigDict(arbitrary_types_allowed=True)

        def build_enter_cmds(self) -> list[bytes]:
            raise NotImplementedError

        def build_exit_cmds(self) -> list[bytes]:
            raise NotImplementedError

        def __enter__(self) -> typing.Self:
            self.tspl_context.cmdlist.extend(self.build_enter_cmds())
            return self

        def __exit__(self, *args: ContextExitArgType) -> None:
            self.tspl_context.cmdlist.extend(self.build_exit_cmds())

    class ImageBuffer(TSPLCommandContextManager, pydantic.BaseModel):
        def build_enter_cmds(self) -> list[bytes]:
            # Clear Image Buffer
            return [b"CLS"]

        def build_exit_cmds(self) -> list[bytes]:
            return []

        def write(self, image: PIL.Image.Image) -> None:
            bw_img = image.convert("1")
            bit_arr_str = "".join(map(str, np.array(bw_img, dtype=int).flatten(order="c")))
            img_hex_num_str = b"".join(
                map(lambda x: int(x, 2).to_bytes(length=1, byteorder="little"), BIT_8_CUTTER.findall(bit_arr_str))
            )

            # BITMAP x, y, width, height, mode, bitmap data
            # mode:
            #   0: overwrite
            #   1: OR
            #   2: XOR
            self.tspl_context.cmdlist.append(
                f"BITMAP 0,0,{int(bw_img.size[0] / 8)},{bw_img.size[1]},0,".encode() + img_hex_num_str
            )

    class Page(TSPLCommandContextManager, pydantic.BaseModel):
        def build_enter_cmds(self) -> list[bytes]:
            return [
                f"SIZE {self.tspl_context.size[0]} mm, {self.tspl_context.size[1]} mm".encode(),
                f"GAP {self.tspl_context.gap} mm, 0 mm".encode(),
                f"OFFSET {self.tspl_context.offset} mm".encode(),
                f"DIRECTION {0 if self.tspl_context.direction == 'FORWARD' else 1}".encode(),
                f"SPEED {self.tspl_context.speed}".encode() if self.tspl_context.speed else b"",
                f"DENSITY {self.tspl_context.density}".encode(),
            ]

        def build_exit_cmds(self) -> list[bytes]:
            return []

        @property
        def image_buffer(self) -> TSPL.ImageBuffer:
            return TSPL.ImageBuffer(tspl_context=self.tspl_context)

    cmdlist: list[bytes] = pydantic.Field(default_factory=list)

    size: tuple[float, float]  # in mm
    gap: int = 0  # in mm, currently only support normal gap
    offset: float = 0  # in mm

    speed: str | None = None  # Print speed in inch per second. (I hate this imperial unit)
    density: int = pydantic.Field(default=7, ge=0, le=15)

    direction: typing.Literal["FORWARD", "BACKWARD"] = "FORWARD"
    mirror: bool = False

    auto_detect: bool = False
    gap_detect: bool = False
    bline_detect: bool = False

    model_config = pydantic.ConfigDict(arbitrary_types_allowed=True)

    @property
    def page(self) -> TSPL.Page:
        return self.Page(tspl_context=self)

    def __enter__(self) -> typing.Self:
        INITIAL_CMD = [b"INITIALPRINTER"]
        self.cmdlist.extend(INITIAL_CMD)

        return self

    def __exit__(self, *args: ContextExitArgType) -> None:
        INITIAL_END_CMD = [b"PRINT 1", b"END"]
        self.cmdlist.extend(INITIAL_END_CMD)
        pass

    def print(self, cdc_path: str) -> None:
        if not (dev := pathlib.Path(cdc_path)).exists():
            raise FileNotFoundError(f"Device {dev} not found")

        dev.write_bytes(b"\r\n".join(self.cmdlist) + b"\r\n")
