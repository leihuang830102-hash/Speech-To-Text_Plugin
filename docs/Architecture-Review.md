# Architecture Review - OpenCodeTTS

> **Review Date**: 2026-03-19
> **Reviewer**: Claude Architect Agent
> **Branch**: feature/keyboard-hotkey-recording

---

## 1. Executive Summary

The OpenCodeTTS project is a Windows desktop voice input tool with a floating ball interface. The architecture follows a **dual-process model** (Electron + Python) communicating via WebSocket. Overall, the implementation is functional and well-documented, but several architectural issues require attention for production readiness.

### Key Findings

| Severity | Count | Summary |
|----------|-------|---------|
| Critical | 1 | Single point of failure in transcription lock |
| High | 3 | Error handling gaps, race conditions, missing input validation |
| Medium | 4 | Code duplication, inconsistent state management, missing logging |
| Low | 2 | Documentation gaps, minor style inconsistencies |

---

## 2. Architecture Overview

### 2.1 Component Diagram

```
+------------------+        WebSocket         +--------------------+
|  Electron App    | <---------------------> |  Python STT Server |
|  (main.js)       |   ws://127.0.0.1:8765   |  (server.py)       |
+------------------+                         +--------------------+
        |                                             |
        | IPC                                         |
        v                                             v
+------------------+                         +--------------------+
|  Renderer        |                         |  Backend Manager   |
|  (renderer.js)   |                         |  (manager.py)      |
+------------------+                         +--------------------+
        |                                             |
        | preload.js                                  |
        v                                             v
+------------------+                         +--------------------+
|  record.py       | (spawn)                 |  doubao.py         |
|  (Audio Recording)|                        |  whisper.py        |
+------------------+                         +--------------------+
```

### 2.2 Data Flow

1. **User triggers recording** (mouse/hotkey)
2. **main.js** spawns `record.py` as child process
3. **record.py** captures audio, sends events via stderr
4. **main.js** buffers audio, sends to server on silence detection
5. **server.py** routes to appropriate backend
6. **Backend** transcribes audio
7. **main.js** inserts text via clipboard + PowerShell

---

## 3. Critical Issues

### 3.1 [CRITICAL] Transcription Lock Race Condition

**Location**: `floating-ball/main.js` lines 766-767, 827-831, 860-870, 902-908

**Problem**: The `transcriptionInProgress` global lock is used to prevent duplicate transcription, but the lock acquisition and release logic has gaps:

```javascript
// Line 827-831 - Lock acquired
if (transcriptionInProgress) {
  log('DEBUG', 'main', `Skipping intermediate_silence - transcription in progress`);
  return;
}
transcriptionInProgress = true;  // Acquire global lock
```

**Issue**: Between the check and acquisition, another async handler could acquire the lock. This is a classic TOCTOU (Time-of-Check to Time-of-Use) race condition.

**Impact**: Duplicate text insertion under high concurrency.

**Recommendation**: Use atomic lock pattern:

```javascript
function tryAcquireLock() {
  if (transcriptionInProgress) return false;
  transcriptionInProgress = true;
  return true;
}

// Usage
if (!tryAcquireLock()) return;
try {
  // ... transcription logic
} finally {
  transcriptionInProgress = false;
}
```

### 3.2 [HIGH] Missing Input Validation on WebSocket Messages

**Location**: `src/scripts/stt/server.py` lines 53-117

**Problem**: WebSocket messages are parsed but not validated:

```python
data = json.loads(msg.data)
action = data.get("action")
# No validation of action value, audio data size, etc.
```

**Impact**: Malformed or malicious messages could crash the server.

**Recommendation**: Add input validation:

```python
ALLOWED_ACTIONS = ['start_recording', 'stop_recording', 'partial_transcribe', 'switch_backend', 'get_status']
MAX_AUDIO_SIZE = 10 * 1024 * 1024  # 10MB

action = data.get("action")
if action not in ALLOWED_ACTIONS:
    await ws.send_json({"event": "error", "message": f"Unknown action: {action}"})
    continue
```

### 3.3 [HIGH] Duplicate Text Insertion Functions

**Location**: `floating-ball/main.js` lines 960-986 and 1074-1095

**Problem**: Two nearly identical `insertTextImmediately` functions exist:

1. Lines 960-986 (first definition)
2. Lines 1074-1095 (second definition - overrides first)

**Impact**: Code duplication, maintenance burden, potential confusion.

**Recommendation**: Remove the first definition, keep only one.

### 3.4 [HIGH] Unbounded Audio Buffer Growth

**Location**: `floating-ball/main.js` line 765, `record.py` line 69

**Problem**: `streamingAudioBuffer` and `all_audio` arrays grow without bounds during long recordings:

```javascript
let streamingAudioBuffer = [];  // No max size limit
// ...
streamingAudioBuffer.push(data);  // Unbounded push
```

**Impact**: Memory exhaustion during long recordings (up to 180 seconds).

**Recommendation**: Implement circular buffer or max size limit:

```javascript
const MAX_BUFFER_SIZE = 50 * 1024 * 1024;  // 50MB
if (Buffer.concat(streamingAudioBuffer).length > MAX_BUFFER_SIZE) {
  log('WARN', 'main', 'Audio buffer exceeded max size, truncating');
  // Handle truncation
}
```

---

## 4. Medium Priority Issues

### 4.1 Inconsistent State Machine Implementation

**Location**: Multiple files

**Problem**: State machine is implemented in two places:
- `renderer.js` (lines 10-22): Manages visual state
- `main.js` (lines 596-606): Manages application state

States are duplicated and not always synchronized:
- `renderer.js`: `idle | recording | processing | success | error`
- `main.js`: `idle | warming | recording | processing | success | error`

**Recommendation**: Consolidate state definitions in a shared module or use IPC to maintain single source of truth.

### 4.2 Missing Error Recovery for WebSocket Disconnect

**Location**: `floating-ball/main.js` lines 511-528

**Problem**: WebSocket reconnection logic exists but doesn't handle partial operations:

```javascript
wsClient.on('close', () => {
  wsConnected = false;
  setTimeout(connectWebSocket, 3000);  // Reconnect after 3s
});
```

**Issue**: If recording is in progress when WebSocket disconnects, audio is lost.

**Recommendation**: Add graceful degradation:

```javascript
wsClient.on('close', () => {
  wsConnected = false;
  if (state === 'recording' || state === 'processing') {
    log('WARN', 'ws', 'WebSocket lost during recording, falling back to local mode');
    // Buffer audio locally for later transmission
  }
  setTimeout(connectWebSocket, 3000);
});
```

### 4.3 Hard-coded Configuration Values

**Location**: Multiple files

**Problem**: Several values are hard-coded instead of using configuration:

| Value | Location | Hard-coded | Config |
|-------|----------|------------|--------|
| Min recording time | `renderer.js:12` | `500` | Missing |
| Hotkey debounce | `main.js:323` | `300` | Missing |
| WebSocket timeout | `main.js:579` | `60000` | Partial |

**Recommendation**: Move all magic numbers to `config.json`.

### 4.4 Missing Logging Levels Consistency

**Location**: `floating-ball/main.js` lines 235-245

**Problem**: Log function accepts level parameter but writes everything to `console.error`:

```javascript
function log(level, module, message) {
  console.error(line);  // Always stderr regardless of level
}
```

**Recommendation**: Route logs appropriately:

```javascript
function log(level, module, message) {
  const line = `[${timestamp}] [${level}] [${module}] ${message}`;
  if (level === 'ERROR' || level === 'WARN') {
    console.error(line);
  } else {
    console.log(line);
  }
  // ... file logging
}
```

---

## 5. Low Priority Issues

### 5.1 Inconsistent Naming Conventions

**Problem**: Mixed naming styles across files:

| File | Convention | Example |
|------|------------|---------|
| `main.js` | camelCase | `transcriptionInProgress` |
| `server.py` | snake_case | `audio_buffer` |
| `record.py` | snake_case | `silent_chunks` |

**Recommendation**: Document naming conventions per language and enforce consistency.

### 5.2 Missing Type Hints in Python

**Location**: `src/scripts/stt/server.py`

**Problem**: Type hints are inconsistent:

```python
async def handle_websocket(self, request):  # No return type hint
async def api_status(self, request):        # No return type hint
```

**Recommendation**: Add complete type hints for better IDE support and early error detection.

---

## 6. Positive Observations

### 6.1 Strong Points

1. **Good IPC Security**: Context isolation enabled, nodeIntegration disabled
2. **Focusable: false**: Elegant solution to Windows focus management
3. **Streaming Support**: Intermediate results improve user experience
4. **Backend Abstraction**: Clean backend interface allows easy switching
5. **Comprehensive Documentation**: Well-documented architecture and design decisions

### 6.2 Well-Implemented Features

- Hotkey debouncing (300ms) prevents accidental triggers
- Graceful WebSocket reconnection
- Multiple text insertion fallback methods
- Traditional to Simplified Chinese conversion

---

## 7. Recommendations Summary

### Immediate Actions (Critical/High)

| # | Issue | Priority | Effort |
|---|-------|----------|--------|
| 1 | Fix transcription lock race condition | Critical | Medium |
| 2 | Remove duplicate insertTextImmediately | High | Low |
| 3 | Add WebSocket input validation | High | Medium |
| 4 | Implement audio buffer size limit | High | Medium |

### Future Improvements (Medium/Low)

| # | Issue | Priority | Effort |
|---|-------|----------|--------|
| 5 | Consolidate state machine | Medium | High |
| 6 | Add graceful degradation on WS disconnect | Medium | Medium |
| 7 | Move magic numbers to config | Medium | Low |
| 8 | Fix logging level routing | Medium | Low |
| 9 | Add Python type hints | Low | Low |
| 10 | Document naming conventions | Low | Low |

---

## 8. Files Reviewed

| File | Lines | Purpose |
|------|-------|---------|
| `docs/REQUIREMENTS_AND_ARCHITECTURE.md` | 500 | Requirements and design |
| `floating-ball/main.js` | 1378 | Electron main process |
| `floating-ball/renderer.js` | 159 | UI rendering |
| `floating-ball/preload.js` | 30 | IPC bridge |
| `floating-ball/record.py` | 145 | Audio recording |
| `src/scripts/stt/server.py` | 249 | WebSocket server |
| `src/scripts/stt/backends/manager.py` | 100 | Backend management |

---

## 9. Appendix: Code Quality Metrics

### Complexity Analysis

| File | Cyclomatic Complexity | Maintainability |
|------|----------------------|-----------------|
| `main.js` | High (multiple nested async handlers) | Medium |
| `record.py` | Low (linear flow) | High |
| `server.py` | Medium (message dispatch) | High |

### Test Coverage (Based on Review)

| Component | Unit Tests | Integration Tests | Manual Tests |
|-----------|------------|-------------------|--------------|
| Main process | Minimal | None | Required |
| WebSocket server | None | None | Required |
| Recording | None | None | Required |
| Text insertion | None | None | Required |

---

*Report generated by Claude Architect Agent on 2026-03-19*
