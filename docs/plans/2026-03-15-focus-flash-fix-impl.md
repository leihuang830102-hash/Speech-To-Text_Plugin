# Focus Flash Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate Alt+Tab window flash by configuring floating ball to never take focus.

**Architecture:** Add `focusable: false` to Electron BrowserWindow, simplify focus restoration logic to no-op, update documentation.

**Tech Stack:** Electron, Node.js, Vitest (for testing)

---

## Task 1: Write Test for Focus-Free Window Configuration

**Files:**
- Create: `floating-ball/tests/focus.test.js`
- Modify: N/A

**Step 1: Create test file with failing test**

```javascript
// floating-ball/tests/focus.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Test: BrowserWindow should have focusable: false
 *
 * This test verifies that the floating ball window is configured
 * to never take focus, preventing Alt+Tab flash on Windows.
 */

describe('Floating Ball Focus Configuration', () => {
  it('should have focusable set to false in window options', () => {
    // Read main.js and check for focusable: false
    const fs = require('fs');
    const path = require('path');
    const mainPath = path.join(__dirname, '..', 'main.js');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');

    // Check that focusable: false is present in BrowserWindow options
    expect(mainContent).toMatch(/focusable:\s*false/);
  });

  it('should not contain Alt+Tab keyboard simulation', () => {
    const fs = require('fs');
    const path = require('path');
    const mainPath = path.join(__dirname, '..', 'main.js');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');

    // Alt+Tab should be removed to prevent flash
    expect(mainContent).not.toMatch(/Key\.Tab/);
    expect(mainContent).not.toMatch(/LeftAlt.*Tab|Tab.*LeftAlt/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd floating-ball && npm test -- tests/focus.test.js`
Expected: FAIL - focusable: false not found, Alt+Tab still present

**Step 3: Commit test file**

```bash
git add floating-ball/tests/focus.test.js
git commit -m "test: add failing tests for focus-free window configuration"
```

---

## Task 2: Implement focusable: false in createWindow

**Files:**
- Modify: `floating-ball/main.js:155-169`

**Step 1: Add focusable: false to BrowserWindow options**

Find the `createWindow()` function and add `focusable: false`:

```javascript
// floating-ball/main.js - createWindow function
// Around line 155-169

mainWindow = new BrowserWindow({
  width: config.window.width,
  height: config.window.height,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  hasShadow: false,
  focusable: false,  // ADD THIS LINE - window never takes focus
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
});
```

**Step 2: Run test to verify focusable: false is detected**

Run: `cd floating-ball && npm test -- tests/focus.test.js`
Expected: First test PASSES, second test still FAILS (Alt+Tab present)

**Step 3: Commit**

```bash
git add floating-ball/main.js
git commit -m "feat: add focusable: false to prevent window from taking focus"
```

---

## Task 3: Remove Alt+Tab Logic and Simplify Focus Restoration

**Files:**
- Modify: `floating-ball/main.js:464-486`

**Step 1: Simplify returnFocusToPreviousApp function**

Replace the entire `returnFocusToPreviousApp` function:

```javascript
// floating-ball/main.js - around line 464-486
// REPLACE the entire function with:

async function returnFocusToPreviousApp() {
  // No-op: window is configured with focusable: false, so it never took focus
  // This eliminates the need for Alt+Tab which caused window flash on Windows
  log('DEBUG', 'main', 'Focus management: no-op (focusable: false)');
}
```

**Step 2: Run test to verify Alt+Tab is removed**

Run: `cd floating-ball && npm test -- tests/focus.test.js`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add floating-ball/main.js
git commit -m "fix: remove Alt+Tab flash by simplifying focus restoration to no-op"
```

---

## Task 4: Clean Up Unused Imports

**Files:**
- Modify: `floating-ball/main.js:1-10`

**Step 1: Remove unused nut-js import if no longer needed**

Check if `@nut-tree/nut-js` is still used elsewhere in main.js. If only used for Alt+Tab, the import in `insertText` function still uses it for Ctrl+V, so keep it.

**Step 2: Verify no unused code remains**

Run: `cd floating-ball && npm run lint 2>/dev/null || echo "No lint configured"`
Expected: No errors or warnings about unused imports

**Step 3: Commit if changes made**

```bash
git add floating-ball/main.js
git commit -m "refactor: clean up unused code after focus fix"
```

---

## Task 5: Manual Integration Test

**Files:**
- N/A (manual testing)

**Step 1: Start the floating ball app**

Run: `cd floating-ball && npm start`

**Step 2: Verify behavior**

1. Open a text editor (Notepad, VS Code, etc.)
2. Click the floating ball to start recording
3. Verify: Text editor KEEPS focus (cursor still visible)
4. Speak something
5. Release to stop recording
6. Verify: Transcribed text appears in text editor WITHOUT any window flash

**Step 3: Document test results**

Update test file with integration test placeholder:

```javascript
// Add to floating-ball/tests/focus.test.js

describe('Integration: Focus-Free Behavior', () => {
  it.skip('should keep focus on original app during recording', () => {
    // Manual test:
    // 1. Open Notepad
    // 2. Click floating ball
    // 3. Verify Notepad still has focus (cursor blinks)
    // This test requires Playwright/nut-js for automation
  });

  it.skip('should insert text without visible flash', () => {
    // Manual test:
    // 1. Record and transcribe
    // 2. Verify no Alt+Tab flash appears
    // This test requires visual verification or screen recording analysis
  });
});
```

**Step 4: Commit test updates**

```bash
git add floating-ball/tests/focus.test.js
git commit -m "test: add integration test placeholders for manual verification"
```

---

## Task 6: Update Documentation

**Files:**
- Modify: `memory/MEMORY.md`
- Modify: `CLAUDE.md` (if needed)

**Step 1: Update memory with fix status**

```markdown
### 问题 3: Alt+Tab 窗口闪烁 ✅ 已修复

**现象**: 使用 Alt+Tab 恢复焦点时，Windows 会短暂显示任务切换界面，所有打开的窗口会闪烁一下。

**解决方案**: 设置 BrowserWindow 的 `focusable: false`，让悬浮球窗口永远不获取焦点。如果从未夺取焦点，就不需要恢复焦点，从而彻底消除闪烁。

**修改的文件**:
1. `floating-ball/main.js` - 添加 `focusable: false`，移除 Alt+Tab 逻辑

**状态**: ✅ 已修复 (2026-03-15)
```

**Step 2: Commit documentation**

```bash
git add memory/MEMORY.md
git commit -m "docs: update memory with Alt+Tab flash fix resolution"
```

---

## Task 7: Run Full Test Suite

**Files:**
- N/A

**Step 1: Run all tests**

Run: `cd floating-ball && npm test`
Expected: All tests PASS

**Step 2: Run project-level tests if available**

Run: `npm run test` (from project root)
Expected: All tests PASS

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| 1 | Write failing tests | ⬜ |
| 2 | Add focusable: false | ⬜ |
| 3 | Remove Alt+Tab logic | ⬜ |
| 4 | Clean up unused code | ⬜ |
| 5 | Manual integration test | ⬜ |
| 6 | Update documentation | ⬜ |
| 7 | Run full test suite | ⬜ |

---

## Next Steps After Completion

1. **Test Doubao ASR/STT** - Integrate cloud-based speech recognition
2. **Update user documentation** - Update docs/user-guide.md if needed
3. **Merge to master** - Create PR or merge feature/stt-improvements branch
