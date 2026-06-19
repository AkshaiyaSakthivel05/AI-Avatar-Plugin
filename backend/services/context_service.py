import json
from typing import Any


class ContextService:
    """Builds the page_context string injected as an ElevenLabs dynamic variable."""

    def build_page_context(
        self,
        url: str,
        title: str,
        content: str,
        extra: dict[str, Any] | None,
        max_chars: int,
    ) -> str:
        parts: list[str] = []

        if title:
            parts.append(f"Page Title: {title}")
        if url:
            parts.append(f"URL: {url}")
        if content:
            parts.append(f"\nPage Content:\n{content[:max_chars]}")
        if extra:
            serialised = json.dumps(extra, indent=2, default=str)
            parts.append(f"\nApp Data:\n{serialised[:4000]}")

        return "\n".join(parts) if parts else "No page context captured."
