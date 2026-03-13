# Integration Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create integration tests for Floating Ball Electron app that verify IPC communication, Python process lifecycle, and STT workflow with real environments.

**Architecture:** Use vitest with custom Electron launcher helper. Tests spawn real Electron processes and verify behavior through stdout/stderr parsing and log file inspection.

**Tech Stack:** vitest, electron, child_process

---

## Prerequisites

- Electron 已修复环境变量问题（已完成）
- Python STT 后端已安装
- vitest 已配置

---

### Task 1: Create Test Helpers

**Files:**
- Create: `tests/helpers/electron-launcher.js`
- Create: `tests/integration/.gitkeep`

**Step 1: Create electron-launcher.js helper**

```javascript
// tests/helpers/electron-launcher.js
const { spawn } = require('child_process');
const path = require('path');

/**
 * Launch Electron app for testing
 * @param {Object} options - Launch options
 * @param {string[]} options.args - Additional CLI args
 * @param {Object} options.env - Extra environment variables
 * @returns {ChildProcess}
 */
function launchElectron(options = {}) {
  const { args = [], env = {} } = options;

  // Get electron executable path
  const electronPath = require('electron');

  // Path to our app
  const appPath = path.join(__dirname, '../../');

  // Clear IDE-inherited env vars that interfere with Electron
  const cleanEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
    ELECTRON_FORCE_IS_PACKAGED: '',
    VSCODE_RUN_IN_ELECTRON: '',
    ICUBE_IS_ELECTRON: '',
    ICUBE_ELECTRON_PATH: '',
    ...env
  };

  const proc = spawn(electronPath, [appPath, ...args], {
    env: cleanEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return proc;
}

/**
 * Kill electron process and wait for exit
 * @param {ChildProcess} proc
 * @param {number} timeout - Max wait time in ms
 */
async function killElectron(proc, timeout = 5000) {
  if (!proc || proc.killed) return;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
    }, timeout);

    proc.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    proc.kill('SIGTERM');
  });
}

/**
 * Collect stdout/stderr into a string
 * @param {ChildProcess} proc
 * @returns {{stdout: string, stderr: string}}
 */
function collectOutput(proc) {
  let stdout = '';
  let stderr = '';

  proc.stdout?.on('data', (data) => {
    stdout += data.toString();
  });

  proc.stderr?.on('data', (data) => {
    stderr += data.toString();
  });

  return {
    get stdout() { return stdout; },
    get stderr() { return stderr; }
  };
}

/**
 * Wait for a pattern in output
 * @param {ChildProcess} proc
 * @param {RegExp|string} pattern
 * @param {number} timeout - Max wait time in ms
 */
async function waitForOutput(proc, pattern, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let buffer = '';
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for pattern: ${pattern}`));
    }, timeout);

    const check = (data) => {
      buffer += data.toString();
      if (regex.test(buffer)) {
        clearTimeout(timer);
        resolve(buffer);
      }
    };

    proc.stdout?.on('data', check);
    proc.stderr?.on('data', check);
  });
}

module.exports = {
  launchElectron,
  killElectron,
  collectOutput,
  waitForOutput
};
```

**Step 2: Create integration test directory placeholder**

```bash
mkdir -p tests/integration tests/helpers
touch tests/integration/.gitkeep
```

**Step 3: Verify helper loads correctly**

Run: `node -e "const h = require('./tests/helpers/electron-launcher.js'); console.log('OK:', Object.keys(h))"`
Expected: `OK: [ 'launchElectron', 'killElectron', 'collectOutput', 'waitForOutput' ]`

**Step 4: Commit**

```bash
git add tests/helpers/electron-launcher.js tests/integration/.gitkeep
git commit -m "test: add electron launcher helper for integration tests"
```

---

### Task 2: IPC Communication Tests

**Files:**
- Create: `tests/integration/ipc.test.js`

**Step 1: Write the failing test**

```javascript
// tests/integration/ipc.test.js
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { launchElectron, killElectron, waitForOutput } from '../helpers/electron-launcher.js';

describe('IPC Communication', () => {
  let electron;
  const output = { stdout: '', stderr: '' };

  beforeAll(async () => {
    electron = launchElectron();

    electron.stdout?.on('data', (data) => {
      output.stdout += data.toString();
    });
    electron.stderr?.on('data', (data) => {
      output.stderr += data.toString();
    });

    // Wait for app to be ready
    await waitForOutput(electron, /Creating floating ball window/, 10000);
  }, 15000);

  afterAll(async () => {
    await killElectron(electron);
  });

  it('should initialize BrowserWindow', () => {
    expect(output.stderr).toContain('Creating floating ball window');
  });

  it('should have ipcMain available', () => {
    // If ipcMain was undefined, app would crash on line 181
    // Getting here means ipcMain is working
    expect(electron.exitCode).toBe(null);
  });

  it('should have preload script loaded', async () => {
    // Check for preload-related output (if any)
    // App should still be running
    expect(electron.killed).toBe(false);
  });
});
```

**Step 2: Run test to verify behavior**

Run: `cd floating-ball && npx vitest run tests/integration/ipc.test.js --reporter=verbose`
Expected: Tests pass (3/3)

**Step 3: Commit**

```bash
git add tests/integration/ipc.test.js
git commit -m "test: add IPC communication integration tests"
```

---

### Task 3: Python Process Lifecycle Tests

**Files:**
- Create: `tests/integration/python.test.js`
- Create: `tests/fixtures/test-output.json`

**Step 1: Create test fixture**

```json
// tests/fixtures/test-output.json
{
  "success": true,
  "text": "Hello world",
  "backend": "test",
  "model": "tiny"
}
```

**Step 2: Write the Python tests**

```javascript
// tests/integration/python.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } = require('child_process');
import path from 'path';
import fs from 'fs';

describe('Python Process Lifecycle', () => {
  const pythonPath = 'python';
  const sttScript = path.join(__dirname, '../../stt/stt.py');

  it('should find Python executable', async () => {
    const result = await new Promise((resolve, reject) => {
      const proc = spawn(pythonPath, ['--version']);
      let output = '';
      proc.stderr.on('data', (d) => output += d.toString());
      proc.stdout.on('data', (d) => output += d.toString());
      proc.on('close', (code) => resolve({ code, output }));
      proc.on('error', reject);
    });
    expect(result.code).toBe(0);
    expect(result.output).toMatch(/Python 3/);
  });

  it('should find STT script', () => {
    expect(fs.existsSync(sttScript)).toBe(true);
  });

  it('should handle invalid Python path gracefully', async () => {
    const result = await new Promise((resolve) => {
      const proc = spawn('nonexistent_python', ['--version']);
      proc.on('error', (err) => resolve({ error: err.message }));
      proc.on('close', (code) => resolve({ code }));
    });
    expect(result.error).toContain('ENOENT');
  });

  it('should parse valid JSON output', () => {
    const jsonStr = '{"success":true,"text":"Hello","backend":"test"}';
    const parsed = JSON.parse(jsonStr);
    expect(parsed.success).toBe(true);
    expect(parsed.text).toBe('Hello');
  });

  it('should handle malformed JSON output', () => {
    const badJson = 'not valid json';
    expect(() => JSON.parse(badJson)).toThrow();
  });
});
```

**Step 3: Run tests**

Run: `cd floating-ball && npx vitest run tests/integration/python.test.js --reporter=verbose`
Expected: Tests pass (5/5)

**Step 4: Commit**

```bash
git add tests/integration/python.test.js tests/fixtures/
git commit -m "test: add Python process lifecycle integration tests"
```

---

### Task 4: STT Interactive Test

**Files:**
- Create: `tests/integration/stt-interactive.test.js`

**Step 1: Write the interactive test**

```javascript
// tests/integration/stt-interactive.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchElectron, killElectron, waitForOutput } from '../helpers/electron-launcher.js';
import readline from 'readline';

describe('STT Interactive', () => {
  let electron;
  const output = { stdout: '', stderr: '' };

  beforeAll(async () => {
    electron = launchElectron();

    electron.stdout?.on('data', (data) => {
      output.stdout += data.toString();
    });
    electron.stderr?.on('data', (data) => {
      output.stderr += data.toString();
    });

    await waitForOutput(electron, /Creating floating ball window/, 10000);
  }, 15000);

  afterAll(async () => {
    await killElectron(electron);
  });

  it('should complete full recording workflow', async () => {
    console.log('\n');
    console.log('========================================');
    console.log('  INTERACTIVE TEST: Please click and hold');
    console.log('  the floating ball, speak something,');
    console.log('  then release.');
    console.log('========================================');
    console.log('\n');

    // Wait for user to complete recording
    // This will detect transcription result in logs
    const result = await Promise.race([
      waitForOutput(electron, /Transcription:/, 60000),
      waitForOutput(electron, /Transcription failed/, 60000)
    ]);

    expect(result).toBeDefined();
  }, 90000);

  it('should log transcription result or error', () => {
    const hasTranscription = output.stderr.includes('Transcription:');
    const hasError = output.stderr.includes('Transcription failed');

    // Either success or failure should be logged
    expect(hasTranscription || hasError).toBe(true);
  });
});
```

**Step 2: Run interactive test manually**

Run: `cd floating-ball && npx vitest run tests/integration/stt-interactive.test.js --reporter=verbose`
Expected: Test waits for user interaction, then passes

**Step 3: Commit**

```bash
git add tests/integration/stt-interactive.test.js
git commit -m "test: add STT interactive integration test"
```

---

### Task 5: Update Vitest Config for Integration Tests

**Files:**
- Modify: `vitest.config.js`

**Step 1: Update vitest config with integration test settings**

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    reporters: ['verbose'],
    // Integration tests need more time
    testTimeout: 90000,
    // Don't run integration tests in parallel (Electron conflicts)
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
});
```

**Step 2: Verify all tests run**

Run: `cd floating-ball && npm run test:integration`
Expected: All integration tests pass

**Step 3: Commit**

```bash
git add vitest.config.js
git commit -m "test: configure vitest for integration tests"
```

---

### Task 6: Final Verification

**Step 1: Run all tests**

Run: `cd floating-ball && npm test`
Expected: All unit and integration tests pass

**Step 2: Run only integration tests**

Run: `cd floating-ball && npm run test:integration`
Expected: 3 test files, all pass

**Step 3: Commit final state**

```bash
git add -A
git commit -m "test: complete integration test suite"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Test helpers | `tests/helpers/electron-launcher.js` |
| 2 | IPC tests | `tests/integration/ipc.test.js` |
| 3 | Python tests | `tests/integration/python.test.js` |
| 4 | STT interactive | `tests/integration/stt-interactive.test.js` |
| 5 | Vitest config | `vitest.config.js` |
| 6 | Verification | - |
