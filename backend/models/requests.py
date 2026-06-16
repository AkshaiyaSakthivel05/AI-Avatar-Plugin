from typing import Optional
from pydantic import BaseModel, Field


class TokenRequest(BaseModel):
    url: str = Field(default="", description="Current page URL")
    title: str = Field(default="", description="Current page title")
    content: str = Field(default="", description="Visible page text content")
    extra: Optional[dict] = Field(default=None, description="Structured app data from registered sources")


class ConfigUpdate(BaseModel):
    agent_name: Optional[str] = None
    agent_id: Optional[str] = None
    agent_first_message: Optional[str] = None
    max_context_chars: Optional[int] = Field(default=None, ge=100, le=20000)
