from __future__ import annotations

import re
import types
import typing

import cv2
import numpy as np
import PIL.Image
import pydantic
import serial

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
        tspl = TSPL(...)  # or TSPL.detect(printer_serial)
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
            rot_img = image.rotate(90, expand=True)
            bw_rot_img = rot_img.convert("1")
            gs_rot_img = rot_img.convert("L")
            img_arr = np.array(gs_rot_img)

            blur = cv2.GaussianBlur(img_arr, (BLUR_KERNEL_SIZE, BLUR_KERNEL_SIZE), 0)
            blurred_inv_thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
            inv_thresh = cv2.threshold(img_arr, 0, 255, cv2.THRESH_BINARY_INV)[1]
            threshold = np.add(inv_thresh, blurred_inv_thresh)

            if cv2.__version__.startswith("4"):
                contours, _ = cv2.findContours(threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            elif cv2.__version__.startswith("3"):
                _, contours, _ = cv2.findContours(threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for contour in contours:
                # left, top, width, height
                x, y, w, h = align_to_pixelperfect(*cv2.boundingRect(contour))
                cropped_image = bw_rot_img.crop((x, y, x + w, y + h))
                bit_arr_str = "".join(map(str, np.array(cropped_image, dtype=int).flatten(order="c")))
                img_hex_num_str = b"".join(
                    map(lambda x: int(x, 2).to_bytes(length=1, byteorder="little"), BIT_8_CUTTER.findall(bit_arr_str))
                )
                # BITMAP x, y, width, height, mode, bitmap data
                # mode:
                #   0: overwrite
                #   1: OR
                #   2: XOR
                self.tspl_context.cmdlist.append(f"BITMAP {x},{y},{int(w / 8)},{h},0,".encode() + img_hex_num_str)

    class Page(TSPLCommandContextManager, pydantic.BaseModel):
        def build_enter_cmds(self) -> list[bytes]:
            return [
                f"SIZE {self.tspl_context.size[0]} mm, {self.tspl_context.size[1]} mm".encode(),
                f"GAP {self.tspl_context.gap} mm, 0 mm".encode(),
                f"OFFSET {self.tspl_context.offset} mm".encode(),
                f"DIRECTION {0 if self.tspl_context.direction == 'FORWARD' else 1}".encode(),
            ]

        def build_exit_cmds(self) -> list[bytes]:
            return []

        @property
        def image_buffer(self) -> TSPL.ImageBuffer:
            return TSPL.ImageBuffer(tspl_context=self.tspl_context)

    printer: serial.Serial | None = None
    cmdlist: list[bytes] = pydantic.Field(default_factory=list)

    size: tuple[float, float]  # in mm
    gap: int  # in mm, currently only support normal gap
    offset: float = 0  # in mm

    speed: str | None = None  # Print speed in inch per second. (I hate this imperial unit)
    density: int = pydantic.Field(default=7, ge=0, le=15)

    direction: typing.Literal[b"FORWARD", b"BACKWARD"] = b"FORWARD"
    mirror: bool = False

    auto_detect: bool = False
    gap_detect: bool = False
    bline_detect: bool = False

    model_config = pydantic.ConfigDict(arbitrary_types_allowed=True)

    @property
    def page(self) -> TSPL.Page:
        return self.Page(tspl_context=self)

    # @classmethod
    # def detect(cls, printer: serial.Serial, **kwargs) -> TSPL:
    #     printer.write("QUERY SENSOR\n".encode())
    #     response = printer.readline().decode()

    #     return cls(
    #         printer=printer,
    #         auto_detect="AUTO" in response,
    #         gap_detect="GAP" in response,
    #         bline_detect="BLINE" in response,
    #         **kwargs,
    #     )

    def __enter__(self) -> typing.Self:
        INITIAL_CMD = [b"INITIALPRINTER"]
        self.cmdlist.extend(INITIAL_CMD)

        return self

    def __exit__(self, *args: ContextExitArgType) -> None:
        INITIAL_END_CMD = [b"PRINT 1", b"END"]
        self.cmdlist.extend(INITIAL_END_CMD)
        pass
