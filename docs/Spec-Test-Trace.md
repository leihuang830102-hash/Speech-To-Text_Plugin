# Spec-Test Traceability Matrix - OpenCodeTTS

> **Version**: 1.0
> **Created**: 2026-03-19
> **Branch**: feature/keyboard-hotkey-recording

---

## 1. Functional Requirements

### 1.1 Core Features (P0)

| ID | Requirement | Description | Priority |
|----|-------------|-------------|----------|
| FR-001 | Voice-to-Text | Press and hold floating ball to record, release to transcribe | P0 |
| FR-002 | Text Insertion | Transcription result automatically inserted at cursor position | P0 |
| FR-003 | Floating Ball Drag | Ball can be dragged to any position on screen | P0 |
| FR-004 | Position Memory | Ball position is remembered after restart | P1 |

### 1.2 Input Methods (P1)

| ID | Requirement | Description | Priority |
|----|-------------|-------------|----------|
| FR-005 | Global Hotkey | Press hotkey to start/stop recording (toggle mode) | P1 |
| FR-006 | Hotkey Debounce | 300ms debounce to prevent rapid triggers | P1 |
| FR-007 | Hotkey Config | Hotkey is configurable via config.json | P1 |

### 1.3 STT Backends (P1)

| ID | Requirement | Description | Priority |
|----|-------------|-------------|----------|
| FR-008 | Doubao Cloud | Support Doubao cloud ASR (~1s response) | P1 |
| FR-009 | Local Whisper | Support local Whisper (~10s on CPU) | P1 |
| FR-010 | Backend Switch | Runtime backend switching via context menu | P1 |
| FR-011 | Backend Persistence | Backend choice persisted to config | P1 |

### 1.4 Streaming Output (P2)

| ID | Requirement | Description | Priority |
|----|-------------|-------------|----------|
| FR-012 | Intermediate Result | Display intermediate transcription after 1s silence | P2 |
| FR-013 | Final Result | Final transcription after 5s silence or user stop | P2 |
| FR-014 | Real-time Feedback | Intermediate result shown in tooltip | P2 |

### 1.5 UI/UX (P1)

| ID | Requirement | Description | Priority |
|----|-------------|-------------|----------|
| FR-015 | State Visualization | Visual feedback for all states (idle/recording/processing/success/error) | P1 |
| FR-016 | No Focus Theft | Floating ball never takes keyboard focus | P1 |
| FR-017 | Context Menu | Right-click menu for backend switch and exit | P1 |

### 1.6 Platform (P0)

| ID | Requirement | Description | Priority |
|----|-------------|-------------|----------|
| FR-018 | Windows 10/11 | Target platform is Windows 10/11 | P0 |
| FR-019 | Node.js 18+ | Requires Node.js version 18 or higher | P0 |
| FR-020 | Python 3.8+ | Requires Python version 3.8 or higher | P0 |

---

## 2. Test Cases

### 2.1 TC-001: Basic Voice Recording (Manual)

**Requirement**: FR-001
**Priority**: P0
**Type**: Manual
**Automation**: Not automatable (requires audio input)

**Steps**:
1. Start the floating ball application
2. Left-click and hold on the ball
3. Speak a test phrase ("Hello world")
4. Release the mouse button
5. Wait for transcription

**Expected Result**:
- State transitions: idle -> recording -> processing -> success -> idle
- Transcribed text appears at cursor position
- Text matches spoken phrase (with reasonable accuracy)

**Test Data**: None (live audio)

---

### 2.2 TC-002: Text Insertion at Cursor (Manual)

**Requirement**: FR-002
**Priority**: P0
**Type**: Manual
**Automation**: Not automatable (requires GUI interaction)

**Steps**:
1. Open Notepad or any text editor
2. Position cursor in editor
3. Record and transcribe audio via floating ball
4. Verify text appears in editor at cursor position

**Expected Result**:
- Text is inserted at the current cursor position
- Original clipboard content is replaced
- No window switching or focus change

**Test Data**: None (live audio)

---

### 2.3 TC-003: Floating Ball Drag (Automated)

**Requirement**: FR-003
**Priority**: P0
**Type**: Unit/Integration
**Automation**: Fully automatable

**Steps**:
1. Launch application
2. Simulate mouse drag from position (100, 100) to (500, 500)
3. Read ball position from window API
4. Verify position matches target

**Expected Result**:
- Ball moves to new position
- No restrictions on movement

**Test Script**: `tests/integration/drag.test.js` (to be created)

---

### 2.4 TC-004: Position Memory (Automated)

**Requirement**: FR-004
**Priority**: P1
**Type**: Integration
**Automation**: Fully automatable

**Steps**:
1. Launch application
2. Move ball to position (300, 400)
3. Close application
4. Relaunch application
5. Read ball position

**Expected Result**:
- Ball position matches saved position
- Position file exists at `floating-ball/position.json`

**Test Script**: `tests/integration/position-memory.test.js` (to be created)

---

### 2.5 TC-005: Global Hotkey Toggle (Manual)

**Requirement**: FR-005, FR-006
**Priority**: P1
**Type**: Manual
**Automation**: Partially automatable

**Steps**:
1. Start application
2. Press Ctrl+Alt+Space (default hotkey)
3. Verify recording starts (ball changes state)
4. Speak a phrase
5. Press Ctrl+Alt+Space again
6. Verify recording stops and transcription begins

**Expected Result**:
- Hotkey toggles recording on/off
- Rapid presses (< 300ms apart) are debounced

**Test Data**: None (live audio)

---

### 2.6 TC-006: Backend Switch (Automated)

**Requirement**: FR-008, FR-009, FR-010
**Priority**: P1
**Type**: Integration
**Automation**: Fully automatable

**Steps**:
1. Start application and STT server
2. Record current backend
3. Send switch_backend command via WebSocket
4. Verify backend changed
5. Send another switch command
6. Verify backend changed again

**Expected Result**:
- Backend switches successfully
- Server responds with `backend_switched` event
- Available backends include `doubao-cloud` and `whisper`

**Test Script**: `tests/integration/backend-switch.test.js` (to be created)

---

### 2.7 TC-007: Backend Transcription Quality (Automated)

**Requirement**: FR-008, FR-009
**Priority**: P1
**Type**: Integration
**Automation**: Fully automatable

**Steps**:
1. Start STT server
2. Load test audio file from `tests/stt/fixtures/`
3. Send audio to server for transcription
4. Compare result with expected text
5. Calculate similarity score

**Expected Result**:
- Similarity score >= 80%
- Transcription completes within time limit

**Test Data**: `tests/stt/fixtures/zh_short.wav`, `tests/stt/fixtures/en_short.wav`
**Test Script**: `tests/stt/stt-runner.js` (existing)

---

### 2.8 TC-008: Streaming Intermediate Result (Manual)

**Requirement**: FR-012, FR-013, FR-014
**Priority**: P2
**Type**: Manual
**Automation**: Not automatable (requires real-time audio)

**Steps**:
1. Start application
2. Start recording
3. Speak a phrase, then stay silent for 1+ seconds
4. Observe tooltip showing intermediate result
5. Speak another phrase
6. Stop recording
7. Verify final text insertion

**Expected Result**:
- Intermediate result appears after 1s silence
- Intermediate text is inserted immediately
- Final result completes the transcription

**Test Data**: None (live audio)

---

### 2.9 TC-009: State Visualization (Automated)

**Requirement**: FR-015
**Priority**: P1
**Type**: Unit
**Automation**: Fully automatable

**Steps**:
1. Load renderer in test environment
2. Call `setState('recording')`
3. Verify CSS class is applied
4. Call `setState('processing')`
5. Verify CSS class changes

**Expected Result**:
- CSS class matches state name
- Transition is logged

**Test Script**: `tests/unit/state-machine.test.ts` (existing)

---

### 2.10 TC-010: No Focus Theft (Manual)

**Requirement**: FR-016
**Priority**: P1
**Type**: Manual
**Automation**: Not automatable

**Steps**:
1. Open Notepad, type some text
2. Click on floating ball, hold and speak
3. Release ball
4. Verify cursor remains in Notepad
5. Verify text is inserted in Notepad

**Expected Result**:
- Focus never leaves Notepad
- No Alt+Tab flash
- Text inserted correctly

**Test Data**: None

---

### 2.11 TC-011: Context Menu (Manual)

**Requirement**: FR-017
**Priority**: P1
**Type**: Manual
**Automation**: Partially automatable

**Steps**:
1. Right-click on floating ball
2. Verify menu appears
3. Verify current backend is shown
4. Click "Switch backend"
5. Verify backend changes

**Expected Result**:
- Menu shows current backend with checkmark
- Switch option works
- Exit option works

**Test Data**: None

---

### 2.12 TC-012: Audio Recording Duration (Automated)

**Requirement**: FR-001 (max duration)
**Priority**: P1
**Type**: Integration
**Automation**: Fully automatable

**Steps**:
1. Start recording with `record.py`
2. Record for maximum duration (180s)
3. Verify process exits gracefully
4. Verify audio data is complete

**Expected Result**:
- Recording stops at max duration
- No crash or hang
- Audio file is valid WAV

**Test Script**: `tests/integration/recording-duration.test.js` (to be created)

---

### 2.13 TC-013: Silence Detection (Automated)

**Requirement**: FR-012, FR-013
**Priority**: P1
**Type**: Unit
**Automation**: Fully automatable

**Steps**:
1. Generate test audio with 1s silence
2. Feed to `record.py`
3. Verify intermediate_silence event fires
4. Generate test audio with 5s silence
5. Verify final_silence event fires

**Expected Result**:
- Events fire at correct silence thresholds
- Audio data is segmented correctly

**Test Script**: `tests/unit/silence-detection.test.js` (to be created)

---

### 2.14 TC-014: Traditional to Simplified Chinese (Automated)

**Requirement**: FR-009 (implicit)
**Priority**: P1
**Type**: Unit
**Automation**: Fully automatable

**Steps**:
1. Call `to_simplified_chinese()` with Traditional text
2. Verify output is Simplified

**Expected Result**:
- "我們測試" -> "我们测试"
- "哈囉" -> "哈啰"

**Test Data**: `zhconv` library
**Test Script**: `tests/unit/chinese-conversion.test.js` (to be created)

---

### 2.15 TC-015: WebSocket Reconnection (Automated)

**Requirement**: Implicit reliability
**Priority**: P1
**Type**: Integration
**Automation**: Fully automatable

**Steps**:
1. Start application with server
2. Kill server process
3. Verify WebSocket disconnects
4. Restart server
5. Verify WebSocket reconnects within 5s

**Expected Result**:
- Reconnection happens automatically
- No user intervention required

**Test Script**: `tests/integration/websocket-reconnect.test.js` (to be created)

---

## 3. Traceability Matrix

| Requirement | Test Case | Automation | Status |
|-------------|-----------|------------|--------|
| FR-001 | TC-001, TC-012 | Manual + Automated | Partial |
| FR-002 | TC-002 | Manual | No |
| FR-003 | TC-003 | Automated | To Create |
| FR-004 | TC-004 | Automated | To Create |
| FR-005 | TC-005 | Manual | No |
| FR-006 | TC-005 | Manual | No |
| FR-007 | (Config test) | Automated | To Create |
| FR-008 | TC-006, TC-007 | Automated | Partial |
| FR-009 | TC-006, TC-007, TC-014 | Automated | Partial |
| FR-010 | TC-006 | Automated | To Create |
| FR-011 | (Config test) | Automated | To Create |
| FR-012 | TC-008, TC-013 | Manual + Automated | Partial |
| FR-013 | TC-008, TC-013 | Manual + Automated | Partial |
| FR-014 | TC-008 | Manual | No |
| FR-015 | TC-009 | Automated | Existing |
| FR-016 | TC-010 | Manual | No |
| FR-017 | TC-011 | Manual | No |
| FR-018 | (Platform) | Manual | N/A |
| FR-019 | (Dependency) | Automated | Existing |
| FR-020 | (Dependency) | Automated | Existing |

---

## 4. Test Automation Coverage

### 4.1 Automatable Tests

| Category | Total | Automated | Coverage |
|----------|-------|-----------|----------|
| Core Features | 4 | 2 | 50% |
| Input Methods | 3 | 1 | 33% |
| STT Backends | 4 | 3 | 75% |
| Streaming | 3 | 1 | 33% |
| UI/UX | 3 | 1 | 33% |
| **Total** | **17** | **8** | **47%** |

### 4.2 Manual-Only Tests

The following tests require manual execution due to GUI or audio input requirements:

1. TC-001: Basic Voice Recording (live audio)
2. TC-002: Text Insertion at Cursor (GUI interaction)
3. TC-005: Global Hotkey Toggle (hardware input)
4. TC-008: Streaming Intermediate Result (real-time observation)
5. TC-010: No Focus Theft (visual verification)
6. TC-011: Context Menu (GUI interaction)

---

## 5. Test Data Requirements

### 5.1 Audio Fixtures

| File | Duration | Language | Purpose |
|------|----------|----------|---------|
| `zh_short.wav` | 1-2s | Chinese | Short phrase test |
| `zh_long.wav` | 5-10s | Chinese | Long sentence test |
| `zh_numbers.wav` | 2-3s | Chinese | Number recognition |
| `en_short.wav` | 1-2s | English | Short phrase test |
| `en_long.wav` | 5-10s | English | Long sentence test |
| `en_numbers.wav` | 2-3s | English | Number recognition |
| `silence_1s.wav` | 1s | - | Intermediate silence test |
| `silence_5s.wav` | 5s | - | Final silence test |

### 5.2 Configuration Fixtures

| File | Purpose |
|------|---------|
| `test-config.json` | Test configuration with mock settings |
| `test-position.json` | Saved position for position memory test |

---

## 6. Test Execution Plan

### 6.1 Pre-commit (Fast)

```bash
npm run test:unit
```

Runs: TC-009, TC-013, TC-014
Duration: < 30s

### 6.2 CI Pipeline (Medium)

```bash
npm run test:integration
```

Runs: TC-003, TC-004, TC-006, TC-007, TC-012, TC-015
Duration: ~5 min

### 6.3 Release (Full)

```bash
npm run test:all
```

Runs: All automated + manual test checklist
Duration: ~15 min + manual testing

---

## 7. Existing Test Scripts

| Script | Type | Status |
|--------|------|--------|
| `tests/stt/stt-runner.js` | STT Integration | Working |
| `tests/unit/state-machine.test.ts` | Unit | Working |
| `tests/unit/voice-service.test.ts` | Unit | Working |
| `tests/integration/python-bridge.test.ts` | Integration | Working |
| `tests/integration/python-server.test.ts` | Integration | Working |

---

*Document generated by Claude Architect Agent on 2026-03-19*
