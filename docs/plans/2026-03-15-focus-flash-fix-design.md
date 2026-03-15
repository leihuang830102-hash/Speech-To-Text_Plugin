# Focus Flash Fix Design Document

> 创建日期: 2026-03-15
> 状态: 已批准
> 分支: feature/stt-improvements

## 1. 问题描述

### 1.1 现象

录音转写完成后，使用 Alt+Tab 恢复焦点时，Windows 会短暂显示任务切换界面，所有打开的窗口会闪烁一下。

### 1.2 影响

- 严重影响用户体验
- 频繁使用时干扰工作流程
- 视觉上的不专业感

### 1.3 当前实现

```javascript
// main.js:464-486
async function returnFocusToPreviousApp() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (process.platform === 'win32') {
      mainWindow.hide();
      // Alt+Tab causes flash!
      await keyboard.pressKey(Key.LeftAlt, Key.Tab);
      await keyboard.releaseKey(Key.LeftAlt, Key.Tab);
    }
  }
}
```

---

## 2. 解决方案

### 2.1 核心思路

**让悬浮球窗口永远不获取焦点**。如果从未夺取焦点，就不需要恢复焦点，从而彻底消除闪烁问题。

### 2.2 技术实现

在 Electron BrowserWindow 配置中添加 `focusable: false`：

```javascript
mainWindow = new BrowserWindow({
  width: config.window.width,
  height: config.window.height,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  hasShadow: false,
  focusable: false,  // 新增：窗口不获取焦点
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
});
```

### 2.3 鼠标事件兼容性

`focusable: false` 只阻止**键盘焦点**，不影响鼠标事件：

| 事件类型 | 状态 |
|----------|------|
| mousedown | ✅ 正常 |
| mouseup | ✅ 正常 |
| click | ✅ 正常 |
| mousemove | ✅ 正常 |
| 拖拽 | ✅ 正常 |
| 键盘输入 | ❌ 阻止（预期行为） |

悬浮球的"按下开始录音，松开停止录音"交互逻辑完全不受影响。

---

## 3. 行为对比

### 3.1 当前流程（有闪烁）

```
点击悬浮球 → 悬浮球获取焦点 → 开始录音 → 隐藏窗口 → Alt+Tab → 闪烁！ → 插入文本
```

### 3.2 新流程（无闪烁）

```
点击悬浮球 → 原应用保持焦点 → 开始录音 → 直接插入文本
```

---

## 4. 代码变更

### 4.1 main.js

| 变更 | 位置 | 描述 |
|------|------|------|
| 添加 `focusable: false` | `createWindow()` ~L155 | 窗口永不获取焦点 |
| 简化 `returnFocusToPreviousApp()` | ~L464 | 移除 Alt+Tab 逻辑，改为空操作 |
| 移除 `mainWindow.hide()` | ~L469 | 不再需要隐藏窗口 |
| 保留 `restoreWindow()` | ~L488 | 保留以备边缘情况 |

### 4.2 简化后的函数

```javascript
async function returnFocusToPreviousApp() {
  // No-op: 窗口设置为 focusable: false，从未获取焦点
  // 保留此函数以维持 API 兼容性
  log('DEBUG', 'main', 'Focus management: no-op (focusable: false)');
}

function restoreWindow() {
  // 可能仍需要处理某些边缘情况
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    mainWindow.show();
  }
}
```

---

## 5. 边缘情况

| 场景 | 行为 |
|------|------|
| 快速点击悬浮球 | 正常工作 - 鼠标事件正常触发 |
| 拖拽悬浮球 | 正常工作 - 拖拽不需要焦点 |
| 录音时用户输入 | 输入到原应用（预期行为） |
| 文本插入 (Ctrl+V) | 正常工作 - 剪贴板 API 不需要窗口焦点 |
| macOS / Linux | 不受影响 - 使用原有的 `blur()` 逻辑 |

---

## 6. 测试计划

### 6.1 功能测试

- [x] 点击悬浮球开始/停止录音
- [x] 拖拽悬浮球移动位置
- [ ] 转写完成后文本正确插入到原应用（待修复）
- [x] 焦点始终保持在原应用
- [x] 无可见闪烁

### 6.2 平台测试

- [x] Windows 10/11
- [ ] macOS (可选)
- [ ] Linux (可选)

---

## 7. 实施状态 (2026-03-15)

| 问题 | 状态 | 备注 |
|------|------|------|
| Alt+Tab 窗口闪烁 | ✅ 已解决 | 通过 `focusable: false` 实现 |
| 文本插入到目标窗口 | ⏳ 待修复 | 剪贴板 + Ctrl+V 方案不稳定 |

---

## 7. 相关文档

- 原始设计: `docs/plans/2026-03-13-floating-ball-design.md`
- STT 优化: `docs/plans/2026-03-15-stt-optimization-design.md`
- 调试记录: `memory/MEMORY.md`
