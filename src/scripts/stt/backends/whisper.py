# src/scripts/stt/backends/whisper.py
"""OpenAI Whisper backend implementation."""

import tempfile
import os
from typing import Optional
from .base import BaseBackend


class WhisperBackend(BaseBackend):
    """OpenAI Whisper local STT backend."""

    def __init__(self, config: dict):
        super().__init__(config)
        self.model = None
        self.model_name = config.get("model", "tiny")

    @property
    def name(self) -> str:
        return "whisper"

    def is_available(self) -> bool:
        """Check if whisper is installed."""
        try:
            import whisper
            return True
        except ImportError:
            return False

    async def initialize(self) -> bool:
        """Load the model."""
        if self._initialized:
            return True

        try:
            import whisper
            self.model = whisper.load_model(self.model_name)
            self._initialized = True
            return True
        except Exception as e:
            print(f"Whisper initialization error: {e}")
            return False

    async def transcribe(self, audio_data: bytes, language: str = "zh") -> str:
        """Transcribe audio using whisper."""
        if not self._initialized:
            await self.initialize()

        # Write audio to temp file (whisper needs file path)
        temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        try:
            temp_file.write(audio_data)
            temp_file.close()

            result = self.model.transcribe(temp_file.name, language=language)
            return result.get("text", "").strip()
        finally:
            os.unlink(temp_file.name)

    async def cleanup(self) -> None:
        """Cleanup resources."""
        self.model = None
        self._initialized = False
