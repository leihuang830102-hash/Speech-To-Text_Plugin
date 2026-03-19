/**
 * Unit tests for backend switching functionality
 * Covers: FR-010 (Backend Switch), FR-011 (Backend Persistence)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Backend Manager implementation
class BackendConfigManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.availableBackends = ['doubao-cloud', 'whisper', 'faster-whisper'];
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (e) {
      // Ignore errors
    }
    return { stt: { backend: 'whisper' } };
  }

  saveConfig() {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  getCurrentBackend() {
    return this.config.stt?.backend || 'whisper';
  }

  switchBackend(newBackend) {
    if (!this.availableBackends.includes(newBackend)) {
      return { success: false, error: `Unknown backend: ${newBackend}` };
    }

    const oldBackend = this.getCurrentBackend();
    this.config.stt = this.config.stt || {};
    this.config.stt.backend = newBackend;
    this.saveConfig();

    return { success: true, oldBackend, newBackend };
  }

  isBackendAvailable(backend) {
    return this.availableBackends.includes(backend);
  }

  addAvailableBackend(backend) {
    if (!this.availableBackends.includes(backend)) {
      this.availableBackends.push(backend);
    }
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('BackendConfigManager', () => {
  let manager;
  let testDir;
  let testFile;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), 'opentts-backend-test-' + Date.now());
    testFile = path.join(testDir, 'config.json');
    manager = new BackendConfigManager(testFile);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('FR-010: Backend Switch', () => {
    it('should switch from whisper to doubao-cloud', () => {
      // First set to whisper
      manager.config.stt = { backend: 'whisper' };
      manager.saveConfig();

      const result = manager.switchBackend('doubao-cloud');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.oldBackend, 'whisper');
      assert.strictEqual(result.newBackend, 'doubao-cloud');
      assert.strictEqual(manager.getCurrentBackend(), 'doubao-cloud');
    });

    it('should reject unknown backend', () => {
      const result = manager.switchBackend('unknown-backend');

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Unknown backend'));
    });

    it('should switch between available backends', () => {
      manager.switchBackend('whisper');
      assert.strictEqual(manager.getCurrentBackend(), 'whisper');

      manager.switchBackend('doubao-cloud');
      assert.strictEqual(manager.getCurrentBackend(), 'doubao-cloud');

      manager.switchBackend('faster-whisper');
      assert.strictEqual(manager.getCurrentBackend(), 'faster-whisper');
    });

    it('should check if backend is available', () => {
      assert.strictEqual(manager.isBackendAvailable('whisper'), true);
      assert.strictEqual(manager.isBackendAvailable('doubao-cloud'), true);
      assert.strictEqual(manager.isBackendAvailable('unknown'), false);
    });
  });

  describe('FR-011: Backend Persistence', () => {
    it('should persist backend choice to file', () => {
      manager.switchBackend('doubao-cloud');

      // Read file directly
      const data = fs.readFileSync(testFile, 'utf8');
      const config = JSON.parse(data);

      assert.strictEqual(config.stt.backend, 'doubao-cloud');
    });

    it('should load persisted backend on startup', () => {
      // Save initial config
      manager.switchBackend('doubao-cloud');

      // Create new manager to simulate app restart
      const newManager = new BackendConfigManager(testFile);

      assert.strictEqual(newManager.getCurrentBackend(), 'doubao-cloud');
    });

    it('should default to whisper if no config exists', () => {
      const newManager = new BackendConfigManager(path.join(testDir, 'nonexistent.json'));
      assert.strictEqual(newManager.getCurrentBackend(), 'whisper');
    });

    it('should handle corrupted config file gracefully', () => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFile, 'invalid json {{{');

      const newManager = new BackendConfigManager(testFile);
      // Should fall back to default
      assert.strictEqual(newManager.getCurrentBackend(), 'whisper');
    });

    it('should maintain other config when switching backend', () => {
      manager.config.stt = {
        backend: 'whisper',
        modelSize: 'small',
        language: 'zh'
      };
      manager.saveConfig();

      manager.switchBackend('doubao-cloud');

      // Reload to verify
      const newManager = new BackendConfigManager(testFile);
      assert.strictEqual(newManager.config.stt.backend, 'doubao-cloud');
      assert.strictEqual(newManager.config.stt.modelSize, 'small');
      assert.strictEqual(newManager.config.stt.language, 'zh');
    });
  });
});
