from typing import Any
from pydantic import BaseModel


class PublicConfigResponse(BaseModel):
    agent_name: str
    ready: bool


class AdminConfigResponse(BaseModel):
    agent_id: str
    agent_name: str
    agent_first_message: str
    max_context_chars: int
    has_api_key: bool


class TokenResponse(BaseModel):
    token: str
    dynamic_variables: dict[str, Any]


class HealthResponse(BaseModel):
    service: str
    version: str
    ready: bool


class ConfigUpdateResponse(BaseModel):
    status: str
    config: dict[str, Any]


class AvatarItem(BaseModel):
    id: str
    label: str
    url: str


class AvatarsResponse(BaseModel):
    avatars: list[AvatarItem]
