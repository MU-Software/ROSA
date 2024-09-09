import base64
import re
import uuid

UUID_PATTERN = "^[a-f0-9]{8}-?[a-f0-9]{4}-?4[a-f0-9]{3}-?[89ab][a-f0-9]{3}-?[a-f0-9]{12}$"
UUID_REGEX = re.compile(UUID_PATTERN, re.IGNORECASE)


def uuid_to_b64(in_str: uuid.UUID | str) -> str:
    if isinstance(in_str, str):
        if not UUID_REGEX.match(in_str):
            raise ValueError(f"Invalid UUID string: {in_str}")
        in_str = uuid.UUID(in_str)

    return base64.urlsafe_b64encode(in_str.bytes).decode("utf-8").rstrip("=")


def b64_to_uuid(in_str: str) -> uuid.UUID:
    in_str += "=" * (4 - len(in_str) % 4)
    return uuid.UUID(bytes=base64.urlsafe_b64decode(in_str + "=="))
