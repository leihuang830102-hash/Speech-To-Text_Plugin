# Floating Ball Debug Session - 2026-03-14

## 问题描述
悬浮球 STT 功能：按住录音，释放后没有文字输出到光标处。

## 调试过程

### 阶段1：初步调查
1. 检查日志发现 Python 转录成功，但文字插入失败
2. 错误信息：`Cannot find module './build/Release/robotjs.node'`
3. **问题**：robotjs 原生模块未正确编译

### 阶段2：修复文字插入
1. 尝试 `npm rebuild robotjs` → 失败（需要 Visual Studio）
2. 改用 `@nut-tree/nut-js` 替代 robotjs
3. 文字插入成功，但用户反馈没有文字输出

### 阶段3：发现时序问题
检查日志发现：
```
16:51:10 - Inserting text...
16:51:15 - Text inserted successfully
16:51:15 - Focus returned to previous application  ← 焦点返回太晚！
```
**问题**：文字在焦点返回之前插入，所以打到了 Electron 窗口而不是目标应用。

**修复**：调整顺序，先返回焦点，再插入文字。

### 阶段4：发现 Python 启动延迟
检查日志发现：
```
16:56:24 - Python 启动
16:56:27 - Python 真正开始录音 (3.5秒后!)
16:56:28 - 用户释放 (只录了 0.4 秒)
```
**问题**：Python 启动需要 ~4 秒，用户释放时录音才刚开始。

### 阶段5：交互模型重设计
1. 添加 "warming" 状态（橙色快闪）表示 Python 正在启动
2. 检测 Python stderr "Recording..." 后才切换到 "recording" 状态（红色）
3. 用户看到红色后再说话

### 阶段6：解决交互冲突
**问题**：`-webkit-app-region: drag` 与点击事件冲突

**解决方案**：
- 外圈：可拖动（`-webkit-app-region: drag`）
- 内圈图标：可点击（`-webkit-app-region: no-drag`）

### 阶段7：优化文字插入速度
**问题**：`keyboard.type()` 逐字符输入太慢

**解决方案**：使用剪贴板 + Ctrl+V 粘贴
```javascript
clipboard.writeText(text);
await keyboard.pressKey(Key.LeftControl, Key.V);
await keyboard.releaseKey(Key.LeftControl, Key.V);
```

## 最终方案

### 状态机
```
idle (蓝) → warming (橙快闪) → recording (红) → processing (橙旋转) → success (绿) → idle
```

### 交互模型
| 区域 | 操作 | 效果 |
|------|------|------|
| 外圈 | 拖动 | 移动窗口 |
| 内圈图标 | 按住 | warming → recording |
| 内圈图标 | 释放 | processing → 文字插入 |

### 关键代码改动
1. `main.js`：添加 warming 状态检测，调整焦点返回时序
2. `renderer.js`：分离拖动和点击区域
3. `styles.css`：添加 warming 状态样式
4. `index.html`：分离拖动区域和点击按钮

## 学到的教训
1. Python 启动时间不可忽略，需要视觉反馈
2. 焦点管理要在文字插入之前
3. Electron 的 `-webkit-app-region: drag` 会拦截鼠标事件
4. 剪贴板粘贴比逐字符输入快得多
