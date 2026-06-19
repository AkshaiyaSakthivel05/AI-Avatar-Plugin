from pathlib import Path

from fastapi import APIRouter

from backend.models.responses import AvatarItem, AvatarsResponse

router = APIRouter(prefix="/api")

_AVATARS_DIR = Path(__file__).parent.parent.parent / "static" / "avatars"

_SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

# Human-readable labels keyed by stem — extend this dict to rename any avatar.
_LABELS: dict[str, str] = {
    "avatar-woman": "Sarah",
    "avatar-man": "James",
}


@router.get("/avatars", response_model=AvatarsResponse)
async def list_avatars() -> AvatarsResponse:
    items: list[AvatarItem] = []

    if _AVATARS_DIR.exists():
        for path in sorted(_AVATARS_DIR.iterdir()):
            if path.suffix.lower() in _SUPPORTED_EXTENSIONS:
                stem = path.stem
                label = _LABELS.get(stem, stem.replace("-", " ").title())
                items.append(
                    AvatarItem(
                        id=stem,
                        label=label,
                        url=f"/avatars/{path.name}",
                    )
                )

    return AvatarsResponse(avatars=items)
