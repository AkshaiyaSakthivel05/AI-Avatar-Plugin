import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

CONFIG_FILE = Path(__file__).parent.parent / "config.json"

DEFAULT_CONFIG = {
    "agent_id": "",
    "agent_name": "AI Assistant",
    "agent_first_message": "Hello! How can I help you today?",
    "max_context_chars": 6000,
}

SYSTEM_PROMPT_TEMPLATE = """\
You are {{agent_name}}, an intelligent AI assistant embedded in a web application.

You help users understand the page they are viewing and answer their questions conversationally.

## Current Page
{{page_context}}

## Guidelines
- Keep responses short and conversational — this is a voice interface
- Answer questions about the page content above
- If asked about data you can see in the context, use it directly
- Be friendly and helpful
- Do not mention you are an AI unless directly asked
"""


def load_config() -> dict:
    base = DEFAULT_CONFIG.copy()
    if CONFIG_FILE.exists():
        try:
            stored = json.loads(CONFIG_FILE.read_text())
            base.update(stored)
        except Exception:
            pass
    # env vars take priority
    if os.getenv("ELEVENLABS_AGENT_ID"):
        base["agent_id"] = os.getenv("ELEVENLABS_AGENT_ID")
    return base


def save_config(updates: dict) -> dict:
    config = load_config()
    config.update(updates)
    CONFIG_FILE.write_text(json.dumps(config, indent=2))
    return config


def get_api_key() -> str:
    return os.getenv("ELEVENLABS_API_KEY", "")
