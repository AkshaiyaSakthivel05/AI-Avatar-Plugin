from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from backend.container import Container
from backend.models.requests import ConfigUpdate
from backend.models.responses import AdminConfigResponse, ConfigUpdateResponse
from backend.services.config_service import ConfigService

router = APIRouter(prefix="/api/admin")


@router.get("/config", response_model=AdminConfigResponse)
@inject
async def get_admin_config(
    config_service: ConfigService = Depends(Provide[Container.config_service]),
) -> AdminConfigResponse:
    config = config_service.load()
    return AdminConfigResponse(
        agent_id=config.get("agent_id", ""),
        agent_name=config.get("agent_name", "AI Assistant"),
        agent_first_message=config.get("agent_first_message", ""),
        max_context_chars=config.get("max_context_chars", 6000),
        has_api_key=bool(config_service.get_api_key()),
    )


@router.put("/config", response_model=ConfigUpdateResponse)
@inject
async def update_admin_config(
    update: ConfigUpdate,
    config_service: ConfigService = Depends(Provide[Container.config_service]),
) -> ConfigUpdateResponse:
    updates = {k: v for k, v in update.model_dump().items() if v is not None}
    updated_config = config_service.save(updates)
    return ConfigUpdateResponse(status="ok", config=updated_config)
