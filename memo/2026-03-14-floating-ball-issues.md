# Floating Ball Issues - Discovered During Debugging

## Overview

This document records issues discovered while debugging the floating-ball STT (Speech-to-Text) functionality. These issues led to the decision to rewrite the module from scratch.

## Critical Design Issues

### 1. Interaction Model Conflict

**Problem**: Drag vs long-press on the same element doesn't work well with Electron's `-webkit-app-region: drag`

**Root Cause**:
- Electron's `-webkit-app-region: drag` intercepts mouse events at the OS level for window movement
- Long-press detection requires JavaScript mouse event handling
- These two mechanisms conflict, causing:
  - Inability to drag the window when long-press is active
  - Inability to detect long-press when drag mode is active

**Failed Attempts**:
1. Toggling `-webkit-app-region` between `drag` and `no-drag` based on state
2. Using CSS transitions to switch modes
3. Long-press with drag threshold detection

**Lesson**: Don't mix drag interactions with click/long-press on the same element. Use separate gestures (e.g., double-click for recording, single-click+drag for moving).

### 2. Python Process Lifecycle Management

**Problem**: Multiple places could kill the Python process, causing race conditions

**Root Cause**:
- `stop-recording` IPC handler was calling `killPython()`
- Python script auto-stops on 1.5s silence
- These two mechanisms could conflict:
  - If kill happens before Python outputs JSON → "Unexpected end of JSON input" error
  - If Python finishes naturally → no problem, but kill was unnecessary

**Failed Fix**: Commented out `killPython()` in stop-recording handler

**Lesson**: Have a single clear lifecycle for spawned processes:
- Option A: Python controls its own lifecycle (auto-stop on silence, always outputs JSON)
- Option B: Main process controls lifecycle (timeout, explicit kill with cleanup)

### 3. State Machine Not Well-Defined

**Problem**: States get stuck when errors occur

**Root Cause**:
- No explicit state machine definition
- State transitions scattered across multiple handlers
- No guaranteed reset to `idle` state on errors

**Lesson**: Define a clear state machine with explicit transitions and guaranteed reset paths.

### 4. Focus Handling

**Problem**: Cursor doesn't return to previous app after transcription

**Root Cause**:
- `mainWindow.blur()` was not called after Python process finished
- Without blur, the Electron window retains focus

**Fix**: Added `mainWindow.blur()` in the `pythonProcess.on('close')` handler

**Lesson**: Always restore focus to the previous application after completing text insertion.

### 5. Timeout Handling

**Problem**: No proper timeout for long-running processes

**Root Cause**:
- If Python hangs (e.g., waiting for audio device), the app gets stuck in `recording` state
- No timeout to prevent indefinite hangs

**Lesson**: Add configurable timeout (e.g., 60s) for the entire recording+transcription process.

## Implementation Issues

### CSS Drag/No-Drag Toggle

The CSS `-webkit-app-region` property must be set before user interaction starts, not dynamically toggled. The browser/Electron doesn't reliably update the drag region when CSS changes dynamically.

### Long-Press Detection with Drag Threshold

```javascript
// This approach has issues:
ball.addEventListener('mousedown', () => {
  longPressTimer = setTimeout(() => {
    // Start recording
  }, 300);
});

ball.addEventListener('mousemove', (e) => {
  // Cancel long-press if moved > 5px
});
```

Problems:
- Mouse events don't fire reliably during `-webkit-app-region: drag`
- The drag region is captured by Electron before JavaScript can process it

### JSON Parsing Errors

```javascript
pythonProcess.on('close', () => {
  const result = JSON.parse(output);  // Fails if Python was killed
});
```

Problems:
- If Python process is killed, `output` may be incomplete
- Need try-catch and fallback handling

## Recommended Design

See [rewrite-design.md](../floating-ball/docs/rewrite-design.md) for the clean design using:
- Double-click to record (deliberate action)
- Drag to move (immediate, native)
- Clear state machine
- Single spawn/kill pattern
- Proper timeout

## Key Takeaways

1. **Separate gestures for separate actions**: Don't mix drag with click/press on same element
2. **Single source of truth for process lifecycle**: Either Python controls it or main.js controls it, not both
3. **Define state machine explicitly**: All states, transitions, and error paths
4. **Always restore focus**: After text insertion, return focus to previous application
5. **Add timeouts**: Prevent indefinite hangs in all async operations
