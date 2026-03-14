# OpenCode STT 用户手册

## 1. 概述

OpenCode STT 是一个语音转文字工具，支持本地和云端后端。

### 功能特性

- 悬浮球快速录音
- 多后端支持（豆包云、faster-whisper、moonshine）
- 系统托盘管理
- 后端动态切换

### 系统要求

- Windows 10/11
- Node.js >= 18.0.0
- Python >= 3.8

## 2. 安装

### 2.1 Node.js 依赖

```bash
npm install
```

### 2.2 Python 依赖

```bash
pip install aiohttp sounddevice soundfile numpy faster-whisper
```

可选：
```bash
pip install moonshine-onnx openai-whisper
```

### 2.3 配置 API Keys

复制 `.env.example` 到 `.env` 并填入豆包云 API 密钥：

```env
DOUBAO_APP_KEY=your_app_key
DOUBAO_ACCESS_KEY=your_access_key
```

## 3. 使用方法

### 3.1 启动服务

```bash
# 启动 Python STT 服务
python src/scripts/stt/server.py

# 启动悬浮球应用
cd floating-ball && npm start
```

### 3.2 录音操作

1. 点击悬浮球开始录音
2. 说话
3. 释放悬浮球结束录音
4. 等待转写结果

### 3.3 托盘菜单

右键点击托盘图标可以：
- 显示/隐藏悬浮球
- 切换后端
- 开启调试日志
- 退出应用

## 4. 配置说明

### 4.1 stt-config.json

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `server.host` | 服务地址 | `127.0.0.1` |
| `server.port` | 服务端口 | `8765` |
| `stt.defaultBackend` | 默认后端 | `faster-whisper` |
| `logging.level` | 日志级别 | `INFO` |

### 4.2 后端选项

| 后端 | 说明 | 要求 |
|------|------|------|
| `faster-whisper` | 本地 Whisper | faster-whisper 包 |
| `doubao-cloud` | 豆包云 | API Key |
| `moonshine-onnx` | 本地轻量 | moonshine-onnx 包 |

## 5. 故障排除

### 5.1 服务启动失败

检查 Python 依赖是否安装：
```bash
python -c "import aiohttp; print('OK')"
```

### 5.2 麦克风无权限

Windows 设置 > 隐私 > 麦克风，允许应用访问。

### 5.3 查看日志

日志位于 `logs/server.log`。
