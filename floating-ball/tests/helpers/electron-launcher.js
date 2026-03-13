/**
 * Electron Launcher Helper for Integration Tests
 *
 * Provides utilities to launch and manage Electron processes in tests.
 * Clears IDE-inherited environment variables that interfere with Electron mode.
 */

const { spawn } = require('child_process');
const path = require('path');

// Environment variables that must be cleared for Electron to run in proper mode
// These are inherited from IDEs (VSCode, etc.) and cause Electron to run as Node.js
const ENV_VARS_TO_CLEAR = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_FORCE_IS_PACKAGED',
  'VSCODE_RUN_IN_ELECTRON',
  'ICUBE_IS_ELECTRON',
  'ICUBE_ELECTRON_PATH'
];

/**
 * Get the path to the Electron executable
 * @returns {string} Path to electron binary
 */
function getElectronPath() {
  // require('electron') returns the path to the electron binary
  return require('electron');
}

/**
 * Create a clean environment for Electron process
 * Removes IDE-inherited environment variables
 * @param {Object} extraEnv - Additional environment variables to set
 * @returns {Object} Cleaned environment object
 */
function createCleanEnv(extraEnv = {}) {
  const env = { ...process.env };

  // Clear IDE-inherited variables
  for (const varName of ENV_VARS_TO_CLEAR) {
    delete env[varName];
  }

  // Merge in any extra environment variables
  return { ...env, ...extraEnv };
}

/**
 * Launch Electron process with clean environment
 *
 * @param {Object} options - Launch options
 * @param {string} [options.appPath] - Path to Electron app (default: current directory)
 * @param {string[]} [options.args] - Additional arguments for Electron
 * @param {Object} [options.env] - Additional environment variables
 * @param {boolean} [options.show=true] - Whether to show the window (sets ELECTRON_RUN_AS_NODE=false)
 * @param {number} [options.timeout=30000] - Default timeout for operations
 * @returns {import('child_process').ChildProcess} The spawned Electron process
 */
function launchElectron(options = {}) {
  const {
    appPath = process.cwd(),
    args = [],
    env = {},
    timeout = 30000
  } = options;

  const electronPath = getElectronPath();
  const cleanEnv = createCleanEnv(env);

  // Spawn Electron with clean environment
  const proc = spawn(electronPath, [appPath, ...args], {
    env: cleanEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  // Store launch options on process for reference
  proc._launchOptions = { appPath, args, timeout };

  return proc;
}

/**
 * Kill Electron process gracefully, then forcefully if needed
 *
 * @param {import('child_process').ChildProcess} proc - The Electron process to kill
 * @param {number} [timeout=5000] - Time to wait for graceful shutdown before SIGKILL
 * @returns {Promise<void>} Resolves when process is killed
 */
function killElectron(proc, timeout = 5000) {
  return new Promise((resolve) => {
    if (!proc || proc.killed) {
      resolve();
      return;
    }

    let resolved = false;
    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    proc.on('exit', cleanup);
    proc.on('error', cleanup);

    // Try graceful shutdown first (SIGTERM)
    proc.kill('SIGTERM');

    // Force kill after timeout
    const forceKillTimer = setTimeout(() => {
      if (!proc.killed) {
        try {
          proc.kill('SIGKILL');
        } catch (e) {
          // Process might already be dead
        }
      }
      cleanup();
    }, timeout);

    // Clean up timer if process exits before timeout
    proc.on('exit', () => clearTimeout(forceKillTimer));
  });
}

/**
 * Collect stdout and stderr output from a process
 *
 * @param {import('child_process').ChildProcess} proc - The Electron process
 * @returns {Object} Object with stdout and stderr arrays
 * @returns {string[]} returns.stdout - Collected stdout lines
 * @returns {string[]} returns.stderr - Collected stderr lines
 */
function collectOutput(proc) {
  const output = {
    stdout: [],
    stderr: []
  };

  if (proc.stdout) {
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (data) => {
      output.stdout.push(data);
    });
  }

  if (proc.stderr) {
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (data) => {
      output.stderr.push(data);
    });
  }

  return output;
}

/**
 * Wait for a specific pattern in process output
 *
 * @param {import('child_process').ChildProcess} proc - The Electron process
 * @param {string|RegExp} pattern - Pattern to match (string or RegExp)
 * @param {number} [timeout=10000] - Maximum time to wait in milliseconds
 * @returns {Promise<{matched: boolean, line: string, output: {stdout: string, stderr: string}}>}
 *          Resolves with match result and captured output
 */
function waitForOutput(proc, pattern, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const output = { stdout: '', stderr: '' };
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          matched: false,
          line: '',
          output,
          timedOut: true
        });
      }
    }, timeout);

    const matcher = typeof pattern === 'string'
      ? (line) => line.includes(pattern)
      : (line) => pattern.test(line);

    const checkMatch = (data, stream) => {
      output[stream] += data;

      if (!resolved && matcher(data)) {
        resolved = true;
        clearTimeout(timer);
        resolve({
          matched: true,
          line: data,
          output
        });
      }
    };

    if (proc.stdout) {
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (data) => checkMatch(data, 'stdout'));
    }

    if (proc.stderr) {
      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', (data) => checkMatch(data, 'stderr'));
    }

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    proc.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({
          matched: false,
          line: '',
          output,
          exitCode: code
        });
      }
    });
  });
}

module.exports = {
  launchElectron,
  killElectron,
  collectOutput,
  waitForOutput,
  getElectronPath,
  createCleanEnv,
  ENV_VARS_TO_CLEAR
};
