// main.js - Floating Ball Main Process
// With Python warm-up detection
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// ============================================================================
// Configuration
// ============================================================================

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  const defaults = {
    python: { path: 'python', sttScript: './stt/stt.py' },
    stt: { backend: 'auto', modelSize: 'tiny', language: 'zh', maxDuration: 30 },
    window: { width: 60, height: 60, rememberPosition: true },
    logging: { level: 'INFO', logToFile: true },
    timeout: { maxProcessingTime: 60000 }
  };

  try {
    if (fs.existsSync(configPath)) {
      const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return { ...defaults, ...userConfig };
    }
  } catch (e) {
    console.error(`Failed to load config: ${e.message}`);
  }
  return defaults;
}

let config = loadConfig();

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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  if (config.window.rememberPosition) {
    const positionPath = path.join(__dirname, 'position.json');
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
      fs.writeFileSync(
        path.join(__dirname, 'position.json'),
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
    pythonProcess.kill();
    pythonProcess = null;
  }
  if (processTimeout) {
    clearTimeout(processTimeout);
    processTimeout = null;
  }
}

async function handlePythonOutput(output) {
  try {
    if (!output.trim()) {
      log('ERROR', 'main', 'Python produced no output');
      setState('error');
      scheduleReset(1000);
      return;
    }

    const result = JSON.parse(output);

    // Return focus BEFORE inserting text
    returnFocusToPreviousApp();

    // Wait longer for focus to switch (200ms instead of 100ms)
    await new Promise(resolve => setTimeout(resolve, 200));

    if (result.success && result.text && result.text.trim()) {
      log('INFO', 'main', `Transcription: "${result.text}"`);
      await insertText(result.text);
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
    returnFocusToPreviousApp();
    setState('error');
    scheduleReset(1000);
  }
}

// ============================================================================
// Text Insertion
// ============================================================================

async function insertText(text) {
  try {
    log('DEBUG', 'main', `Inserting text: "${text}"`);

    // Method 1: Use clipboard + paste (faster than typing)
    const { clipboard } = require('electron');
    const { keyboard, Key } = require('@nut-tree/nut-js');

    // Copy text to clipboard
    clipboard.writeText(text);

    // Paste using Ctrl+V
    await keyboard.pressKey(Key.LeftControl, Key.V);
    await keyboard.releaseKey(Key.LeftControl, Key.V);

    log('INFO', 'main', 'Text inserted successfully via clipboard');
  } catch (e) {
    log('ERROR', 'main', `Failed to insert text: ${e.message}`);
  }
}

function returnFocusToPreviousApp() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.blur();
    log('DEBUG', 'main', 'Focus returned to previous application');
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
// IPC Handlers
// ============================================================================

ipcMain.on('start-recording', () => {
  log('INFO', 'main', 'IPC: start-recording received');

  if (state !== 'idle') {
    log('WARN', 'main', `Cannot start recording in state: ${state}`);
    return;
  }

  // Show "warming" state first - Python needs time to start
  setState('warming');
  spawnPythonProcess();
});

ipcMain.on('stop-recording', () => {
  log('INFO', 'main', 'IPC: stop-recording received');

  if (state === 'warming') {
    // Still warming up, just go to idle
    cleanupPythonProcess();
    setState('idle');
    return;
  }

  if (state === 'recording') {
    setState('processing');
  }
});

ipcMain.on('get-state', (event) => {
  event.reply('state-changed', state);
});

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  cleanupPythonProcess();
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
});
