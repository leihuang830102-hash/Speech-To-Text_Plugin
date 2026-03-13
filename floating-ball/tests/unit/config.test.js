// tests/unit/config.test.js
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import { loadConfig, getDefaultConfig } from '../../config-loader.js';

describe('Config Loader', () => {
  const testConfigPath = './test-config.json';

  afterEach(() => {
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  it('should load valid config file', () => {
    const config = {
      python: { path: 'python3', sttScript: './stt.py' },
      stt: { backend: 'whisper', modelSize: 'base' }
    };
    fs.writeFileSync(testConfigPath, JSON.stringify(config));

    const loaded = loadConfig(testConfigPath);
    expect(loaded.python.path).toBe('python3');
    expect(loaded.stt.backend).toBe('whisper');
  });

  it('should merge with defaults for missing fields', () => {
    const partialConfig = { python: { path: 'python' } };
    fs.writeFileSync(testConfigPath, JSON.stringify(partialConfig));

    const loaded = loadConfig(testConfigPath);
    expect(loaded.stt.backend).toBe('auto'); // default
    expect(loaded.stt.language).toBe('zh'); // default
  });

  it('should return defaults when file not found', () => {
    const loaded = loadConfig('./nonexistent.json');
    const defaults = getDefaultConfig();
    expect(loaded).toEqual(defaults);
  });

  it('should validate window dimensions', () => {
    const config = { window: { width: 0, height: 60 } };
    fs.writeFileSync(testConfigPath, JSON.stringify(config));

    const loaded = loadConfig(testConfigPath);
    expect(loaded.window.width).toBe(60); // reset to default
  });
});
