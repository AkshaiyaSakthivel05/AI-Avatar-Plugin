"""
Text chat service — supports OpenRouter (primary) and Anthropic (fallback).

Provider selection:
  CHAT_PROVIDER=openrouter   → OpenRouter API (default when OPENROUTER_API_KEY is set)
  CHAT_PROVIDER=anthropic    → Anthropic Messages API

Model selection:
  CHAT_MODEL=<model-id>      → default model (first in CHAT_MODELS if unset)
  CHAT_MODELS=id1,id2,...    → comma-separated list of available models for UI picker

Any OpenAI-compatible model served by OpenRouter can be listed in CHAT_MODELS.
Anthropic models are supported only when CHAT_PROVIDER=anthropic.
"""

import os

import httpx

from backend.services.context_service import ContextService

_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
_ANTHROPIC_BASE = "https://api.anthropic.com/v1"

# Default free-tier models available on OpenRouter.
# Add / remove entries via the CHAT_MODELS env var.
_DEFAULT_MODELS = [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "cohere/north-mini-code:free",
    "nex-agi/nex-n2-pro:free",
    "nvidia/nemotron-3.5-content-safety:free",
]

CHAT_SYSTEM_PROMPT = """\
You are {agent_name}, an AI assistant embedded directly into a web application.

## Current Page Context
{page_context}

## Instructions
- Answer questions about the data and content shown above.
- Be accurate and concise — 1–4 sentences unless more detail is genuinely needed.
- If specific data is not in the context, say it is not available on this page.
- Never hallucinate numbers, names, or values.
- Do not refer to yourself as an AI or language model unless asked.
"""


class ChatService:
    """Multi-provider text chat: OpenRouter (default) or Anthropic."""

    def __init__(self, context_service: ContextService) -> None:
        self._context = context_service

    # ── Provider / model helpers ──────────────────────────────────────────────

    def get_provider(self) -> str:
        explicit = os.getenv("CHAT_PROVIDER", "").strip().lower()
        if explicit in ("openrouter", "anthropic"):
            return explicit
        # Auto-detect: prefer OpenRouter if its key is set.
        return "openrouter" if os.getenv("OPENROUTER_API_KEY") else "anthropic"

    def get_available_models(self) -> list[str]:
        raw = os.getenv("CHAT_MODELS", "").strip()
        if raw:
            return [m.strip() for m in raw.split(",") if m.strip()]
        return _DEFAULT_MODELS.copy()

    def get_default_model(self) -> str:
        explicit = os.getenv("CHAT_MODEL", "").strip()
        if explicit:
            return explicit
        models = self.get_available_models()
        return models[0] if models else _DEFAULT_MODELS[0]

    def is_chat_available(self) -> bool:
        provider = self.get_provider()
        if provider == "openrouter":
            return bool(os.getenv("OPENROUTER_API_KEY"))
        return bool(os.getenv("ANTHROPIC_API_KEY"))

    # ── Public chat entry point ───────────────────────────────────────────────

    async def chat(
        self,
        *,
        agent_name: str,
        page_context: str,
        history: list[dict],
        message: str,
        model: str | None = None,
        max_tokens: int = 512,
    ) -> str:
        system = CHAT_SYSTEM_PROMPT.format(
            agent_name=agent_name, page_context=page_context
        )
        model = model or self.get_default_model()
        provider = self.get_provider()

        if provider == "openrouter":
            return await self._openrouter(system, history, message, model, max_tokens)
        return await self._anthropic(system, history, message, model, max_tokens)

    # ── OpenRouter (OpenAI-compatible) ────────────────────────────────────────

    async def _openrouter(
        self,
        system: str,
        history: list[dict],
        message: str,
        model: str,
        max_tokens: int,
    ) -> str:
        api_key = os.getenv("OPENROUTER_API_KEY", "")
        if not api_key:
            raise ValueError(
                "OPENROUTER_API_KEY is not set. Add it to .env to enable text chat."
            )

        messages = [{"role": "system", "content": system}]
        messages += [{"role": m["role"], "content": m["content"]} for m in history]
        messages.append({"role": "user", "content": message})

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_OPENROUTER_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": os.getenv("SITE_URL", "http://localhost"),
                    "X-Title": os.getenv("SITE_NAME", "AI Avatar Plugin"),
                },
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "messages": messages,
                },
            )

        if resp.status_code != 200:
            err = resp.json().get("error", {})
            detail = err.get("message") or resp.text
            raise RuntimeError(f"OpenRouter API error {resp.status_code}: {detail}")

        return resp.json()["choices"][0]["message"]["content"]

    # ── Anthropic ─────────────────────────────────────────────────────────────

    async def _anthropic(
        self,
        system: str,
        history: list[dict],
        message: str,
        model: str,
        max_tokens: int,
    ) -> str:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY is not set. Add it to .env to enable text chat."
            )

        messages = [{"role": m["role"], "content": m["content"]} for m in history]
        messages.append({"role": "user", "content": message})

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_ANTHROPIC_BASE}/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "system": system,
                    "messages": messages,
                },
            )

        if resp.status_code != 200:
            err = resp.json().get("error", {})
            detail = err.get("message") or resp.text
            raise RuntimeError(f"Anthropic API error {resp.status_code}: {detail}")

        return resp.json()["content"][0]["text"]
