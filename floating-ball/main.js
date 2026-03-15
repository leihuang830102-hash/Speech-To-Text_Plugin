// main.js - Floating Ball Main Process
// With WebSocket STT support for faster response
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const WebSocket = require('ws');

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
      log('INFO', 'ws', 'WebSocket connected');
    });

    wsClient.on('close', () => {
      wsConnected = false;
      log('INFO', 'ws', 'WebSocket disconnected');
      // Reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    });

    wsClient.on('error', (err) => {
      log('ERROR', 'ws', `WebSocket error: ${err.message}`);
    });
  } catch (e) {
    log('ERROR', 'ws', `Failed to connect: ${e.message}`);
  }
}

function sendAudioToServer(audioData) {
  return new Promise((resolve, reject) => {
    if (!wsConnected || !wsClient) {
      reject(new Error('WebSocket not connected'));
      return;
    }

    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'result') {
          wsClient.off('message', handler);
          resolve(msg.text);
        } else if (msg.event === 'error') {
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
    wsClient.send(JSON.stringify({ action: 'stop_recording' }));

    // Timeout
    setTimeout(() => {
      wsClient.off('message', handler);
      reject(new Error('WebSocket timeout'));
    }, config.timeout?.maxProcessingTime || 60000);
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

// WebSocket mode: Record audio with Python, transcribe via WebSocket
function spawnRecordingOnly() {
  if (pythonProcess) {
    log('WARN', 'main', 'Python process already running, killing old one');
    cleanupPythonProcess();
  }

  const scriptPath = path.join(__dirname, config.python.recordScript || './record.py');
  const args = [
    scriptPath,
    '--duration', String(config.stt.maxDuration),
    '--silence-duration', '1.5'
  ];

  log('INFO', 'main', `Starting recorder: ${config.python.path} ${args.join(' ')}`);

  const pythonEnv = {
    ...process.env,
    KMP_DUPLICATE_LIB_OK: 'TRUE'
  };

  pythonProcess = spawn(config.python.path, args, { env: pythonEnv });
  let audioBuffer = [];

  pythonProcess.stdout.on('data', (data) => {
    // Collect binary audio data
    audioBuffer.push(data);
  });

  pythonProcess.stderr.on('data', (data) => {
    const stderrText = data.toString().trim();
    log('DEBUG', 'main', `Recorder stderr: ${stderrText}`);

    if (stderrText.includes('Recording...') && state === 'warming') {
      log('INFO', 'main', 'Recorder is now recording');
      setState('recording');
    }
  });

  pythonProcess.on('close', async (code) => {
    log('INFO', 'main', `Recorder exited with code ${code}`);
    clearTimeout(processTimeout);
    processTimeout = null;
    pythonProcess = null;

    if (code === 0 && audioBuffer.length > 0) {
      // Combine audio chunks
      const audioData = Buffer.concat(audioBuffer);
      log('INFO', 'main', `Recorded ${audioData.length} bytes, sending to WebSocket`);

      try {
        const text = await sendAudioToServer(audioData);
        await handleTranscriptionResult(text);
      } catch (e) {
        log('ERROR', 'main', `WebSocket transcription failed: ${e.message}`);
        setState('error');
        scheduleReset(1000);
        restoreWindow();
      }
    } else {
      log('ERROR', 'main', 'Recording failed or no audio');
      setState('error');
      scheduleReset(1000);
      restoreWindow();
    }
  });

  pythonProcess.on('error', (err) => {
    log('ERROR', 'main', `Failed to start recorder: ${err.message}`);
    cleanupPythonProcess();
    setState('error');
    scheduleReset(1000);
  });

  // Timeout
  const timeout = config.timeout?.maxProcessingTime || 60000;
  processTimeout = setTimeout(() => {
    log('WARN', 'main', `Recorder timed out after ${timeout}ms`);
    cleanupPythonProcess();
    setState('error');
    scheduleReset(1000);
  }, timeout);
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
// IPC Handlers
// ============================================================================

ipcMain.on('start-recording', () => {
  log('INFO', 'main', 'IPC: start-recording received');

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

app.whenReady().then(() => {
  createWindow();
  connectWebSocket();
});

app.on('window-all-closed', () => {
  cleanupPythonProcess();
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
});
