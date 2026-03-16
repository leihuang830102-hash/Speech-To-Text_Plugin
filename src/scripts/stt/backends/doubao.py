# src/scripts/stt/backends/doubao.py
"""Doubao Cloud ASR backend using RevenueModeASR SDK."""

import asyncio
import logging
import os
import tempfile
from typing import Tuple

from .base import BaseBackend

logger = logging.getLogger(__name__)


class DoubaoBackend(BaseBackend):
    """豆包云 ASR 后端 - 使用 RevenueModeASR SDK"""

    def __init__(self, config: dict):
        super().__init__(config)
        self._client = None

    @property
    def name(self) -> str:
        return "doubao-cloud"

    def is_available(self) -> bool:
        """Check if SDK is available and configured."""
        try:
            # Load .env file using absolute path
            from pathlib import Path
            from dotenv import load_dotenv

            # Get the .env file path (5 levels up from this file)
            env_path = Path(__file__).parent.parent.parent.parent.parent / ".env"
            load_dotenv(env_path)

            # Check if required env vars are set
            required_vars = ["ASR_APP_ID", "ASR_ACCESS_TOKEN", "ASR_CLUSTER"]
            available = all(os.getenv(var) for var in required_vars)

            if not available:
                missing = [var for var in required_vars if not os.getenv(var)]
                logger.warning(f"[{self.name}] Missing env vars: {missing}")

            return available
        except Exception as e:
            logger.error(f"[{self.name}] is_available check failed: {e}")
            return False

    async def initialize(self) -> bool:
        """Initialize the ASR client."""
        try:
            # Import SDK from local doubao_asr package
            from .doubao_asr import RevenueModeASR
            self._client = RevenueModeASR()
            self._initialized = True
            logger.info(f"[{self.name}] Initialized RevenueModeASR client")
            return True
        except Exception as e:
            logger.error(f"[{self.name}] Failed to initialize: {e}")
            return False

    async def transcribe(self, audio_data: bytes, language: str = "zh") -> Tuple[str, str]:
        """
        Transcribe audio data to text.

        Args:
            audio_data: Raw audio bytes (WAV format)
            language: Language code (zh, en, etc.)

        Returns:
            Tuple of (transcribed text, language code)
        """
        if self._client is None:
            await self.initialize()

        # Save audio to temp file (SDK expects file path)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_data)
            temp_path = f.name

        try:
            # Run blocking SDK call in executor
            loop = asyncio.get_event_loop()
            text = await loop.run_in_executor(
                None,
                self._client.recognize,
                temp_path
            )

            logger.info(f"[{self.name}] Transcription: {text}")
            return text, language

        except Exception as e:
            logger.error(f"[{self.name}] Transcription failed: {e}")
            raise

        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except:
                pass

    async def cleanup(self) -> None:
        """Cleanup resources."""
        self._client = None
        self._initialized = False
