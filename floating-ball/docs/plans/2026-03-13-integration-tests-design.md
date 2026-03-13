# Integration Tests Design

## Overview

为 Floating Ball Electron 应用设计集成测试，使用真实 Electron 环境和 Python STT 后端。

## Requirements

- **运行环境**: 真实 Electron + 真实 Python
- **音频来源**: 实时录音（需用户操作）
- **自动化程度**: 半自动（IPC 测试自动，STT 测试需用户交互）

## Test Structure

```
tests/
├── integration/
│   ├── ipc.test.js             # IPC 通信测试（自动）
│   ├── python.test.js          # Python 进程测试（自动）
│   └── stt-interactive.test.js # STT 交互测试（手动）
├── helpers/
│   ├── electron-launcher.js    # Electron 启动器
│   └── ipc-mock.js             # IPC 测试辅助
└── fixtures/
    └── .gitkeep
```

## Test Cases

### 1. IPC Tests (ipc.test.js)

自动化测试，验证主进程与渲染进程通信。

| 测试用例 | 描述 |
|---------|------|
| `should handle start-recording` | 发送 start-recording，验证状态变为 recording |
| `should handle stop-recording` | 发送 stop-recording，验证状态变为 processing |
| `should emit state-changed` | 验证 state-changed 事件正确发送 |
| `should handle state transitions` | 验证完整状态流转 |

### 2. Python Tests (python.test.js)

自动化测试，验证 Python 进程生命周期。

| 测试用例 | 描述 |
|---------|------|
| `should spawn Python process` | Python 进程能正常启动 |
| `should parse JSON output` | 能正确解析 Python 输出的 JSON |
| `should handle Python errors` | Python 错误时返回 error 状态 |
| `should handle invalid Python path` | 无效路径时正确报错 |
| `should kill Python on stop` | stop-recording 时终止进程 |

### 3. STT Interactive Tests (stt-interactive.test.js)

半自动测试，需用户手动操作。

| 测试用例 | 描述 |
|---------|------|
| `should transcribe speech` | 用户录音后验证转录文本非空 |
| `should insert text via robotjs` | 验证文本能插入到目标位置 |

## Implementation Approach

### Electron Launcher

```javascript
// tests/helpers/electron-launcher.js
const { spawn } = require('child_process');
const path = require('path');

function launchElectron(testEnv = {}) {
  const electronPath = require('electron');
  const appPath = path.join(__dirname, '../../');

  const proc = spawn(electronPath, [appPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',  // 清除干扰变量
      ...testEnv
    }
  });

  return proc;
}

module.exports = { launchElectron };
```

### Test Pattern

```javascript
// tests/integration/ipc.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchElectron } from '../helpers/electron-launcher.js';

describe('IPC Communication', () => {
  let electron;

  beforeAll(() => {
    electron = launchElectron();
  });

  afterAll(() => {
    electron.kill();
  });

  it('should handle start-recording', async () => {
    // 测试逻辑
  });
});
```

## Dependencies

无需额外依赖，使用现有：
- vitest (已安装)
- electron (已安装)

## Running Tests

```bash
# 运行所有集成测试
npm run test:integration

# 运行特定测试
npx vitest run tests/integration/ipc.test.js
```

## Notes

1. **环境变量清理**: 启动脚本已处理 `ELECTRON_RUN_AS_NODE` 干扰
2. **超时设置**: STT 测试需要较长超时（30s+）
3. **并行限制**: Electron 测试不应并行运行
