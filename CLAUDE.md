# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenCode Doubao TTS Plugin - A voice input plugin for OpenCode that enables speech-to-text input via a floating button or keyboard shortcut. The plugin uses Python-based speech recognition backends (Moonshine, Whisper, Faster-Whisper) running in a separate process to transcribe audio and insert text directly into the OpenCode editor.

## Common Commands

```bash
# Build TypeScript to dist/
npm run build

# Run STT test suite
npm run test

# Run all tests
node tests/test-runner.js

# Run specific test case
node tests/test-runner.js --case 001

# Add new test case interactively
node tests/test-runner.js --add

# List available test fixtures
node tests/test-runner.js --fixtures

# List available STT backends
node tests/test-runner.js --list-backends

# Lint source code
npm run lint
```

## Architecture

### Plugin Structure

The plugin follows the OpenCode plugin architecture:

- **Entry Point**: `src/index.ts` - Main plugin that exports a `Plugin` function taking `PluginContext`
- **Components**: React components rendered in the OpenCode UI (e.g., `FloatingVoiceButton`)
- **Tools**: Custom commands exposed to OpenCode CLI
- **Keybindings**: Keyboard shortcuts registered with OpenCode
- **Hooks**: React hooks for state management

### Python Backend Integration

The plugin uses a separate Python process (`src/scripts/stt.py`) for speech-to-text:

1. **Communication**: TypeScript spawns Python process via `child_process.spawn()`
2. **Protocol**: JSON over stdout/stderr
3. **Audio Recording**: Python uses `sounddevice` + `numpy` for microphone capture
4. **Silence Detection**: Recording auto-stops after 1.5s of silence (configurable)
5. **Backend Selection**: Auto-detects available backends in order: Moonshine → Faster-Whisper → Whisper

### STT Backends

The Python script supports multiple backends with automatic fallback:

- **Moonshine** (`moonshine_onnx`): Recommended, fastest, smallest models
- **Faster-Whisper** (`faster_whisper`): Optimized OpenAI Whisper implementation
- **Whisper** (`openai-whisper`): Original OpenAI implementation

Models: `tiny`, `base`, `small`, `medium` (speed vs accuracy tradeoff)

### State Flow

```
User Input (Floating Button/Hotkey)
    ↓
FloatingVoiceButton: startRecording
    ↓
useVoiceInput hook (state: 'recording')
    ↓
User releases button → stopRecording
    ↓
voice-service.ts: transcribe()
    ↓
Spawn Python process (stt.py)
    ↓
Python: record_audio() → transcribe_*()
    ↓
JSON response: {success, text, backend, model}
    ↓
insertText(text) → OpenCode editor
```

## Configuration

### Plugin Config (`Config.json`)

```json
{
  "pythonPath": "python",          // Python interpreter path
  "sttBackend": "faster-whisper",  // or "moonshine", "whisper", "auto"
  "modelSize": "tiny",              // or "base", "small", "medium"
  "language": "zh",                 // Language code (zh, en, etc.)
  "maxDuration": 30,                // Max recording seconds
  "hotkey": "Ctrl+Shift+V"         // Keyboard shortcut
}
```

### TypeScript Types

Key types in `src/services/voice-service.ts`:
- `SttBackend`: 'moonshine' | 'whisper' | 'faster-whisper' | 'auto'
- `SttResult`: { success, text?, error?, backend?, model? }
- `PluginConfig`: Complete plugin settings

## Python Dependencies

Required Python packages (install via pip):

```bash
pip install sounddevice soundfile numpy faster-whisper
# Optional backends:
pip install moonshine-onnx      # For Moonshine backend
pip install openai-whisper      # For original Whisper
```

## Testing

### Test Structure

- `tests/test-runner.js`: Custom Node.js test runner (not standard test frameworks)
- `tests/cases/stt-cases.json`: Test case definitions
- `tests/fixtures/`: Audio file fixtures

### Test Cases

Each test case in `stt-cases.json`:
```json
{
  "id": "001",
  "audio": "test_sample_audio.wav",
  "expected": "Expected text",
  "language": "en",
  "backend": "whisper",
  "model": "tiny"
}
```

### Test Output

Tests pass if similarity ≥ 80% between expected and actual text.

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/index.ts` | Plugin entry point, registers components/tools/keybindings |
| `src/components/FloatingVoiceButton.tsx` | Floating mic button with recording states |
| `src/hooks/useVoiceInput.ts` | React hook managing voice input lifecycle |
| `src/services/voice-service.ts` | Python process management and config |
| `src/scripts/stt.py` | Python STT backend with audio recording |
| `Config.json` | Plugin configuration and settings schema |
| `package.json` | NPM dependencies and scripts |

## Development Notes

- The plugin is a TypeScript/React frontend with Python backend
- Python process is spawned per transcription (not a persistent daemon)
- Text insertion uses OpenCode's `context.insertText()` API
- Error handling includes UI feedback via the floating button states
- The `Ref/` directory contains reference implementations from other projects (not actively used)
