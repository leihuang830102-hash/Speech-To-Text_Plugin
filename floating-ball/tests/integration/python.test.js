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

  it('should handle invalid Python path gracefully', async () => {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('nonexistent_python_xyz123', ['--version']);
      let errorOccurred = false;

      pythonProcess.on('error', (error) => {
        errorOccurred = true;
        try {
          expect(error.code).toBe('ENOENT');
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      });

      pythonProcess.on('close', (code) => {
        // If we get here without an error event, something unexpected happened
        if (!errorOccurred) {
          reject(new Error(`Expected ENOENT error but process closed with code ${code}`));
        }
      });

      // Set a timeout in case neither event fires
      setTimeout(() => {
        if (!errorOccurred) {
          reject(new Error('Timeout waiting for error'));
        }
      }, 5000);
    });
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

  it('should handle malformed JSON output', () => {
    const malformedJson = '{"success": true, "text": "missing closing brace';

    expect(() => {
      JSON.parse(malformedJson);
    }).toThrow();
  });
});
