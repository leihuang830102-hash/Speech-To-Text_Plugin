# Floating Ball Voice Input

A standalone Electron desktop application that provides voice-to-text input via a floating ball. Simply press and hold the floating ball to record your voice, release to transcribe, and the text will be automatically inserted at your cursor position.

## Features

- **Floating Ball Interface**: A small, always-on-top floating ball that can be dragged anywhere on screen
- **Press-and-Hold Recording**: Hold left mouse button to record, release to transcribe
- **Speech-to-Text**: Supports multiple backends (Moonshine, Faster-Whisper, Whisper)
- **Auto Text Insertion**: Transcribed text is automatically typed at the cursor position using robotjs
- **Visual State Feedback**: Color changes and animations indicate recording/processing/success/error states
- **Position Memory**: Ball position is remembered between sessions
- **Log Rotation**: Built-in logging with automatic file rotation

## Requirements

### System Requirements
- **Operating System**: Windows 10/11
- **Node.js**: >= 18.0.0
- **Python**: >= 3.8

### Python Dependencies
```bash
pip install sounddevice soundfile numpy faster-whisper
```

Optional backends:
```bash
pip install moonshine-onnx      # Fastest, smallest models (recommended)
pip install openai-whisper      # Original OpenAI implementation
```

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd floating-ball
   ```

2. Install Node.js dependencies:
   ```bash
   npm install
   ```

3. Install Python dependencies:
   ```bash
   pip install sounddevice soundfile numpy faster-whisper
   ```

4. (Optional) Install additional STT backends:
   ```bash
   pip install moonshine-onnx
   ```

## Usage

### Starting the Application
```bash
npm start
```

### How to Use
1. The floating ball will appear on your screen (default position: top-left)
2. Position your cursor in any text field (e.g., Notepad, browser, chat app)
3. **Press and hold** the floating ball with left mouse button to start recording
4. **Speak** your text while holding
5. **Release** the mouse button to stop recording and start transcription
6. The transcribed text will be automatically typed at your cursor position

### Dragging the Ball
- Click and drag anywhere on the ball to move it around the screen
- The position is automatically saved and restored on next launch

## Configuration

Configuration is stored in `config.json`:

```json
{
  "python": {
    "path": "python",
    "sttScript": "./stt/stt.py"
  },
  "stt": {
    "backend": "auto",
    "modelSize": "tiny",
    "language": "zh",
    "maxDuration": 30
  },
  "window": {
    "width": 60,
    "height": 60,
    "rememberPosition": true
  },
  "logging": {
    "level": "INFO",
    "logToFile": true,
    "maxFileSize": 5242880,
    "maxFiles": 5,
    "maxTotalSize": 20971520,
    "maxAge": 604800
  }
}
```

### Configuration Options

| Field | Description | Default |
|-------|-------------|---------|
| `python.path` | Python interpreter path | `"python"` |
| `python.sttScript` | Path to STT script | `"./stt/stt.py"` |
| `stt.backend` | Speech backend: `auto`, `moonshine`, `whisper`, `faster-whisper` | `"auto"` |
| `stt.modelSize` | Model size: `tiny`, `base`, `small`, `medium` | `"tiny"` |
| `stt.language` | Language code (e.g., `zh`, `en`) | `"zh"` |
| `stt.maxDuration` | Maximum recording duration in seconds | `30` |
| `window.rememberPosition` | Save and restore ball position | `true` |
| `logging.level` | Log level: `DEBUG`, `INFO`, `WARN`, `ERROR` | `"INFO"` |
| `logging.logToFile` | Write logs to file | `true` |
| `logging.maxFileSize` | Max single log file size in bytes (5MB) | `5242880` |
| `logging.maxFiles` | Maximum number of log files | `5` |
| `logging.maxTotalSize` | Max total log size in bytes (20MB) | `20971520` |
| `logging.maxAge` | Log retention time in seconds (7 days) | `604800` |

## Visual States

The floating ball displays different colors and animations based on its current state:

| State | Color | Animation | Description |
|-------|-------|-----------|-------------|
| Idle | Blue | None | Ready to record |
| Recording | Red | Pulse + Ripple | Currently recording audio |
| Processing | Yellow | Spin | Transcribing audio to text |
| Success | Green | None (0.5s) | Transcription complete |
| Error | Gray | None (1s) | Transcription failed |

## Logs

### Log Location
Logs are stored in the `logs/` directory:
```
logs/
├── app.log        # Current log file
├── app.log.1      # Historical log 1
├── app.log.2      # Historical log 2
├── app.log.3      # Historical log 3
└── app.log.4      # Historical log 4
```

### Log Format
```
[2026-03-13T10:30:45.123Z] [INFO] [main] Python process started (pid: 12345)
[2026-03-13T10:30:48.456Z] [INFO] [main] Transcription result: "Hello world"
[2026-03-13T10:30:48.500Z] [DEBUG] [main] robotjs.typeString called
```

### Log Rotation
- Files rotate when they reach 5MB or are older than 7 days
- Maximum of 5 log files are kept
- Total log storage is capped at 20MB

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Python not found" | Python not installed or not in PATH | Install Python 3.8+ and add to PATH |
| "Failed to start Python" | Invalid Python path in config | Update `python.path` in config.json |
| "Module not found" | Missing Python dependencies | Run `pip install sounddevice soundfile numpy faster-whisper` |
| "Recording failed" | Microphone not available or no permission | Check microphone permissions in Windows settings |
| "Transcription failed" | STT backend error | Check logs for details, try different backend/model |
| "Text insertion failed" | robotjs error | Target application may not accept keyboard input |

### Error Indicators
- Ball turns gray for 1 second when an error occurs
- Check `logs/app.log` for detailed error messages

## Testing

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
```

### Test Structure
```
tests/
├── unit/                 # Unit tests
│   ├── config.test.js    # Configuration loading tests
│   ├── logger.test.js    # Log rotation tests
│   └── position.test.js  # Position memory tests
├── integration/          # Integration tests
│   ├── ipc.test.js       # IPC communication tests
│   ├── python.test.js    # Python process tests
│   └── stt.test.js       # STT workflow tests
└── fixtures/             # Test audio files
    ├── sample-zh.wav
    └── sample-en.wav
```

## Building

### Build for Windows
```bash
npm run build
```

This creates an executable in the `dist/` directory using electron-builder.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Application                     │
├──────────────────────┬──────────────────────────────────────┤
│   Main Process       │           Renderer Process           │
│   (main.js)          │   (renderer.js + index.html)         │
├──────────────────────┼──────────────────────────────────────┤
│ - Window creation    │ - Ball UI rendering                  │
│ - IPC handling       │ - Mouse event handling               │
│ - Python spawning    │ - State management                   │
│ - robotjs typing     │ - Drag functionality                 │
└──────────────────────┴──────────────────────────────────────┘
            │                           │
            │ IPC                       │ User Events
            ▼                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Python STT Process                        │
│                      (stt/stt.py)                           │
├─────────────────────────────────────────────────────────────┤
│ - Audio recording (sounddevice)                             │
│ - Speech transcription (faster-whisper/moonshine)           │
│ - JSON output to stdout                                     │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User presses ball
       │
       ▼
renderer.js: mousedown → IPC 'start-recording'
       │
       ▼
main.js: spawn Python process
       │
       ▼
stt.py: Start audio recording
       │
User releases ball
       │
       ▼
renderer.js: mouseup → IPC 'stop-recording'
       │
       ▼
main.js: kill Python → wait for transcription
       │
       ▼
stt.py: Transcribe → output JSON {"success": true, "text": "..."}
       │
       ▼
main.js: Parse JSON → robotjs.typeString(text)
       │
       ▼
Text appears at cursor position
```

## License

MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
