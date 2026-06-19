from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException

from backend.container import Container
from backend.models.requests import ChatRequest, TokenRequest
from backend.models.responses import ChatResponse, PublicConfigResponse, TokenResponse
from backend.services.chat_service import ChatService
from backend.services.config_service import ConfigService
from backend.services.context_service import ContextService
from backend.services.elevenlabs_service import ElevenLabsService

router = APIRouter(prefix="/api")


@router.get("/config", response_model=PublicConfigResponse)
@inject
async def get_public_config(
    config_service: ConfigService = Depends(Provide[Container.config_service]),
    chat_service: ChatService = Depends(Provide[Container.chat_service]),
) -> PublicConfigResponse:
    config = config_service.load()
    models = chat_service.get_available_models()
    return PublicConfigResponse(
        agent_name=config.get("agent_name", "AI Assistant"),
        ready=bool(config.get("agent_id")) and bool(config_service.get_api_key()),
        chat_enabled=chat_service.is_chat_available(),
        chat_models=models,
        chat_default_model=chat_service.get_default_model(),
    )


@router.post("/token", response_model=TokenResponse)
@inject
async def get_token(
    body: TokenRequest,
    config_service: ConfigService = Depends(Provide[Container.config_service]),
    elevenlabs_service: ElevenLabsService = Depends(
        Provide[Container.elevenlabs_service]
    ),
    context_service: ContextService = Depends(Provide[Container.context_service]),
) -> TokenResponse:
    from fastapi import HTTPException

    config = config_service.load()
    agent_id = config.get("agent_id", "")

    if not agent_id:
        raise HTTPException(
            status_code=400,
            detail="Agent not set up. Run: uv run python backend/setup_agent.py",
        )

    token = await elevenlabs_service.fetch_conversation_token(agent_id)

    page_context = context_service.build_page_context(
        url=body.url,
        title=body.title,
        content=body.content,
        extra=body.extra,
        max_chars=config.get("max_context_chars", 6000),
    )

    return TokenResponse(
        token=token,
        dynamic_variables={
            "page_context": page_context,
            "agent_name": config.get("agent_name", "AI Assistant"),
        },
    )


@router.post("/chat", response_model=ChatResponse)
@inject
async def text_chat(
    body: ChatRequest,
    config_service: ConfigService = Depends(Provide[Container.config_service]),
    chat_service: ChatService = Depends(Provide[Container.chat_service]),
    context_service: ContextService = Depends(Provide[Container.context_service]),
) -> ChatResponse:
    config = config_service.load()

    page_context = context_service.build_page_context(
        url=body.url,
        title=body.title,
        content=body.content,
        extra=body.extra,
        max_chars=config.get("max_context_chars", 6000),
    )

    history = [{"role": m.role, "content": m.content} for m in body.history]

    try:
        reply = await chat_service.chat(
            agent_name=config.get("agent_name", "AI Assistant"),
            page_context=page_context,
            history=history,
            message=body.message,
            model=body.model or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return ChatResponse(reply=reply)
