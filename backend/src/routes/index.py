import fastapi
import fastapi.staticfiles
from starlette.responses import FileResponse

router = fastapi.APIRouter(prefix="")


@router.get(path="/", response_class=fastapi.responses.HTMLResponse)
@router.get(path="/index.html", response_class=fastapi.responses.HTMLResponse)
async def index() -> str:
    """index.html 페이지"""
    return FileResponse("src/static/index.html")
