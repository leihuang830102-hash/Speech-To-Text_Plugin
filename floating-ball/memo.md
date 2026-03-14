# Floating Ball 开发备忘录

## 2026-03-14 状态

### 已修复问题

#### 1. 中文输出繁简转换 ✅
- **问题**: Whisper 转录输出繁体中文字符
- **解决**: 在 `stt/utils.py` 添加 `to_simplified_chinese()` 函数，使用 `zhconv` 库转换
- **文件**: `src/scripts/stt/utils.py`, `src/scripts/stt/backends/manager.py`

#### 2. Windows 焦点返回 ✅ (有已知限制)
- **问题**: 转录完成后，光标不返回到之前的应用窗口
- **解决**: 使用 `hide()` + `Alt+Tab` 模拟
- **文件**: `floating-ball/main.js` - `returnFocusToPreviousApp()`
- **已知限制**: Alt+Tab 会短暂显示 Windows 任务切换界面，有闪烁感

### 已知问题

#### 焦点返回闪烁
- **原因**: 使用 `Alt+Tab` 模拟切换窗口
- **表现**: Windows 会短暂显示任务切换界面（所有打开窗口的缩略图）
- **可能改进方案**:
  1. 使用 Windows API `SetForegroundWindow` + `AttachThreadInput`（需要更复杂的实现）
  2. 保存窗口句柄后直接调用 Windows API
  3. 使用第三方工具如 `nircmd`

### 拖拽问题修复
- **问题**: 拖拽时出现两个悬浮球（重影）
- **解决**: 添加 `hasShadow: false` 到 BrowserWindow 配置
- **文件**: `floating-ball/main.js`

## 技术细节

### 焦点返回流程
```javascript
async function returnFocusToPreviousApp() {
  if (process.platform === 'win32') {
    mainWindow.hide();  // 隐藏窗口
    // 模拟 Alt+Tab 切换到上一个应用
    await keyboard.pressKey(Key.LeftAlt, Key.Tab);
    await keyboard.releaseKey(Key.LeftAlt, Key.Tab);
  }
}
```

### 尝试过但失败的方案
1. `mainWindow.blur()` - Windows 上不可靠
2. PowerShell + `SetForegroundWindow` - 启动太慢，超时
3. `GetForegroundWindow` + `SetForegroundWindow` + `AttachThreadInput` - PowerShell 超时

## 配置

### WebSocket 模式
- 服务端: `ws://127.0.0.1:8765`
- 启用后无需预热，模型已加载

### 依赖
- `@nut-tree/nut-js`: 键盘模拟（Alt+Tab, Ctrl+V）
- `zhconv`: 繁简转换
- `sounddevice`: Python 音频录制
