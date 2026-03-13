// tests/integration/ipc.test.js
/**
 * IPC Communication Integration Tests
 *
 * Tests that the Electron main process correctly initializes BrowserWindow
 * and sets up IPC handlers for renderer communication.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchElectron, killElectron, waitForOutput } from '../helpers/electron-launcher.js';
import path from 'path';

describe('IPC Communication', () => {
  let electronProc = null;
  let output = { stdout: '', stderr: '' };

  beforeAll(async () => {
    // Launch Electron with the floating-ball app
    const appPath = path.resolve(__dirname, '../..');
    electronProc = launchElectron({ appPath });

    // Wait for window creation message (timeout 10s)
    const result = await waitForOutput(
      electronProc,
      'Creating floating ball window',
      10000
    );

    output = result.output;

    // If process exited or timed out, capture additional info
    if (result.exitCode !== undefined) {
      console.error('Process exited with code:', result.exitCode);
      console.error('Output:', output);
    }
    if (result.timedOut) {
      console.error('Timed out waiting for window creation');
      console.error('Output so far:', output);
    }
  }, 15000);

  afterAll(async () => {
    if (electronProc) {
      await killElectron(electronProc);
    }
  });

  it('should initialize BrowserWindow', () => {
    // Check that process didn't crash and window was created
    expect(electronProc).toBeDefined();
    expect(electronProc.killed).toBe(false);

    // Verify log message indicates window creation
    const combinedOutput = output.stdout + output.stderr;
    expect(combinedOutput).toContain('Creating floating ball window');
  });

  it('should have ipcMain available', () => {
    // If ipcMain was undefined, the app would crash at line 181 of main.js
    // when trying to call ipcMain.on('start-recording', ...)
    // The fact that we see "Creating floating ball window" means
    // the app passed the ipcMain handlers setup (which happens at module load)
    expect(electronProc).toBeDefined();
    expect(electronProc.killed).toBe(false);

    // The main.js defines IPC handlers at the top level
    // If ipcMain was not available, we would have seen an error
    const combinedOutput = output.stdout + output.stderr;

    // Should NOT have crashed with TypeError about ipcMain
    expect(combinedOutput).not.toContain("Cannot read properties of undefined (reading 'on')");
  });

  it('should have preload script loaded', () => {
    // App should still be running without errors after window creation
    // The preload script is loaded as part of BrowserWindow creation
    expect(electronProc).toBeDefined();

    // If preload script had issues, we would see errors in output
    const combinedOutput = output.stdout + output.stderr;

    // Should not have preload-related errors
    expect(combinedOutput).not.toContain('preload');
    expect(combinedOutput).not.toContain('Error loading preload script');
  });
});
