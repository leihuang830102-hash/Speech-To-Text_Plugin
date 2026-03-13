// tests/integration/python.test.js
/**
 * Python Process Lifecycle Integration Tests
 *
 * Tests that the Electron app can correctly find and communicate with
 * the Python STT backend process.
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to floating-ball root directory
const floatingBallRoot = path.resolve(__dirname, '../..');

// 5 second safety timeout in case error event never fires
const SAFETY_TIMEOUT = 5000;

describe('Python Process Lifecycle', () => {
  it('should find Python executable', async () => {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', ['--version']);
      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        try {
          expect(code).toBe(0);
          const output = stdout + stderr;
          expect(output).toContain('Python 3');
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      pythonProcess.on('error', (error) => {
        reject(error);
      });
    });
  });

  it('should find STT script', () => {
    const sttScriptPath = path.join(floatingBallRoot, 'stt', 'stt.py');
    expect(fs.existsSync(sttScriptPath)).toBe(true);
  });

  it('should execute STT script with --help flag', async () => {
    return new Promise((resolve, reject) => {
      const sttScriptPath = path.join(floatingBallRoot, 'stt', 'stt.py');
      const pythonProcess = spawn('python', [sttScriptPath, '--help']);
      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for STT script --help'));
      }, SAFETY_TIMEOUT);

      pythonProcess.on('close', (code) => {
        clearTimeout(timeout);
        try {
          expect(code).toBe(0);
          // Verify the script ran and showed help text
          expect(stdout).toContain('Speech-to-Text');
          expect(stdout).toContain('--backend');
          expect(stdout).toContain('--check');
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      pythonProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  it('should handle invalid Python path gracefully', async () => {
    const errorPromise = new Promise((resolve, reject) => {
      const pythonProcess = spawn('nonexistent_python_xyz123', ['--version']);

      pythonProcess.on('error', (error) => {
        resolve(error);
      });

      pythonProcess.on('close', (code) => {
        // On some platforms, close fires without error event
        reject(new Error(`Process closed with code ${code} instead of error`));
      });
    });

    const timeoutPromise = new Promise((_, reject) => {
      // 5 second safety timeout in case error event never fires
      setTimeout(() => {
        reject(new Error('Timeout waiting for error'));
      }, SAFETY_TIMEOUT);
    });

    const error = await Promise.race([errorPromise, timeoutPromise]);
    expect(error.code).toBe('ENOENT');
  });

  it('should parse valid JSON output', () => {
    const fixturePath = path.join(__dirname, '../fixtures/test-output.json');
    const jsonContent = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(jsonContent);

    expect(parsed).toHaveProperty('success');
    expect(parsed).toHaveProperty('text');
    expect(parsed).toHaveProperty('backend');
    expect(parsed).toHaveProperty('model');
    expect(parsed.success).toBe(true);
    expect(parsed.text).toBe('Hello world');
    expect(parsed.backend).toBe('test');
    expect(parsed.model).toBe('tiny');
  });

  it('should parse error JSON output', () => {
    const fixturePath = path.join(__dirname, '../fixtures/test-output-error.json');
    const jsonContent = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(jsonContent);

    expect(parsed).toHaveProperty('success');
    expect(parsed).toHaveProperty('error');
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Test error message');
  });

  it('should handle malformed JSON output', () => {
    const malformedJson = '{"success": true, "text": "missing closing brace';

    expect(() => {
      JSON.parse(malformedJson);
    }).toThrow();
  });
});
