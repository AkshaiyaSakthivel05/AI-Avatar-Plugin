"""
Text chat service — two independent pipelines, user-selectable via model picker.

┌─────────────────────────────────────────────────────────────────────────────┐
│  Pipeline 1 — OpenRouter  (default, cloud, free models)                     │
│    • OPENROUTER_API_KEY required                                             │
│    • Models listed in CHAT_MODELS (no special prefix)                        │
│    • Zero setup — works out of the box                                       │
│                                                                              │
│  Pipeline 2 — LiteLLM  (opt-in, local/private, user must start proxy)      │
│    • LITELLM_API_KEY + LITELLM_BASE_URL required                             │
│    • Models declared in LITELLM_MODELS env var                               │
│    • Activated automatically when user picks a model from LITELLM_MODELS     │
│    • No CHAT_PROVIDER override needed — routing is model-name-driven         │
└─────────────────────────────────────────────────────────────────────────────┘

Env vars:
  CHAT_MODEL=<id>          Default model shown in widget picker
  CHAT_MODELS=id1,id2,...  All models shown in widget picker (OpenRouter)
  LITELLM_MODELS=id1,...   Models routed to LiteLLM pipeline (added to picker)
  LITELLM_API_KEY          LiteLLM proxy key
  LITELLM_BASE_URL         LiteLLM proxy URL (default: http://localhost:4000)
  OPENROUTER_API_KEY       OpenRouter cloud key
  ANTHROPIC_API_KEY        Anthropic key (optional, set CHAT_PROVIDER=anthropic)
  CHAT_PROVIDER            Force a provider: openrouter | litellm | anthropic
                           (Normally unset — provider is inferred from model choice)
"""

import os

import httpx

from backend.services.context_service import ContextService

_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
_ANTHROPIC_BASE = "https://api.anthropic.com/v1"
_LITELLM_DEFAULT_BASE = "http://localhost:4000"

# Pipeline 1: default OpenRouter free models (overridden by CHAT_MODELS env var).
_DEFAULT_OPENROUTER_MODELS = [
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
    """
    Multi-provider text chat with model-driven pipeline routing.

    OpenRouter is the default pipeline. LiteLLM is an opt-in secondary pipeline
    activated when the user selects a model listed in LITELLM_MODELS.
    """

    def __init__(self, context_service: ContextService) -> None:
        self._context = context_service

    # ── Model lists ───────────────────────────────────────────────────────────

    def get_openrouter_models(self) -> list[str]:
        """Pipeline 1 models — served by OpenRouter cloud."""
        raw = os.getenv("CHAT_MODELS", "").strip()
        if raw:
            return [m.strip() for m in raw.split(",") if m.strip()]
        return _DEFAULT_OPENROUTER_MODELS.copy()

    def get_litellm_models(self) -> list[str]:
        """Pipeline 2 models — served by local/private LiteLLM proxy."""
        raw = os.getenv("LITELLM_MODELS", "").strip()
        return [m.strip() for m in raw.split(",") if m.strip()]

    def get_available_models(self) -> list[str]:
        """All models exposed to the widget picker (Pipeline 1 + Pipeline 2)."""
        return self.get_openrouter_models() + self.get_litellm_models()

    def get_default_model(self) -> str:
        explicit = os.getenv("CHAT_MODEL", "").strip()
        if explicit:
            return explicit
        models = self.get_available_models()
        return models[0] if models else _DEFAULT_OPENROUTER_MODELS[0]

    # ── Provider resolution ───────────────────────────────────────────────────

    def _resolve_provider(self, model: str) -> str:
        """
        Determine which pipeline handles this model.

        Priority:
          1. Explicit CHAT_PROVIDER env var (escape hatch for admins).
          2. Model is in LITELLM_MODELS → Pipeline 2 (LiteLLM).
          3. Everything else → Pipeline 1 (OpenRouter, or Anthropic if forced).
        """
        # 1. Admin override
        explicit = os.getenv("CHAT_PROVIDER", "").strip().lower()
        if explicit in ("openrouter", "anthropic", "litellm"):
            return explicit

        # 2. Model-driven: route to LiteLLM when user picks a LiteLLM model
        if model in self.get_litellm_models() and os.getenv("LITELLM_API_KEY"):
            return "litellm"

        # 3. Default cloud pipeline
        return "openrouter" if os.getenv("OPENROUTER_API_KEY") else "anthropic"

    def is_chat_available(self) -> bool:
        provider = self._resolve_provider(self.get_default_model())
        if provider == "openrouter":
            return bool(os.getenv("OPENROUTER_API_KEY"))
        if provider == "litellm":
            return bool(os.getenv("LITELLM_API_KEY"))
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
        provider = self._resolve_provider(model)

        if provider == "litellm":
            return await self._litellm(system, history, message, model, max_tokens)
        if provider == "openrouter":
            return await self._openrouter(system, history, message, model, max_tokens)
        return await self._anthropic(system, history, message, model, max_tokens)

    # ── Pipeline 1: OpenRouter (cloud, OpenAI-compatible) ────────────────────

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
                json={"model": model, "max_tokens": max_tokens, "messages": messages},
            )

        if resp.status_code != 200:
            err = resp.json().get("error", {})
            raise RuntimeError(
                f"OpenRouter error {resp.status_code}: {err.get('message') or resp.text}"
            )

        return resp.json()["choices"][0]["message"]["content"]

    # ── Pipeline 2: LiteLLM proxy (local/private, OpenAI-compatible) ─────────

    async def _litellm(
        self,
        system: str,
        history: list[dict],
        message: str,
        model: str,
        max_tokens: int,
    ) -> str:
        """
        Sends to a locally running LiteLLM proxy (default: http://localhost:4000).
        Start the proxy before using this pipeline:
          uv run --with 'litellm[proxy]' litellm --model <model> --port 4000
        """
        api_key = os.getenv("LITELLM_API_KEY", "")
        if not api_key:
            raise ValueError(
                "LITELLM_API_KEY is not set. Add it to .env to enable LiteLLM chat."
            )
        base_url = os.getenv("LITELLM_BASE_URL", _LITELLM_DEFAULT_BASE).rstrip("/")

        messages = [{"role": "system", "content": system}]
        messages += [{"role": m["role"], "content": m["content"]} for m in history]
        messages.append({"role": "user", "content": message})

        # Higher timeout — local large models are slower than cloud APIs.
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": model, "max_tokens": max_tokens, "messages": messages},
            )

        if resp.status_code != 200:
            err = resp.json().get("error", {})
            raise RuntimeError(
                f"LiteLLM error {resp.status_code}: {err.get('message') or resp.text}"
            )

        return resp.json()["choices"][0]["message"]["content"]

    # ── Anthropic (optional, explicit CHAT_PROVIDER=anthropic only) ───────────

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
                "ANTHROPIC_API_KEY is not set. Add it to .env to enable Anthropic chat."
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
            raise RuntimeError(
                f"Anthropic error {resp.status_code}: {err.get('message') or resp.text}"
            )

        return resp.json()["content"][0]["text"]
