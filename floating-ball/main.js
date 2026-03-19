// main.js - Floating Ball Main Process
// With WebSocket STT support for faster response
const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const WebSocket = require('ws');

// ============================================================================
// Packaged Mode Detection
// ============================================================================

const isPackaged = app.isPackaged;
const APP_NAME = 'OpenCodeTTS';

// In packaged mode, use AppData directory for user configuration
const CONFIG_DIR = isPackaged
  ? path.join(process.env.APPDATA || process.env.HOME, APP_NAME)
  : __dirname;

const DOCS_URL = 'https://www.volcengine.com/docs/6561/80818?lang=zh';

function getConfigPath() {
  return path.join(CONFIG_DIR, 'config.json');
}

function getEnvPath() {
  return path.join(CONFIG_DIR, '.env');
}

function getPositionPath() {
  return path.join(CONFIG_DIR, 'position.json');
}

// ============================================================================
// Configuration
// ============================================================================

function loadConfig() {
  const configPath = getConfigPath();
  const defaults = {
    python: { path: 'python', sttScript: './stt/stt.py', recordScript: './record.py', serverScript: '../src/scripts/stt/server.py' },
    stt: {
      backend: 'auto',
      modelSize: 'tiny',
      language: 'zh',
      maxDuration: 180,
      silenceDuration: 0,      // 0 = disabled (record until user releases)
      silenceThreshold: 0.01,
      minDuration: 1.5
    },
    hotkey: {
      enabled: true,
      key: 'CommandOrControl+Alt+Space'  // Electron accelerator format
    },
    window: { width: 60, height: 60, rememberPosition: true },
    logging: { level: 'INFO', logToFile: true },
    timeout: { maxProcessingTime: 300000 }
  };

  try {
    if (fs.existsSync(configPath)) {
      const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      // Deep merge to preserve nested properties
      return deepMerge(defaults, userConfig);
    }
  } catch (e) {
    console.error(`Failed to load config: ${e.message}`);
  }
  return defaults;
}

// Deep merge utility function
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

let config = loadConfig();

function saveConfig() {
  const configPath = getConfigPath();
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    log('INFO', 'config', 'Configuration saved');
    return true;
  } catch (e) {
    log('ERROR', 'config', `Failed to save config: ${e.message}`);
    return false;
  }
}

// ============================================================================
// Context Menu
// ============================================================================

function buildContextMenu() {
  const currentBackend = config.stt.backend || 'doubao-cloud';
  const backendLabel = currentBackend === 'doubao-cloud' ? '豆包云 (~1s)' : '本地 Whisper (~10s)';
  const otherBackend = currentBackend === 'doubao-cloud' ? 'whisper' : 'doubao-cloud';
  const otherBackendLabel = currentBackend === 'doubao-cloud' ? '本地 Whisper (~10s)' : '豆包云 (~1s)';

  return Menu.buildFromTemplate([
    // Section: Current backend info
    {
      label: `━━━ 当前后端 ━━━`,
      enabled: false
    },
    {
      label: `✅ ${backendLabel}`,
      enabled: false
    },
    { type: 'separator' },
    // Section: Switch backend
    {
      label: `🔄 切换到: ${otherBackendLabel}`,
      click: () => {
        log('INFO', 'menu', `Switch backend clicked: ${otherBackend}`);
        switchBackend(otherBackend);
      }
    },
    { type: 'separator' },
    // Section: Exit
    {
      label: '❌ 退出应用',
      click: () => {
        log('INFO', 'menu', 'Exit clicked');
        app.quit();
      }
    }
  ]);
}

function switchBackend(backend) {
  log('INFO', 'config', `Switching backend to: ${backend}`);

  // CRITICAL: Clear audio buffer and reset state before switching
  // This prevents residual audio from being processed after switch
  streamingAudioBuffer = [];
  intermediateResultDisplayed = false;

  // If currently recording or processing, stop first
  if (state !== 'idle') {
    log('WARN', 'config', `Stopping current recording (state: ${state}) before backend switch`);
    if (state === 'recording') {
      cleanupPythonProcess();
    }
    setState('idle');
    restoreWindow();
  }

  // Send switch_backend command to server via WebSocket
  if (wsConnected && wsClient) {
    wsClient.send(JSON.stringify({ action: 'switch_backend', backend: backend }));

    // Wait for response then update local config
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'backend_switched' && msg.backend === backend) {
          wsClient.off('message', handler);
          log('INFO', 'config', `Server confirmed backend switch to: ${backend}`);
          config.stt.backend = backend;
          saveConfig();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('backend-changed', backend);
          }
        } else if (msg.event === 'error') {
          wsClient.off('message', handler);
          log('ERROR', 'config', `Server rejected backend switch: ${msg.message}`);
        }
      } catch (e) {
        // Ignore parse errors
      }
    };
    wsClient.on('message', handler);

    // Timeout for response
    setTimeout(() => {
      wsClient.off('message', handler);
    }, 5000);
  } else {
    // Fallback: just update local config (for legacy mode)
    log('WARN', 'config', 'WebSocket not connected, updating local config only');
    config.stt.backend = backend;
    saveConfig();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-changed', backend);
    }
  }
}

function reconnectWebSocket() {
  if (wsClient) {
    wsClient.close();
    wsClient = null;
    wsConnected = false;
  }
  connectWebSocket();
}

// IPC for context menu
ipcMain.on('show-context-menu', (event) => {
  log('INFO', 'main', 'Context menu requested');
  const menu = buildContextMenu();

  // Use callback to ensure menu handlers work correctly with focusable:false window
  menu.popup({
    window: mainWindow,
    callback: () => {
      log('INFO', 'main', 'Context menu closed');
    }
  });
});

ipcMain.on('switch-backend', (event, backend) => {
  switchBackend(backend);
});

// ============================================================================
// Logging
// ============================================================================

function log(level, module, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] [${module}] ${message}`;
  console.error(line);

  if (config.logging?.logToFile) {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(path.join(logsDir, 'app.log'), line + '\n');
  }
}

// ============================================================================
// Keyboard Hotkey Support
// ============================================================================

/**
 * Check if Right Ctrl key is currently pressed
 * Uses Windows API via PowerShell
 * @returns {boolean}
 */
function isRightCtrlPressed() {
  const { execSync } = require('child_process');

  // Virtual key code for Right Ctrl is 0xA3 (163)
  // GetAsyncKeyState returns 0x8000 if key is currently down
  const psScript = `
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);' -Name Win32 -Namespace N
[N.Win32]::GetAsyncKeyState(0xA3) -band 0x8000
`;

  try {
    const base64Cmd = Buffer.from(psScript, 'utf16le').toString('base64');
    const result = execSync(`powershell -EncodedCommand ${base64Cmd}`, {
      encoding: 'utf8',
      timeout: 100
    });
    return result.includes('True');
  } catch (e) {
    log('ERROR', 'hotkey', `Failed to check key state: ${e.message}`);
    return false;
  }
}

/**
 * Register global hotkey for recording (configurable via config.json)
 */
function registerGlobalHotkey() {
  const { globalShortcut } = require('electron');

  // Check if hotkey is enabled
  if (!config.hotkey?.enabled) {
    log('INFO', 'hotkey', 'Hotkey disabled in config');
    return false;
  }

  const accelerator = config.hotkey?.key || 'CommandOrControl+Alt+Space';
  log('INFO', 'hotkey', `Attempting to register hotkey: ${accelerator}`);

  // Unregister first in case of re-registration
  if (globalShortcut.isRegistered(accelerator)) {
    globalShortcut.unregister(accelerator);
  }

  const registered = globalShortcut.register(accelerator, () => {
    onHotkeyPressed();
  });

  if (registered) {
    log('INFO', 'hotkey', `Hotkey registered: ${accelerator}`);
  } else {
    log('ERROR', 'hotkey', `Failed to register hotkey: ${accelerator} - may be in use by another app`);
  }

  return registered;
}

/**
 * Unregister all global hotkeys
 */
function unregisterGlobalHotkey() {
  const { globalShortcut } = require('electron');
  globalShortcut.unregisterAll();
  log('INFO', 'hotkey', 'Global hotkeys unregistered');
}

// Debounce tracking for hotkey
let lastHotkeyTime = 0;
const HOTKEY_DEBOUNCE_MS = 300; // Minimum time between hotkey triggers

/**
 * Handle hotkey press
 * Toggle mode: start recording if idle, stop if recording
 */
function onHotkeyPressed() {
  const now = Date.now();

  // Debounce: ignore if triggered too quickly after last trigger
  if (now - lastHotkeyTime < HOTKEY_DEBOUNCE_MS) {
    log('DEBUG', 'hotkey', `Hotkey debounced (${now - lastHotkeyTime}ms since last trigger)`);
    return;
  }
  lastHotkeyTime = now;

  const accelerator = config.hotkey?.key || 'CommandOrControl+Alt+Space';
  log('INFO', 'hotkey', `Hotkey ${accelerator} pressed, current state: ${state}`);

  if (state === 'idle') {
    // Start recording
    startRecording();
  } else if (state === 'recording') {
    // Stop recording
    stopRecording();
  } else {
    log('DEBUG', 'hotkey', `Ignoring hotkey in state: ${state}`);
  }
}

// ============================================================================
// STT Server Management
// ============================================================================

let serverProcess = null;
let serverStarting = false;
let serverCheckAttempts = 0;
const MAX_SERVER_CHECK_ATTEMPTS = 10;

function checkServerRunning() {
  return new Promise((resolve) => {
    const testUrl = config.websocket?.url || 'ws://127.0.0.1:8765';
    const testWs = new WebSocket(testUrl, { handshakeTimeout: 2000 });

    testWs.on('open', () => {
      testWs.close();
      resolve(true);
    });

    testWs.on('error', () => {
      resolve(false);
    });

    // Timeout fallback
    setTimeout(() => {
      testWs.terminate();
      resolve(false);
    }, 2000);
  });
}

function startSTTServer() {
  return new Promise((resolve, reject) => {
    if (serverProcess || serverStarting) {
      resolve(true);
      return;
    }

    // In packaged mode, use bundled resources path
    let serverScript;
    if (isPackaged) {
      serverScript = path.join(process.resourcesPath, 'resources', 'stt', 'server.py');
    } else {
      serverScript = path.resolve(__dirname, config.python.serverScript || '../src/scripts/stt/server.py');
    }
    log('INFO', 'server', `Starting STT server: ${serverScript}`);

    serverStarting = true;

    // Pass env file path to Python server
    const envPath = getEnvPath();

    const env = {
      ...process.env,
      KMP_DUPLICATE_LIB_OK: 'TRUE',
      PYTHONIOENCODING: 'utf-8',
      DOTENV_PATH: envPath  // Custom env var for Python to find .env
    };

    // In packaged mode, set working directory to resources
    const cwd = isPackaged
      ? path.join(process.resourcesPath, 'resources')
      : path.resolve(__dirname, '..');

    serverProcess = spawn(config.python.path, [serverScript], {
      cwd: cwd,
      env: env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', (data) => {
      log('DEBUG', 'server', `stdout: ${data.toString().trim()}`);
    });

    serverProcess.stderr.on('data', (data) => {
      log('DEBUG', 'server', `stderr: ${data.toString().trim()}`);
    });

    serverProcess.on('error', (err) => {
      log('ERROR', 'server', `Failed to start: ${err.message}`);
      serverProcess = null;
      serverStarting = false;
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      log('INFO', 'server', `Server exited with code ${code}`);
      serverProcess = null;
      serverStarting = false;
    });

    // Wait for server to be ready
    let attempts = 0;
    const checkInterval = setInterval(async () => {
      attempts++;
      const running = await checkServerRunning();
      if (running) {
        clearInterval(checkInterval);
        serverStarting = false;
        log('INFO', 'server', 'STT server is ready');
        resolve(true);
      } else if (attempts >= 20) {
        clearInterval(checkInterval);
        serverStarting = false;
        log('ERROR', 'server', 'STT server failed to start within timeout');
        reject(new Error('Server startup timeout'));
      }
    }, 500);
  });
}

async function ensureServerRunning() {
  const running = await checkServerRunning();
  if (running) {
    log('INFO', 'server', 'STT server already running');
    return true;
  }

  log('INFO', 'server', 'STT server not running, starting...');
  try {
    await startSTTServer();
    return true;
  } catch (e) {
    log('ERROR', 'server', `Failed to start server: ${e.message}`);
    return false;
  }
}

function cleanupServer() {
  if (serverProcess) {
    log('INFO', 'server', 'Stopping STT server');
    serverProcess.kill();
    serverProcess = null;
  }
}

// ============================================================================
// WebSocket Connection
// ============================================================================

let wsClient = null;
let wsConnected = false;

function connectWebSocket() {
  if (!config.websocket?.enabled) return;

  const url = config.websocket.url || 'ws://127.0.0.1:8765';
  log('INFO', 'ws', `Connecting to WebSocket: ${url}`);

  try {
    wsClient = new WebSocket(url);

    wsClient.on('open', () => {
      wsConnected = true;
      serverCheckAttempts = 0; // Reset attempts on successful connection
      log('INFO', 'ws', 'WebSocket connected');
    });

    wsClient.on('close', () => {
      wsConnected = false;
      log('INFO', 'ws', 'WebSocket disconnected');
      // Reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    });

    wsClient.on('error', async (err) => {
      log('ERROR', 'ws', `WebSocket error: ${err.message}`);
      // If connection refused, try starting the server
      if (err.code === 'ECONNREFUSED') {
        serverCheckAttempts++;
        if (serverCheckAttempts <= 3) {
          log('INFO', 'ws', 'Connection refused, attempting to start server...');
          await ensureServerRunning();
        }
      }
    });
  } catch (e) {
    log('ERROR', 'ws', `Failed to connect: ${e.message}`);
  }
}

function sendAudioToServer(audioData, isIntermediate = false) {
  return new Promise((resolve, reject) => {
    if (!wsConnected || !wsClient) {
      reject(new Error('WebSocket not connected'));
      return;
    }

    let resolved = false;  // Prevent double resolve

    const handler = (data) => {
      if (resolved) return;  // Already resolved, ignore

      try {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'result') {
          resolved = true;
          wsClient.off('message', handler);
          resolve(msg.text);
        } else if (msg.event === 'partial_result') {
          // Intermediate result
          if (isIntermediate) {
            resolved = true;
            wsClient.off('message', handler);
            resolve(msg.text);
          }
        } else if (msg.event === 'error') {
          resolved = true;
          wsClient.off('message', handler);
          reject(new Error(msg.message));
        }
      } catch (e) {
        // Ignore parse errors, wait for next message
      }
    };

    wsClient.on('message', handler);

    // Send start_recording then audio data
    wsClient.send(JSON.stringify({ action: 'start_recording', language: config.stt.language }));
    wsClient.send(audioData);
    wsClient.send(JSON.stringify({ action: 'stop_recording', is_intermediate: isIntermediate }));

    // Shorter timeout for intermediate results
    const timeout = isIntermediate
      ? (config.timeout?.intermediateProcessingTime || 10000)
      : (config.timeout?.maxProcessingTime || 60000);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        wsClient.off('message', handler);
        reject(new Error('WebSocket timeout'));
      }
    }, timeout);
  });
}

// ============================================================================
// State Management
// ============================================================================

// States: idle | warming | recording | processing | success | error
let state = 'idle';
let mainWindow = null;
let pythonProcess = null;
let processTimeout = null;

function setState(newState) {
  const oldState = state;
  state = newState;
  log('DEBUG', 'state', `State transition: ${oldState} -> ${newState}`);
  sendStateToRenderer(newState);
}

function sendStateToRenderer(stateToSend) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state-changed', stateToSend);
  }
}

// ============================================================================
// Window Management
// ============================================================================

function createWindow() {
  log('INFO', 'main', 'Creating floating ball window');

  mainWindow = new BrowserWindow({
    width: config.window.width,
    height: config.window.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,  // Prevent ghost images on Windows during drag
    focusable: false,  // Window never takes focus - eliminates Alt+Tab flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  if (config.window.rememberPosition) {
    const positionPath = getPositionPath();
    try {
      if (fs.existsSync(positionPath)) {
        const position = JSON.parse(fs.readFileSync(positionPath, 'utf-8'));
        mainWindow.setPosition(position.x, position.y);
        log('INFO', 'main', `Restored position: (${position.x}, ${position.y})`);
      }
    } catch (e) {
      log('ERROR', 'main', `Failed to restore position: ${e.message}`);
    }
  }

  mainWindow.on('moved', () => {
    if (config.window.rememberPosition) {
      const [x, y] = mainWindow.getPosition();
      // Ensure config directory exists
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(
        getPositionPath(),
        JSON.stringify({ x, y })
      );
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    cleanupPythonProcess();
  });
}

// ============================================================================
// Python Process Management
// ============================================================================

function spawnPythonProcess() {
  if (pythonProcess) {
    log('WARN', 'main', 'Python process already running, killing old one');
    cleanupPythonProcess();
  }

  const scriptPath = path.join(__dirname, config.python.sttScript);
  const args = [
    scriptPath,
    '--backend', config.stt.backend,
    '--model', config.stt.modelSize,
    '--language', config.stt.language,
    '--duration', String(config.stt.maxDuration)
  ];

  log('INFO', 'main', `Starting Python: ${config.python.path} ${args.join(' ')}`);

  const pythonEnv = {
    ...process.env,
    KMP_DUPLICATE_LIB_OK: 'TRUE'
  };

  pythonProcess = spawn(config.python.path, args, { env: pythonEnv });
  let output = '';

  pythonProcess.stdout.on('data', (data) => {
    output += data.toString();
    log('DEBUG', 'main', `Python stdout: ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    const stderrText = data.toString().trim();
    log('DEBUG', 'main', `Python stderr: ${stderrText}`);

    // Detect when Python actually starts recording
    if (stderrText.includes('Recording...') && state === 'warming') {
      log('INFO', 'main', 'Python is now recording');
      setState('recording');
    }
  });

  pythonProcess.on('close', (code) => {
    log('INFO', 'main', `Python process exited with code ${code}`);
    clearTimeout(processTimeout);
    processTimeout = null;
    handlePythonOutput(output);
    pythonProcess = null;
  });

  pythonProcess.on('error', (err) => {
    log('ERROR', 'main', `Failed to start Python: ${err.message}`);
    cleanupPythonProcess();
    setState('error');
    scheduleReset(1000);
  });

  // Timeout
  const timeout = config.timeout?.maxProcessingTime || 60000;
  processTimeout = setTimeout(() => {
    log('WARN', 'main', `Python process timed out after ${timeout}ms`);
    cleanupPythonProcess();
    setState('error');
    scheduleReset(1000);
  }, timeout);
}

function cleanupPythonProcess() {
  if (pythonProcess) {
    log('INFO', 'main', 'Terminating Python process');
    // Remove all event listeners to prevent buffered data from firing
    pythonProcess.stdout.removeAllListeners();
    pythonProcess.stderr.removeAllListeners();
    pythonProcess.removeAllListeners();
    pythonProcess.kill();
    pythonProcess = null;
  }
  if (processTimeout) {
    clearTimeout(processTimeout);
    processTimeout = null;
  }
  // CRITICAL: Clear audio buffer and reset ALL flags
  streamingAudioBuffer = [];
  intermediateResultDisplayed = false;
  transcriptionInProgress = false;  // MUST reset this lock!
}

// WebSocket mode: Record audio with Python, transcribe via WebSocket
// Supports streaming output with intermediate silence detection
let streamingAudioBuffer = [];  // Buffer for streaming mode
let intermediateResultDisplayed = false;
let transcriptionInProgress = false;  // Global lock to prevent duplicate transcription

function spawnRecordingOnly() {
  if (pythonProcess) {
    log('WARN', 'main', 'Python process already running, killing old one');
    cleanupPythonProcess();
  }

  streamingAudioBuffer = [];  // Reset streaming buffer
  intermediateResultDisplayed = false;
  transcriptionInProgress = false;  // Reset global lock

  const scriptPath = path.join(__dirname, config.python.recordScript || './record.py');

  // Streaming parameters
  const intermediateSilence = config.stt?.intermediateSilenceDuration || 0.5;
  const finalSilence = config.stt?.finalSilenceDuration || config.stt?.silenceDuration || 5.0;

  const args = [
    scriptPath,
    '--duration', String(config.stt.maxDuration),
    '--silence-threshold', String(config.stt?.silenceThreshold || 0.01),
    '--intermediate-silence', String(intermediateSilence),
    '--final-silence', String(finalSilence),
    '--min-duration', String(config.stt?.minDuration || 1.5)
  ];

  log('INFO', 'main', `Starting recorder: ${config.python.path} ${args.join(' ')}`);

  const pythonEnv = {
    ...process.env,
    KMP_DUPLICATE_LIB_OK: 'TRUE'
  };

  pythonProcess = spawn(config.python.path, args, { env: pythonEnv });

  pythonProcess.stdout.on('data', (data) => {
    // Collect binary audio data
    streamingAudioBuffer.push(data);
  });

  pythonProcess.stderr.on('data', async (data) => {
    const stderrText = data.toString();
    log('DEBUG', 'main', `Recorder stderr: ${stderrText.trim()}`);

    // Handle recording started
    if (stderrText.includes('Recording...') && state === 'warming') {
      log('INFO', 'main', 'Recorder is now recording');
      setState('recording');
    }

    // Process events line by line
    const lines = stderrText.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Handle intermediate silence (0.5s) - output text and continue recording
      if (trimmedLine.includes('"event": "intermediate_silence"')) {
        // Global lock check - skip if any transcription in progress
        if (transcriptionInProgress) {
          log('DEBUG', 'main', `Skipping intermediate_silence - transcription in progress`);
          return;
        }
        transcriptionInProgress = true;  // Acquire global lock

        log('INFO', 'main', `Intermediate silence detected (0.5s)`);

        // Small delay to ensure audio data is flushed
        await new Promise(resolve => setTimeout(resolve, 50));

        if (streamingAudioBuffer.length > 0 && wsConnected && wsClient) {
          const audioData = Buffer.concat(streamingAudioBuffer);
          log('INFO', 'main', `Intermediate: ${audioData.length} bytes`);

          try {
            const text = await sendAudioToServer(audioData, false);
            if (text && text.trim()) {
              log('INFO', 'main', `Intermediate text: "${text}"`);
              await insertTextImmediately(text);
            }
          } catch (e) {
            log('WARN', 'main', `Intermediate transcription failed: ${e.message}`);
          }
          // Clear buffer - audio already transcribed
          streamingAudioBuffer = [];
        }
        transcriptionInProgress = false;  // Release global lock
      }

      // Handle final silence (5s) - output text and stop
      if (trimmedLine.includes('"event": "final_silence"') ||
          trimmedLine.includes('"event": "max_duration"')) {
        // Global lock check - skip if transcription already done by intermediate
        if (transcriptionInProgress) {
          log('DEBUG', 'main', `Skipping final_silence - transcription in progress`);
          return;
        }
        // Check if buffer was already processed
        if (streamingAudioBuffer.length === 0) {
          log('DEBUG', 'main', `Skipping final_silence - buffer already empty`);
          return;
        }
        transcriptionInProgress = true;  // Acquire global lock

        log('INFO', 'main', `Final event: ${trimmedLine}`);

        // Transcribe and insert any remaining audio immediately
        if (streamingAudioBuffer.length > 0 && wsConnected && wsClient) {
          const audioData = Buffer.concat(streamingAudioBuffer);
          log('INFO', 'main', `Final transcription: ${audioData.length} bytes`);

          try {
            const text = await sendAudioToServer(audioData, false);
            if (text && text.trim()) {
              log('INFO', 'main', `Final text: "${text}"`);
              await insertTextImmediately(text);
            }
          } catch (e) {
            log('WARN', 'main', `Final transcription failed: ${e.message}`);
          }
          // Clear buffer - audio already transcribed
          streamingAudioBuffer = [];
        }
        // Keep lock held - process is ending, no more transcription needed
      }
    }
  });

  pythonProcess.on('close', async (code) => {
    log('INFO', 'main', `Recorder exited with code ${code}`);
    clearTimeout(processTimeout);
    processTimeout = null;
    pythonProcess = null;

    // Global lock check - skip if transcription already done by final_silence
    if (transcriptionInProgress) {
      log('DEBUG', 'main', `Skipping on_close transcription - already done`);
      setState('success');
      scheduleReset(500);
      return;
    }

    // Handle any remaining audio (only if not already processed)
    if (code === 0 && streamingAudioBuffer.length > 0) {
      transcriptionInProgress = true;  // Acquire global lock
      const audioData = Buffer.concat(streamingAudioBuffer);
      log('INFO', 'main', `Final: ${audioData.length} bytes`);

      try {
        const text = await sendAudioToServer(audioData, false);
        if (text && text.trim()) {
          log('INFO', 'main', `Final text: "${text}"`);
          await insertTextImmediately(text);
        }
        setState('success');
        scheduleReset(500);
      } catch (e) {
        log('ERROR', 'main', `Final transcription failed: ${e.message}`);
        setState('error');
        scheduleReset(1000);
      }
      streamingAudioBuffer = [];
      transcriptionInProgress = false;  // Release lock after processing
    } else if (code === 0) {
      // No remaining audio, just go to success
      setState('success');
      scheduleReset(500);
    } else {
      log('ERROR', 'main', 'Recording failed');
      setState('error');
      scheduleReset(1000);
    }
    restoreWindow();
  });

  pythonProcess.on('error', (err) => {
    log('ERROR', 'main', `Failed to start recorder: ${err.message}`);
    cleanupPythonProcess();
    setState('error');
    scheduleReset(1000);
  });

  // Timeout (extended for long recordings)
  const timeout = config.timeout?.maxProcessingTime || 300000;
  processTimeout = setTimeout(() => {
    log('WARN', 'main', `Recorder timed out after ${timeout}ms`);
    cleanupPythonProcess();
    setState('error');
    scheduleReset(1000);
  }, timeout);
}

// Insert text immediately without changing state (for intermediate results)
async function insertTextImmediately(text) {
  const { clipboard } = require('electron');
  const { execSync } = require('child_process');

  log('INFO', 'insertText', `Inserting: "${text}"`);

  try {
    // Write to clipboard
    clipboard.writeText(text);

    // Wait briefly for clipboard
    await new Promise(resolve => setTimeout(resolve, 50));

    // Send Ctrl+V
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("^v")
`;
    const base64Cmd = Buffer.from(psScript, 'utf16le').toString('base64');
    execSync(`powershell -EncodedCommand ${base64Cmd}`, { timeout: 5000 });

    log('INFO', 'insertText', `Inserted successfully`);
  } catch (e) {
    log('ERROR', 'insertText', `Failed: ${e.message}`);
  }
}

async function handleTranscriptionResult(text) {
  // Return focus BEFORE inserting text
  await returnFocusToPreviousApp();

  // Wait for focus to switch (longer on Windows due to hide)
  const focusDelay = process.platform === 'win32' ? 400 : 200;
  await new Promise(resolve => setTimeout(resolve, focusDelay));

  if (text && text.trim()) {
    log('INFO', 'main', `Transcription: "${text}"`);
    log('DEBUG', 'main', 'About to call insertText...');
    try {
      await insertText(text);
      log('DEBUG', 'main', 'insertText completed');
    } catch (e) {
      log('ERROR', 'main', `insertText failed: ${e.message}`);
    }
    setState('success');
    scheduleReset(500);
  } else {
    log('INFO', 'main', 'Transcription succeeded but no text');
    setState('success');
    scheduleReset(500);
  }

  // Restore window after everything is done (on Windows)
  if (process.platform === 'win32') {
    restoreWindow();
  }
}

async function handlePythonOutput(output) {
  try {
    if (!output.trim()) {
      log('ERROR', 'main', 'Python produced no output');
      setState('error');
      scheduleReset(1000);
      restoreWindow();
      return;
    }

    const result = JSON.parse(output);

    // Return focus BEFORE inserting text
    await returnFocusToPreviousApp();

    // Wait longer for focus to switch
    const focusDelay = process.platform === 'win32' ? 400 : 200;
    await new Promise(resolve => setTimeout(resolve, focusDelay));

    if (result.success && result.text && result.text.trim()) {
      log('INFO', 'main', `Transcription: "${result.text}"`);
      try {
        await insertText(result.text);
        log('INFO', 'main', 'insertText completed successfully');
      } catch (e) {
        log('ERROR', 'main', `insertText threw exception: ${e.message}`);
      }
      setState('success');
      scheduleReset(500);
    } else if (result.success && (!result.text || !result.text.trim())) {
      log('INFO', 'main', 'Transcription succeeded but no text');
      setState('success');
      scheduleReset(500);
    } else {
      log('ERROR', 'main', `Transcription failed: ${result.error || 'Unknown'}`);
      setState('error');
      scheduleReset(1000);
    }
  } catch (e) {
    log('ERROR', 'main', `Failed to parse Python output: ${e.message}`);
    await returnFocusToPreviousApp();
    setState('error');
    scheduleReset(1000);
  }

  // Restore window after everything is done (on Windows)
  if (process.platform === 'win32') {
    restoreWindow();
  }
}

// ============================================================================
// Text Insertion
// ============================================================================

// Insert text immediately (for intermediate results during recording)
async function insertTextImmediately(text) {
  const { clipboard } = require('electron');
  const { execSync } = require('child_process');

  log('INFO', 'insertText', `Inserting intermediate: "${text}"`);

  try {
    clipboard.writeText(text);
    await new Promise(resolve => setTimeout(resolve, 50));

    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("^v")
`;
    const base64Cmd = Buffer.from(psScript, 'utf16le').toString('base64');
    execSync(`powershell -EncodedCommand ${base64Cmd}`, { timeout: 5000 });
    log('INFO', 'insertText', `Intermediate text inserted`);
  } catch (e) {
    log('ERROR', 'insertText', `Intermediate insertion failed: ${e.message}`);
  }
}

async function insertText(text) {
  const { clipboard } = require('electron');
  const { execSync } = require('child_process');

  log('INFO', 'insertText', `=== START text insertion ===`);
  log('INFO', 'insertText', `Text to insert: "${text}" (${text.length} chars)`);

  // DIAGNOSTIC: Check foreground window before insertion
  try {
    const psScript = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();' -Name Win32 -Namespace N; [N.Win32]::GetForegroundWindow()`;
    const base64Cmd = Buffer.from(psScript, 'utf16le').toString('base64');
    const hwnd = execSync(`powershell -EncodedCommand ${base64Cmd}`, { encoding: 'utf8', timeout: 2000 }).trim();
    log('INFO', 'insertText', `Foreground window handle: ${hwnd}`);
  } catch (e) {
    log('WARN', 'insertText', `Could not get foreground window: ${e.message}`);
  }

  // === METHOD 1: Electron clipboard + PowerShell SendKeys (Ctrl+V) ===
  try {
    log('INFO', 'insertText', `Method 1: Electron clipboard + PowerShell SendKeys...`);

    // Write to clipboard using Electron
    clipboard.writeText(text);
    log('INFO', 'insertText', `Clipboard writeText called`);

    // Verify clipboard content
    await new Promise(resolve => setTimeout(resolve, 50));
    const clipContent = clipboard.readText();
    log('INFO', 'insertText', `Clipboard verification: match=${clipContent === text}`);

    if (clipContent !== text) {
      throw new Error(`Clipboard verification failed`);
    }

    // Wait for clipboard to stabilize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Use PowerShell to send Ctrl+V
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("^v")
`;
    const base64Cmd = Buffer.from(psScript, 'utf16le').toString('base64');
    execSync(`powershell -EncodedCommand ${base64Cmd}`, { timeout: 5000 });
    log('INFO', 'insertText', `Method 1 completed successfully`);

    return; // Success
  } catch (e) {
    log('ERROR', 'insertText', `Method 1 failed: ${e.message}`);
  }

  // === METHOD 2: Pure PowerShell clipboard + SendKeys ===
  try {
    log('INFO', 'insertText', `Method 2: Pure PowerShell clipboard + SendKeys...`);

    // Escape single quotes for PowerShell
    const escapedText = text.replace(/'/g, "''");

    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Clipboard]::SetText('${escapedText}')
Start-Sleep -Milliseconds 50
[System.Windows.Forms.SendKeys]::SendWait("^v")
`;
    const base64Cmd = Buffer.from(psScript, 'utf16le').toString('base64');
    execSync(`powershell -EncodedCommand ${base64Cmd}`, { timeout: 5000 });
    log('INFO', 'insertText', `Method 2 completed successfully`);

    return; // Success
  } catch (e) {
    log('ERROR', 'insertText', `Method 2 failed: ${e.message}`);
  }

  // === METHOD 3: PowerShell type string character by character ===
  try {
    log('INFO', 'insertText', `Method 3: PowerShell character typing...`);

    // Build SendKeys string with special character escaping
    let sendKeysStr = '';
    for (const char of text) {
      if (char === ' ') {
        sendKeysStr += ' ';
      } else if (char === '\n') {
        sendKeysStr += '{ENTER}';
      } else if (char === '\t') {
        sendKeysStr += '{TAB}';
      } else if (char === '{') {
        sendKeysStr += '{{}';
      } else if (char === '}') {
        sendKeysStr += '{}}';
      } else if (char === '+') {
        sendKeysStr += '{+}';
      } else if (char === '^') {
        sendKeysStr += '{^}';
      } else if (char === '%') {
        sendKeysStr += '{%}';
      } else if (char === '~') {
        sendKeysStr += '{~}';
      } else if (char === '(') {
        sendKeysStr += '{(}';
      } else if (char === ')') {
        sendKeysStr += '{)}';
      } else {
        sendKeysStr += char;
      }
    }

    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${sendKeysStr}")
`;
    const base64Cmd = Buffer.from(psScript, 'utf16le').toString('base64');
    execSync(`powershell -EncodedCommand ${base64Cmd}`, { timeout: 10000 });
    log('INFO', 'insertText', `Method 3 completed successfully`);

    return; // Success
  } catch (e) {
    log('ERROR', 'insertText', `Method 3 failed: ${e.message}`);
  }

  log('ERROR', 'insertText', `=== ALL METHODS FAILED ===`);
}

async function returnFocusToPreviousApp() {
  // No-op: window is configured with focusable: false, so it never took focus
  // This eliminates the need for Alt+Tab which caused window flash on Windows
  log('DEBUG', 'main', 'Focus management: no-op (focusable: false)');
}

function restoreWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    log('DEBUG', 'main', 'Window restored');
  }
}

// ============================================================================
// State Reset
// ============================================================================

function scheduleReset(delay) {
  setTimeout(() => {
    if (state === 'success' || state === 'error') {
      setState('idle');
    }
  }, delay);
}

// ============================================================================
// Recording Functions (used by both IPC and Context Menu)
// ============================================================================

function startRecording() {
  log('INFO', 'main', 'startRecording called');

  if (state !== 'idle') {
    log('WARN', 'main', `Cannot start recording in state: ${state}`);
    return;
  }

  // Use WebSocket mode if enabled and connected
  if (config.websocket?.enabled && wsConnected) {
    log('INFO', 'main', 'Using WebSocket mode for STT');
    setState('recording'); // No warmup needed - model already loaded
    spawnRecordingOnly();
  } else {
    // Fallback to legacy mode (with warmup)
    log('INFO', 'main', 'Using legacy mode for STT');
    setState('warming');
    spawnPythonProcess();
  }
}

function stopRecording() {
  log('INFO', 'main', `stopRecording called (state: ${state}, pythonProcess: ${pythonProcess ? 'running' : 'null'})`);

  if (state === 'warming') {
    // Still warming up, just go to idle
    cleanupPythonProcess();
    setState('idle');
    return;
  }

  if (state === 'recording') {
    log('INFO', 'main', 'Recording -> Processing, Python recorder will stop on its own (silence detection or max duration)');
    setState('processing');
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

ipcMain.on('start-recording', () => {
  startRecording();
});

ipcMain.on('stop-recording', () => {
  stopRecording();
});

ipcMain.on('get-state', (event) => {
  event.reply('state-changed', state);
});

// ============================================================================
// First-Run Check
// ============================================================================

function checkFirstRun() {
  // In development mode, skip first-run check (use project .env)
  if (!isPackaged) {
    return true;
  }

  const envPath = getEnvPath();

  if (!fs.existsSync(envPath)) {
    dialog.showErrorBox(
      'Configuration Required / 需要配置',
      'Please run the setup wizard to configure API credentials.\n' +
      '请运行设置向导配置 API 凭证。\n\n' +
      'Run in terminal / 在终端运行:\n' +
      '  npm run setup\n\n' +
      'Or manually create / 或手动创建:\n' +
      `  ${envPath}\n\n` +
      `Documentation / 文档: ${DOCS_URL}`
    );
    app.quit();
    return false;
  }

  return true;
}

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(async () => {
  // Check for first-run configuration
  if (!checkFirstRun()) {
    return;
  }

  createWindow();

  // Ensure STT server is running before connecting WebSocket
  await ensureServerRunning();
  connectWebSocket();

  // Register global hotkey for Right Ctrl
  registerGlobalHotkey();
});

app.on('window-all-closed', () => {
  cleanupPythonProcess();
  cleanupServer();
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  cleanupPythonProcess();
  cleanupServer();
});

app.on('will-quit', () => {
  // Unregister all global hotkeys
  unregisterGlobalHotkey();
});
