# Design: Keyboard Hotkey for Recording (Right Ctrl)

**Date:** 2026-03-18
**Branch:** feature/keyboard-hotkey-recording
**Status:** Approved

## Summary

Add global hotkey support so users can press and hold the **Right Ctrl** key to start/stop recording, as an alternative to pressing the floating ball.

## Requirements

1. **Fixed hotkey**: Right Ctrl (not configurable for now)
2. **Visual feedback**: Floating ball shows recording state when triggered via keyboard
3. **Conflict handling**: If already recording (via ball or keyboard), ignore second trigger
4. **Only when app running**: Hotkey only works when floating ball app is active

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         main.js                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐         ┌──────────────────┐               │
│  │ Floating Ball   │         │ Global Hotkey    │               │
│  │ (renderer.js)   │         │ (globalShortcut) │               │
│  │                 │         │                  │               │
│  │ mousedown ──────┼────────►│ startRecording() │               │
│  │ mouseup ────────┼────────►│ stopRecording()  │               │
│  └─────────────────┘         │                  │               │
│                              │ RightCtrl ───────┼──► onHotkey() │
│                              │                  │    └─► poller │
│                              └──────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────┐
                        │   Shared State Machine   │
                        │   (idle/recording/etc.)  │
                        └──────────────────────────┘
```

## Approach

Use **Electron globalShortcut + PowerShell key state polling**:

1. Register `RightControl` as a global accelerator via `globalShortcut.register()`
2. When triggered, call existing `startRecording()` and begin polling
3. Poll key release state every 50ms using PowerShell + Windows API
4. When key released, call existing `stopRecording()`
5. Unregister all shortcuts on app quit

### Why This Approach

| Aspect | Benefit |
|--------|---------|
| No dependencies | Pure Electron, no native modules |
| Cross-platform potential | Works on macOS/Linux with minor changes |
| Simple maintenance | No native compilation issues |
| Good latency | 50ms polling is imperceptible |

## Implementation Details

### Global Hotkey Registration

```javascript
const { globalShortcut } = require('electron');

// In app.whenReady()
function registerHotkey() {
  const registered = globalShortcut.register('RightControl', () => {
    onRightCtrlPressed();
  });

  if (!registered) {
    log('ERROR', 'hotkey', 'Failed to register RightCtrl hotkey');
  }
}

// Cleanup
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

### Key State Polling

```javascript
function isRightCtrlPressed() {
  const psScript = `
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);' -Name Win32 -Namespace N
[N.Win32]::GetAsyncKeyState(0xA3) -band 0x8000
`;
  const base64 = Buffer.from(psScript, 'utf16le').toString('base64');
  const result = execSync(`powershell -EncodedCommand ${base64}`, { timeout: 100 });
  return result.includes('True');
}

function onRightCtrlPressed() {
  if (state !== 'idle') {
    log('DEBUG', 'hotkey', 'Ignoring hotkey, state is not idle');
    return;
  }

  startRecording();

  // Start polling for key release
  const pollInterval = setInterval(() => {
    if (!isRightCtrlPressed()) {
      clearInterval(pollInterval);
      stopRecording();
    }
  }, 50);

  // Safety: stop polling if recording stops for any other reason
  const stateWatcher = setInterval(() => {
    if (state !== 'recording') {
      clearInterval(pollInterval);
      clearInterval(stateWatcher);
    }
  }, 100);
}
```

## File Changes

| File | Changes |
|------|---------|
| `floating-ball/main.js` | Add globalShortcut registration, polling logic, integrate with existing start/stopRecording() |
| `floating-ball/preload.js` | No changes needed |
| `floating-ball/renderer.js` | No changes needed |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Right Ctrl pressed while ball recording | Ignored (state !== 'idle') |
| Ball pressed while keyboard recording | Ignored (state !== 'idle') |
| Right Ctrl pressed briefly (< 500ms) | Still transcribes (minimum recording time already handled) |
| App loses focus during recording | Recording continues, polling still works |
| App quits while recording | `will-quit` cleanup stops everything cleanly |
| Right Ctrl key stuck held | Max recording duration (180s) will auto-stop |

## Future Enhancements (Out of Scope)

- Configurable hotkey via config.json
- UI indication that hotkey is registered (small indicator on ball)
- Cross-platform key polling (macOS/Linux)
