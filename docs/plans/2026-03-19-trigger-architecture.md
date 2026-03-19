# 触发器架构分析

## 当前事件流

### 悬浮球按钮 (Press-Hold 模式)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ renderer.js                                                              │
│                                                                          │
│  mousedown ──► MIN_RECORDING_TIME=500ms ──► mouseup                     │
│      │                                           │                       │
│      ▼                                           ▼                       │
│  setState('recording')              if (heldTime >= 500ms)              │
│  electronAPI.startRecording()            setState('processing')         │
│                                          electronAPI.stopRecording()    │
│                                      else                               │
│                                          (等待 Python 自动停止)          │
└─────────────────────────────────────────────────────────────────────────┘
                           │                           │
                           ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ main.js (IPC Handlers)                                                   │
│                                                                          │
│  ipcMain.on('start-recording')          ipcMain.on('stop-recording')    │
│      │                                           │                       │
│      ▼                                           ▼                       │
│  startRecording()                       stopRecording()                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 全局热键 (Toggle 模式)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ main.js (Hotkey Handler)                                                 │
│                                                                          │
│  globalShortcut.register(accelerator, () => {                           │
│      onHotkeyPressed()                                                  │
│  })                                                                     │
│                                                                          │
│  function onHotkeyPressed() {                                           │
│      if (debounced) return                                              │
│      if (state === 'idle')       ──► startRecording()                  │
│      if (state === 'recording')  ──► stopRecording()                   │
│  }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

## 共同部分

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Recording State Machine                                                  │
│                                                                          │
│  startRecording()                                                        │
│      │                                                                   │
│      ▼                                                                   │
│  if (state !== 'idle') return                                           │
│  if (wsConnected)                                                        │
│      setState('recording')                                               │
│      spawnRecordingOnly()  ──► Python record.py                         │
│  else                                                                    │
│      setState('warming')                                                 │
│      spawnPythonProcess()                                                │
│                                                                          │
│  stopRecording()                                                         │
│      │                                                                   │
│      ▼                                                                   │
│  if (state === 'warming') cleanupPythonProcess(), setState('idle')      │
│  if (state === 'recording') setState('processing')                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Text Output (3 Event Handlers)                                           │
│                                                                          │
│  Python stdout ──► 'intermediate_silence' ──► 转录 + 插入文字            │
│                  'final_silence'        ──► 转录 + 插入文字 + 停止       │
│                  'max_duration'         ──► 转录 + 插入文字 + 停止       │
│                                                                          │
│  Python close ──► on('close') ──► if (buffer.length > 0) 转录 + 插入    │
└─────────────────────────────────────────────────────────────────────────┘
```

## 问题分析

### 问题 1: 双重状态管理

| 位置 | 状态管理 | 问题 |
|------|---------|------|
| renderer.js | currentState (idle/recording/processing) | 与 main.js 可能不同步 |
| main.js | state (idle/recording/processing/success/error) | 主状态 |

**解决方案**: 只在 main.js 管理状态，renderer.js 通过 IPC 同步

### 问题 2: 触发模式不一致

| 触发源 | 模式 | 行为 |
|--------|------|------|
| 悬浮球 | Press-Hold | 按住录音，松开停止 |
| 热键 | Toggle | 按一下开始，再按一下停止 |

**问题**: 用户可能期望热键也是 Press-Hold 模式（Right Ctrl 按住录音）

### 问题 3: 全局锁不完整

```javascript
let transcriptionInProgress = false;

// 问题: cleanupPythonProcess() 之前没有重置锁
// 修复: 已添加 transcriptionInProgress = false
```

## 建议的统一架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Trigger Layer                                    │
├───────────────────────────┬─────────────────────────────────────────────┤
│  BallTrigger              │  HotkeyTrigger                              │
│  (Press-Hold)             │  (Press-Hold or Toggle, configurable)      │
│  - mousedown → start      │  - keydown → start                         │
│  - mouseup → stop         │  - keyup → stop (Press-Hold mode)          │
│                           │  - or Toggle mode                           │
└───────────────────────────┴─────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Recording Controller                               │
│                       (main.js, single source of truth)                  │
│                                                                          │
│  startRecording() ──► spawnRecordingOnly() ──► Python record.py         │
│  stopRecording()  ──► setState('processing')                            │
│                                                                          │
│  状态机: idle → recording → processing → success/error → idle           │
└─────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Output Layer                                     │
│                                                                          │
│  Python stdout ──► EventParser ──► Transcriber ──► TextInserter        │
│                                                                          │
│  - intermediate_silence: 流式输出中间结果                               │
│  - final_silence: 最终结果                                              │
│  - on('close'): 兜底处理                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

## 重构建议

### 1. 统一触发接口

```javascript
// 新的统一接口
class RecordingController {
  start() { /* 开始录音 */ }
  stop() { /* 停止录音 */ }
  getState() { return this.state; }
}

// 悬浮球触发器
class BallTrigger {
  constructor(controller) { this.controller = controller; }
  onMouseDown() { this.controller.start(); }
  onMouseUp() { this.controller.stop(); }
}

// 热键触发器
class HotkeyTrigger {
  constructor(controller, mode = 'toggle') {
    this.controller = controller;
    this.mode = mode; // 'toggle' or 'press-hold'
  }
  onPressed() {
    if (this.mode === 'toggle') {
      if (this.controller.getState() === 'idle') this.controller.start();
      else this.controller.stop();
    } else {
      this.controller.start();
    }
  }
  onReleased() {
    if (this.mode === 'press-hold') this.controller.stop();
  }
}
```

### 2. 简化文字输出

```javascript
// 统一的文字输出处理器
class TextOutputHandler {
  constructor() {
    this.buffer = [];
    this.lock = false;
  }

  async processAudio(audioData, isFinal = false) {
    if (this.lock) return;
    this.lock = true;
    try {
      const text = await sendAudioToServer(audioData, isFinal);
      if (text) await insertTextImmediately(text);
      if (isFinal) this.buffer = [];
    } finally {
      this.lock = false;
    }
  }

  reset() {
    this.buffer = [];
    this.lock = false;
  }
}
```

## 配置项

```json
{
  "trigger": {
    "ball": {
      "enabled": true,
      "mode": "press-hold",
      "minHoldTime": 500
    },
    "hotkey": {
      "enabled": true,
      "key": "CommandOrControl+Alt+Space",
      "mode": "toggle"  // or "press-hold"
    }
  }
}
```
