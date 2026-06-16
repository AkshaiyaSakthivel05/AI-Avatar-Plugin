from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

_STATIC_DIR = Path(__file__).parent.parent.parent / "static"


@router.get("/widget.js", include_in_schema=False)
async def serve_widget() -> FileResponse:
    widget_path = _STATIC_DIR / "widget.js"
    if not widget_path.exists():
        raise HTTPException(status_code=404, detail="widget.js not found")
    return FileResponse(
        widget_path,
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache"},
    )
