from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ConfigServiceProtocol(Protocol):
    def load(self) -> dict[str, Any]: ...
    def save(self, updates: dict[str, Any]) -> dict[str, Any]: ...
    def get_api_key(self) -> str: ...
    def get_agent_id(self) -> str: ...


@runtime_checkable
class ElevenLabsServiceProtocol(Protocol):
    async def fetch_conversation_token(self, agent_id: str) -> str:
        """Fetches a short-lived WebRTC conversation token from ElevenLabs."""
        ...


@runtime_checkable
class ContextServiceProtocol(Protocol):
    def build_page_context(
        self,
        url: str,
        title: str,
        content: str,
        extra: dict[str, Any] | None,
        max_chars: int,
    ) -> str:
        """Builds the page_context string injected as a dynamic variable."""
        ...
