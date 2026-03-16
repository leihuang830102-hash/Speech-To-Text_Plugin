# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenCodeTTS - A voice input tool that enables speech-to-text input via a floating ball. The application supports multiple STT backends:

- **Doubao Cloud ASR** (豆包云端) - Fast cloud-based recognition (~1s)
- **Local Whisper** - Offline recognition (~10s on CPU)

## Quick Start

```bash
# Start the floating ball application
cd floating-ball && npm start
```

**Usage:**
- **Left-click and hold**: Start recording, release to transcribe
- **Right-click**: Open context menu to switch backends or exit

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│  Electron App   │ ◄───────────────► │  Python STT      │
│  (floating-ball)│   ws://127.0.0.1:8765  Server        │
└─────────────────┘                    └──────────────────┘
        │                                       │
        │ IPC                                   │
        ▼                                       ▼
┌─────────────────┐                    ┌──────────────────┐
│  record.py      │                    │  doubao-cloud    │
│  (录音)          │                    │  whisper (本地)   │
└─────────────────┘                    └──────────────────┘
```

### Components

| Directory | Description |
|-----------|-------------|
| `floating-ball/` | Electron floating ball application |
| `src/scripts/stt/` | Python STT server and backends |
| `config/` | Server configuration |
| `.env` | API credentials (not in git) |

## Configuration

### Environment Variables (`.env`)

Create a `.env` file in the project root with Doubao API credentials:

```env
# 豆包语音识别配置
ASR_APP_ID=your_app_id
ASR_ACCESS_TOKEN=your_access_token
ASR_ACCESS_SECRET=your_access_secret
ASR_CLUSTER=volcengine_streaming_common
```

**Important:** Never commit `.env` to git. It's already in `.gitignore`.

### Server Config (`config/stt-config.json`)

```json
{
  "stt": {
    "defaultBackend": "doubao-cloud",
    "backends": {
      "doubao-cloud": { "enabled": true },
      "whisper": { "enabled": true, "model": "small" }
    }
  }
}
```

### Floating Ball Config (`floating-ball/config.json`)

```json
{
  "stt": {
    "backend": "doubao-cloud",
    "modelSize": "small",
    "language": "auto"
  }
}
```

## STT Backends

### Doubao Cloud ASR (Recommended)

- **Speed**: ~1 second
- **Accuracy**: High for Chinese
- **Requires**: API credentials in `.env`

### Local Whisper

- **Speed**: ~10 seconds on CPU
- **Accuracy**: Good
- **Requires**: No internet, no API key

## Common Commands

```bash
# Start floating ball
cd floating-ball && npm start

# Build TypeScript
npm run build

# Run tests
npm run test

# Lint source code
npm run lint
```

## Python Dependencies

```bash
pip install sounddevice soundfile numpy websockets aiohttp
pip install openai-whisper     # For local Whisper
pip install zhconv             # For Chinese text conversion
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `floating-ball/main.js` | Electron main process, context menu, WebSocket client |
| `floating-ball/renderer.js` | UI rendering and event handling |
| `src/scripts/stt/server.py` | WebSocket STT server |
| `src/scripts/stt/backends/doubao.py` | Doubao cloud ASR backend |
| `src/scripts/stt/backends/whisper.py` | Local Whisper backend |
| `src/scripts/stt/backends/manager.py` | Backend switching logic |
| `config/stt-config.json` | Server-side backend configuration |
| `floating-ball/config.json` | Client-side configuration |

## Development Notes

### Backend Switching

The floating ball supports runtime backend switching via right-click context menu:
1. Menu reads current backend from `config.stt.backend`
2. Sends `switch_backend` command to server via WebSocket
3. Server switches backend and confirms
4. Client updates local config and saves

### Text Insertion

Text is inserted using clipboard + PowerShell SendKeys for maximum compatibility on Windows.

### Traditional to Simplified Chinese

The `zhconv` library converts traditional Chinese output to simplified Chinese automatically.

## Security Notes

- **Never commit `.env`** - Contains API credentials
- **Never commit `Ref/`** - Contains reference implementations with sensitive data
- Both are already in `.gitignore`
