# src/scripts/stt/backends/manager.py
"""Backend manager for switching between STT backends."""

from typing import Dict, List, Optional, Type
from .base import BaseBackend
from .faster_whisper import FasterWhisperBackend
from .doubao import DoubaoBackend
from .whisper import WhisperBackend
from ..utils import to_simplified_chinese


class BackendManager:
    """Manages STT backends and allows runtime switching."""

    # Registry of available backend classes
    _backend_classes: Dict[str, Type[BaseBackend]] = {
        "faster-whisper": FasterWhisperBackend,
        "doubao-cloud": DoubaoBackend,
        "whisper": WhisperBackend,
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

        text, detected_lang = await backend.transcribe(audio_data, language)

        # Only convert Traditional Chinese to Simplified if detected language is Chinese
        if detected_lang == "zh" or detected_lang.startswith("zh-"):
            text = to_simplified_chinese(text)

        return text

    async def cleanup(self) -> None:
        """Cleanup all backends."""
        for backend in self._backends.values():
            await backend.cleanup()
        self._backends.clear()
        self._current_backend = None
