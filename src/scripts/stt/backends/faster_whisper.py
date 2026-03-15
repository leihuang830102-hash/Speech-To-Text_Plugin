# src/scripts/stt/backends/faster_whisper.py
"""Faster-Whisper backend implementation."""

import tempfile
import os
from typing import Optional, Tuple
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

    async def transcribe(self, audio_data: bytes, language: str = "zh") -> Tuple[str, str]:
        """Transcribe audio using faster-whisper.

        Returns:
            Tuple of (text, detected_language)
        """
        if not self._initialized:
            await self.initialize()

        # Write audio to temp file (faster-whisper needs file path)
        temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        try:
            temp_file.write(audio_data)
            temp_file.close()

            # Pass None for auto-detect
            lang_param = None if language == "auto" else language
            segments, info = self.model.transcribe(temp_file.name, language=lang_param)
            text = " ".join([segment.text for segment in segments]).strip()
            detected_lang = info.language if hasattr(info, 'language') else language
            return text, detected_lang
        finally:
            os.unlink(temp_file.name)
