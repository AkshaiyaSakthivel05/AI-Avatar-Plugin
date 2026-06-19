#!/usr/bin/env python3
# Run with: uv run python scripts/upgrade_dependencies.py
import subprocess

MAX_RETRIES = 3

STEPS = [
    ("uv self update", ["uv", "self", "update"]),
    ("uv sync --upgrade", ["uv", "sync", "--upgrade"]),
    ("pre-commit autoupdate", ["uv", "run", "pre-commit", "autoupdate"]),
    ("pre-commit run --all-files", ["uv", "run", "pre-commit", "run", "--all-files"]),
    ("ruff fix", ["uv", "run", "ruff", "check", "--fix", "--unsafe-fixes"]),
    ("ruff format", ["uv", "run", "ruff", "format", "."]),
]


def run_step(name: str, cmd: list[str]) -> bool:
    for attempt in range(1, MAX_RETRIES + 1):
        result = subprocess.run(cmd)
        if result.returncode == 0:
            suffix = f" (attempt {attempt})" if attempt > 1 else ""
            print(f"[OK] {name}{suffix}")
            return True
        if attempt < MAX_RETRIES:
            print(f"[RETRY {attempt}/{MAX_RETRIES}] {name} failed, retrying...")
        else:
            print(f"[FAIL] {name} failed after {MAX_RETRIES} attempts — continuing")
    return False


if __name__ == "__main__":
    results = {name: run_step(name, cmd) for name, cmd in STEPS}

    print("\n--- Summary ---")
    for name, ok in results.items():
        print(f"  {'OK  ' if ok else 'FAIL'} {name}")
