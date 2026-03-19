# Spec-Code Traceability Matrix - OpenCodeTTS

> **Version**: 1.0
> **Created**: 2026-03-19
> **Branch**: feature/keyboard-hotkey-recording

---

## 1. Functional Requirements to Code Mapping

### 1.1 Core Features (P0)

| ID | Requirement | Implementation Location | Code Reference |
|----|-------------|------------------------|----------------|
| FR-001 | Voice-to-Text (Press-Hold) | `floating-ball/main.js` | `spawnRecordingOnly()` lines 769-958, `startRecording()` lines 1221-1239, `renderer.js` mousedown handler lines 29-43 |
| FR-002 | Text Insertion | `floating-ball/main.js` | `insertText()` lines 1069-1190, `insertTextImmediately()` lines 1047-1067 |
| FR-003 | Floating Ball Drag | `floating-ball/renderer.js` | Drag handled by `-webkit-app-region: drag` CSS (index.html/styles.css) |
| FR-004 | Position Memory | `floating-ball/main.js` | `getPositionPath()` line 31-33, createWindow position restore lines 640-651, `moved` event handler lines 653-665 |

### 1.2 Input Methods (P1)

| ID | Requirement | Implementation Location | Code Reference |
|----|-------------|------------------------|----------------|
| FR-005 | Global Hotkey (Toggle) | `floating-ball/main.js` | `registerGlobalHotkey()` lines 282-310, `onHotkeyPressed()` lines 329-351 |
| FR-006 | Hotkey Debounce | `floating-ball/main.js` | `HOTKEY_DEBOUNCE_MS = 300` line 323, debounce check in `onHotkeyPressed()` lines 330-337 |
| FR-007 | Hotkey Config | `floating-ball/main.js` | Config loading in `loadConfig()` lines 39-71, hotkey config structure line 52-55 |

### 1.3 STT Backends (P1)

| ID | Requirement | Implementation Location | Code Reference |
|----|-------------|------------------------|----------------|
| FR-008 | Doubao Cloud | `src/scripts/stt/backends/doubao.py`, `src/scripts/stt/backends/doubao_asr/` | `DoubaoBackend` class, WebSocket streaming ASR client |
| FR-009 | Local Whisper | `src/scripts/stt/backends/whisper.py`, `src/scripts/stt/backends/faster_whisper.py` | `WhisperBackend`, `FasterWhisperBackend` classes |
| FR-010 | Backend Switch | `floating-ball/main.js` | `switchBackend()` lines 145-202, `server.py` `switch_backend` action lines 108-114 |
| FR-011 | Backend Persistence | `floating-ball/main.js` | `saveConfig()` lines 88-102, config update in `switchBackend()` line 174-175 |

### 1.4 Streaming Output (P2)

| ID | Requirement | Implementation Location | Code Reference |
|----|-------------|------------------------|----------------|
| FR-012 | Intermediate Result | `floating-ball/record.py` | `intermediate_silence` event lines 109-125, `main.js` handler lines 825-855 |
| FR-013 | Final Result | `floating-ball/record.py` | `final_silence` event lines 94-106, `max_duration` event lines 131-140 |
| FR-014 | Real-time Feedback | `floating-ball/renderer.js` | `showIntermediateResult()` lines 138-150, `onIntermediateResult` IPC handler lines 114-118 |

### 1.5 UI/UX (P1)

| ID | Requirement | Implementation Location | Code Reference |
|----|-------------|------------------------|----------------|
| FR-015 | State Visualization | `floating-ball/renderer.js` | `setState()` lines 14-22, CSS class application |
| FR-016 | No Focus Theft | `floating-ball/main.js` | `focusable: false` in BrowserWindow options line 630 |
| FR-017 | Context Menu | `floating-ball/main.js` | `buildContextMenu()` lines 108-143, IPC handler lines 214-225 |

### 1.6 Platform (P0)

| ID | Requirement | Implementation Location | Code Reference |
|----|-------------|------------------------|----------------|
| FR-018 | Windows 10/11 | `floating-ball/main.js` | Windows-specific code (PowerShell SendKeys, focus management) |
| FR-019 | Node.js 18+ | `floating-ball/package.json` | engines field (implicit) |
| FR-020 | Python 3.8+ | `src/scripts/stt/` | Python syntax compatible with 3.8+ |

---

## 2. Architecture Components to Code Mapping

### 2.1 Electron App (floating-ball/)

| Component | File | Key Functions/Classes |
|-----------|------|----------------------|
| Main Process | `main.js` | `createWindow()`, `startRecording()`, `stopRecording()`, `insertText()` |
| Preload Script | `preload.js` | IPC bridge: `startRecording`, `stopRecording`, `showContextMenu`, `onStateChanged` |
| Renderer Process | `renderer.js` | `setState()`, event handlers for mousedown/mouseup/contextmenu |
| UI | `index.html`, `styles.css` | Ball element, state-based CSS classes |
| Recording Script | `record.py` | Audio capture with VAD, streaming events |
| Config | `config.json` | Runtime configuration |

### 2.2 Python STT Server (src/scripts/stt/)

| Component | File | Key Functions/Classes |
|-----------|------|----------------------|
| WebSocket Server | `server.py` | `STTServer`, `handle_websocket()`, API endpoints |
| Backend Manager | `backends/manager.py` | `BackendManager`, `switch_backend()`, `transcribe()` |
| Base Backend | `backends/base.py` | `BaseBackend` abstract class |
| Doubao Cloud | `backends/doubao.py` | `DoubaoBackend` |
| Doubao ASR Client | `backends/doubao_asr/` | WebSocket streaming ASR protocol |
| Whisper Local | `backends/whisper.py` | `WhisperBackend` |
| Faster Whisper | `backends/faster_whisper.py` | `FasterWhisperBackend` |
| Utils | `utils.py` | `to_simplified_chinese()` |
| Config | `config.py` | `load_config()`, `DEFAULT_CONFIG` |
| Logger | `logger.py` | `setup_logger()`, `get_logger()` |

### 2.3 Configuration Files

| Config | Location | Purpose |
|--------|----------|---------|
| Client Config | `floating-ball/config.json` | Hotkey, STT settings, window options |
| Server Config | `config/stt-config.json` | Backend configuration, server port |
| Position | `floating-ball/position.json` | Saved window position |
| Environment | `.env` | API credentials (not in git) |

---

## 3. Data Flow to Code Mapping

### 3.1 Recording Flow

```
User Action                Code Location                          Function
--------------------------------------------------------------------------------
mousedown/Hotkey    -->    renderer.js:29-43 / main.js:329-351   -->  event handlers
Start Recording     -->    main.js:1221-1239                    -->  startRecording()
Spawn Python        -->    main.js:769-958                      -->  spawnRecordingOnly()
Audio Capture       -->    record.py:76-106                     -->  sd.InputStream loop
Intermediate Event  -->    record.py:109-125                    -->  intermediate_silence
Final Event         -->    record.py:94-106                     -->  final_silence
```

### 3.2 Transcription Flow

```
Event                    Code Location                          Function
--------------------------------------------------------------------------------
Audio Data Ready  -->    main.js:838-853                      -->  streamingAudioBuffer
Send to Server    -->    main.js:534-589                      -->  sendAudioToServer()
Backend Process   -->    server.py:70-81                      -->  transcribe()
Text Conversion   -->    backends/manager.py:86-92            -->  to_simplified_chinese()
Result Return     -->    server.py:72-78                      -->  send_json result
Text Insertion    -->    main.js:1047-1067                    -->  insertTextImmediately()
```

### 3.3 Backend Switch Flow

```
User Action                Code Location                          Function
--------------------------------------------------------------------------------
Context Menu Click  -->    main.js:128-131                     -->  switchBackend()
WebSocket Command   -->    main.js:164-187                     -->  wsClient.send()
Server Process      -->    server.py:108-114                   -->  switch_backend action
Backend Manager     -->    manager.py:58-71                    -->  switch_backend()
Config Update       -->    main.js:174-175                     -->  saveConfig()
```

---

## 4. State Machine Implementation

| State | Entry Condition | Exit Condition | Code Location |
|-------|-----------------|----------------|---------------|
| idle | App start, reset | startRecording() | renderer.js:131, main.js:596 |
| warming | Legacy mode start | Python ready | main.js:1237 |
| recording | Python ready / WebSocket mode | stopRecording() | main.js:1232, renderer.js:38 |
| processing | stopRecording() | Transcription complete | main.js:1254, renderer.js:59 |
| success | Transcription success | Auto-reset (500ms) | main.js:1018, renderer.js auto |
| error | Transcription failure | Auto-reset (1000ms) | main.js:1026, renderer.js auto |

---

## 5. IPC Communication Channels

| Channel | Direction | Purpose | File:Line |
|---------|-----------|---------|-----------|
| `start-recording` | Renderer -> Main | Start recording | preload.js:5 |
| `stop-recording` | Renderer -> Main | Stop recording | preload.js:6 |
| `show-context-menu` | Renderer -> Main | Show context menu | preload.js:7 |
| `switch-backend` | Renderer -> Main | Switch STT backend | preload.js:8 |
| `state-changed` | Main -> Renderer | State update | preload.js:11 |
| `backend-changed` | Main -> Renderer | Backend switch notification | preload.js:14 |
| `intermediate-result` | Main -> Renderer | Streaming text | preload.js:23 |
| `clear-intermediate` | Main -> Renderer | Clear tooltip | preload.js:27 |

---

## 6. WebSocket Protocol Implementation

| Action | Direction | Handler | File:Line |
|--------|-----------|---------|-----------|
| `start_recording` | Client -> Server | server.py:59-64 | Reset buffer, set language |
| `stop_recording` | Client -> Server | server.py:66-83 | Transcribe and return |
| `partial_transcribe` | Client -> Server | server.py:85-106 | Intermediate transcription |
| `switch_backend` | Client -> Server | server.py:108-114 | Switch backend |
| Binary audio | Client -> Server | server.py:119-121 | Append to buffer |
| `result` | Server -> Client | server.py:73-78 | Transcription result |
| `error` | Server -> Client | server.py:81, 104, 114 | Error message |
| `backend_switched` | Server -> Client | server.py:112 | Switch confirmation |

---

## 7. Code Quality Notes

### 7.1 Well-Structured Areas
- State machine implementation is clean and well-separated
- Backend abstraction via `BaseBackend` allows easy extension
- IPC communication via preload.js follows Electron security best practices
- Configuration system supports deep merge for nested properties

### 7.2 Areas for Improvement
- `main.js` is 1350+ lines - could be split into modules
- Some duplicate code in text insertion methods
- Error handling could be more consistent across backends
- Missing unit tests for several components (see Spec-Test-Trace.md)

---

## 8. Cross-Reference

| Document | Purpose |
|----------|---------|
| [REQUIREMENTS_AND_ARCHITECTURE.md](REQUIREMENTS_AND_ARCHITECTURE.md) | Full requirements and architecture |
| [Spec-Test-Trace.md](Spec-Test-Trace.md) | Requirements to test case mapping |
| [Quality-Report.md](Quality-Report.md) | Quality analysis and recommendations |

---

*Document generated by Claude Quality Agent on 2026-03-19*
