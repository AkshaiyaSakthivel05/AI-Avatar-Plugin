"""
Run once to create (or update) the ElevenLabs agent and save ids to .env

Create a new agent:
    python backend/setup_agent.py

Update tools on an existing agent (keeps agent_id, rebuilds tools):
    python backend/setup_agent.py --update

Extra options:
    --name "My Assistant"   agent display name (create only)
    --voice rachel          voice preset (create only)
    --first-message "..."   opening line (create only)
"""

import argparse
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

VOICES = {
    "rachel": "21m00Tcm4TlvDq8ikWAM",
    "domi": "AZnzlk1XvdvUeBnXmlld",
    "bella": "EXAVITQu4vr4xnSDxMaL",
    "Antoni": "ErXwobaYiN019PkySvjV",
    "josh": "TxGEqnHWrfWFTfGW9XjX",
    "arnold": "VR6AewLTigWG4xSOukaG",
    "adam": "pNInz6obpgDQGcFmaJgB",
    "sam": "yoZ06aMxZJJ28mfd3POQ",
}

# ── System prompt ─────────────────────────────────────────────────────────────
# {{page_context}} is injected as an ElevenLabs dynamic variable at session start.
# list_data_sources / get_data_source are client tools registered in widget.js.
SYSTEM_PROMPT = """\
You are {{agent_name}}, an intelligent AI assistant embedded directly into a web application.

## Current Session Context
{{page_context}}

## Live Data Tools
You have two tools to fetch real-time data from the host dashboard at any point during the conversation:

- **list_data_sources** — no arguments. Returns the names of all data sources the dashboard \
has registered (e.g. "accounts", "riskManagement", "tradingOverview").
- **get_data_source** — argument: `name` (string). Fetches the current live value of that \
named source. Always call `list_data_sources` first if you are unsure what is available.

When the user asks about specific data (accounts, trades, risk, portfolio, etc.):
1. Call `list_data_sources` to discover what is available.
2. Call `get_data_source` with the relevant name.
3. Answer based on what you receive — do not guess or hallucinate values.

## Behaviour
- Keep responses SHORT and CONVERSATIONAL — this is a real-time voice interface.
- Refer to numbers and data precisely; do not round unless the user asks.
- If a data source returns `available: false`, say the data is not loaded yet and suggest \
the user navigate to that section of the app first.
- Never say "based on the context provided" — just answer naturally.
- Aim for 1–3 sentences per response.
"""

# ── Tool definitions ──────────────────────────────────────────────────────────
# Defined once per workspace; reused across agents via tool_ids.
CLIENT_TOOLS = [
    {
        "name": "list_data_sources",
        "description": (
            "Returns the names of all real-time data sources the host dashboard has registered. "
            "Call this first to discover what data is available before calling get_data_source."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
        },
        "response_timeout_secs": 10,
        "expects_response": True,
    },
    {
        "name": "get_data_source",
        "description": (
            "Fetches the current live value of a named data source from the host dashboard. "
            "Call list_data_sources first to see what names are available. "
            "Returns { available, name, data } — if available is false the data has not been "
            "loaded yet and the user should navigate to that section of the app."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The data source name to fetch (e.g. 'accounts', 'riskManagement').",
                }
            },
            "required": ["name"],
        },
        "response_timeout_secs": 15,
        "expects_response": True,
    },
]

_BASE = "https://api.elevenlabs.io/v1"


def _headers(api_key: str) -> dict:
    return {"xi-api-key": api_key, "Content-Type": "application/json"}


# ── Tool management ───────────────────────────────────────────────────────────


def create_tools(api_key: str) -> list[str]:
    """Creates both client tools in the workspace and returns their IDs."""
    tool_ids = []
    for tool_def in CLIENT_TOOLS:
        print(f"  Creating tool '{tool_def['name']}'…")
        resp = httpx.post(
            f"{_BASE}/convai/tools",
            headers=_headers(api_key),
            json={
                "tool_config": {
                    "type": "client",
                    **tool_def,
                }
            },
            timeout=30,
        )
        if resp.status_code not in (200, 201):
            print(f"  ERROR creating tool '{tool_def['name']}': {resp.status_code}")
            print(f"  {resp.text}")
            sys.exit(1)
        tool_id = resp.json().get("id") or resp.json().get("tool_id")
        print(f"  Created '{tool_def['name']}' → {tool_id}")
        tool_ids.append(tool_id)
    return tool_ids


# ── Agent management ──────────────────────────────────────────────────────────


def create_agent(
    name: str, voice_key: str, first_message: str, api_key: str
) -> tuple[str, list[str]]:
    voice_id = VOICES.get(voice_key.lower(), VOICES["rachel"])
    print("\nCreating tools…")
    tool_ids = create_tools(api_key)

    print(f"\nCreating agent '{name}'…")
    resp = httpx.post(
        f"{_BASE}/convai/agents/create",
        headers=_headers(api_key),
        json={
            "name": name,
            "conversation_config": {
                "agent": {
                    "first_message": first_message,
                    "language": "en",
                    "dynamic_variables": {
                        "dynamic_variable_placeholders": {
                            "page_context": "No page context available.",
                            "agent_name": name,
                        }
                    },
                    "prompt": {
                        "prompt": SYSTEM_PROMPT,
                        "llm": "gemini-2.5-flash",
                        "tool_ids": tool_ids,
                    },
                },
                "tts": {
                    "model_id": "eleven_flash_v2",
                    "voice_id": voice_id,
                },
            },
        },
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"ERROR creating agent: {resp.status_code}\n{resp.text}")
        sys.exit(1)

    agent_id = resp.json()["agent_id"]
    print(f"Agent created → {agent_id}")
    return agent_id, tool_ids


def update_agent_tools(agent_id: str, api_key: str) -> list[str]:
    """Recreates client tools and patches the existing agent to use them."""
    print(f"\nRecreating tools for existing agent {agent_id}…")
    tool_ids = create_tools(api_key)

    print("Patching agent with new tool_ids…")
    resp = httpx.patch(
        f"{_BASE}/convai/agents/{agent_id}",
        headers=_headers(api_key),
        json={
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "tool_ids": tool_ids,
                        # Also refresh the system prompt to pick up any wording changes.
                        "prompt": SYSTEM_PROMPT,
                    }
                }
            }
        },
        timeout=30,
    )
    if resp.status_code not in (200, 204):
        print(f"ERROR patching agent: {resp.status_code}\n{resp.text}")
        sys.exit(1)
    print("Agent patched.")
    return tool_ids


# ── .env helpers ──────────────────────────────────────────────────────────────


def _upsert_env(path: Path, key: str, value: str):
    """Insert or replace a single KEY=value line in the env file."""
    if path.exists():
        lines = path.read_text().splitlines()
        matched = False
        for i, line in enumerate(lines):
            if line.startswith(f"{key}="):
                lines[i] = f"{key}={value}"
                matched = True
                break
        if not matched:
            lines.append(f"{key}={value}")
        path.write_text("\n".join(lines) + "\n")
    else:
        path.write_text(f"{key}={value}\n")


def save_ids(agent_id: str, tool_ids: list[str]):
    env_path = Path(__file__).parent.parent / ".env"
    _upsert_env(env_path, "ELEVENLABS_AGENT_ID", agent_id)
    _upsert_env(env_path, "ELEVENLABS_TOOL_IDS", ",".join(tool_ids))
    print(f"Saved ids to {env_path}")


# ── Entry point ───────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Create or update ElevenLabs AI Avatar agent"
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="Update tools on an existing agent (reads ELEVENLABS_AGENT_ID from .env)",
    )
    parser.add_argument(
        "--name", default="AI Assistant", help="Agent display name (create only)"
    )
    parser.add_argument(
        "--voice",
        default="rachel",
        choices=list(VOICES),
        help="Voice preset (create only)",
    )
    parser.add_argument(
        "--first-message",
        default="Hello! I can see this page — what would you like to know?",
        help="Opening line (create only)",
    )
    args = parser.parse_args()

    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print("ERROR: ELEVENLABS_API_KEY not set in .env")
        sys.exit(1)

    if args.update:
        agent_id = os.getenv("ELEVENLABS_AGENT_ID")
        if not agent_id:
            print(
                "ERROR: ELEVENLABS_AGENT_ID not found in .env — run without --update to create first."
            )
            sys.exit(1)
        tool_ids = update_agent_tools(agent_id, api_key)
        save_ids(agent_id, tool_ids)
    else:
        agent_id, tool_ids = create_agent(
            args.name, args.voice, args.first_message, api_key
        )
        save_ids(agent_id, tool_ids)

    print("\nDone! Start the backend with:")
    print("  uv run fastapi dev backend/main.py")


if __name__ == "__main__":
    main()
