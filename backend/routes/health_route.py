from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from backend.container import Container
from backend.models.responses import HealthResponse
from backend.services.config_service import ConfigService

router = APIRouter()


@router.get("/", response_model=HealthResponse)
@inject
async def health(
    config_service: ConfigService = Depends(Provide[Container.config_service]),
) -> HealthResponse:
    config = config_service.load()
    return HealthResponse(
        service="AI Avatar Plugin",
        version="1.0.0",
        ready=bool(config.get("agent_id")) and bool(config_service.get_api_key()),
    )
