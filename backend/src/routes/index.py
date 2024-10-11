import pathlib

import fastapi
import fastapi.staticfiles
import starlette.responses

router = fastapi.APIRouter(prefix="")


@router.get(path="/", response_class=fastapi.responses.HTMLResponse)
@router.get(path="/index.html", response_class=fastapi.responses.HTMLResponse)
async def index() -> str:
    """index.html 페이지"""
    if not pathlib.Path("src/static/index.html").exists():
        return "index.html not found"
    return starlette.responses.FileResponse("src/static/index.html")
