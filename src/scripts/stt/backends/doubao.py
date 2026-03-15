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

    async def transcribe(self, audio_data: bytes, language: str = "zh") -> tuple:
        """Transcribe audio using Doubao Cloud API.

        Returns:
            Tuple of (text, detected_language)
        """
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

        # Doubao doesn't return detected language, use input language
        return result_text.strip(), language
