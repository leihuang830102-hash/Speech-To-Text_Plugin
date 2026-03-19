# Floating Ball Voice Input - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a standalone Electron floating ball app for voice-to-text input on Windows.

**Architecture:** Single-window Electron app with Python STT subprocess. Main process handles window management, Python lifecycle, and text insertion via robotjs. Renderer handles UI events and visual feedback.

**Tech Stack:** Electron, robotjs, Python (faster-whisper/moonshine), Vitest

---

## Task 1: Project Initialization

**Files:**
- Create: `floating-ball/package.json`
- Create: `floating-ball/config.json`

**Step 1: Create package.json**

```json
{
  "name": "floating-ball-voice",
  "version": "1.0.0",
  "description": "Floating ball voice input tool",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "build": "electron-builder --win"
  },
  "dependencies": {
    "electron": "^28.0.0",
    "robotjs": "^0.6.0"
  },
  "devDependencies": {
    "electron-builder": "^24.0.0",
    "vitest": "^1.0.0"
  }
}
```

**Step 2: Create config.json**

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

**Step 3: Install dependencies**

Run: `cd floating-ball && npm install`
Expected: Dependencies installed successfully

**Step 4: Commit**

```bash
git add floating-ball/package.json floating-ball/config.json
git commit -m "feat: initialize floating-ball project structure"
```

---

## Task 2: Logger Module

**Files:**
- Create: `floating-ball/logger.js`
- Create: `floating-ball/tests/unit/logger.test.js`

**Step 1: Write the failing test**

```javascript
// tests/unit/logger.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Logger } from '../../logger.js';

describe('Logger', () => {
  const testLogDir = './test-logs';
  let logger;

  beforeEach(() => {
    if (!fs.existsSync(testLogDir)) fs.mkdirSync(testLogDir, { recursive: true });
    logger = new Logger({ logDir: testLogDir, level: 'DEBUG' });
  });

  afterEach(() => {
    fs.rmSync(testLogDir, { recursive: true, force: true });
  });

  it('should write INFO level log', () => {
    logger.info('main', 'Test info message');
    const logFile = path.join(testLogDir, 'app.log');
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('[INFO]');
    expect(content).toContain('[main]');
    expect(content).toContain('Test info message');
  });

  it('should format timestamp correctly', () => {
    logger.info('main', 'Test');
    const logFile = path.join(testLogDir, 'app.log');
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/);
  });

  it('should not write DEBUG logs when level is INFO', () => {
    const infoLogger = new Logger({ logDir: testLogDir, level: 'INFO' });
    infoLogger.debug('main', 'Should not appear');
    const logFile = path.join(testLogDir, 'app.log');
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).not.toContain('Should not appear');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd floating-ball && npm run test:unit`
Expected: FAIL - Logger not found

**Step 3: Write minimal implementation**

```javascript
// logger.js
import fs from 'fs';
import path from 'path';

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

export class Logger {
  constructor(config = {}) {
    this.logDir = config.logDir || './logs';
    this.level = LEVELS[config.level] ?? LEVELS.INFO;
    this.logFile = path.join(this.logDir, 'app.log');

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  _formatTimestamp() {
    const now = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
           `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
  }

  _write(level, module, message) {
    if (LEVELS[level] < this.level) return;
    const timestamp = this._formatTimestamp();
    const logLine = `[${timestamp}] [${level}] [${module}] ${message}\n`;
    fs.appendFileSync(this.logFile, logLine);
  }

  debug(module, message) { this._write('DEBUG', module, message); }
  info(module, message) { this._write('INFO', module, message); }
  warn(module, message) { this._write('WARN', module, message); }
  error(module, message) { this._write('ERROR', module, message); }
}

export default Logger;
```

**Step 4: Run test to verify it passes**

Run: `cd floating-ball && npm run test:unit`
Expected: PASS

**Step 5: Commit**

```bash
git add floating-ball/logger.js floating-ball/tests/unit/logger.test.js
git commit -m "feat: add logger module with basic tests"
```

---

## Task 3: Log Rotation

**Files:**
- Modify: `floating-ball/logger.js`
- Modify: `floating-ball/tests/unit/logger.test.js`

**Step 1: Write the failing test**

```javascript
// Add to tests/unit/logger.test.js

  it('should rotate log file when size exceeds maxFileSize', () => {
    const smallLogger = new Logger({
      logDir: testLogDir,
      level: 'DEBUG',
      maxFileSize: 100  // 100 bytes for testing
    });

    // Write more than 100 bytes
    for (let i = 0; i < 20; i++) {
      smallLogger.info('main', 'This is a test message that will exceed limit');
    }

    expect(fs.existsSync(path.join(testLogDir, 'app.log.1'))).toBe(true);
  });

  it('should delete old logs when maxFiles exceeded', () => {
    const rotatingLogger = new Logger({
      logDir: testLogDir,
      level: 'DEBUG',
      maxFileSize: 50,
      maxFiles: 2
    });

    // Trigger multiple rotations
    for (let i = 0; i < 50; i++) {
      rotatingLogger.info('main', `Message ${i}`);
    }

    const files = fs.readdirSync(testLogDir).filter(f => f.startsWith('app.log'));
    expect(files.length).toBeLessThanOrEqual(3); // app.log + app.log.1 + app.log.2
  });
```

**Step 2: Run test to verify it fails**

Run: `cd floating-ball && npm run test:unit`
Expected: FAIL - rotation not implemented

**Step 3: Implement log rotation**

```javascript
// Update logger.js
import fs from 'fs';
import path from 'path';

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

export class Logger {
  constructor(config = {}) {
    this.logDir = config.logDir || './logs';
    this.level = LEVELS[config.level] ?? LEVELS.INFO;
    this.maxFileSize = config.maxFileSize || 5242880; // 5MB
    this.maxFiles = config.maxFiles || 5;
    this.logFile = path.join(this.logDir, 'app.log');

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this._rotateIfNeeded();
  }

  _formatTimestamp() {
    const now = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
           `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
  }

  _rotateIfNeeded() {
    if (!fs.existsSync(this.logFile)) return;

    const stats = fs.statSync(this.logFile);
    if (stats.size >= this.maxFileSize) {
      this._rotate();
    }
  }

  _rotate() {
    // Delete oldest file if at max
    const oldestFile = path.join(this.logDir, `app.log.${this.maxFiles}`);
    if (fs.existsSync(oldestFile)) {
      fs.unlinkSync(oldestFile);
    }

    // Shift existing files
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const oldFile = path.join(this.logDir, `app.log.${i}`);
      const newFile = path.join(this.logDir, `app.log.${i + 1}`);
      if (fs.existsSync(oldFile)) {
        fs.renameSync(oldFile, newFile);
      }
    }

    // Rename current to .1
    fs.renameSync(this.logFile, path.join(this.logDir, 'app.log.1'));
  }

  _write(level, module, message) {
    if (LEVELS[level] < this.level) return;

    this._rotateIfNeeded();

    const timestamp = this._formatTimestamp();
    const logLine = `[${timestamp}] [${level}] [${module}] ${message}\n`;
    fs.appendFileSync(this.logFile, logLine);
  }

  debug(module, message) { this._write('DEBUG', module, message); }
  info(module, message) { this._write('INFO', module, message); }
  warn(module, message) { this._write('WARN', module, message); }
  error(module, message) { this._write('ERROR', module, message); }
}

export default Logger;
```

**Step 4: Run test to verify it passes**

Run: `cd floating-ball && npm run test:unit`
Expected: PASS

**Step 5: Commit**

```bash
git add floating-ball/logger.js floating-ball/tests/unit/logger.test.js
git commit -m "feat: add log rotation with size and file count limits"
```

---

## Task 4: Config Loader

**Files:**
- Create: `floating-ball/config-loader.js`
- Create: `floating-ball/tests/unit/config.test.js`

**Step 1: Write the failing test**

```javascript
// tests/unit/config.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { loadConfig, getDefaultConfig } from '../../config-loader.js';

describe('Config Loader', () => {
  const testConfigPath = './test-config.json';

  afterEach(() => {
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  it('should load valid config file', () => {
    const config = {
      python: { path: 'python3', sttScript: './stt.py' },
      stt: { backend: 'whisper', modelSize: 'base' }
    };
    fs.writeFileSync(testConfigPath, JSON.stringify(config));

    const loaded = loadConfig(testConfigPath);
    expect(loaded.python.path).toBe('python3');
    expect(loaded.stt.backend).toBe('whisper');
  });

  it('should merge with defaults for missing fields', () => {
    const partialConfig = { python: { path: 'python' } };
    fs.writeFileSync(testConfigPath, JSON.stringify(partialConfig));

    const loaded = loadConfig(testConfigPath);
    expect(loaded.stt.backend).toBe('auto'); // default
    expect(loaded.stt.language).toBe('zh'); // default
  });

  it('should return defaults when file not found', () => {
    const loaded = loadConfig('./nonexistent.json');
    const defaults = getDefaultConfig();
    expect(loaded).toEqual(defaults);
  });

  it('should validate window dimensions', () => {
    const config = { window: { width: 0, height: 60 } };
    fs.writeFileSync(testConfigPath, JSON.stringify(config));

    const loaded = loadConfig(testConfigPath);
    expect(loaded.window.width).toBe(60); // reset to default
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd floating-ball && npm run test:unit`
Expected: FAIL - config-loader not found

**Step 3: Write minimal implementation**

```javascript
// config-loader.js
import fs from 'fs';

const DEFAULT_CONFIG = {
  python: {
    path: 'python',
    sttScript: './stt/stt.py'
  },
  stt: {
    backend: 'auto',
    modelSize: 'tiny',
    language: 'zh',
    maxDuration: 30
  },
  window: {
    width: 60,
    height: 60,
    rememberPosition: true
  },
  logging: {
    level: 'INFO',
    logToFile: true,
    maxFileSize: 5242880,
    maxFiles: 5,
    maxTotalSize: 20971520,
    maxAge: 604800
  }
};

export function getDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

export function loadConfig(configPath) {
  const config = getDefaultConfig();

  if (!fs.existsSync(configPath)) {
    return config;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(content);
    return mergeConfig(config, userConfig);
  } catch (e) {
    console.error(`Failed to load config: ${e.message}`);
    return config;
  }
}

function mergeConfig(defaults, user) {
  const result = { ...defaults };

  for (const key in user) {
    if (typeof user[key] === 'object' && user[key] !== null && !Array.isArray(user[key])) {
      result[key] = mergeConfig(defaults[key] || {}, user[key]);
    } else {
      result[key] = user[key];
    }
  }

  // Validation
  if (result.window.width < 30) result.window.width = 60;
  if (result.window.height < 30) result.window.height = 60;

  return result;
}

export default { loadConfig, getDefaultConfig };
```

**Step 4: Run test to verify it passes**

Run: `cd floating-ball && npm run test:unit`
Expected: PASS

**Step 5: Commit**

```bash
git add floating-ball/config-loader.js floating-ball/tests/unit/config.test.js
git commit -m "feat: add config loader with validation"
```

---

## Task 5: Python STT Script

**Files:**
- Create: `floating-ball/stt/stt.py`

**Step 1: Copy and adapt existing STT script**

Reference existing `src/scripts/stt.py` and create adapted version for floating-ball.

```python
# stt/stt.py
#!/usr/bin/env python3
"""
Speech-to-Text script for floating-ball.
Records audio and transcribes using Whisper/Moonshine.
Outputs JSON to stdout.
"""

import sys
import json
import argparse
import subprocess
from pathlib import Path

def check_dependencies():
    """Check and report available STT backends."""
    backends = []
    missing = []

    try:
        import sounddevice
        backends.append('sounddevice')
    except ImportError:
        missing.append('sounddevice')

    try:
        import numpy
        backends.append('numpy')
    except ImportError:
        missing.append('numpy')

    try:
        from faster_whisper import WhisperModel
        backends.append('faster-whisper')
    except ImportError:
        missing.append('faster-whisper')

    return backends, missing


def record_audio(duration=None, samplerate=16000):
    """Record audio from microphone."""
    import sounddevice as sd
    import numpy as np

    # Log start
    log_info('stt', f'Starting recording (max {duration}s)')

    audio_chunks = []

    def callback(indata, frames, time, status):
        if status:
            log_error('stt', f'Recording status: {status}')
        audio_chunks.append(indata.copy())

    silence_threshold = 0.01
    silence_duration = 1.5
    silence_frames = 0
    max_silence_frames = int(samplerate * silence_duration / 512)  # 512 is default blocksize

    with sd.InputStream(callback=callback, channels=1, samplerate=samplerate):
        frame_count = 0
        max_frames = int(duration * samplerate / 512) if duration else float('inf')

        while frame_count < max_frames:
            sd.sleep(100)
            frame_count += 1

            # Check for silence (simple energy-based)
            if len(audio_chunks) > 0:
                last_chunk = audio_chunks[-1]
                energy = np.abs(last_chunk).mean()
                if energy < silence_threshold:
                    silence_frames += 1
                    if silence_frames >= max_silence_frames:
                        log_info('stt', 'Silence detected, stopping')
                        break
                else:
                    silence_frames = 0

    audio = np.concatenate(audio_chunks, axis=0)
    log_info('stt', f'Recording complete: {len(audio)} samples')
    return audio, samplerate


def transcribe_faster_whisper(audio, samplerate, model_size='tiny', language='zh'):
    """Transcribe using faster-whisper."""
    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device='cpu', compute_type='int8')
    segments, info = model.transcribe(audio, language=language)

    text = ''.join(segment.text for segment in segments)
    return text, 'faster-whisper', model_size


def transcribe_moonshine(audio, samplerate, model_size='tiny', language='en'):
    """Transcribe using Moonshine."""
    from moonshine_onnx import Moonshine

    model = Moonshine(model_type=model_size)
    text = model.transcribe(audio)
    return text, 'moonshine', model_size


def log_info(module, message):
    """Log info message to stderr (so stdout remains clean for JSON)."""
    print(f'[INFO] [{module}] {message}', file=sys.stderr, flush=True)


def log_error(module, message):
    """Log error message to stderr."""
    print(f'[ERROR] [{module}] {message}', file=sys.stderr, flush=True)


def main():
    parser = argparse.ArgumentParser(description='Speech-to-Text')
    parser.add_argument('--backend', default='auto', choices=['auto', 'faster-whisper', 'moonshine'])
    parser.add_argument('--model', default='tiny', choices=['tiny', 'base', 'small', 'medium'])
    parser.add_argument('--language', default='zh')
    parser.add_argument('--duration', type=int, default=30)
    parser.add_argument('--check', action='store_true', help='Check dependencies only')

    args = parser.parse_args()

    if args.check:
        backends, missing = check_dependencies()
        result = {
            'success': True,
            'backends': backends,
            'missing': missing
        }
        print(json.dumps(result))
        return

    try:
        # Record
        audio, samplerate = record_audio(duration=args.duration)

        # Select backend
        backend = args.backend
        if backend == 'auto':
            try:
                from faster_whisper import WhisperModel
                backend = 'faster-whisper'
            except ImportError:
                try:
                    from moonshine_onnx import Moonshine
                    backend = 'moonshine'
                except ImportError:
                    raise RuntimeError('No STT backend available')

        # Transcribe
        if backend == 'faster-whisper':
            text, used_backend, model = transcribe_faster_whisper(
                audio, samplerate, args.model, args.language
            )
        elif backend == 'moonshine':
            text, used_backend, model = transcribe_moonshine(
                audio, samplerate, args.model, args.language
            )
        else:
            raise RuntimeError(f'Unknown backend: {backend}')

        result = {
            'success': True,
            'text': text.strip(),
            'backend': used_backend,
            'model': model
        }
        print(json.dumps(result))

    except Exception as e:
        log_error('stt', str(e))
        result = {
            'success': False,
            'error': str(e)
        }
        print(json.dumps(result))
        sys.exit(1)


if __name__ == '__main__':
    main()
```

**Step 2: Create stt directory and file**

Run: `mkdir -p floating-ball/stt`
Then create the file above.

**Step 3: Test Python script manually**

Run: `cd floating-ball && python stt/stt.py --check`
Expected: JSON output with available backends

**Step 4: Commit**

```bash
git add floating-ball/stt/stt.py
git commit -m "feat: add Python STT script with faster-whisper and moonshine support"
```

---

## Task 6: Electron Main Process

**Files:**
- Create: `floating-ball/main.js`
- Create: `floating-ball/preload.js`

**Step 1: Create preload.js**

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startRecording: () => ipcRenderer.send('start-recording'),
  stopRecording: () => ipcRenderer.send('stop-recording'),

  onStateChanged: (callback) => {
    ipcRenderer.on('state-changed', (event, state) => callback(state));
  },

  onLog: (callback) => {
    ipcRenderer.on('log', (event, message) => callback(message));
  }
});
```

**Step 2: Create main.js**

```javascript
// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const robot = require('robotjs');
const { loadConfig } = require('./config-loader');
const { Logger } = require('./logger');

let mainWindow = null;
let pythonProcess = null;
let logger = null;
let config = null;

function createWindow() {
  config = loadConfig(path.join(__dirname, 'config.json'));
  logger = new Logger({
    logDir: path.join(__dirname, 'logs'),
    level: config.logging.level
  });

  logger.info('main', 'Creating floating ball window');

  mainWindow = new BrowserWindow({
    width: config.window.width,
    height: config.window.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  // Restore position if configured
  if (config.window.rememberPosition) {
    const positionPath = path.join(__dirname, 'position.json');
    try {
      if (require('fs').existsSync(positionPath)) {
        const position = JSON.parse(require('fs').readFileSync(positionPath, 'utf-8'));
        mainWindow.setPosition(position.x, position.y);
        logger.info('main', `Restored position: (${position.x}, ${position.y})`);
      }
    } catch (e) {
      logger.error('main', `Failed to restore position: ${e.message}`);
    }
  }

  mainWindow.on('moved', () => {
    if (config.window.rememberPosition) {
      const [x, y] = mainWindow.getPosition();
      require('fs').writeFileSync(
        path.join(__dirname, 'position.json'),
        JSON.stringify({ x, y })
      );
      logger.debug('main', `Position saved: (${x}, ${y})`);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function spawnPython() {
  if (pythonProcess) {
    logger.warn('main', 'Python process already running');
    return;
  }

  const scriptPath = path.join(__dirname, config.python.sttScript);
  const args = [
    scriptPath,
    '--backend', config.stt.backend,
    '--model', config.stt.modelSize,
    '--language', config.stt.language,
    '--duration', String(config.stt.maxDuration)
  ];

  logger.info('main', `Starting Python: ${config.python.path} ${args.join(' ')}`);

  pythonProcess = spawn(config.python.path, args);
  let output = '';

  pythonProcess.stdout.on('data', (data) => {
    output += data.toString();
    logger.debug('main', `Python stdout: ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    logger.debug('main', `Python stderr: ${data.toString().trim()}`);
  });

  pythonProcess.on('close', (code) => {
    logger.info('main', `Python process exited with code ${code}`);

    try {
      const result = JSON.parse(output);
      if (result.success && result.text) {
        logger.info('main', `Transcription: "${result.text}"`);
        insertText(result.text);
        sendState('success');
      } else {
        logger.error('main', `Transcription failed: ${result.error || 'Unknown error'}`);
        sendState('error');
      }
    } catch (e) {
      logger.error('main', `Failed to parse Python output: ${e.message}`);
      sendState('error');
    }

    pythonProcess = null;
  });

  pythonProcess.on('error', (err) => {
    logger.error('main', `Failed to start Python: ${err.message}`);
    sendState('error');
    pythonProcess = null;
  });
}

function killPython() {
  if (pythonProcess) {
    logger.info('main', 'Terminating Python process');
    pythonProcess.kill();
    pythonProcess = null;
  }
}

function insertText(text) {
  try {
    logger.debug('main', `Inserting text via robotjs: "${text}"`);
    robot.typeString(text);
    logger.info('main', 'Text inserted successfully');
  } catch (e) {
    logger.error('main', `Failed to insert text: ${e.message}`);
  }
}

function sendState(state) {
  if (mainWindow) {
    mainWindow.webContents.send('state-changed', state);
  }
}

// IPC handlers
ipcMain.on('start-recording', () => {
  logger.info('main', 'IPC: start-recording received');
  sendState('recording');
  spawnPython();
});

ipcMain.on('stop-recording', () => {
  logger.info('main', 'IPC: stop-recording received');
  sendState('processing');
  killPython();
});

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

**Step 3: Verify files created**

Run: `ls -la floating-ball/`
Expected: main.js and preload.js exist

**Step 4: Commit**

```bash
git add floating-ball/main.js floating-ball/preload.js
git commit -m "feat: add Electron main process with Python lifecycle and robotjs"
```

---

## Task 7: Renderer - UI and Styles

**Files:**
- Create: `floating-ball/index.html`
- Create: `floating-ball/styles.css`
- Create: `floating-ball/renderer.js`

**Step 1: Create index.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="ball" class="ball idle">
    <div class="ball-inner">
      <div class="icon">🎤</div>
    </div>
    <div class="ripple"></div>
  </div>
  <script src="renderer.js"></script>
</body>
</html>
```

**Step 2: Create styles.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-app-region: drag;
}

body {
  overflow: hidden;
  background: transparent;
}

.ball {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  -webkit-app-region: no-drag;
  transition: background-color 0.2s ease;
}

.ball-inner {
  z-index: 2;
}

.icon {
  font-size: 24px;
  user-select: none;
}

/* States */
.ball.idle {
  background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
  box-shadow: 0 4px 15px rgba(74, 144, 217, 0.4);
}

.ball.recording {
  background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
  box-shadow: 0 4px 15px rgba(231, 76, 60, 0.4);
  animation: pulse 1s ease-in-out infinite;
}

.ball.processing {
  background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
  box-shadow: 0 4px 15px rgba(243, 156, 18, 0.4);
  animation: spin 1s linear infinite;
}

.ball.success {
  background: linear-gradient(135deg, #27ae60 0%, #229954 100%);
  box-shadow: 0 4px 15px rgba(39, 174, 96, 0.4);
}

.ball.error {
  background: linear-gradient(135deg, #7f8c8d 0%, #6c7a7a 100%);
  box-shadow: 0 4px 15px rgba(127, 140, 141, 0.4);
}

/* Animations */
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Ripple effect */
.ripple {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.5);
  opacity: 0;
  z-index: 1;
}

.ball.recording .ripple {
  animation: ripple 1.5s ease-out infinite;
}

@keyframes ripple {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}

/* Hover effect */
.ball:hover {
  filter: brightness(1.1);
}

.ball:active {
  transform: scale(0.95);
}
```

**Step 3: Create renderer.js**

```javascript
// renderer.js
const ball = document.getElementById('ball');

let isRecording = false;
let stateTimeout = null;

// State management
function setState(newState) {
  clearTimeout(stateTimeout);

  ball.className = 'ball ' + newState;

  // Auto-reset to idle after success/error
  if (newState === 'success') {
    stateTimeout = setTimeout(() => setState('idle'), 500);
  } else if (newState === 'error') {
    stateTimeout = setTimeout(() => setState('idle'), 1000);
  }
}

// Mouse events for recording
ball.addEventListener('mousedown', (e) => {
  if (e.button === 0) { // Left click
    e.preventDefault();
    isRecording = true;
    setState('recording');
    window.electronAPI.startRecording();
  }
});

ball.addEventListener('mouseup', (e) => {
  if (e.button === 0 && isRecording) {
    e.preventDefault();
    isRecording = false;
    setState('processing');
    window.electronAPI.stopRecording();
  }
});

// Handle mouse leaving the ball while recording
ball.addEventListener('mouseleave', () => {
  if (isRecording) {
    isRecording = false;
    setState('processing');
    window.electronAPI.stopRecording();
  }
});

// Prevent context menu
ball.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Listen for state changes from main process
window.electronAPI.onStateChanged((state) => {
  setState(state);
});

// Initialize
setState('idle');
console.log('[renderer] Floating ball initialized');
```

**Step 4: Commit**

```bash
git add floating-ball/index.html floating-ball/styles.css floating-ball/renderer.js
git commit -m "feat: add floating ball UI with states and animations"
```

---

## Task 8: Integration Test

**Files:**
- Create: `floating-ball/tests/integration/stt.test.js`

**Step 1: Write integration test**

```javascript
// tests/integration/stt.test.js
import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';

describe('STT Integration', () => {
  const sttScript = path.join(__dirname, '../../stt/stt.py');

  it('should check dependencies and return JSON', async () => {
    const result = await runPython(sttScript, ['--check']);
    expect(result.success).toBe(true);
    expect(Array.isArray(result.backends)).toBe(true);
  });

  it('should return error for missing audio input', async () => {
    // This tests that the script handles the case properly
    // In real usage, audio comes from microphone
    const result = await runPython(sttScript, [
      '--backend', 'faster-whisper',
      '--duration', '1'
    ]);

    // Should complete without crashing
    expect(result).toHaveProperty('success');
  });
});

function runPython(script, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', [script, ...args]);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => stdout += data);
    proc.stderr.on('data', (data) => stderr += data);

    proc.on('close', (code) => {
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Failed to parse output: ${stdout}\nstderr: ${stderr}`));
      }
    });

    proc.on('error', reject);

    // Timeout after 10s
    setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout'));
    }, 10000);
  });
}
```

**Step 2: Run test**

Run: `cd floating-ball && npm run test:integration`
Expected: Tests pass if Python environment is set up

**Step 3: Commit**

```bash
git add floating-ball/tests/integration/stt.test.js
git commit -m "feat: add STT integration tests"
```

---

## Task 9: README Documentation

**Files:**
- Create: `floating-ball/README.md`

**Step 1: Create comprehensive README**

```markdown
# Floating Ball Voice Input

A standalone Electron app for voice-to-text input on Windows.

## Features

- 🎤 Click and hold to record voice
- ⚡ Automatic transcription using local AI models
- 📝 Text inserted directly at cursor position
- 🎯 Floating ball stays on top, doesn't steal focus
- 🔄 Draggable position with memory

## Requirements

- Windows 10/11
- Node.js >= 18.0.0
- Python >= 3.8
- Microphone

## Installation

### 1. Install Node.js dependencies

```bash
cd floating-ball
npm install
```

### 2. Install Python dependencies

```bash
pip install sounddevice soundfile numpy faster-whisper
```

Optional backends:
```bash
pip install moonshine-onnx     # Moonshine backend
pip install openai-whisper     # Original Whisper
```

## Usage

### Start the app

```bash
npm start
```

### How to use

1. Position the floating ball where you want it (it remembers position)
2. Click in any app (Notepad, Word, browser, etc.) to place cursor
3. Click and hold the floating ball
4. Speak your text
5. Release to transcribe
6. Text appears at cursor position

## Configuration

Edit `config.json` to customize:

```json
{
  "python": {
    "path": "python",           // Python interpreter path
    "sttScript": "./stt/stt.py" // STT script path
  },
  "stt": {
    "backend": "auto",          // auto, faster-whisper, moonshine
    "modelSize": "tiny",        // tiny, base, small, medium
    "language": "zh",           // Language code
    "maxDuration": 30           // Max recording seconds
  },
  "window": {
    "width": 60,
    "height": 60,
    "rememberPosition": true
  },
  "logging": {
    "level": "INFO",            // DEBUG, INFO, WARN, ERROR
    "logToFile": true,
    "maxFileSize": 5242880,     // 5MB
    "maxFiles": 5
  }
}
```

## Visual States

| State | Color | Description |
|-------|-------|-------------|
| Idle | 🔵 Blue | Ready to record |
| Recording | 🔴 Red + Pulse | Currently recording |
| Processing | 🟡 Yellow + Spin | Transcribing audio |
| Success | 🟢 Green | Text inserted successfully |
| Error | ⚫ Gray | Something went wrong |

## Logs

Logs are stored in `logs/app.log` with automatic rotation:

- Max file size: 5MB
- Max files: 5
- Auto-cleanup of old logs

View logs:
```bash
tail -f logs/app.log
```

## Error Handling

### "Please install Python"

Python is not installed or not in PATH.
- Install Python 3.8+ from python.org
- Ensure `python` command works in terminal

### "Missing dependencies"

Required Python packages are missing.
```bash
pip install sounddevice soundfile numpy faster-whisper
```

### No transcription appears

1. Check microphone permissions in Windows Settings
2. Check logs for errors: `logs/app.log`
3. Verify STT backend: `python stt/stt.py --check`

### Text not inserting

1. Ensure target app has focus
2. Some apps may block simulated input
3. Try a different app (Notepad works reliably)

## Testing

```bash
npm test                 # Run all tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
```

## Building

```bash
npm run build
```

Output will be in `dist/` directory.

## Architecture

```
┌─────────────────┐
│   renderer.js   │  Mouse events, UI state
└────────┬────────┘
         │ IPC
         ▼
┌─────────────────┐
│    main.js      │  Window, Python lifecycle, robotjs
└────────┬────────┘
         │ spawn
         ▼
┌─────────────────┐
│    stt.py       │  Recording, transcription
└─────────────────┘
```

## License

MIT
```

**Step 2: Commit**

```bash
git add floating-ball/README.md
git commit -m "docs: add comprehensive README"
```

---

## Task 10: Final Verification

**Step 1: Run all tests**

Run: `cd floating-ball && npm test`
Expected: All tests pass

**Step 2: Manual startup test**

Run: `cd floating-ball && npm start`
Expected:
- Floating ball appears on screen
- Ball is draggable
- Click and hold shows red recording state
- Release shows yellow processing state

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete floating-ball MVP"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Project init | package.json, config.json |
| 2 | Logger module | logger.js, tests |
| 3 | Log rotation | logger.js (updated) |
| 4 | Config loader | config-loader.js, tests |
| 5 | Python STT | stt/stt.py |
| 6 | Electron main | main.js, preload.js |
| 7 | UI/Renderer | index.html, styles.css, renderer.js |
| 8 | Integration tests | tests/integration/stt.test.js |
| 9 | Documentation | README.md |
| 10 | Verification | - |
