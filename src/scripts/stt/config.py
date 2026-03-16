# src/scripts/stt/config.py
"""Configuration loader for STT server."""

import json
import os
from pathlib import Path
from typing import Any, Dict

def load_env_file(env_path: Path) -> Dict[str, str]:
    """Load .env file into dictionary."""
    env_vars = {}
    if env_path.exists():
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
    return env_vars

def load_config(config_path: Path = None) -> Dict[str, Any]:
    """Load configuration from JSON file with .env overrides."""
    if config_path is None:
        # Default path relative to this file
        config_path = Path(__file__).parent.parent.parent.parent / "config" / "stt-config.json"

    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    # Load .env for API keys
    env_path = config_path.parent.parent / ".env"
    env_vars = load_env_file(env_path)

    # Inject API keys into config (for Realtime Dialogue API)
    if "DOUBAO_APP_ID" in env_vars:
        config.setdefault("stt", {}).setdefault("backends", {}).setdefault("doubao-cloud", {})
        config["stt"]["backends"]["doubao-cloud"]["appId"] = env_vars["DOUBAO_APP_ID"]
    if "DOUBAO_ACCESS_TOKEN" in env_vars:
        config.setdefault("stt", {}).setdefault("backends", {}).setdefault("doubao-cloud", {})
        config["stt"]["backends"]["doubao-cloud"]["accessToken"] = env_vars["DOUBAO_ACCESS_TOKEN"]

    return config

# Default configuration
DEFAULT_CONFIG = {
    "server": {
        "host": "127.0.0.1",
        "port": 8765
    },
    "stt": {
        "defaultBackend": "faster-whisper",
        "backends": {
            "doubao-cloud": {
                "enabled": True,
                "url": "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream"
            },
            "faster-whisper": {
                "enabled": True,
                "model": "tiny",
                "device": "auto"
            },
            "moonshine-onnx": {
                "enabled": True,
                "model": "tiny"
            }
        }
    },
    "logging": {
        "level": "INFO",
        "dir": "./logs",
        "maxFileSize": 5242880,
        "maxFiles": 5,
        "maxTotalSize": 20971520,
        "maxAge": 604800
    }
}
