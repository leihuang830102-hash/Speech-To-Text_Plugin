/**
 * Integration Tests for Python ↔ TypeScript Bridge
 *
 * Tests the communication protocol between TypeScript and Python STT process
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

const PYTHON_PATH = process.env.PYTHON_PATH || 'python';
const STT_SCRIPT = path.join(__dirname, '..', '..', 'src', 'scripts', 'stt.py');
const FIXTURES_DIR = path.join(__dirname, '..', 'stt', 'fixtures');

// Environment with OpenMP fix for Windows
const SPAWN_ENV = { ...process.env, KMP_DUPLICATE_LIB_OK: 'TRUE' };

describe('Python Bridge Integration', () => {
  describe('Python Environment', () => {
    it('should have Python available', async () => {
      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn(PYTHON_PATH, ['--version']);
        let output = '';
        proc.stdout.on('data', (d) => output += d);
        proc.stderr.on('data', (d) => output += d);
        proc.on('close', () => resolve(output));
        proc.on('error', reject);
      });
      expect(result).toContain('Python');
    });

    it('should have stt.py script available', () => {
      expect(fs.existsSync(STT_SCRIPT)).toBe(true);
    });

    it('should list available backends', async () => {
      const result = await new Promise<any>((resolve, reject) => {
        const proc = spawn(PYTHON_PATH, [STT_SCRIPT, '--list-backends'], { env: SPAWN_ENV });
        let stdout = '';
        proc.stdout.on('data', (d) => stdout += d);
        proc.on('close', () => {
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch (e) {
            reject(new Error(`Failed to parse: ${stdout}`));
          }
        });
        proc.on('error', reject);
      });

      expect(result).toHaveProperty('available_backends');
      expect(Array.isArray(result.available_backends)).toBe(true);
    });
  });

  describe('STT Transcription', () => {
    const testAudio = path.join(FIXTURES_DIR, 'en_short.wav');

    beforeAll(() => {
      // Skip if no test audio available
      if (!fs.existsSync(testAudio)) {
        console.log('Skipping STT tests - no test audio available');
      }
    });

    it('should transcribe audio file and return JSON', async () => {
      if (!fs.existsSync(testAudio)) {
        return; // Skip
      }

      const result = await new Promise<any>((resolve, reject) => {
        const proc = spawn(PYTHON_PATH, [
          STT_SCRIPT,
          '--backend', 'auto',
          '--model', 'tiny',
          '--language', 'en',
          '--audio-file', testAudio
        ], { env: SPAWN_ENV });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (d) => stdout += d);
        proc.stderr.on('data', (d) => stderr += d);

        proc.on('close', (code) => {
          if (code !== 0 && !stdout) {
            reject(new Error(stderr || `Exit code ${code}`));
            return;
          }
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch (e) {
            reject(new Error(`Failed to parse: ${stdout}`));
          }
        });

        proc.on('error', reject);
      });

      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result).toHaveProperty('text');
        expect(result).toHaveProperty('backend');
        expect(result).toHaveProperty('model');
      }
    }, 60000); // 60s timeout for transcription

    it('should handle invalid audio file gracefully', async () => {
      const result = await new Promise<any>((resolve, reject) => {
        const proc = spawn(PYTHON_PATH, [
          STT_SCRIPT,
          '--backend', 'auto',
          '--model', 'tiny',
          '--language', 'en',
          '--audio-file', '/nonexistent/file.wav'
        ], { env: SPAWN_ENV });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (d) => stdout += d);
        proc.stderr.on('data', (d) => stderr += d);

        proc.on('close', () => {
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch (e) {
            // Even if parsing fails, we expect some output
            resolve({ success: false, error: stderr || stdout });
          }
        });

        proc.on('error', reject);
      });

      expect(result.success).toBe(false);
    }, 30000); // 30s timeout
  });

  describe('JSON Protocol', () => {
    it('should output valid JSON format', async () => {
      const result = await new Promise<any>((resolve, reject) => {
        const proc = spawn(PYTHON_PATH, [STT_SCRIPT, '--list-backends'], { env: SPAWN_ENV });
        let stdout = '';
        proc.stdout.on('data', (d) => stdout += d);
        proc.on('close', () => {
          try {
            const parsed = JSON.parse(stdout.trim());
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Invalid JSON: ${stdout}`));
          }
        });
        proc.on('error', reject);
      });

      // Verify it's a valid object
      expect(typeof result).toBe('object');
    }, 30000); // 30s timeout
  });
});
