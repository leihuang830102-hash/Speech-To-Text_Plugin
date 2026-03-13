// tests/integration/stt.test.js
import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Environment with OpenMP fix for Windows
const SPAWN_ENV = { ...process.env, KMP_DUPLICATE_LIB_OK: 'TRUE' };

describe('STT Integration', () => {
  const sttScript = path.join(__dirname, '../../src/scripts/stt.py');

  it('should list available backends and return JSON', async () => {
    const result = await runPython(sttScript, ['--list-backends']);
    expect(result).toHaveProperty('available_backends');
    expect(Array.isArray(result.available_backends)).toBe(true);
  });

  it('should return valid JSON structure for list-backends', async () => {
    const result = await runPython(sttScript, ['--list-backends']);
    expect(result).toHaveProperty('available_backends');
    expect(Array.isArray(result.available_backends)).toBe(true);
  });

  it('should handle invalid audio file gracefully', async () => {
    const result = await runPython(sttScript, [
      '--backend', 'auto',
      '--model', 'tiny',
      '--language', 'en',
      '--audio-file', '/nonexistent/file.wav'
    ]);

    expect(result.success).toBe(false);
    expect(result).toHaveProperty('error');
  }, 30000); // 30s timeout
});

function runPython(script, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', [script, ...args], { env: SPAWN_ENV });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => stdout += data);
    proc.stderr.on('data', (data) => stderr += data);

    proc.on('close', (code) => {
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse output: ${stdout}\nstderr: ${stderr}`));
      }
    });

    proc.on('error', reject);

    // Timeout after 30s for transcription operations
    setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout'));
    }, 30000);
  });
}
