# OpenCodeTTS 悬浮球语音输入工具 - 需求与架构文档

> **版本**: 2.0
> **更新日期**: 2026-03-19
> **状态**: 已实现
> **分支**: feature/keyboard-hotkey-recording

---

## 1. 项目概述

### 1.1 产品定位

OpenCodeTTS 是一款 Windows 桌面语音输入工具，通过悬浮球界面实现"按住说话、松开转写"的语音转文字功能。支持多种 STT 后端（云端豆包、本地 Whisper），可无缝插入文字到任意应用的光标位置。

### 1.2 目标用户

- 需要频繁文字输入的用户
- 希望提高打字效率的用户
- 对云端/本地语音识别有不同偏好的用户

### 1.3 目标平台

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10/11 |
| Node.js | >= 18.0.0 |
| Python | >= 3.8 |
| 网络 | 云端后端需要网络连接 |

---

## 2. 功能需求

### 2.1 核心功能

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 语音转文字 | 按住悬浮球录音，松开后自动转写 | P0 |
| 文字插入 | 转写结果自动插入到光标位置 | P0 |
| 悬浮球拖动 | 可拖动悬浮球到任意位置 | P0 |
| 位置记忆 | 重启后恢复上次位置 | P1 |
| 全局热键 | 按住热键录音，松开停止 | P1 |
| 后端切换 | 动态切换云端/本地后端 | P1 |
| 流式输出 | 录音过程中实时显示中间结果 | P2 |

### 2.2 触发方式

#### 2.2.1 悬浮球按压 (Press-Hold)

```
┌─────────────────────────────────────────────────────────────────┐
│  mousedown ──► 开始录音 ──► 录音中 ──► mouseup ──► 停止录音    │
│      │                                          │               │
│      └─► 最小按压时间 500ms ◄──────────────────┘               │
│           (短于 500ms 等待 Python 自动停止)                      │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.2.2 全局热键 (Toggle)

```
┌─────────────────────────────────────────────────────────────────┐
│  热键按下 ──► if (idle) 开始录音                                │
│           ──► if (recording) 停止录音                           │
│                                                                 │
│  默认热键: CommandOrControl+Alt+Space                           │
│  防抖时间: 300ms                                                │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 STT 后端

| 后端 | 类型 | 速度 | 准确度 | 网络需求 |
|------|------|------|--------|----------|
| **doubao-cloud** | 云端 | ~1s | 高（中文优化） | 需要 |
| **whisper** | 本地 | ~10s (CPU) | 高 | 不需要 |

### 2.4 状态机

```
┌───────┐  开始录音   ┌───────────┐  停止录音  ┌────────────┐
│ idle  │ ──────────► │ recording │ ─────────► │ processing │
└───────┘             └───────────┘            └────────────┘
    ▲                                                 │
    │                    成功/失败                     │
    └────────────────────────────────────────────────┘
                         │
                         ▼
                   ┌───────────┐
                   │ success/  │ (0.5-1s 后自动恢复 idle)
                   │  error    │
                   └───────────┘
```

---

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Electron App                                   │
│                        (floating-ball/)                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         main.js (主进程)                           │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │  │
│  │  │ 悬浮球触发器     │  │ 热键触发器       │  │ 录音控制器       │   │  │
│  │  │ (Press-Hold)    │  │ (Toggle)        │  │                 │   │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │  │
│  │           │                    │                    │            │  │
│  │           └────────────────────┼────────────────────┘            │  │
│  │                                ▼                                 │  │
│  │           ┌─────────────────────────────────────┐                │  │
│  │           │      共享状态机 (idle/recording/...) │                │  │
│  │           └─────────────────────────────────────┘                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│                         WebSocket │ ws://127.0.0.1:8765                 │
│                                    ▼                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Python STT Server                                │
│                       (src/scripts/stt/)                                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        server.py                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Backend Manager                           │  │  │
│  │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │  │  │
│  │  │  │ doubao-cloud  │  │   whisper     │  │  (moonshine)  │   │  │  │
│  │  │  │ (WebSocket)   │  │   (本地)      │  │  (本地)       │   │  │  │
│  │  │  └───────────────┘  └───────────────┘  └───────────────┘   │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│                              spawn │                                     │
│                                    ▼                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     record.py (录音进程)                           │  │
│  │  - sounddevice 录音                                                │  │
│  │  - VAD 静音检测                                                    │  │
│  │  - 流式输出 (intermediate_silence / final_silence)                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 技术选型

| 组件 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron 28+ | 跨平台桌面应用 |
| 全局热键 | Electron globalShortcut | 无需原生模块 |
| 前端通信 | WebSocket | 与 Python 服务通信 |
| Python 服务 | aiohttp + websockets | 异步 WebSocket 服务器 |
| 云端 STT | 豆包云 API | 中文语音优化 |
| 本地 STT | faster-whisper / whisper | 离线可用 |
| 文字插入 | 剪贴板 + PowerShell SendKeys | 最大兼容性 |
| 繁简转换 | zhconv | 自动转换为简体中文 |

### 3.3 项目结构

```
OpenCodeTTS/
├── floating-ball/                # Electron 悬浮球应用
│   ├── main.js                   # 主进程 - 热键、录音控制、状态机
│   ├── preload.js                # 预加载脚本 - IPC 桥接
│   ├── renderer.js               # 渲染进程 - UI 事件处理
│   ├── index.html                # 悬浮球 UI
│   ├── styles.css                # 样式
│   ├── config.json               # 客户端配置
│   ├── record.py                 # Python 录音脚本
│   └── start-electron.sh         # 启动脚本 (清除 IDE 环境变量)
│
├── src/scripts/stt/              # Python STT 服务
│   ├── server.py                 # WebSocket 服务器
│   ├── backends/
│   │   ├── base.py               # 后端基类
│   │   ├── manager.py            # 后端管理器
│   │   ├── doubao.py             # 豆包云后端
│   │   └── whisper.py            # Whisper 后端
│   ├── config.py                 # 配置加载
│   └── utils.py                  # 工具函数 (繁简转换)
│
├── config/
│   └── stt-config.json           # 服务端配置
│
├── docs/                         # 文档
│   ├── plans/                    # 设计文档
│   └── user-guide.md             # 用户手册
│
├── .env                          # API Keys (不提交)
└── .env.example                  # API Keys 模板
```

---

## 4. 数据流

### 4.1 录音到文字插入完整流程

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. 触发录音                                                               │
│    悬浮球 mousedown ──► IPC ──► main.startRecording()                    │
│    热键按下 ──► globalShortcut ──► main.startRecording()                 │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. 启动录音                                                               │
│    main.spawnRecordingOnly() ──► spawn record.py                         │
│    record.py: 录音 → VAD 检测 → 输出音频数据 + 事件                        │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. 流式处理 (可选)                                                        │
│    record.py ──► "intermediate_silence" 事件                              │
│    main.js ──► 缓冲音频 ──► sendAudioToServer() ──► insertTextImmediately()│
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. 停止录音                                                               │
│    悬浮球 mouseup ──► IPC ──► main.stopRecording() ──► state=processing  │
│    热键再次按下 ──► main.stopRecording() ──► state=processing             │
│    或 Python 自动停止 (final_silence / max_duration)                      │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. 转写与插入                                                             │
│    Python 进程退出 ──► on('close') 事件                                   │
│    main.js ──► sendAudioToServer() ──► 获取文字                           │
│    insertTextImmediately() ──► clipboard.writeText() + SendKeys "^v"     │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 WebSocket 消息协议

**客户端 → 服务端:**

```json
{"action": "transcribe", "audio": "<base64>", "final": true}
{"action": "switch_backend", "backend": "doubao-cloud"}
{"action": "get_status"}
```

**服务端 → 客户端:**

```json
{"event": "result", "text": "你好世界", "backend": "doubao-cloud"}
{"event": "error", "message": "API 调用失败"}
{"event": "status", "backend": "doubao-cloud", "connected": true}
```

---

## 5. 配置系统

### 5.1 客户端配置 (floating-ball/config.json)

```json
{
  "python": {
    "path": "python",
    "recordScript": "./record.py",
    "serverScript": "../src/scripts/stt/server.py"
  },
  "stt": {
    "backend": "doubao-cloud",
    "modelSize": "small",
    "language": "auto",
    "maxDuration": 180,
    "silenceThreshold": 0.02,
    "minDuration": 0.5,
    "intermediateSilenceDuration": 1,
    "finalSilenceDuration": 5
  },
  "hotkey": {
    "enabled": true,
    "key": "CommandOrControl+Alt+Space"
  },
  "window": {
    "width": 60,
    "height": 60,
    "rememberPosition": true
  },
  "logging": {
    "level": "INFO",
    "logToFile": true
  },
  "websocket": {
    "enabled": true,
    "url": "ws://127.0.0.1:8765"
  }
}
```

### 5.2 服务端配置 (config/stt-config.json)

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 8765
  },
  "stt": {
    "defaultBackend": "doubao-cloud",
    "backends": {
      "doubao-cloud": { "enabled": true },
      "whisper": { "enabled": true, "model": "small" }
    }
  }
}
```

### 5.3 环境变量 (.env)

```env
# 豆包语音识别配置
ASR_APP_ID=your_app_id
ASR_ACCESS_TOKEN=your_access_token
ASR_ACCESS_SECRET=your_access_secret
ASR_CLUSTER=volcengine_streaming_common
```

---

## 6. 开发过程中发现的问题与解决方案

### 6.1 已解决问题

| 问题 | 现象 | 根本原因 | 解决方案 |
|------|------|----------|----------|
| **IDE 环境变量污染** | Electron 启动崩溃 | Trae CN 设置 `ELECTRON_RUN_AS_NODE=1` | 启动脚本清除环境变量 |
| **繁体中文输出** | Whisper 输出繁体字 | `language="zh"` 不区分简繁 | 后处理使用 zhconv 转换 |
| **Alt+Tab 窗口闪烁** | 恢复焦点时窗口闪烁 | Alt+Tab 显示任务切换界面 | `focusable: false` 不抢焦点 |
| **热键连发** | 快速按热键触发多次 | 无防抖机制 | 添加 300ms 防抖 |
| **后端切换重复输出** | 切换后端时文字重复 | 音频缓冲未清空 + 事件监听器残留 | 切换时清理缓冲和监听器 |
| **转录锁未释放** | 按钮按压无文字输出 | `transcriptionInProgress` 未重置 | 所有清理路径重置锁 |

### 6.2 关键修复详情

#### 6.2.1 IDE 环境变量污染

**问题**: Trae CN (Electron IDE) 设置了 `ELECTRON_RUN_AS_NODE=1`，导致 Electron 以 Node.js 模式运行，`ipcMain` 为 undefined。

**解决方案**: 创建 `start-electron.sh` 清除环境变量：

```bash
#!/bin/bash
unset ELECTRON_RUN_AS_NODE
unset ELECTRON_FORCE_IS_PACKAGED
unset VSCODE_RUN_IN_ELECTRON
unset ICUBE_IS_ELECTRON
unset ICUBE_ELECTRON_PATH
exec "$(dirname "$0")/node_modules/.bin/electron" .
```

#### 6.2.2 焦点管理

**问题**: Windows 有焦点防抢机制，恢复焦点困难。

**解决方案**: 使用 `focusable: false` 让悬浮球永不获取焦点，从根源解决问题：

```javascript
mainWindow = new BrowserWindow({
  // ...
  focusable: false,  // 窗口永不获取焦点
  // ...
});
```

#### 6.2.3 转录锁机制

**问题**: `intermediate_silence`、`final_silence`、`on('close')` 三个处理器可能重复处理同一音频。

**解决方案**:

1. 全局锁 `transcriptionInProgress`
2. 在所有清理路径重置锁
3. 在转录完成后释放锁

```javascript
// 清理函数必须重置锁
function cleanupPythonProcess() {
  // ...
  transcriptionInProgress = false;  // MUST reset this lock!
}

// on('close') 处理完成后释放锁
pythonProcess.on('close', async (code) => {
  // ...
  transcriptionInProgress = false;  // Release lock after processing
});
```

---

## 7. 新增功能

### 7.1 全局热键支持

- **默认热键**: `CommandOrControl+Alt+Space`
- **模式**: Toggle (按一下开始，再按一下停止)
- **防抖**: 300ms
- **状态共享**: 与悬浮球共用同一状态机

### 7.2 流式输出

- **中间结果**: 1s 静音后输出中间结果
- **最终结果**: 5s 静音后停止录音
- **实时反馈**: 悬浮球显示中间结果 tooltip

### 7.3 动态后端切换

- **右键菜单**: 快速切换云端/本地后端
- **无需重启**: 切换后立即生效
- **状态保存**: 保存到 config.json

### 7.4 位置记忆

- **自动保存**: 拖动后自动保存位置
- **重启恢复**: 下次启动恢复到上次位置
- **配置文件**: `floating-ball/position.json`

---

## 8. 后续规划

### 8.1 短期 (1-2 周)

- [ ] 可配置热键 (自定义按键组合)
- [ ] Press-Hold 热键模式 (按住录音，松开停止)
- [ ] 跨平台支持 (macOS / Linux)

### 8.2 中期 (1-2 月)

- [ ] OpenCode 插件集成
- [ ] 系统托盘支持
- [ ] 开机自启

### 8.3 长期

- [ ] 多语言支持
- [ ] 语音命令
- [ ] AI 辅助润色

---

## 9. 附录

### 9.1 相关文档

| 文档 | 位置 | 说明 |
|------|------|------|
| 悬浮球设计 | [2026-03-13-floating-ball-design.md](plans/2026-03-13-floating-ball-design.md) | 原始设计文档 |
| STT 优化 | [2026-03-15-stt-optimization-design.md](plans/2026-03-15-stt-optimization-design.md) | 架构重构 |
| 焦点修复 | [2026-03-15-focus-flash-fix-design.md](plans/2026-03-15-focus-flash-fix-design.md) | 闪烁问题解决 |
| 流式输出 | [2026-03-17-streaming-output.md](plans/2026-03-17-streaming-output.md) | 实时转录 |
| 热键设计 | [2026-03-18-keyboard-hotkey-design.md](plans/2026-03-18-keyboard-hotkey-design.md) | 全局热键 |
| 触发器架构 | [2026-03-19-trigger-architecture.md](plans/2026-03-19-trigger-architecture.md) | 架构分析 |

### 9.2 Git 提交历史

```
d1db11b fix(hotkey): reset transcriptionInProgress lock in all cleanup paths
b341316 fix(transcription): add global lock to prevent duplicate transcription
968498d fix(streaming): add lock to prevent duplicate intermediate processing
d7c7ce9 fix(backend): properly cleanup Python process and audio buffer
6fbf539 fix(backend): clear audio buffer and state on backend switch
01ff4aa feat(hotkey): integrate hotkey registration with app lifecycle
ea5f479 feat(hotkey): add hotkey press handler with key release polling
5edcba7 feat(hotkey): add global hotkey registration functions
440a285 feat(hotkey): add isRightCtrlPressed() helper function
cd07ccf docs: add keyboard hotkey feature design and implementation plan
```

### 9.3 依赖列表

**Node.js:**
```
electron: ^28.0.0
```

**Python:**
```
sounddevice    # 麦克风录音
soundfile      # 音频文件处理
numpy          # 数值计算
websockets     # WebSocket 服务器
aiohttp        # 异步 HTTP
openai-whisper # 本地语音识别 (可选)
zhconv         # 繁简转换
```
