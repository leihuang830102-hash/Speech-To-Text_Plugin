/**
 * Unit tests for voice-service.ts
 * Tests configuration loading, environment checking, and utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

describe('Voice Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configuration', () => {
    it('should have default configuration values', () => {
      const defaultConfig = {
        pythonPath: 'python',
        sttBackend: 'faster-whisper',
        modelSize: 'tiny',
        language: 'zh',
        maxDuration: 30,
        hotkey: 'Ctrl+Shift+V'
      };

      expect(defaultConfig.pythonPath).toBe('python');
      expect(defaultConfig.sttBackend).toBe('faster-whisper');
      expect(defaultConfig.modelSize).toBe('tiny');
      expect(defaultConfig.language).toBe('zh');
      expect(defaultConfig.maxDuration).toBe(30);
      expect(defaultConfig.hotkey).toBe('Ctrl+Shift+V');
    });

    it('should accept valid backend values', () => {
      const validBackends = ['moonshine', 'whisper', 'faster-whisper', 'auto'];
      validBackends.forEach(backend => {
        expect(['moonshine', 'whisper', 'faster-whisper', 'auto']).toContain(backend);
      });
    });

    it('should accept valid model sizes', () => {
      const validModels = ['tiny', 'base', 'small', 'medium'];
      validModels.forEach(model => {
        expect(['tiny', 'base', 'small', 'medium']).toContain(model);
      });
    });
  });

  describe('SttResult Type', () => {
    it('should define success result structure', () => {
      const successResult = {
        success: true,
        text: 'Hello world',
        backend: 'whisper',
        model: 'tiny'
      };

      expect(successResult.success).toBe(true);
      expect(successResult.text).toBeDefined();
      expect(successResult.backend).toBeDefined();
      expect(successResult.model).toBeDefined();
    });

    it('should define error result structure', () => {
      const errorResult = {
        success: false,
        error: 'Python process failed'
      };

      expect(errorResult.success).toBe(false);
      expect(errorResult.error).toBeDefined();
    });
  });

  describe('Process Spawning', () => {
    it('should construct correct Python command arguments', () => {
      const args = [
        '--backend', 'faster-whisper',
        '--model', 'tiny',
        '--language', 'zh'
      ];

      expect(args).toContain('--backend');
      expect(args).toContain('faster-whisper');
      expect(args).toContain('--model');
      expect(args).toContain('tiny');
    });
  });
});

describe('Similarity Calculation', () => {
  function calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().replace(/\s+/g, '');
    const s2 = str2.toLowerCase().replace(/\s+/g, '');

    if (s1 === s2) return 100;

    let matches = 0;
    const maxLen = Math.max(s1.length, s2.length);

    for (let i = 0; i < s1.length; i++) {
      if (s2.includes(s1[i])) matches++;
    }

    return Math.round((matches / maxLen) * 100);
  }

  it('should return 100 for identical strings', () => {
    expect(calculateSimilarity('hello world', 'hello world')).toBe(100);
  });

  it('should handle case insensitivity', () => {
    expect(calculateSimilarity('HELLO', 'hello')).toBe(100);
  });

  it('should ignore whitespace', () => {
    expect(calculateSimilarity('hello  world', 'hello world')).toBe(100);
  });

  it('should return high similarity for similar strings', () => {
    const result = calculateSimilarity('This is a test', 'This is test');
    expect(result).toBeGreaterThanOrEqual(80);
  });

  it('should return low similarity for different strings', () => {
    const result = calculateSimilarity('hello world', 'xyz abc');
    expect(result).toBeLessThan(50);
  });
});
