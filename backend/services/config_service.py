import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

_CONFIG_FILE = Path(__file__).parent.parent.parent / "config.json"

_DEFAULTS: dict[str, Any] = {
    "agent_id": "",
    "agent_name": "AI Assistant",
    "agent_first_message": "Hello! How can I help you today?",
    "max_context_chars": 6000,
}


class ConfigService:
    """Manages agent configuration — loads from disk, overridden by env vars."""

    def load(self) -> dict[str, Any]:
        config = _DEFAULTS.copy()
        if _CONFIG_FILE.exists():
            try:
                stored = json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
                config.update(stored)
            except (json.JSONDecodeError, OSError):
                pass
        env_agent_id = os.getenv("ELEVENLABS_AGENT_ID", "")
        if env_agent_id:
            config["agent_id"] = env_agent_id
        return config

    def save(self, updates: dict[str, Any]) -> dict[str, Any]:
        config = self.load()
        config.update(updates)
        _CONFIG_FILE.write_text(json.dumps(config, indent=2), encoding="utf-8")
        return config

    def get_api_key(self) -> str:
        return os.getenv("ELEVENLABS_API_KEY", "")

    def get_agent_id(self) -> str:
        return self.load().get("agent_id", "")
