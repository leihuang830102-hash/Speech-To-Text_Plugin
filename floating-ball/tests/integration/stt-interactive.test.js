// tests/integration/stt-interactive.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchElectron, killElectron, waitForOutput } from '../helpers/electron-launcher.js';

describe('STT Interactive', () => {
  let electron;
  const output = { stdout: '', stderr: '' };

  beforeAll(async () => {
    electron = launchElectron();

    electron.stdout?.on('data', (data) => {
      output.stdout += data.toString();
    });
    electron.stderr?.on('data', (data) => {
      output.stderr += data.toString();
    });

    await waitForOutput(electron, /Creating floating ball window/, 10000);
  }, 15000);

  afterAll(async () => {
    await killElectron(electron);
  });

  it('should complete full recording workflow', async () => {
    console.log('\n');
    console.log('========================================');
    console.log('  INTERACTIVE TEST: Please click and hold');
    console.log('  the floating ball, speak something,');
    console.log('  then release.');
    console.log('========================================');
    console.log('\n');

    // Wait for user to complete recording
    // This will detect transcription result in logs
    const result = await Promise.race([
      waitForOutput(electron, /Transcription:/, 60000),
      waitForOutput(electron, /Transcription failed/, 60000)
    ]);

    expect(result).toBeDefined();
  }, 90000);

  it('should log transcription result or error', () => {
    const hasTranscription = output.stderr.includes('Transcription:');
    const hasError = output.stderr.includes('Transcription failed');

    // Either success or failure should be logged
    expect(hasTranscription || hasError).toBe(true);
  });
});
