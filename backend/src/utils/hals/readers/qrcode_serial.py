import typing

import pydantic
import serial

ParityType = typing.Literal["N", "E", "O", "M", "S"]


class SerialInfoError(serial.SerialException):
    pass


class SerialInfo(pydantic.BaseModel):
    port: str
    baudrate: int = 115200
    bytesize: int = serial.EIGHTBITS
    parity: ParityType = serial.PARITY_NONE
    stopbits: int = serial.STOPBITS_ONE
    timeout: int | None = None

    @property
    def serial(self) -> serial.Serial:
        return serial.Serial(**self.model_dump())

    def retrieve_and_exec(self, callback: typing.Callable[[str], None]) -> None:
        collected_data: str = ""

        try:
            with self.serial as serial_device:
                while read_data := serial_device.read():
                    collected_data += read_data.decode()
                    if collected_data.endswith(("\n", "\r", "\0")):
                        callback(collected_data)
                        collected_data = ""
        except serial.SerialException as e:
            raise SerialInfoError(f"Error while reading data from serial port: {e}") from e
