import pathlib as pt

import fastapi
import src.utils.stdlibs.import_utils as import_utils


def get_routes() -> list[fastapi.APIRouter]:
    return import_utils.auto_import_objs("router", "", pt.Path(__file__).parent)
