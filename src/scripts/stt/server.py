# src/scripts/stt/server.py
"""WebSocket server for STT service."""

import asyncio
import json
import signal
import sys
from pathlib import Path
from typing import Optional

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from stt.config import load_config, DEFAULT_CONFIG
from stt.logger import setup_logger, get_logger, set_log_level
from stt.backends import BackendManager

try:
    from aiohttp import web
except ImportError:
    print("Error: aiohttp not installed. Run: pip install aiohttp")
    sys.exit(1)


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
        self._runner = None

    async def handle_websocket(self, request):
        """Handle WebSocket connection."""
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        recording = False
        audio_buffer = b""
        language = "zh"

        self.logger.info(f"WebSocket connection established")

        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
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

            elif msg.type == web.WSMsgType.BINARY:
                if recording:
                    audio_buffer += msg.data

            elif msg.type == web.WSMsgType.ERROR:
                self.logger.error(f"WebSocket error: {ws.exception()}")

        self.logger.info("WebSocket connection closed")
        return ws

    async def api_status(self, request):
        """API endpoint: get server status."""
        return web.json_response({
            "status": "running",
            "backend": self.backend_manager.get_current_backend(),
            "available_backends": self.backend_manager.get_available_backends()
        })

    async def api_backends(self, request):
        """API endpoint: list available backends."""
        return web.json_response({
            "available": self.backend_manager.get_available_backends(),
            "current": self.backend_manager.get_current_backend()
        })

    async def api_switch_backend(self, request):
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

    async def api_debug(self, request):
        """API endpoint: set debug level."""
        try:
            data = await request.json()
            level = data.get("level", "INFO")
            set_log_level(level)
            self.logger.info(f"Log level changed to {level}")
            return web.json_response({"success": True, "level": level})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    async def start(self):
        """Start the server."""
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

        # Routes
        app.router.add_get("/", self.handle_websocket)
        app.router.add_get("/api/status", self.api_status)
        app.router.add_get("/api/backends", self.api_backends)
        app.router.add_post("/api/backend", self.api_switch_backend)
        app.router.add_post("/api/debug", self.api_debug)

        self._runner = web.AppRunner(app)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, host, port)
        await self._site.start()

        self._running = True
        self.logger.info(f"Server started on ws://{host}:{port}")

        return True

    async def stop(self):
        """Stop the server."""
        self.logger.info("Stopping server...")
        self._running = False

        await self.backend_manager.cleanup()

        if self._runner:
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

    # Handle signals (Unix only)
    loop = asyncio.get_event_loop()

    def signal_handler():
        server.logger.info("Shutdown signal received")
        server._running = False

    # Windows doesn't support add_signal_handler
    if sys.platform != 'win32':
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, signal_handler)

    await server.run_forever()
    await server.stop()


if __name__ == "__main__":
    asyncio.run(main())
