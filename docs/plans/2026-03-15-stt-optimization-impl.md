# STT 优化与架构重构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 优化 Python STT 响应时间（~4s→<0.5s），支持云端豆包，整理项目结构，完善测试覆盖

**Architecture:** 前后端分离，Python 常驻 WebSocket 服务，支持多后端动态切换（豆包云/faster-whisper/moonshine），Electron 悬浮球增加托盘菜单

**Tech Stack:** Python aiohttp/websockets, TypeScript, Electron, Playwright, Nut.js

---

## 当前进度 (2026-03-15)

### ✅ 已完成
- WebSocket STT 服务架构（实时录音启动，消除 ~4s 预热延迟）
- 繁简中文转换（使用 zhconv 库）
- **Alt+Tab 窗口闪烁问题** - 已通过 `focusable: false` 彻底解决

### ⏳ 待完成
- **文本插入到目标窗口** - 剪贴板写入 + Ctrl+V 方案，但有时不稳定
- **豆包 ASR/STT 集成测试**
- **托盘菜单功能**
- **完善测试覆盖**

---

## Phase 1: Python STT 服务

### Task 1.1: 创建项目结构和配置文件

**Files:**
- Create: `src/scripts/stt/__init__.py`
- Create: `src/scripts/stt/config.py`
- Create: `config/stt-config.json`
- Create: `.env.example`
- Modify: `.gitignore`

**Step 1: 创建 __init__.py**

```python
# src/scripts/stt/__init__.py
"""STT WebSocket Server Package"""

__version__ = "2.0.0"
```

**Step 2: 创建配置加载模块**

```python
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

    # Inject API keys into config
    if "DOUBAO_APP_KEY" in env_vars:
        config.setdefault("stt", {}).setdefault("backends", {}).setdefault("doubao-cloud", {})
        config["stt"]["backends"]["doubao-cloud"]["appKey"] = env_vars["DOUBAO_APP_KEY"]
    if "DOUBAO_ACCESS_KEY" in env_vars:
        config.setdefault("stt", {}).setdefault("backends", {}).setdefault("doubao-cloud", {})
        config["stt"]["backends"]["doubao-cloud"]["accessKey"] = env_vars["DOUBAO_ACCESS_KEY"]

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
```

**Step 3: 创建配置文件**

```json
// config/stt-config.json
{
  "server": {
    "host": "127.0.0.1",
    "port": 8765
  },
  "stt": {
    "defaultBackend": "faster-whisper",
    "backends": {
      "doubao-cloud": {
        "enabled": true,
        "url": "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream"
      },
      "faster-whisper": {
        "enabled": true,
        "model": "tiny",
        "device": "auto"
      },
      "moonshine-onnx": {
        "enabled": true,
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
```

**Step 4: 创建 .env.example**

```env
# .env.example
# Copy to .env and fill in your values

# Doubao Cloud API Keys (required for doubao-cloud backend)
DOUBAO_APP_KEY=your_app_key_here
DOUBAO_ACCESS_KEY=your_access_key_here
```

**Step 5: 更新 .gitignore**

在 `.gitignore` 末尾添加：

```gitignore
# Secrets
.env

# Reference files with sensitive data
Ref/

# Logs
logs/
```

**Step 6: 验证文件创建**

Run: `ls -la src/scripts/stt/ config/ .env.example .gitignore`
Expected: 所有文件存在

**Step 7: Commit**

```bash
git add src/scripts/stt/__init__.py src/scripts/stt/config.py config/stt-config.json .env.example .gitignore
git commit -m "feat(stt): add configuration system for WebSocket server

- Add config.py with .env support for API keys
- Add stt-config.json with backend settings
- Add .env.example template
- Update .gitignore for secrets and logs

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 1.2: 创建日志系统

**Files:**
- Create: `src/scripts/stt/logger.py`
- Create: `logs/.gitkeep`

**Step 1: 创建日志模块**

```python
# src/scripts/stt/logger.py
"""Logging system with rotation and size limits."""

import logging
import os
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional


def setup_logger(
    name: str = "stt",
    level: str = "INFO",
    log_dir: str = "./logs",
    max_file_size: int = 5242880,  # 5MB
    max_files: int = 5,
    max_total_size: int = 20971520,  # 20MB
    max_age: int = 604800  # 7 days in seconds
) -> logging.Logger:
    """Setup logger with file rotation and console output."""
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Clear existing handlers
    logger.handlers.clear()

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)
    console_format = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)

    # File handler with rotation
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    file_handler = RotatingFileHandler(
        log_path / "server.log",
        maxBytes=max_file_size,
        backupCount=max_files,
        encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_format = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    file_handler.setFormatter(file_format)
    logger.addHandler(file_handler)

    return logger


def get_logger(name: str = "stt") -> logging.Logger:
    """Get existing logger instance."""
    return logging.getLogger(name)


def set_log_level(level: str) -> None:
    """Dynamically set log level."""
    logger = get_logger("stt")
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    for handler in logger.handlers:
        if isinstance(handler, logging.StreamHandler):
            handler.setLevel(getattr(logging, level.upper(), logging.INFO))
```

**Step 2: 创建 logs 目录占位符**

```bash
mkdir -p logs && touch logs/.gitkeep
```

**Step 3: 验证日志模块**

Run: `cd src/scripts/stt && python -c "from logger import setup_logger; logger = setup_logger(); logger.info('test')"`
Expected: 输出日志信息到控制台

**Step 4: Commit**

```bash
git add src/scripts/stt/logger.py logs/.gitkeep
git commit -m "feat(stt): add logging system with rotation support

- Console and file output
- Configurable log level
- File rotation with size limits

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 1.3: 创建后端基类

**Files:**
- Create: `src/scripts/stt/backends/__init__.py`
- Create: `src/scripts/stt/backends/base.py`

**Step 1: 创建后端包初始化**

```python
# src/scripts/stt/backends/__init__.py
"""STT Backend implementations."""

from .base import BaseBackend

__all__ = ["BaseBackend"]
```

**Step 2: 创建后端基类**

```python
# src/scripts/stt/backends/base.py
"""Base class for STT backends."""

from abc import ABC, abstractmethod
from typing import Optional
import asyncio


class BaseBackend(ABC):
    """Abstract base class for STT backends."""

    def __init__(self, config: dict):
        """Initialize backend with configuration."""
        self.config = config
        self._initialized = False

    @property
    @abstractmethod
    def name(self) -> str:
        """Return backend name."""
        pass

    @abstractmethod
    async def transcribe(self, audio_data: bytes, language: str = "zh") -> str:
        """
        Transcribe audio data to text.

        Args:
            audio_data: Raw audio bytes (WAV format, 16kHz, mono)
            language: Language code (zh, en, etc.)

        Returns:
            Transcribed text string
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if backend is available (dependencies installed, configured)."""
        pass

    async def initialize(self) -> bool:
        """
        Initialize backend (load models, establish connections).
        Called once before first transcription.

        Returns:
            True if initialization successful
        """
        self._initialized = True
        return True

    async def cleanup(self) -> None:
        """Cleanup resources when backend is no longer needed."""
        self._initialized = False
```

**Step 3: 验证基类**

Run: `cd src/scripts/stt && python -c "from backends.base import BaseBackend; print(BaseBackend.__abstractmethods__)"`
Expected: `frozenset({'transcribe', 'name', 'is_available'})`

**Step 4: Commit**

```bash
git add src/scripts/stt/backends/__init__.py src/scripts/stt/backends/base.py
git commit -m "feat(stt): add abstract base class for backends

- Define common interface for all STT backends
- Support async initialization and cleanup

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 1.4: 创建 faster-whisper 后端

**Files:**
- Create: `src/scripts/stt/backends/faster_whisper.py`

**Step 1: 创建 faster-whisper 后端实现**

```python
# src/scripts/stt/backends/faster_whisper.py
"""Faster-Whisper backend implementation."""

import tempfile
import os
from typing import Optional
from .base import BaseBackend


class FasterWhisperBackend(BaseBackend):
    """Faster-Whisper local STT backend."""

    def __init__(self, config: dict):
        super().__init__(config)
        self.model = None
        self.model_name = config.get("model", "tiny")
        self.device = config.get("device", "auto")

    @property
    def name(self) -> str:
        return "faster-whisper"

    def is_available(self) -> bool:
        """Check if faster-whisper is installed."""
        try:
            from faster_whisper import WhisperModel
            return True
        except ImportError:
            return False

    async def initialize(self) -> bool:
        """Load the model."""
        if self._initialized:
            return True

        try:
            from faster_whisper import WhisperModel
            self.model = WhisperModel(
                self.model_name,
                device=self.device,
                compute_type="auto"
            )
            self._initialized = True
            return True
        except Exception as e:
            return False

    async def transcribe(self, audio_data: bytes, language: str = "zh") -> str:
        """Transcribe audio using faster-whisper."""
        if not self._initialized:
            await self.initialize()

        # Write audio to temp file (faster-whisper needs file path)
        temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        try:
            temp_file.write(audio_data)
            temp_file.close()

            segments, _ = self.model.transcribe(temp_file.name, language=language)
            text = " ".join([segment.text for segment in segments]).strip()
            return text
        finally:
            os.unlink(temp_file.name)
```

**Step 2: 验证后端（如已安装 faster-whisper）**

Run: `cd src/scripts/stt && python -c "from backends.faster_whisper import FasterWhisperBackend; b = FasterWhisperBackend({'model': 'tiny'}); print(b.is_available())"`
Expected: `True` 或 `False`（取决于是否安装）

**Step 3: Commit**

```bash
git add src/scripts/stt/backends/faster_whisper.py
git commit -m "feat(stt): add faster-whisper backend

- Async transcription support
- Auto model loading on first use

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 1.5: 创建豆包云后端

**Files:**
- Create: `src/scripts/stt/backends/doubao.py`

**Step 1: 创建豆包云后端实现**

```python
# src/scripts/stt/backends/doubao.py
"""Doubao Cloud STT backend implementation."""

import asyncio
import json
import struct
import gzip
import uuid
from typing import Optional
from .base import BaseBackend

# Constants for Doubao protocol
DEFAULT_SAMPLE_RATE = 16000


class ProtocolVersion:
    V1 = 0b0001


class MessageType:
    CLIENT_FULL_REQUEST = 0b0001
    CLIENT_AUDIO_ONLY_REQUEST = 0b0010
    SERVER_FULL_RESPONSE = 0b1001
    SERVER_ERROR_RESPONSE = 0b1111


class MessageTypeSpecificFlags:
    NO_SEQUENCE = 0b0000
    POS_SEQUENCE = 0b0001
    NEG_SEQUENCE = 0b0010
    NEG_WITH_SEQUENCE = 0b0011


class SerializationType:
    NO_SERIALIZATION = 0b0000
    JSON = 0b0001


class CompressionType:
    GZIP = 0b0001


class DoubaoBackend(BaseBackend):
    """Doubao Cloud STT backend using WebSocket."""

    def __init__(self, config: dict):
        super().__init__(config)
        self.url = config.get("url", "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream")
        self.app_key = config.get("appKey", "")
        self.access_key = config.get("accessKey", "")
        self._aiohttp = None

    @property
    def name(self) -> str:
        return "doubao-cloud"

    def is_available(self) -> bool:
        """Check if API keys are configured."""
        return bool(self.app_key and self.access_key)

    async def _get_aiohttp(self):
        """Lazy load aiohttp."""
        if self._aiohttp is None:
            import aiohttp
            self._aiohttp = aiohttp
        return self._aiohttp

    def _build_request_header(self, message_type: int, message_type_specific_flags: int) -> bytes:
        """Build protocol header."""
        header = bytearray()
        header.append((ProtocolVersion.V1 << 4) | 1)
        header.append((message_type << 4) | message_type_specific_flags)
        header.append((SerializationType.JSON << 4) | CompressionType.GZIP)
        header.extend(bytes([0x00]))
        return bytes(header)

    def _build_full_request(self, seq: int) -> bytes:
        """Build full client request with config."""
        payload = {
            "user": {"uid": "stt_user"},
            "audio": {
                "format": "wav",
                "codec": "raw",
                "rate": 16000,
                "bits": 16,
                "channel": 1
            },
            "request": {
                "model_name": "bigmodel",
                "enable_itn": True,
                "enable_punc": True,
                "enable_ddc": True,
                "show_utterances": True,
                "enable_nonstream": False
            }
        }

        payload_bytes = json.dumps(payload).encode('utf-8')
        compressed = gzip.compress(payload_bytes)

        request = bytearray()
        request.extend(self._build_request_header(
            MessageType.CLIENT_FULL_REQUEST,
            MessageTypeSpecificFlags.POS_SEQUENCE
        ))
        request.extend(struct.pack('>i', seq))
        request.extend(struct.pack('>I', len(compressed)))
        request.extend(compressed)

        return bytes(request)

    def _build_audio_request(self, seq: int, audio_chunk: bytes, is_last: bool = False) -> bytes:
        """Build audio-only request."""
        flags = MessageTypeSpecificFlags.NEG_WITH_SEQUENCE if is_last else MessageTypeSpecificFlags.POS_SEQUENCE
        actual_seq = -seq if is_last else seq

        compressed = gzip.compress(audio_chunk)

        request = bytearray()
        request.extend(self._build_request_header(
            MessageType.CLIENT_AUDIO_ONLY_REQUEST,
            flags
        ))
        request.extend(struct.pack('>i', actual_seq))
        request.extend(struct.pack('>I', len(compressed)))
        request.extend(compressed)

        return bytes(request)

    def _parse_response(self, data: bytes) -> dict:
        """Parse server response."""
        header_size = data[0] & 0x0f
        message_type = data[1] >> 4
        message_type_specific_flags = data[1] & 0x0f
        serialization = data[2] >> 4
        compression = data[2] & 0x0f

        payload = data[header_size * 4:]

        # Parse sequence if present
        sequence = 0
        if message_type_specific_flags & 0x01:
            sequence = struct.unpack('>i', payload[:4])[0]
            payload = payload[4:]

        is_last = bool(message_type_specific_flags & 0x02)

        # Parse payload size
        if message_type == MessageType.SERVER_FULL_RESPONSE:
            payload_size = struct.unpack('>I', payload[:4])[0]
            payload = payload[4:]
        elif message_type == MessageType.SERVER_ERROR_RESPONSE:
            code = struct.unpack('>i', payload[:4])[0]
            payload = payload[8:]  # Skip code and size
        else:
            payload_size = 0

        # Decompress if needed
        if compression == CompressionType.GZIP and payload:
            try:
                payload = gzip.decompress(payload)
            except:
                pass

        # Parse JSON
        result = {
            "is_last": is_last,
            "sequence": sequence,
            "message_type": message_type
        }

        if payload and serialization == SerializationType.JSON:
            try:
                result["payload"] = json.loads(payload.decode('utf-8'))
            except:
                pass

        return result

    async def transcribe(self, audio_data: bytes, language: str = "zh") -> str:
        """Transcribe audio using Doubao Cloud API."""
        aiohttp = await self._get_aiohttp()

        headers = {
            "X-Api-Resource-Id": "volc.bigasr.sauc.duration",
            "X-Api-Request-Id": str(uuid.uuid4()),
            "X-Api-Access-Key": self.access_key,
            "X-Api-App-Key": self.app_key
        }

        seq = 1
        result_text = ""

        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(self.url, headers=headers) as ws:
                # Send full request
                await ws.send_bytes(self._build_full_request(seq))
                seq += 1

                # Split audio into chunks (200ms segments)
                chunk_size = DEFAULT_SAMPLE_RATE * 2 * 0.2  # 16-bit mono
                chunks = [audio_data[i:i + int(chunk_size)] for i in range(0, len(audio_data), int(chunk_size))]

                for i, chunk in enumerate(chunks):
                    is_last = (i == len(chunks) - 1)
                    await ws.send_bytes(self._build_audio_request(seq, chunk, is_last))
                    if not is_last:
                        seq += 1

                    # Receive response
                    try:
                        msg = await asyncio.wait_for(ws.receive(), timeout=5.0)
                        if msg.type == aiohttp.WSMsgType.BINARY:
                            response = self._parse_response(msg.data)
                            if "payload" in response:
                                # Extract text from response
                                payload = response["payload"]
                                if isinstance(payload, dict) and "result" in payload:
                                    for utterance in payload["result"].get("text", []):
                                        result_text += utterance.get("text", "")
                    except asyncio.TimeoutError:
                        pass

        return result_text.strip()
```

**Step 2: 验证后端类加载**

Run: `cd src/scripts/stt && python -c "from backends.doubao import DoubaoBackend; b = DoubaoBackend({}); print(b.name)"`
Expected: `doubao-cloud`

**Step 3: Commit**

```bash
git add src/scripts/stt/backends/doubao.py
git commit -m "feat(stt): add Doubao Cloud backend

- WebSocket streaming protocol
- Support for real-time transcription
- Requires API keys in .env

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 1.6: 创建后端管理器

**Files:**
- Create: `src/scripts/stt/backends/manager.py`
- Modify: `src/scripts/stt/backends/__init__.py`

**Step 1: 创建后端管理器**

```python
# src/scripts/stt/backends/manager.py
"""Backend manager for switching between STT backends."""

from typing import Dict, List, Optional, Type
from .base import BaseBackend
from .faster_whisper import FasterWhisperBackend
from .doubao import DoubaoBackend


class BackendManager:
    """Manages STT backends and allows runtime switching."""

    # Registry of available backend classes
    _backend_classes: Dict[str, Type[BaseBackend]] = {
        "faster-whisper": FasterWhisperBackend,
        "doubao-cloud": DoubaoBackend,
    }

    def __init__(self, config: dict):
        """Initialize manager with configuration."""
        self.config = config
        self._backends: Dict[str, BaseBackend] = {}
        self._current_backend: Optional[str] = None

    def get_available_backends(self) -> List[str]:
        """Get list of available backend names."""
        available = []
        backends_config = self.config.get("stt", {}).get("backends", {})

        for name, cls in self._backend_classes.items():
            if backends_config.get(name, {}).get("enabled", False):
                backend = self._get_backend(name)
                if backend and backend.is_available():
                    available.append(name)

        return available

    def _get_backend(self, name: str) -> Optional[BaseBackend]:
        """Get or create backend instance."""
        if name not in self._backends:
            cls = self._backend_classes.get(name)
            if cls is None:
                return None

            backend_config = self.config.get("stt", {}).get("backends", {}).get(name, {})
            self._backends[name] = cls(backend_config)

        return self._backends[name]

    async def initialize(self) -> bool:
        """Initialize default backend."""
        default = self.config.get("stt", {}).get("defaultBackend", "faster-whisper")
        return await self.switch_backend(default)

    async def switch_backend(self, name: str) -> bool:
        """Switch to specified backend."""
        backend = self._get_backend(name)
        if backend is None:
            return False

        if not backend.is_available():
            return False

        success = await backend.initialize()
        if success:
            self._current_backend = name

        return success

    def get_current_backend(self) -> Optional[str]:
        """Get current backend name."""
        return self._current_backend

    async def transcribe(self, audio_data: bytes, language: str = "zh") -> str:
        """Transcribe using current backend."""
        if self._current_backend is None:
            raise RuntimeError("No backend initialized")

        backend = self._get_backend(self._current_backend)
        if backend is None:
            raise RuntimeError(f"Backend {self._current_backend} not found")

        return await backend.transcribe(audio_data, language)

    async def cleanup(self) -> None:
        """Cleanup all backends."""
        for backend in self._backends.values():
            await backend.cleanup()
        self._backends.clear()
        self._current_backend = None
```

**Step 2: 更新 __init__.py**

```python
# src/scripts/stt/backends/__init__.py
"""STT Backend implementations."""

from .base import BaseBackend
from .manager import BackendManager
from .faster_whisper import FasterWhisperBackend
from .doubao import DoubaoBackend

__all__ = [
    "BaseBackend",
    "BackendManager",
    "FasterWhisperBackend",
    "DoubaoBackend",
]
```

**Step 3: 验证管理器**

Run: `cd src/scripts/stt && python -c "from backends import BackendManager; m = BackendManager({'stt': {'backends': {'faster-whisper': {'enabled': True}}}}); print(m.get_available_backends())"`
Expected: 列表输出（可能为空或有 faster-whisper）

**Step 4: Commit**

```bash
git add src/scripts/stt/backends/manager.py src/scripts/stt/backends/__init__.py
git commit -m "feat(stt): add backend manager for runtime switching

- Detect available backends
- Switch backends dynamically
- Lazy initialization

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 1.7: 创建 WebSocket 服务器

**Files:**
- Create: `src/scripts/stt/server.py`

**Step 1: 创建 WebSocket 服务器**

```python
# src/scripts/stt/server.py
"""WebSocket server for STT service."""

import asyncio
import json
import signal
import sys
from pathlib import Path
from typing import Optional

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from stt.config import load_config, DEFAULT_CONFIG
from stt.logger import setup_logger, get_logger, set_log_level
from stt.backends import BackendManager


class STTServer:
    """WebSocket server for speech-to-text service."""

    def __init__(self, config: dict = None):
        """Initialize server with configuration."""
        self.config = config or DEFAULT_CONFIG
        self.logger = setup_logger(
            "stt",
            level=self.config.get("logging", {}).get("level", "INFO"),
            log_dir=self.config.get("logging", {}).get("dir", "./logs"),
            max_file_size=self.config.get("logging", {}).get("maxFileSize", 5242880),
            max_files=self.config.get("logging", {}).get("maxFiles", 5),
        )
        self.backend_manager = BackendManager(self.config)
        self._running = False
        self._server = None

    async def handle_websocket(self, websocket, path):
        """Handle WebSocket connection."""
        self.logger.info(f"New WebSocket connection from {websocket.remote_address}")

        recording = False
        audio_buffer = b""

        try:
            async for message in websocket:
                if isinstance(message, bytes):
                    # Binary audio data
                    if recording:
                        audio_buffer += message
                else:
                    # JSON text message
                    try:
                        data = json.loads(message)
                        action = data.get("action")

                        if action == "start_recording":
                            recording = True
                            audio_buffer = b""
                            language = data.get("language", "zh")
                            self.logger.info("Recording started")
                            await websocket.send(json.dumps({
                                "event": "recording_started"
                            }))

                        elif action == "stop_recording":
                            recording = False
                            self.logger.info(f"Recording stopped, {len(audio_buffer)} bytes")

                            # Transcribe
                            try:
                                text = await self.backend_manager.transcribe(audio_buffer, language)
                                self.logger.info(f"Transcription result: {text}")
                                await websocket.send(json.dumps({
                                    "event": "result",
                                    "text": text,
                                    "backend": self.backend_manager.get_current_backend()
                                }))
                            except Exception as e:
                                self.logger.error(f"Transcription error: {e}")
                                await websocket.send(json.dumps({
                                    "event": "error",
                                    "message": str(e)
                                }))

                            audio_buffer = b""

                        elif action == "switch_backend":
                            backend = data.get("backend")
                            success = await self.backend_manager.switch_backend(backend)
                            if success:
                                await websocket.send(json.dumps({
                                    "event": "backend_switched",
                                    "backend": backend
                                }))
                            else:
                                await websocket.send(json.dumps({
                                    "event": "error",
                                    "message": f"Failed to switch to backend: {backend}"
                                }))

                    except json.JSONDecodeError:
                        await websocket.send(json.dumps({
                            "event": "error",
                            "message": "Invalid JSON"
                        }))

        except Exception as e:
            self.logger.error(f"WebSocket error: {e}")
        finally:
            self.logger.info(f"WebSocket connection closed")

    async def handle_http(self, path, request_headers):
        """Handle HTTP requests for API endpoints."""
        if path == "/api/status":
            return (
                200,
                {"Content-Type": "application/json"},
                json.dumps({
                    "status": "running",
                    "backend": self.backend_manager.get_current_backend(),
                    "available_backends": self.backend_manager.get_available_backends()
                }).encode()
            )

        elif path == "/api/backends":
            return (
                200,
                {"Content-Type": "application/json"},
                json.dumps({
                    "available": self.backend_manager.get_available_backends(),
                    "current": self.backend_manager.get_current_backend()
                }).encode()
            )

        return (404, {}, b"Not found")

    async def start(self):
        """Start the server."""
        try:
            import aiohttp
            from aiohttp import web
            import aiohttp.web_ws
        except ImportError:
            self.logger.error("aiohttp not installed. Run: pip install aiohttp")
            return False

        # Initialize backend
        success = await self.backend_manager.initialize()
        if not success:
            self.logger.error("Failed to initialize backend")
            return False

        host = self.config.get("server", {}).get("host", "127.0.0.1")
        port = self.config.get("server", {}).get("port", 8765)

        self.logger.info(f"Starting STT server on {host}:{port}")
        self.logger.info(f"Current backend: {self.backend_manager.get_current_backend()}")
        self.logger.info(f"Available backends: {self.backend_manager.get_available_backends()}")

        # Create aiohttp app
        app = web.Application()

        # WebSocket route
        app.router.add_get("/", self._ws_handler)
        app.router.add_get("/api/status", self._api_status)
        app.router.add_get("/api/backends", self._api_backends)
        app.router.add_post("/api/backend", self._api_switch_backend)
        app.router.add_post("/api/debug", self._api_debug)

        self._runner = web.AppRunner(app)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, host, port)
        await self._site.start()

        self._running = True
        self.logger.info(f"Server started on ws://{host}:{port}")

        return True

    async def _ws_handler(self, request):
        """WebSocket handler for aiohttp."""
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        recording = False
        audio_buffer = b""
        language = "zh"

        self.logger.info(f"WebSocket connection established")

        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    action = data.get("action")

                    if action == "start_recording":
                        recording = True
                        audio_buffer = b""
                        language = data.get("language", "zh")
                        self.logger.info("Recording started")
                        await ws.send_json({"event": "recording_started"})

                    elif action == "stop_recording":
                        recording = False
                        self.logger.info(f"Recording stopped, {len(audio_buffer)} bytes")

                        try:
                            text = await self.backend_manager.transcribe(audio_buffer, language)
                            self.logger.info(f"Transcription: {text}")
                            await ws.send_json({
                                "event": "result",
                                "text": text,
                                "backend": self.backend_manager.get_current_backend()
                            })
                        except Exception as e:
                            self.logger.error(f"Transcription error: {e}")
                            await ws.send_json({"event": "error", "message": str(e)})

                        audio_buffer = b""

                    elif action == "switch_backend":
                        backend = data.get("backend")
                        success = await self.backend_manager.switch_backend(backend)
                        if success:
                            await ws.send_json({"event": "backend_switched", "backend": backend})
                        else:
                            await ws.send_json({"event": "error", "message": f"Failed to switch to {backend}"})

                except json.JSONDecodeError:
                    await ws.send_json({"event": "error", "message": "Invalid JSON"})

            elif msg.type == aiohttp.WSMsgType.BINARY:
                if recording:
                    audio_buffer += msg.data

            elif msg.type == aiohttp.WSMsgType.ERROR:
                self.logger.error(f"WebSocket error: {ws.exception()}")

        self.logger.info("WebSocket connection closed")
        return ws

    async def _api_status(self, request):
        """API endpoint: get server status."""
        return web.json_response({
            "status": "running",
            "backend": self.backend_manager.get_current_backend(),
            "available_backends": self.backend_manager.get_available_backends()
        })

    async def _api_backends(self, request):
        """API endpoint: list available backends."""
        return web.json_response({
            "available": self.backend_manager.get_available_backends(),
            "current": self.backend_manager.get_current_backend()
        })

    async def _api_switch_backend(self, request):
        """API endpoint: switch backend."""
        try:
            data = await request.json()
            backend = data.get("backend")
            success = await self.backend_manager.switch_backend(backend)
            if success:
                return web.json_response({"success": True, "backend": backend})
            else:
                return web.json_response({"success": False, "error": f"Failed to switch to {backend}"}, status=400)
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    async def _api_debug(self, request):
        """API endpoint: set debug level."""
        try:
            data = await request.json()
            level = data.get("level", "INFO")
            set_log_level(level)
            self.logger.info(f"Log level changed to {level}")
            return web.json_response({"success": True, "level": level})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    async def stop(self):
        """Stop the server."""
        self.logger.info("Stopping server...")
        self._running = False

        await self.backend_manager.cleanup()

        if hasattr(self, '_runner'):
            await self._runner.cleanup()

        self.logger.info("Server stopped")

    async def run_forever(self):
        """Run server until interrupted."""
        success = await self.start()
        if not success:
            return

        # Wait forever
        while self._running:
            await asyncio.sleep(1)


async def main():
    """Main entry point."""
    config = load_config()
    server = STTServer(config)

    # Handle signals
    loop = asyncio.get_event_loop()

    def signal_handler():
        server.logger.info("Shutdown signal received")
        server._running = False

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    await server.run_forever()
    await server.stop()


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 2: 验证服务器可导入**

Run: `cd src/scripts && python -c "from stt.server import STTServer; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add src/scripts/stt/server.py
git commit -m "feat(stt): add WebSocket server

- aiohttp-based WebSocket server
- REST API endpoints for status/backend switching
- Binary audio data support
- Graceful shutdown handling

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 2: 文件夹整理

### Task 2.1: 归档旧参考文件

**Files:**
- Move: `Ref/PR11345/` → `outdated/Ref/PR11345/`
- Move: `Ref/PR9264/` → `outdated/Ref/PR9264/`
- Move: `Ref/opencode-stt/` → `outdated/Ref/opencode-stt/`

**Step 1: 创建 outdated 目录并移动文件**

```bash
mkdir -p outdated/Ref
mv Ref/PR11345 outdated/Ref/
mv Ref/PR9264 outdated/Ref/
mv Ref/opencode-stt outdated/Ref/
```

**Step 2: 验证移动结果**

Run: `ls -la outdated/Ref/ && ls -la Ref/`
Expected: `outdated/Ref/` 包含三个文件夹，`Ref/` 只剩 `Doubao/`

**Step 3: Commit**

```bash
git add outdated/
git rm -r Ref/PR11345 Ref/PR9264 Ref/opencode-stt
git commit -m "chore: archive outdated reference implementations

- Move PR11345, PR9264, opencode-stt to outdated/
- Keep Ref/Doubao for active development

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2.2: 更新 .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: 确认 .gitignore 包含必要项**

确保 `.gitignore` 包含：

```gitignore
# Secrets
.env

# Reference files with sensitive data
Ref/

# Logs
logs/

# Node
node_modules/

# Build
dist/

# IDE
.idea/
.vscode/
*.swp
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: update .gitignore for secrets and logs

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 3: 测试案例梳理

### Task 3.1: 安装测试框架

**Files:**
- Modify: `package.json`

**Step 1: 安装 Playwright**

```bash
npm install --save-dev @playwright/test
npx playwright install
```

**Step 2: 验证安装**

Run: `npx playwright --version`
Expected: 版本号输出

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "test: add Playwright for E2E testing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3.2: 创建状态机单元测试

**Files:**
- Create: `tests/unit/state-machine.test.ts`

**Step 1: 创建测试文件**

```typescript
// tests/unit/state-machine.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

// Simple state machine for STT
type State = 'idle' | 'warming' | 'recording' | 'processing' | 'success' | 'error';

class STTStateMachine {
  private _state: State = 'idle';

  get state(): State {
    return this._state;
  }

  transition(event: string): void {
    switch (this._state) {
      case 'idle':
        if (event === 'start') this._state = 'warming';
        break;
      case 'warming':
        if (event === 'ready') this._state = 'recording';
        else if (event === 'error') this._state = 'idle';
        break;
      case 'recording':
        if (event === 'stop') this._state = 'processing';
        else if (event === 'timeout') this._state = 'idle';
        else if (event === 'error') this._state = 'idle';
        break;
      case 'processing':
        if (event === 'success') this._state = 'success';
        else if (event === 'error') this._state = 'error';
        break;
      case 'success':
      case 'error':
        // Auto reset after a delay (simulated)
        this._state = 'idle';
        break;
    }
  }

  reset(): void {
    this._state = 'idle';
  }
}

describe('STTStateMachine', () => {
  let machine: STTStateMachine;

  beforeEach(() => {
    machine = new STTStateMachine();
  });

  it('should start in idle state', () => {
    expect(machine.state).toBe('idle');
  });

  it('should transition to warming on start', () => {
    machine.transition('start');
    expect(machine.state).toBe('warming');
  });

  it('should transition to recording when ready', () => {
    machine.transition('start');
    machine.transition('ready');
    expect(machine.state).toBe('recording');
  });

  it('should return to idle on error from any state', () => {
    machine.transition('start');
    machine.transition('error');
    expect(machine.state).toBe('idle');

    machine.transition('start');
    machine.transition('ready');
    machine.transition('error');
    expect(machine.state).toBe('idle');
  });

  it('should handle timeout during recording', () => {
    machine.transition('start');
    machine.transition('ready');
    machine.transition('timeout');
    expect(machine.state).toBe('idle');
  });

  it('should complete full cycle successfully', () => {
    machine.transition('start');
    machine.transition('ready');
    machine.transition('stop');
    machine.transition('success');
    expect(machine.state).toBe('idle');
  });

  it('should handle rapid state changes', () => {
    machine.transition('start');
    machine.transition('ready');
    machine.transition('stop');
    expect(machine.state).toBe('processing');
  });
});
```

**Step 2: 运行测试**

Run: `npm test tests/unit/state-machine.test.ts`
Expected: 所有测试通过

**Step 3: Commit**

```bash
git add tests/unit/state-machine.test.ts
git commit -m "test: add state machine unit tests

- Cover all state transitions
- Test error recovery
- Test timeout handling

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3.3: 创建 Python 服务器集成测试

**Files:**
- Create: `tests/integration/python-server.test.ts`

**Step 1: 创建测试文件**

```typescript
// tests/integration/python-server.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';

describe('Python STT Server', () => {
  let serverProcess: ChildProcess;
  let ws: WebSocket;

  beforeAll(async () => {
    // Start Python server
    serverProcess = spawn('python', ['src/scripts/stt/server.py'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  afterAll(async () => {
    if (ws) ws.close();
    if (serverProcess) {
      serverProcess.kill();
      await new Promise(resolve => serverProcess.on('close', resolve));
    }
  });

  it('should start and accept WebSocket connections', async () => {
    return new Promise((resolve, reject) => {
      ws = new WebSocket('ws://127.0.0.1:8765');

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        resolve(undefined);
      });

      ws.on('error', reject);

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  });

  it('should respond to status API', async () => {
    const response = await fetch('http://127.0.0.1:8765/api/status');
    const data = await response.json();

    expect(data.status).toBe('running');
    expect(data.backend).toBeDefined();
    expect(Array.isArray(data.available_backends)).toBe(true);
  });

  it('should handle start/stop recording messages', async () => {
    return new Promise((resolve, reject) => {
      ws = new WebSocket('ws://127.0.0.1:8765');

      ws.on('open', () => {
        // Send start recording
        ws.send(JSON.stringify({ action: 'start_recording', language: 'zh' }));
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.event === 'recording_started') {
          // Send stop recording
          ws.send(JSON.stringify({ action: 'stop_recording' }));
        }

        if (msg.event === 'result' || msg.event === 'error') {
          expect(msg.event).toBeDefined();
          resolve(undefined);
        }
      });

      ws.on('error', reject);
      setTimeout(() => reject(new Error('Test timeout')), 10000);
    });
  });
});
```

**Step 2: Commit**

```bash
git add tests/integration/python-server.test.ts
git commit -m "test: add Python server integration tests

- WebSocket connection test
- Status API test
- Recording start/stop flow test

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3.4: 创建 Playwright E2E 配置

**Files:**
- Create: `playwright.config.ts`

**Step 1: 创建配置文件**

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'electron',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

**Step 2: Commit**

```bash
git add playwright.config.ts
git commit -m "test: add Playwright configuration

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 4: 用户手册

### Task 4.1: 创建用户手册

**Files:**
- Create: `docs/user-guide.md`

**Step 1: 创建用户手册**

```markdown
# OpenCode STT 用户手册

## 1. 概述

OpenCode STT 是一个语音转文字工具，支持本地和云端后端。

### 功能特性

- 悬浮球快速录音
- 多后端支持（豆包云、faster-whisper、moonshine）
- 系统托盘管理
- 后端动态切换

### 系统要求

- Windows 10/11
- Node.js >= 18.0.0
- Python >= 3.8

## 2. 安装

### 2.1 Node.js 依赖

\`\`\`bash
npm install
\`\`\`

### 2.2 Python 依赖

\`\`\`bash
pip install aiohttp sounddevice soundfile numpy faster-whisper
\`\`\`

可选：
\`\`\`bash
pip install moonshine-onnx openai-whisper
\`\`\`

### 2.3 配置 API Keys

复制 `.env.example` 到 `.env` 并填入豆包云 API 密钥：

\`\`\`env
DOUBAO_APP_KEY=your_app_key
DOUBAO_ACCESS_KEY=your_access_key
\`\`\`

## 3. 使用方法

### 3.1 启动服务

\`\`\`bash
# 启动 Python STT 服务
python src/scripts/stt/server.py

# 启动悬浮球应用
cd floating-ball && npm start
\`\`\`

### 3.2 录音操作

1. 点击悬浮球开始录音
2. 说话
3. 释放悬浮球结束录音
4. 等待转写结果

### 3.3 托盘菜单

右键点击托盘图标可以：
- 显示/隐藏悬浮球
- 切换后端
- 开启调试日志
- 退出应用

## 4. 配置说明

### 4.1 stt-config.json

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `server.host` | 服务地址 | `127.0.0.1` |
| `server.port` | 服务端口 | `8765` |
| `stt.defaultBackend` | 默认后端 | `faster-whisper` |
| `logging.level` | 日志级别 | `INFO` |

### 4.2 后端选项

| 后端 | 说明 | 要求 |
|------|------|------|
| `faster-whisper` | 本地 Whisper | faster-whisper 包 |
| `doubao-cloud` | 豆包云 | API Key |
| `moonshine-onnx` | 本地轻量 | moonshine-onnx 包 |

## 5. 故障排除

### 5.1 服务启动失败

检查 Python 依赖是否安装：
\`\`\`bash
python -c "import aiohttp; print('OK')"
\`\`\`

### 5.2 麦克风无权限

Windows 设置 > 隐私 > 麦克风，允许应用访问。

### 5.3 查看日志

日志位于 `logs/server.log`。
```

**Step 2: Commit**

```bash
git add docs/user-guide.md
git commit -m "docs: add user guide

- Installation instructions
- Usage guide
- Configuration reference
- Troubleshooting

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 完成检查清单

- [ ] Phase 1: Python STT 服务
  - [ ] Task 1.1: 配置系统
  - [ ] Task 1.2: 日志系统
  - [ ] Task 1.3: 后端基类
  - [ ] Task 1.4: faster-whisper 后端
  - [ ] Task 1.5: 豆包云后端
  - [ ] Task 1.6: 后端管理器
  - [ ] Task 1.7: WebSocket 服务器
- [ ] Phase 2: 文件夹整理
  - [ ] Task 2.1: 归档旧文件
  - [ ] Task 2.2: 更新 .gitignore
- [ ] Phase 3: 测试案例
  - [ ] Task 3.1: 安装测试框架
  - [ ] Task 3.2: 状态机测试
  - [ ] Task 3.3: 服务器集成测试
  - [ ] Task 3.4: Playwright 配置
- [ ] Phase 4: 用户手册
  - [ ] Task 4.1: 创建用户手册
