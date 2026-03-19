/**
 * Unit tests for position memory functionality
 * Covers: FR-004 (Position Memory)
 *
 * Tests the window position persistence across sessions
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Position Manager implementation
class PositionManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.defaultPosition = { x: 100, y: 100 };
  }

  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const pos = JSON.parse(data);
        // Validate position is within screen bounds
        if (typeof pos.x === 'number' && typeof pos.y === 'number') {
          return { x: pos.x, y: pos.y };
        }
      }
    } catch (e) {
      // Ignore parse errors, return default
    }
    return { ...this.defaultPosition };
  }

  save(position) {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(position));
  }

  clear() {
    if (fs.existsSync(this.configPath)) {
      fs.unlinkSync(this.configPath);
    }
  }

  isInBounds(position, bounds) {
    return position.x >= 0 &&
           position.y >= 0 &&
           position.x < bounds.width &&
           position.y < bounds.height;
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('PositionManager', () => {
  let positionManager;
  let testDir;
  let testFile;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), 'opentts-test-' + Date.now());
    testFile = path.join(testDir, 'position.json');
    positionManager = new PositionManager(testFile);
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('FR-004: Position Memory', () => {
    it('should return default position when no saved position exists', () => {
      const pos = positionManager.load();
      assert.deepStrictEqual(pos, { x: 100, y: 100 });
    });

    it('should save and load position', () => {
      positionManager.save({ x: 500, y: 300 });

      const pos = positionManager.load();
      assert.deepStrictEqual(pos, { x: 500, y: 300 });
    });

    it('should persist position across multiple loads', () => {
      positionManager.save({ x: 250, y: 150 });

      // Create new manager to simulate app restart
      const newManager = new PositionManager(testFile);
      const pos = newManager.load();

      assert.deepStrictEqual(pos, { x: 250, y: 150 });
    });

    it('should return default for corrupted JSON', () => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFile, 'not valid json');

      const pos = positionManager.load();
      assert.deepStrictEqual(pos, { x: 100, y: 100 });
    });

    it('should return default for invalid position format', () => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFile, JSON.stringify({ x: 'invalid', y: 200 }));

      const pos = positionManager.load();
      assert.deepStrictEqual(pos, { x: 100, y: 100 });
    });

    it('should clear saved position', () => {
      positionManager.save({ x: 400, y: 200 });
      assert.strictEqual(fs.existsSync(testFile), true);

      positionManager.clear();

      assert.strictEqual(fs.existsSync(testFile), false);
    });

    it('should validate position within screen bounds', () => {
      const bounds = { width: 1920, height: 1080 };

      assert.strictEqual(positionManager.isInBounds({ x: 100, y: 100 }, bounds), true);
      assert.strictEqual(positionManager.isInBounds({ x: 500, y: 500 }, bounds), true);
      assert.strictEqual(positionManager.isInBounds({ x: -10, y: 100 }, bounds), false);
      assert.strictEqual(positionManager.isInBounds({ x: 100, y: -10 }, bounds), false);
      assert.strictEqual(positionManager.isInBounds({ x: 2000, y: 100 }, bounds), false);
    });

    it('should create directory if not exists', () => {
      const nestedFile = path.join(testDir, 'nested', 'deep', 'position.json');
      const nestedManager = new PositionManager(nestedFile);

      nestedManager.save({ x: 100, y: 200 });

      assert.strictEqual(fs.existsSync(nestedFile), true);
    });
  });
});
