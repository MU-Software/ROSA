import typing

import pydantic
import serial

ParityType = typing.Literal["N", "E", "O", "M", "S"]


class SerialInfoError(serial.SerialException):
    pass


class SerialInfo(pydantic.BaseModel):
    port: str
    baudrate: int = 115200
    bytesize: int = 8
    parity: ParityType = "N"
    stopbits: int = 1
    timeout: int | None = None

    @property
    def serial(self) -> serial.Serial:
        return serial.Serial(**self.model_dump())

    def retrieve_and_exec(self, callback: typing.Callable[[str], None]) -> None:
        collected_data: str = ""

        try:
            while read_data := self.serial.read():
                collected_data += read_data.decode()
                if collected_data.endswith(("\n", "\r")):
                    callback(collected_data)
                    collected_data = ""
        except serial.SerialException as e:
            raise SerialInfoError(f"Error while reading data from serial port: {e}") from e
