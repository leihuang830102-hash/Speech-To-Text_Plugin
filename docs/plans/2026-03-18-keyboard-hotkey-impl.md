# Keyboard Hotkey Recording Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add global Right Ctrl hotkey support to start/stop voice recording as an alternative to clicking the floating ball.

**Architecture:** Use Electron's built-in `globalShortcut` API to register Right Ctrl as a global hotkey. When triggered, call existing `startRecording()` and poll for key release using PowerShell + Windows API. On release, call `stopRecording()`. Both mouse and keyboard triggers share the same state machine.

**Tech Stack:** Electron globalShortcut, PowerShell for key state polling, Windows API (GetAsyncKeyState)

---

## Task 1: Add Key State Polling Helper

**Files:**
- Modify: `floating-ball/main.js`

**Step 1: Add isRightCtrlPressed() function**

Add this function after the `log()` function (around line 226):

```javascript
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
```

**Step 2: Verify the file compiles**

Run: `cd floating-ball && node -c main.js`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add floating-ball/main.js
git commit -m "feat(hotkey): add isRightCtrlPressed() helper function"
```

---

## Task 2: Add Global Hotkey Registration

**Files:**
- Modify: `floating-ball/main.js`

**Step 1: Add hotkey registration function**

Add after the `isRightCtrlPressed()` function:

```javascript
/**
 * Register Right Ctrl as global hotkey
 */
function registerGlobalHotkey() {
  const { globalShortcut } = require('electron');

  // Unregister first in case of re-registration
  if (globalShortcut.isRegistered('RightControl')) {
    globalShortcut.unregister('RightControl');
  }

  const registered = globalShortcut.register('RightControl', () => {
    onRightCtrlPressed();
  });

  if (registered) {
    log('INFO', 'hotkey', 'RightCtrl hotkey registered successfully');
  } else {
    log('ERROR', 'hotkey', 'Failed to register RightCtrl hotkey - may be in use by another app');
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
```

**Step 2: Verify the file compiles**

Run: `cd floating-ball && node -c main.js`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add floating-ball/main.js
git commit -m "feat(hotkey): add global hotkey registration functions"
```

---

## Task 3: Add Hotkey Press Handler with Polling

**Files:**
- Modify: `floating-ball/main.js`

**Step 1: Add hotkey press handler**

Add after `unregisterGlobalHotkey()`:

```javascript
// Polling interval reference for cleanup
let hotkeyPollInterval = null;

/**
 * Handle Right Ctrl key press
 * Starts recording and polls for key release
 */
function onRightCtrlPressed() {
  log('INFO', 'hotkey', 'RightCtrl pressed');

  // Check if we can start recording
  if (state !== 'idle') {
    log('DEBUG', 'hotkey', `Ignoring hotkey, state is ${state} (not idle)`);
    return;
  }

  // Start recording using existing function
  startRecording();

  // Clear any existing poll interval
  if (hotkeyPollInterval) {
    clearInterval(hotkeyPollInterval);
    hotkeyPollInterval = null;
  }

  // Poll for key release every 50ms
  hotkeyPollInterval = setInterval(() => {
    if (!isRightCtrlPressed()) {
      log('INFO', 'hotkey', 'RightCtrl released');
      clearInterval(hotkeyPollInterval);
      hotkeyPollInterval = null;

      // Only stop if we're still recording (not already stopped by other means)
      if (state === 'recording') {
        stopRecording();
      }
    }
  }, 50);
}
```

**Step 2: Verify the file compiles**

Run: `cd floating-ball && node -c main.js`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add floating-ball/main.js
git commit -m "feat(hotkey): add hotkey press handler with key release polling"
```

---

## Task 4: Integrate Hotkey with App Lifecycle

**Files:**
- Modify: `floating-ball/main.js`

**Step 1: Register hotkey on app ready**

Find the `app.whenReady().then()` block (around line 1152). Add hotkey registration after `connectWebSocket()`:

```javascript
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
```

**Step 2: Unregister hotkey on app quit**

Find the `app.on('will-quit')` handler or add it if it doesn't exist. Add after `app.on('before-quit')` (around line 1183):

```javascript
app.on('will-quit', () => {
  // Unregister all global hotkeys
  unregisterGlobalHotkey();
});
```

**Step 3: Update cleanup on window-all-closed**

Find the `app.on('window-all-closed')` handler (around line 1165). Add hotkey cleanup:

```javascript
app.on('window-all-closed', () => {
  cleanupPythonProcess();
  cleanupServer();
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }
  // Clear hotkey polling interval
  if (hotkeyPollInterval) {
    clearInterval(hotkeyPollInterval);
    hotkeyPollInterval = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

**Step 4: Verify the file compiles**

Run: `cd floating-ball && node -c main.js`
Expected: No syntax errors

**Step 5: Commit**

```bash
git add floating-ball/main.js
git commit -m "feat(hotkey): integrate hotkey registration with app lifecycle"
```

---

## Task 5: Manual Integration Testing

**Files:**
- None (manual testing)

**Step 1: Start the floating ball app**

Run: `cd floating-ball && npm start`
Expected: Floating ball appears, STT server starts

**Step 2: Test keyboard recording**

1. Open Notepad or any text editor
2. Press and hold **Right Ctrl** key
3. The ball should turn red (recording state)
4. Speak some text
5. Release **Right Ctrl** key
6. Ball should show processing state, then insert transcribed text

**Step 3: Test conflict handling**

1. Press and hold the floating ball (mouse down)
2. While holding, press Right Ctrl
3. Right Ctrl should be ignored (ball already recording)
4. Release mouse to stop recording

**Step 4: Test ball still works**

1. Click and hold the floating ball (not keyboard)
2. Verify recording starts and stops normally

**Step 5: Test app quit cleanup**

1. Close the floating ball app
2. Verify no lingering processes in Task Manager

---

## Summary

After completing all tasks:

1. ✅ `isRightCtrlPressed()` helper checks key state via PowerShell
2. ✅ `registerGlobalHotkey()` registers Right Ctrl as global hotkey
3. ✅ `onRightCtrlPressed()` starts recording and polls for release
4. ✅ Hotkey registered on app start, unregistered on quit
5. ✅ Conflict handling: only one recording source at a time
6. ✅ Visual feedback: ball shows recording state via existing state machine

**Files Changed:**
- `floating-ball/main.js` - All changes in one file

**No new dependencies required.**
