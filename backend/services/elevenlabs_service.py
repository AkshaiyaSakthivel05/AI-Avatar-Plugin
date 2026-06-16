import httpx
from fastapi import HTTPException

from backend.services.config_service import ConfigService

_ELEVENLABS_TOKEN_URL = "https://api.elevenlabs.io/v1/convai/conversation/token"
_TIMEOUT_SECONDS = 10.0


class ElevenLabsService:
    """Fetches short-lived conversation tokens from the ElevenLabs Agents API."""

    def __init__(self, config_service: ConfigService) -> None:
        self._config = config_service

    async def fetch_conversation_token(self, agent_id: str) -> str:
        api_key = self._config.get_api_key()
        if not api_key:
            raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY not configured.")

        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            try:
                response = await client.get(
                    _ELEVENLABS_TOKEN_URL,
                    headers={"xi-api-key": api_key},
                    params={"agent_id": agent_id},
                )
            except httpx.TimeoutException as exc:
                raise HTTPException(
                    status_code=504,
                    detail="ElevenLabs API timed out.",
                ) from exc
            except httpx.RequestError as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"ElevenLabs API unreachable: {exc}",
                ) from exc

        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"ElevenLabs token error ({response.status_code}): {response.text}",
            )

        token: str = response.json().get("token", "")
        if not token:
            raise HTTPException(status_code=502, detail="ElevenLabs returned an empty token.")
        return token
