# src/scripts/stt/backends/base.py
"""Base class for STT backends."""

from abc import ABC, abstractmethod
from typing import Optional, Tuple
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
    async def transcribe(self, audio_data: bytes, language: str = "zh") -> Tuple[str, str]:
        """
        Transcribe audio data to text.

        Args:
            audio_data: Raw audio bytes (WAV format, 16kHz, mono)
            language: Language code (zh, en, etc.)

        Returns:
            Tuple of (transcribed text, detected language code)
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
