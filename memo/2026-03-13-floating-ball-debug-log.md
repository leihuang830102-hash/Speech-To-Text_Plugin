# Floating Ball 调试日志 - 2026-03-13

## ✅ 已修复的 Bug

### Bug 1: Electron 启动崩溃 - `ipcMain.on is not a function`

**错误信息:**
```
TypeError: Cannot read properties of undefined (reading 'on')
at main.js:181 - ipcMain.on('start-recording', ...)
```

**根本原因:**
Trae CN IDE 污染了子进程的环境变量：
- `ELECTRON_RUN_AS_NODE=1` - 让 Electron 以 Node.js 模式运行，导致 `ipcMain` 为 undefined

**解决方案:**
创建 `floating-ball/start-electron.sh` 启动脚本清除干扰变量：
```bash
#!/bin/bash
unset ELECTRON_RUN_AS_NODE
unset ELECTRON_FORCE_IS_PACKAGED
unset VSCODE_RUN_IN_ELECTRON
unset ICUBE_IS_ELECTRON
unset ICUBE_ELECTRON_PATH
exec "$(dirname "$0")/node_modules/.bin/electron" .
```

---

### Bug 2: 点击悬浮球抢走光标

**问题:**
点击悬浮球时，焦点被抢走，用户无法继续在其他应用输入。

**尝试的方案:**

| 方案 | 结果 |
|------|------|
| `focusable: false` (构造函数) | ❌ 阻止了鼠标事件，无法点击 |
| `setFocusable(false)` (创建后) | ❌ 阻止了鼠标事件，无法点击 |
| `blur()` 在 start-recording 时 | ❌ 阻止了 mouseup 事件，无法停止录音 |
| `blur()` 在转录完成后 | ✅ 可用 |

**最终方案:**
```javascript
// 在 Python 进程结束后 blur
pythonProcess.on('close', (code) => {
  // ... 处理转录结果 ...
  mainWindow.blur();  // 把焦点还回去
});
```

**注意:** 录音期间仍会抢光标，但转录完成后自动归还。

---

### Bug 3: 点击没有反应 (CSS 拖拽区域问题)

**问题:**
可以拖拽悬浮球，但点击没反应。

**根本原因:**
CSS 中 `* { -webkit-app-region: drag }` 设置了所有元素为拖拽区域，`.ball` 的子元素也继承了 drag，阻止了点击事件。

**解决方案:**
```css
/* 确保 .ball 及其所有子元素都是 no-drag */
.ball {
  -webkit-app-region: no-drag;
}

.ball * {
  -webkit-app-region: no-drag;
}
```

---

### Bug 4: OpenMP 库冲突

**错误信息:**
```
OMP: Error #15: Initializing libiomp5md.dll, but found libiomp5md.dll already initialized.
```

**解决方案:**
在 spawn Python 时设置环境变量：
```javascript
const pythonEnv = {
  ...process.env,
  KMP_DUPLICATE_LIB_OK: 'TRUE'
};
pythonProcess = spawn(config.python.path, args, { env: pythonEnv });
```

---

## ⏳ 未完成的问题

### 问题 1: 录音时间太短 ✅ 已修复

**现象:**
- 用户按住悬浮球只有 1-2 秒就释放
- Python 被终止时还没有完成转录
- 日志显示: `Failed to parse Python output: Unexpected end of JSON input`

**根本原因:**
`stop-recording` IPC handler 立即调用 `killPython()`，但 Python 脚本设计为：
1. 录音直到检测到 1.5s 静音
2. 然后转录
3. 然后输出 JSON

在用户释放按钮时立即终止 Python，导致它没有机会完成录音和转录。

**解决方案:**
修改 `main.js` 的 `stop-recording` handler：
- 不再调用 `killPython()`
- 只改变状态为 'processing'
- 让 Python 自然完成（静音检测 → 转录 → 输出 JSON）
- 添加安全超时（maxDuration + 30s buffer）

---

### 问题 2: STT 模型问题

**现象:**
- faster-whisper 模型文件损坏: `Unable to open file 'model.bin'`
- 删除缓存后无法重新下载（网络问题，huggingface.co 连接超时）

**临时方案:**
修改 `config.json` 使用主项目的 STT 脚本：
```json
{
  "python": {
    "sttScript": "../src/scripts/stt.py"
  }
}
```

**验证结果:**
主项目 STT 使用 whisper 后端，可以正常工作：
```
$ python src/scripts/stt.py --audio-file tests/fixtures/test_sample_audio.wav
{"success": true, "text": "這是所謂的", "backend": "whisper", "model": "tiny"}
```

---

## 📁 修改的文件

| 文件 | 修改内容 |
|------|----------|
| `floating-ball/start-electron.sh` | 新建启动脚本，清除 IDE 干扰变量 |
| `floating-ball/package.json` | 更新 start 脚本使用 start-electron.sh |
| `floating-ball/main.js` | 添加 KMP_DUPLICATE_LIB_OK 环境变量 |
| `floating-ball/main.js` | 移除 stop-recording 中的 killPython()，添加安全超时 |
| `floating-ball/styles.css` | 添加 `.ball * { no-drag }` 修复点击问题 |
| `floating-ball/renderer.js` | 添加调试日志 |
| `floating-ball/config.json` | 修改 sttScript 指向主项目脚本 |

---

## 🔄 重启后继续的 Prompt

```
继续调试 floating-ball 的 STT 功能。

当前状态:
- 点击和 IPC 通信正常 ✅
- 焦点处理正常 ✅
- 但录音时间太短，转录未完成就被终止

待验证:
1. 用户是否按住悬浮球足够长时间（3-5秒）
2. 完整录音后的转录结果

日志文件: floating-ball/logs/app.log
配置文件: floating-ball/config.json (已指向 ../src/scripts/stt.py)

请用户按住悬浮球更长时间测试，然后检查日志中的转录结果。
```

---

## 📝 使用方法

1. **按住**悬浮球（会变红表示正在录音）
2. **开始说话**（可以说 2-5 秒）
3. 说完后**释放**悬浮球（变黄表示正在处理）
4. **等待** 1.5s 静音检测 + 转录时间
5. 悬浮球变绿表示成功，文字自动插入到光标位置

**注意:**
- 第一次使用 whisper 后端需要几秒钟加载模型
- 释放按钮后不要立即点击其他地方，等待转录完成
- 如果 60s 内没有完成，进程会自动终止
