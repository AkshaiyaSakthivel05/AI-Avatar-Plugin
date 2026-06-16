"""
Run once to create the ElevenLabs agent and save the agent_id to .env

Usage:
    python setup_agent.py
    python setup_agent.py --name "My Assistant" --voice rachel
"""

import os
import sys
import argparse
import httpx
from pathlib import Path
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

SYSTEM_PROMPT = """\
You are {{agent_name}}, an intelligent AI assistant embedded directly into a web application.

Your job is to help users understand and work with the content they are currently viewing.

## What You Can See Right Now
{{page_context}}

## How to Behave
- Keep all responses SHORT and CONVERSATIONAL — this is a real-time voice interface
- Answer questions about the page content naturally and directly
- If you see data like numbers, tables, or lists in the context above, refer to them precisely
- If the page context is empty or unavailable, still be helpful with general questions
- Never say "based on the context provided" — just answer naturally
- Be warm and concise — aim for 1–3 sentences per response
"""


def create_agent(name: str, voice_key: str, first_message: str) -> str:
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print("ERROR: ELEVENLABS_API_KEY not set in .env")
        sys.exit(1)

    voice_id = VOICES.get(voice_key.lower(), VOICES["rachel"])

    print(f"Creating ElevenLabs agent '{name}' with voice '{voice_key}'...")

    response = httpx.post(
        "https://api.elevenlabs.io/v1/convai/agents/create",
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
        },
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

    if response.status_code != 200:
        print(f"ERROR creating agent: {response.status_code}")
        print(response.text)
        sys.exit(1)

    agent_id = response.json()["agent_id"]
    print(f"Agent created! ID: {agent_id}")
    return agent_id


def update_env_file(agent_id: str):
    env_path = Path(__file__).parent / ".env"

    if env_path.exists():
        content = env_path.read_text()
        if "ELEVENLABS_AGENT_ID=" in content:
            lines = content.splitlines()
            lines = [
                f"ELEVENLABS_AGENT_ID={agent_id}" if l.startswith("ELEVENLABS_AGENT_ID=") else l
                for l in lines
            ]
            env_path.write_text("\n".join(lines) + "\n")
        else:
            with env_path.open("a") as f:
                f.write(f"\nELEVENLABS_AGENT_ID={agent_id}\n")
    else:
        env_path.write_text(
            f"ELEVENLABS_API_KEY={os.getenv('ELEVENLABS_API_KEY', '')}\n"
            f"ELEVENLABS_AGENT_ID={agent_id}\n"
        )

    print(f"Saved ELEVENLABS_AGENT_ID to {env_path}")


def main():
    parser = argparse.ArgumentParser(description="Create ElevenLabs AI Avatar agent")
    parser.add_argument("--name", default="AI Assistant", help="Agent name shown to users")
    parser.add_argument(
        "--voice",
        default="rachel",
        choices=list(VOICES.keys()),
        help="Voice to use",
    )
    parser.add_argument(
        "--first-message",
        default="Hello! I can see this page — what would you like to know?",
        help="First message the agent says",
    )
    args = parser.parse_args()

    agent_id = create_agent(args.name, args.voice, args.first_message)
    update_env_file(agent_id)

    print("\nDone! Now run the backend:")
    print("  uvicorn main:app --reload --port 8000")


if __name__ == "__main__":
    main()
