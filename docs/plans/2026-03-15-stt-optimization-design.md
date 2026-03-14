# STT 优化与架构重构设计文档

> 创建日期: 2026-03-15
> 状态: 已批准
> 阶段: 全部

## 1. 概述

### 1.1 项目目标

1. **Python STT 反应时间优化** - 解决 ~4s 启动延迟问题
2. **文件夹整理** - 归档旧文件，规范项目结构
3. **测试案例梳理** - 覆盖之前漏掉的 Bug

### 1.2 目标平台

- **操作系统**: Windows 10/11
- **运行环境**: Node.js >= 18.0.0, Python >= 3.8

---

## 2. 架构设计

### 2.1 整体架构

采用**前后端分离**架构，Python 作为常驻 WebSocket 服务：

```
┌──────────────────┐    ws://localhost:8765    ┌──────────────────┐
│  前端             │ ◀──────────────────────▶ │  Python Server   │
│  (Electron/      │                           │  (常驻进程)        │
│   OpenCode)      │                           │                  │
└──────────────────┘                           └────────┬─────────┘
                                                        │
                                               ws://    │ 本地调用
                                                        ▼
                           ┌─────────────────────────────────────┐
                           │  Backend Manager                     │
                           │  ├── doubao-cloud (WebSocket)       │
                           │  ├── faster-whisper (本地)           │
                           │  ├── moonshine-onnx (本地)           │
                           │  └── openai-whisper (本地)           │
                           └─────────────────────────────────────┘
```

### 2.2 技术选型

| 组件 | 技术 | 说明 |
|------|------|------|
| 前端通信 | WebSocket | 与 Python 服务通信 |
| Python 服务 | aiohttp + websockets | 异步 WebSocket 服务器 |
| 云端 STT | 豆包云 API | 中文语音优化 |
| 本地 STT | faster-whisper / moonshine | 隐私保护，离线可用 |
| 日志系统 | Python logging + loguru | 支持轮转和大小限制 |
| 自动化测试 | Playwright + Nut.js | Electron + 桌面级测试 |

---

## 3. 目标文件夹结构

```
OpenCodeTTS/
├── src/                          # OpenCode 插件源码
│   ├── index.tsx                 # 插件入口
│   ├── components/
│   │   └── FloatingBall/         # 悬浮球组件
│   ├── services/
│   │   └── stt-client.ts         # STT WebSocket 客户端
│   └── scripts/
│       └── stt/                  # Python STT 服务
│           ├── server.py         # WebSocket 服务器
│           ├── backends/
│           │   ├── __init__.py
│           │   ├── base.py       # 后端基类
│           │   ├── doubao.py     # 豆包云
│           │   ├── faster_whisper.py
│           │   ├── moonshine.py
│           │   └── whisper.py
│           ├── config.py         # 配置加载
│           └── logger.py         # 日志系统
│
├── floating-ball/                # 独立 Electron 应用
│   ├── main.js
│   ├── preload.js
│   ├── renderer.js
│   ├── index.html
│   ├── styles.css
│   ├── tray.js                   # 托盘图标
│   └── menu.js                   # 右键菜单
│
├── config/
│   └── stt-config.json           # STT 配置
│
├── logs/                         # 运行日志
│   ├── server.log
│   └── ...
│
├── tests/                        # 测试
│   ├── unit/
│   │   ├── state-machine.test.ts
│   │   ├── backend-manager.test.ts
│   │   └── config-loader.test.ts
│   ├── integration/
│   │   ├── python-server.test.ts
│   │   ├── protocol.test.ts
│   │   ├── backend-switch.test.ts
│   │   └── timeout.test.ts
│   └── e2e/
│       ├── tray-menu.test.ts
│       ├── interaction.test.ts
│       ├── focus.test.ts
│       └── full-flow.test.ts
│
├── docs/                         # 文档
│   ├── user-guide.md             # 用户手册
│   ├── api-reference.md          # API 参考
│   └── troubleshooting.md        # 故障排除
│
├── memo/                         # 过程记录
│   └── ...
│
├── outdated/                     # 归档文件
│   └── Ref/
│       ├── PR11345/
│       ├── PR9264/
│       └── opencode-stt/
│
├── Ref/                          # 敏感资料（不提交）
│   └── Doubao/
│
├── .env                          # API Keys (不提交)
├── .env.example                  # API Keys 模板
├── .gitignore                    # 添加 Ref/, .env, logs/
└── package.json
```

---

## 4. WebSocket API 设计

### 4.1 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | WebSocket | 主通信通道 |
| `/api/backends` | HTTP GET | 列出可用后端 |
| `/api/backend` | HTTP POST | 切换后端 |
| `/api/status` | HTTP GET | 服务状态 |
| `/api/debug` | HTTP POST | 动态调整日志级别 |

### 4.2 消息协议

**前端 → 后端：**

```json
{"action": "start_recording", "language": "zh"}
{"action": "stop_recording"}
```

**后端 → 前端：**

```json
{"event": "recording", "duration": 1.5}
{"event": "result", "text": "你好世界", "backend": "doubao-cloud"}
{"event": "error", "message": "麦克风无权限"}
```

---

## 5. 后端管理器

### 5.1 后端基类

```python
# backends/base.py
class BaseBackend:
    def __init__(self, config: dict):
        self.config = config

    async def transcribe(self, audio_data: bytes) -> str:
        raise NotImplementedError

    @property
    def name(self) -> str:
        raise NotImplementedError

    def is_available(self) -> bool:
        raise NotImplementedError
```

### 5.2 支持的后端

| 后端 | 类型 | 特点 |
|------|------|------|
| **doubao-cloud** | 云端 | WebSocket 流式，中文优，需 API Key |
| **faster-whisper** | 本地 | GPU/CPU，通用，默认后端 |
| **moonshine-onnx** | 本地 | 轻量，快速 |
| **openai-whisper** | 本地 | 原版，较重 |

### 5.3 运行时切换

前端可通过 API 动态切换后端：

```json
POST /api/backend
{"backend": "doubao-cloud"}
```

---

## 6. 悬浮球启动/退出机制

### 6.1 系统托盘

```
┌─────────────────┐          ┌─────────────────┐
│  系统托盘图标    │  右键    │  托盘菜单        │
│  (麦克风图标)    │ ──────▶ │  ├── 显示悬浮球  │
│                 │          │  ├── 隐藏悬浮球  │
└─────────────────┘          │  ├── 后端选择 ▶  │
                             │  ├── 调试日志 ▶  │
                             │  ├── 打开日志    │
                             │  └── 退出        │
                             └─────────────────┘
```

### 6.2 启动配置

| 配置项 | 说明 |
|--------|------|
| `app.autoStart` | 开机自启 |
| `app.startMinimized` | 最小化启动 |
| `app.showTrayIcon` | 显示托盘图标 |

### 6.3 退出流程

1. 检查是否正在录音
2. 如正在录音，提示确认
3. 关闭 Python 服务
4. 保存悬浮球位置
5. 退出 Electron

---

## 7. 日志系统

### 7.1 日志配置

```json
{
  "logging": {
    "level": "INFO",
    "dir": "./logs",
    "maxFileSize": "5MB",
    "maxFiles": 5,
    "maxTotalSize": "20MB",
    "maxAge": "7d"
  }
}
```

### 7.2 日志级别

| 级别 | 用途 |
|------|------|
| DEBUG | 详细调试信息（可动态开启） |
| INFO | 正常操作记录 |
| WARN | 警告（如降级到本地后端） |
| ERROR | 错误（如 API 调用失败） |

### 7.3 调试接口

```json
POST /api/debug
{"level": "DEBUG"}
```

---

## 8. 配置文件

### 8.1 stt-config.json

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 8765
  },
  "stt": {
    "defaultBackend": "faster-whisper",
    "backends": {
      "doubao-cloud": {
        "enabled": true,
        "url": "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream"
      },
      "faster-whisper": {
        "enabled": true,
        "model": "tiny",
        "device": "auto"
      },
      "moonshine-onnx": {
        "enabled": true,
        "model": "tiny"
      },
      "openai-whisper": {
        "enabled": true,
        "model": "tiny"
      }
    }
  },
  "app": {
    "autoStart": false,
    "startMinimized": false,
    "showTrayIcon": true
  },
  "logging": {
    "level": "INFO",
    "dir": "./logs",
    "maxFileSize": "5MB",
    "maxFiles": 5,
    "maxTotalSize": "20MB",
    "maxAge": "7d"
  }
}
```

### 8.2 .env (API Keys)

```env
DOUBAO_APP_KEY=your_app_key
DOUBAO_ACCESS_KEY=your_access_key
```

### 8.3 .gitignore 新增

```gitignore
# Secrets
.env
Ref/

# Logs
logs/

# Outdated (optional)
# outdated/
```

---

## 9. 测试设计

### 9.1 测试框架

| 框架 | 用途 |
|------|------|
| **Playwright** | Electron 内部自动化 |
| **Nut.js** | 桌面级自动化（跨应用） |
| **Vitest** | 单元/集成测试 |

### 9.2 Bug 覆盖对应

| Bug | 测试文件 | 测试用例 |
|-----|----------|----------|
| 交互冲突 | `e2e/interaction.test.ts` | 拖动不影响点击 |
| 进程生命周期 | `integration/python-server.test.ts` | 断开自动清理 |
| 状态机卡死 | `unit/state-machine.test.ts` | 错误后恢复 idle |
| 焦点管理 | `e2e/focus.test.ts` | 转写后焦点返回 |
| 超时处理 | `integration/timeout.test.ts` | 录音超时自动停止 |
| JSON 解析 | `integration/protocol.test.ts` | 不完整数据不崩溃 |

### 9.3 测试覆盖率目标

| 层级 | 工具 | 目标 |
|------|------|------|
| 单元 | Vitest | 90%+ |
| 集成 | Vitest | 80%+ |
| E2E | Playwright | 核心流程 100% |

---

## 10. 用户手册结构

```
docs/
├── user-guide.md           # 用户手册
│   ├── 概述
│   ├── 安装
│   ├── 快速开始
│   ├── 悬浮球使用
│   ├── 后端配置
│   └── 参数配置
├── api-reference.md        # API 参考
└── troubleshooting.md      # 故障排除
```

### 10.1 参数配置说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `server.host` | string | `127.0.0.1` | 服务监听地址 |
| `server.port` | number | `8765` | 服务端口 |
| `stt.defaultBackend` | string | `faster-whisper` | 默认后端 |
| `stt.backends.*.enabled` | boolean | `true` | 启用后端 |
| `stt.backends.faster-whisper.model` | string | `tiny` | 模型大小 |
| `stt.backends.faster-whisper.device` | string | `auto` | 设备 |
| `app.autoStart` | boolean | `false` | 开机自启 |
| `app.startMinimized` | boolean | `false` | 最小化启动 |
| `logging.level` | string | `INFO` | 日志级别 |
| `logging.maxFileSize` | string | `5MB` | 单文件最大 |
| `logging.maxFiles` | number | `5` | 最大文件数 |

---

## 11. 执行计划

### Phase 1: Python STT 优化

```
1.1 创建 Python WebSocket 服务
    ├── server.py
    ├── backends/base.py
    ├── backends/doubao.py
    ├── backends/faster_whisper.py
    ├── config.py
    └── logger.py

1.2 配置系统
    ├── config/stt-config.json
    ├── .env
    ├── .env.example
    └── .gitignore 更新

1.3 前端客户端
    └── src/services/stt-client.ts

1.4 悬浮球托盘
    ├── tray.js
    └── menu.js
```

### Phase 2: 文件夹整理

```
2.1 归档旧文件
    ├── Ref/PR11345/ → outdated/
    ├── Ref/PR9264/ → outdated/
    └── Ref/opencode-stt/ → outdated/

2.2 保留 Ref/Doubao/
    └── 添加到 .gitignore
```

### Phase 3: 测试案例梳理

```
3.1 安装测试框架
    ├── @playwright/test
    └── @nut-tree/nut-js

3.2 编写测试
    ├── unit/
    ├── integration/
    └── e2e/

3.3 覆盖已知 Bug
```

---

## 附录

### A. 相关文档

- 原始 todo: `memo/2026-03-15-todo.md`
- 悬浮球设计: `docs/plans/2026-03-13-floating-ball-design.md`
- 调试记录: `memo/2026-03-14-floating-ball-debug-session.md`

### B. 参考实现

- 豆包云 Demo: `Ref/Doubao/demo/sauc_websocket_demo.py`
- 豆包云文档: https://www.volcengine.com/docs/6561/1594356?lang=zh
