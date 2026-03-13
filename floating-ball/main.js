// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let pythonProcess = null;
let config = null;
let logger = null;

// Load config
function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  const defaults = {
    python: { path: 'python', sttScript: './stt/stt.py' },
    stt: { backend: 'auto', modelSize: 'tiny', language: 'zh', maxDuration: 30 },
    window: { width: 60, height: 60, rememberPosition: true },
    logging: { level: 'INFO', logToFile: true }
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

// Simple logger
function log(level, module, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] [${module}] ${message}`;
  console.error(line); // stderr so it doesn't interfere with IPC

  if (config?.logging?.logToFile) {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(path.join(logsDir, 'app.log'), line + '\n');
  }
}

function createWindow() {
  config = loadConfig();

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

  // Restore position if configured
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
      log('DEBUG', 'main', `Position saved: (${x}, ${y})`);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function spawnPython() {
  if (pythonProcess) {
    log('WARN', 'main', 'Python process already running');
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

  log('INFO', 'main', `Starting Python: ${config.python.path} ${args.join(' ')}`);

  pythonProcess = spawn(config.python.path, args);
  let output = '';

  pythonProcess.stdout.on('data', (data) => {
    output += data.toString();
    log('DEBUG', 'main', `Python stdout: ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    log('DEBUG', 'main', `Python stderr: ${data.toString().trim()}`);
  });

  pythonProcess.on('close', (code) => {
    log('INFO', 'main', `Python process exited with code ${code}`);

    try {
      const result = JSON.parse(output);
      if (result.success && result.text) {
        log('INFO', 'main', `Transcription: "${result.text}"`);
        insertText(result.text);
        sendState('success');
      } else {
        log('ERROR', 'main', `Transcription failed: ${result.error || 'Unknown error'}`);
        sendState('error');
      }
    } catch (e) {
      log('ERROR', 'main', `Failed to parse Python output: ${e.message}`);
      sendState('error');
    }

    pythonProcess = null;
  });

  pythonProcess.on('error', (err) => {
    log('ERROR', 'main', `Failed to start Python: ${err.message}`);
    sendState('error');
    pythonProcess = null;
  });
}

function killPython() {
  if (pythonProcess) {
    log('INFO', 'main', 'Terminating Python process');
    pythonProcess.kill();
    pythonProcess = null;
  }
}

function insertText(text) {
  try {
    log('DEBUG', 'main', `Inserting text: "${text}"`);
    const robotjs = require('robotjs');
    robotjs.typeString(text);
    log('INFO', 'main', 'Text inserted successfully');
  } catch (e) {
    log('ERROR', 'main', `Failed to insert text: ${e.message}`);
  }
}

function sendState(state) {
  if (mainWindow) {
    mainWindow.webContents.send('state-changed', state);
  }
}

// IPC handlers
ipcMain.on('start-recording', () => {
  log('INFO', 'main', 'IPC: start-recording received');
  sendState('recording');
  spawnPython();
});

ipcMain.on('stop-recording', () => {
  log('INFO', 'main', 'IPC: stop-recording received');
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
