# 悬浮球语音输入工具 - 设计文档

> 创建日期: 2026-03-13
> 状态: 已批准
> 阶段: 1 (独立悬浮球)

## 1. 概述

### 1.1 项目目标

创建一个独立的 Electron 桌面应用，通过悬浮球实现语音转文字功能：

- 点击悬浮球开始录音
- 松开悬浮球停止录音并转写
- 转写文字自动插入到光标位置（不抢焦点）

### 1.2 目标平台

- **操作系统**: Windows 10/11
- **用户环境**: Node.js >= 18.0.0, Python >= 3.8

### 1.3 后续规划

阶段 2 将此功能升级为 OpenCode 插件，详见 `memo/roadmap.md`。

---

## 2. 架构设计

### 2.1 技术选型

| 组件 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron | 跨平台桌面应用 |
| 语音识别 | Python (Whisper/Moonshine) | 复用现有 stt.py |
| 文字插入 | robotjs | 模拟键盘输入 |
| 打包工具 | electron-builder | 生成可执行文件 |

### 2.2 项目结构

```
floating-ball/
├── package.json              # 依赖配置
├── main.js                   # Electron 主进程入口
├── preload.js                # 预加载脚本（IPC 桥接）
├── index.html                # 悬浮球 UI
├── styles.css                # 样式（悬浮球外观、动画）
├── renderer.js               # 渲染进程逻辑（事件处理）
├── config.json               # 配置文件
├── stt/
│   └── stt.py                # Python STT 脚本
├── assets/
│   └── icon.png              # 悬浮球图标（可选）
├── tests/
│   ├── unit/                 # 单元测试
│   ├── integration/          # 集成测试
│   ├── e2e/                  # 端到端测试
│   ├── fixtures/             # 测试音频
│   └── test-runner.js        # 测试运行器
├── logs/                     # 日志目录
└── README.md                 # 项目文档
```

---

## 3. 核心组件

### 3.1 主进程 (main.js)

**职责**:
- 创建悬浮球窗口（无边框、透明、始终置顶）
- 管理 Python STT 子进程
- 通过 IPC 与渲染进程通信
- 使用 robotjs 模拟键盘输入

**窗口配置**:
```javascript
{
  width: 60,
  height: 60,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false
}
```

**IPC 事件**:
```javascript
ipcMain.on('start-recording', () => spawnPython())
ipcMain.on('stop-recording', () => killPythonAndTranscribe())
ipcMain.on('insert-text', (text) => robotjs.typeString(text))
```

### 3.2 渲染进程 (renderer.js)

**职责**:
- 悬浮球 UI 渲染和样式
- 处理鼠标事件
- 管理拖动逻辑
- 触发录音状态变化

**事件绑定**:
```javascript
ball.addEventListener('mousedown', (e) => {
  if (e.button === 0) startRecording()  // 左键录音
  if (e.button === 2) showContextMenu() // 右键菜单（预留）
})
ball.addEventListener('mouseup', () => stopRecording())
```

### 3.3 Python STT (stt.py)

**职责**: 录音并返回转写文本

**通信协议**: JSON over stdout
```json
{"success": true, "text": "你好世界", "backend": "faster-whisper"}
```

---

## 4. 数据流

```
用户按住悬浮球
       │
       ▼
┌─────────────────┐
│  renderer.js    │  mousedown 事件
│  (渲染进程)      │──────────────┐
└─────────────────┘              │
                                 ▼
                        ┌────────────────┐
                        │   main.js      │
                        │  (主进程)       │
                        └────────────────┘
                                 │
                    IPC: 'start-recording'
                                 │
                                 ▼
                        ┌────────────────┐
                        │   stt.py       │  spawn Python 进程
                        │  (开始录音)     │
                        └────────────────┘
                                 │
用户松开悬浮球 ◄─────────────────┘
       │
       ▼
┌─────────────────┐
│  renderer.js    │  mouseup 事件
└─────────────────┘
       │
       │ IPC: 'stop-recording'
       ▼
┌─────────────────┐
│   stt.py        │  停止录音，转写
└─────────────────┘
       │
       │ JSON: {success, text}
       ▼
┌─────────────────┐
│   main.js       │  解析结果
└─────────────────┘
       │
       │ robotjs.typeString(text)
       ▼
┌─────────────────┐
│  目标应用       │  文字出现在光标处
│  (记事本等)     │
└─────────────────┘
```

---

## 5. 日志系统

### 5.1 日志点分布

| 位置 | 事件 | 日志级别 |
|------|------|----------|
| renderer.js | mousedown/mouseup | INFO |
| renderer.js | 拖动开始/结束 | DEBUG |
| renderer.js | 状态变化 | DEBUG |
| main.js | IPC 收到请求 | INFO |
| main.js | Python 进程启动/退出 | INFO |
| main.js | Python stdout 输出 | DEBUG |
| main.js | 转写结果 | INFO |
| main.js | robotjs 调用 | DEBUG |
| main.js | 错误/异常 | ERROR |
| stt.py | 开始录音/结束录音 | INFO |
| stt.py | 检测到的后端 | DEBUG |
| stt.py | 转写耗时 | INFO |
| stt.py | 错误/异常 | ERROR |

### 5.2 日志输出

**位置**: `floating-ball/logs/app.log`

**格式**:
```
[2026-03-13 10:30:45.123] [INFO] [main] Python process started (pid: 12345)
[2026-03-13 10:30:48.456] [INFO] [main] Transcription result: "你好世界"
[2026-03-13 10:30:48.500] [DEBUG] [main] robotjs.typeString called
```

### 5.3 日志轮转

```
logs/
├── app.log              # 当前日志
├── app.log.1            # 历史日志 1
├── app.log.2            # 历史日志 2
└── app.log.3            # 历史日志 3
```

**轮转触发条件**:

| 条件 | 阈值 | 行为 |
|------|------|------|
| 单文件大小 | 5 MB | 滚动创建新文件 |
| 单文件时间 | 7 天 | 滚动创建新文件 |
| 总日志大小 | 20 MB | 删除最旧文件 |
| 文件数量 | 5 个 | 删除最旧文件 |

---

## 6. 错误处理

### 6.1 错误类型与处理策略

| 错误场景 | 检测方式 | 处理方式 | 用户反馈 |
|----------|----------|----------|----------|
| Python 未安装 | 启动时检查 | 弹窗提示 + 退出 | ❌ "请先安装 Python" |
| Python 依赖缺失 | 启动时检查 | 控制台警告 | ⚠️ "缺少依赖: xxx" |
| 麦克风无权限 | 录音失败 | 悬浮球显示 ❌ | 短暂显示错误图标 |
| 录音超时 | 超过 maxDuration | 自动停止 + 提示 | 悬浮球闪烁 |
| STT 转写失败 | Python 返回 error | 记录日志 | 悬浮球显示 ❌ |
| 空音频 | 无声音输入 | 记录日志 | 无反馈（静默） |
| 文字插入失败 | robotjs 异常 | 记录日志 | 悬浮球显示 ❌ |

### 6.2 悬浮球状态反馈

```
正常状态:    🔵 蓝色圆形（默认）
录音中:      🔴 红色 + 脉冲动画
成功:        🟢 绿色（短暂显示 0.5s）
失败:        ⚫ 灰色/❌（短暂显示 1s）
加载中:      🟡 黄色 + 转圈动画
```

---

## 7. 配置文件

### 7.1 config.json

```json
{
  "python": {
    "path": "python",
    "sttScript": "./stt/stt.py"
  },
  "stt": {
    "backend": "auto",
    "modelSize": "tiny",
    "language": "zh",
    "maxDuration": 30
  },
  "window": {
    "width": 60,
    "height": 60,
    "rememberPosition": true
  },
  "logging": {
    "level": "INFO",
    "logToFile": true,
    "maxFileSize": 5242880,
    "maxFiles": 5,
    "maxTotalSize": 20971520,
    "maxAge": 604800
  }
}
```

### 7.2 配置说明

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `python.path` | Python 解释器路径 | `"python"` |
| `python.sttScript` | STT 脚本相对路径 | `"./stt/stt.py"` |
| `stt.backend` | 语音后端 (auto/moonshine/whisper/faster-whisper) | `"auto"` |
| `stt.modelSize` | 模型大小 (tiny/base/small/medium) | `"tiny"` |
| `stt.language` | 语音语言 | `"zh"` |
| `stt.maxDuration` | 最大录音时长(秒) | `30` |
| `window.rememberPosition` | 记住窗口位置 | `true` |
| `logging.level` | 日志级别 (DEBUG/INFO/WARN/ERROR) | `"INFO"` |
| `logging.logToFile` | 是否写入文件 | `true` |
| `logging.maxFileSize` | 单文件最大大小(字节) | `5242880` (5MB) |
| `logging.maxFiles` | 最大文件数 | `5` |
| `logging.maxTotalSize` | 总日志最大大小(字节) | `20971520` (20MB) |
| `logging.maxAge` | 日志保留时间(秒) | `604800` (7天) |

---

## 8. 依赖

### 8.1 Node.js 依赖

```json
{
  "dependencies": {
    "electron": "^28.0.0",
    "robotjs": "^0.6.0"
  },
  "devDependencies": {
    "electron-builder": "^24.0.0",
    "vitest": "^4.1.0"
  }
}
```

### 8.2 Python 依赖

```
sounddevice    # 麦克风录音
soundfile      # 音频文件处理
numpy          # 数值计算
faster-whisper # 语音识别（推荐）
moonshine-onnx # 语音识别（可选）
openai-whisper # 语音识别（可选）
```

---

## 9. 测试策略

### 9.1 测试架构

```
tests/
├── unit/                 # 单元测试
│   ├── config.test.js    # 配置读取测试
│   ├── logger.test.js    # 日志轮转测试
│   └── position.test.js  # 位置记忆测试
├── integration/          # 集成测试
│   ├── ipc.test.js       # IPC 通信测试
│   ├── python.test.js    # Python 进程测试
│   └── stt.test.js       # STT 完整流程测试
├── e2e/                  # 端到端测试
│   └── full-flow.test.js # 完整用户流程
├── fixtures/             # 测试音频
│   ├── sample-zh.wav
│   └── sample-en.wav
└── test-runner.js        # 测试运行器
```

### 9.2 测试用例

| 测试项 | 输入 | 预期输出 | 验证方式 |
|--------|------|----------|----------|
| 配置加载 | config.json | 正确解析所有字段 | 日志 + 断言 |
| 位置记忆 | 拖动后重启 | 位置与上次一致 | 日志坐标对比 |
| Python 启动 | spawn 命令 | 进程正常启动 | 日志 pid 检查 |
| STT 转写 | sample-zh.wav | {"success": true, "text": "测试文本"} | JSON 结果断言 |
| 完整流程 | 播放音频文件 | 文字插入剪贴板 | 剪贴板内容检查 |
| 错误处理 | 无效 Python 路径 | 错误日志 + 错误状态 | 日志级别检查 |
| 日志轮转 | 写入大量日志 | 文件滚动 + 清理 | 文件系统检查 |

### 9.3 手动测试（最小化）

```
□ 真实麦克风录音（自动化用音频文件替代）
□ 真实键盘插入到第三方应用（自动化用剪贴板验证）
□ 视觉反馈（颜色、动画）- 截图对比
```

### 9.4 运行命令

```bash
npm test                # 运行所有测试
npm run test:unit       # 仅单元测试
npm run test:integration # 仅集成测试
npm run test:stt        # STT 专项测试
```

---

## 10. MVP 验收标准

1. ✅ 悬浮球可显示、可拖动
2. ✅ 按住录音，松开转写
3. ✅ 转写文字正确插入到光标处
4. ✅ 错误有合理反馈
5. ✅ 日志正常记录

---

## 附录

### A. 相关文档

- 产品路线图: `memo/roadmap.md`
- OpenCode 插件原始代码: `src/`

### B. 参考实现

- `Ref/PR11345/` - 参考实现 1
- `Ref/PR9264/` - 参考实现 2
- `Ref/opencode-stt/` - 参考实现 3
