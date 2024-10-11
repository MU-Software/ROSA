from __future__ import annotations

import dataclasses
import pathlib
import struct
import types
import typing

import PIL.Image
import PIL.ImageOps
import pydantic

ContextExitArgType = tuple[type[BaseException], BaseException, typing.Optional[types.TracebackType]]

PrinterModel = typing.Literal["QL-710W", "QL-720NW", "QL-600"]
LabelMediaType = typing.Literal["No media", "Continuous length tape", "Die-cut labels"]
PhaseType = typing.Literal["Receiving", "Printing"]
NotificationType = typing.Literal["Not available", "Cooling (started)", "Cooling (finished)"]


class ESCP_Response(typing.TypedDict):
    model_code: PrinterModel
    errors: list[str]
    label_width: str
    label_length: str
    media_type: LabelMediaType
    mode: str
    status_type: str
    phase_type: PhaseType
    phase_number: str
    notification_number: NotificationType


class ESCP_ResponseParser:

    @dataclasses.dataclass
    class ChunkParser:
        name: str
        size: int = dataclasses.field(default=1)
        possible_values: dict[int, typing.Any] = dataclasses.field(default_factory=dict)
        important: bool = True

        def __call__(self, data: bytes) -> str:
            if len(data) != self.size:
                raise ValueError(f"Expected {self.size} bytes, got {len(data)}")
            if resp := self.possible_values.get(int.from_bytes(data, "big")):
                return resp
            raise ValueError(f"Value {data!r} not in possible values for {self.name}")

        def to_dict(self, data: bytes) -> dict[str, str]:
            return {self.name.lower().replace(" ", "_"): self(data)} if self.important else {}

    @dataclasses.dataclass
    class ErrorParser(ChunkParser):
        name: str = dataclasses.field(default="Errors")
        size: int = dataclasses.field(default=2)

        def __call__(self, data: bytes) -> list[str]:  # type: ignore[override]
            int_data = int.from_bytes(data, "big")
            return [msg for bit, msg in self.possible_values.items() if int_data & (1 << bit)]

    @dataclasses.dataclass
    class MediaSizeParser(ChunkParser):
        def __call__(self, data: bytes) -> str:
            return f"{int.from_bytes(data, 'big')}mm"

    @dataclasses.dataclass
    class SimpleChunkParser(ChunkParser):
        def __call__(self, data: bytes) -> str:
            return " ".join(hex(x) for x in data)

    @dataclasses.dataclass
    class ReservedParser(SimpleChunkParser):
        name: str = "Reserved"
        size: int = dataclasses.field(default=1)
        important: bool = False

    @dataclasses.dataclass
    class ModeParser(SimpleChunkParser):
        name: str = dataclasses.field(default="Mode")

    @dataclasses.dataclass
    class PhaseParser(SimpleChunkParser):
        name: str = dataclasses.field(default="Phase")
        size: int = dataclasses.field(default=2)

    ERR_INFOS: dict[int, str] = {
        0b0000000000000001: "No media when printing",
        0b0000000000000010: "End of media (only for die-cut labels)",
        0b0000000000000100: "Cutter jam",
        0b0000000000001000: "(Not used)",
        0b0000000000010000: "Printer in use",
        0b0000000000100000: "Printer turned off",
        0b0000000001000000: "High-voltage adapter (not used)",
        0b0000000010000000: "Fan motor error (not used)",
        0b0000000100000000: "Replace media error",
        0b0000001000000000: "Expansion buffer full error",
        0b0000010000000000: "Communication error",
        0b0000100000000000: "Communication buffer full error (not used)",
        0b0001000000000000: "Cover open error",
        0b0010000000000000: "Cancel key (not used)",
        0b0100000000000000: "Media cannot be fed (also when the media end is detected)",
        0b1000000000000000: "System error",
    }
    MODEL_CODE: dict[int, PrinterModel] = {
        0x36: "QL-710W",
        0x37: "QL-720NW",
        0x47: "QL-600",
    }
    MEDIA_TYPES: dict[int, LabelMediaType] = {
        0x00: "No media",
        0x0A: "Continuous length tape",
        0x0B: "Die-cut labels",
        0x4A: "Continuous length tape",
        0x4B: "Die-cut labels",
    }
    STATUS_TYPES: dict[int, str] = {
        0x00: "Reply to status request",
        0x01: "Printing completed",
        0x02: "Error occurred",
        0x05: "Notification",
        0x06: "Phase change",
        **{i: "(Not used)" for i in range(0x08, 0x20 + 1)},
        **{i: "(Reserved)" for i in range(0x21, 0xFF + 1)},
    }
    PHASE_TYPES: dict[int, PhaseType] = {
        0x00: "Receiving",
        0x01: "Printing",
    }
    NOTIFICATION_TYPES: dict[int, NotificationType] = {
        0x00: "Not available",
        0x03: "Cooling (started)",
        0x04: "Cooling (finished)",
    }
    RESP_PARSE_MAP: list[ChunkParser | ErrorParser] = [
        ReservedParser(name="Print head mark"),  # Might be 0x80
        ReservedParser(name="Size"),  # Might be 0x20
        ReservedParser(),  # Might be 0x42
        ReservedParser(name="Series Code"),  # Might be 0x34
        ChunkParser(name="Model Code", possible_values=MODEL_CODE),
        ReservedParser(),  # Might be 0x30
        ReservedParser(),
        ReservedParser(),
        ErrorParser(possible_values=ERR_INFOS),
        MediaSizeParser(name="Label Width"),
        ChunkParser(name="Media type", possible_values=MEDIA_TYPES),
        ReservedParser(),
        ReservedParser(),
        ReservedParser(),
        ModeParser(),
        ReservedParser(),
        MediaSizeParser(name="Label Length"),
        ChunkParser(name="Status Type", possible_values=STATUS_TYPES),
        ChunkParser(name="Phase Type", possible_values=PHASE_TYPES),
        PhaseParser(name="Phase Number"),
        ChunkParser(name="Notification Number", possible_values=NOTIFICATION_TYPES),
        ReservedParser(),
        ReservedParser(size=8),
    ]

    @classmethod
    def parse_response(cls, data: bytes) -> ESCP_Response:
        required_len: int = sum(parser.size for parser in cls.RESP_PARSE_MAP)
        if len(data) != required_len:
            raise ValueError(f"Expected {required_len} bytes, got {len(data)}")

        current_offset = 0
        collected_data: ESCP_Response = {}  # type: ignore[typeddict-item]
        for parser in cls.RESP_PARSE_MAP:
            chunk = data[current_offset : current_offset + parser.size]  # noqa: E203
            collected_data |= parser.to_dict(chunk)  # type: ignore[typeddict-item]
            current_offset += parser.size

        return collected_data


class ESCP(pydantic.BaseModel):
    """
    ESC/P Script Generator

    Usage:
        escp = ESCP(...)
        with escp as printer:
            with printer.page as page:
                page.write_image(image)  # pillow Image

        escp.cmdlist  # list of ESC/P commands
        escp.print()  # send ESC/P commands to printer
    """

    class ESCP_CommandContextManager(pydantic.BaseModel):
        escp_context: ESCP

        model_config = pydantic.ConfigDict(arbitrary_types_allowed=True)

        def build_enter_cmds(self) -> list[bytes]:
            raise NotImplementedError

        def build_exit_cmds(self) -> list[bytes]:
            raise NotImplementedError

        def __enter__(self) -> typing.Self:
            self.escp_context.cmdlist.extend(self.build_enter_cmds())
            return self

        def __exit__(self, *args: ContextExitArgType) -> None:
            self.escp_context.cmdlist.extend(self.build_exit_cmds())

    class Page(ESCP_CommandContextManager, pydantic.BaseModel):
        def build_enter_cmds(self) -> list[bytes]:
            return [
                # Invalidate
                b"\x00" * 200,
                # Switch dynamic command mode
                # 0x00: ESC/P mode (QL-710W / QL-720NW only)
                # 0x01: Raster mode
                # 0x03: P-touch mode (QL-710W / QL-720NW only)
                # 0xFF: Mode set as default (0x01 for QL-600, 0x00 for QL-710W / QL-720NW)
                b"\x1B\x69\x61\x00",  # ESC i a 0x00
                # Initialize
                b"\x1B\x40",  # ESC @
            ]

        def build_exit_cmds(self) -> list[bytes]:
            return [
                # Print
                b"\x0C",
            ]

        def write_image(self, image: PIL.Image.Image, mode: int = 40, line_height: int = 24) -> None:
            # < ESC 3 LINE_HEIGHT > Adjust line-feed size
            self.escp_context.cmdlist.append(b"\x1B\x33" + bytes([16]))

            image = PIL.ImageOps.invert(image.convert("1").rotate(90, expand=1).resize((410, 480)))
            im = image.transpose(PIL.Image.Transpose.ROTATE_270).transpose(PIL.Image.Transpose.FLIP_LEFT_RIGHT)
            width_pixels, height_pixels = im.size
            top, left = 0, 0

            while left < width_pixels:
                box = (left, top, left + line_height, top + height_pixels)
                im_slice = im.transform((line_height, height_pixels), PIL.Image.Transform.EXTENT, box)

                # < ESC * MODE > Select hd bit-image mode and transmit image data
                self.escp_context.cmdlist.append(
                    b"\x1B\x2A" + bytes([mode]) + struct.pack("<H", image.size[0]) + im_slice.tobytes() + b"\n"
                )
                left += line_height

            # < ESC 2 > Reset line-feed size
            self.escp_context.cmdlist.append(b"\x1B\x32")

    cmdlist: list[bytes] = pydantic.Field(default_factory=list)
    model_config = pydantic.ConfigDict(arbitrary_types_allowed=True)

    @property
    def page(self) -> ESCP.Page:
        return self.Page(escp_context=self)

    def __enter__(self) -> typing.Self:
        return self

    def __exit__(self, *args: ContextExitArgType) -> None:
        pass

    def print(self, cdc_path: str) -> None:
        if not (dev := pathlib.Path(cdc_path)).exists():
            raise FileNotFoundError(f"Device {dev} not found")

        dev.write_bytes(b"".join(self.cmdlist))
