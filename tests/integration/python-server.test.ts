// tests/integration/python-server.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';

// Skip these tests if Python server is not available
const shouldRunIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

describe.skipIf(!shouldRunIntegrationTests)('Python STT Server', () => {
  let serverProcess: ChildProcess | null = null;
  let ws: WebSocket | null = null;

  beforeAll(async () => {
    // Start Python server
    serverProcess = spawn('python', ['src/scripts/stt/server.py'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  afterAll(async () => {
    if (ws) {
      ws.close();
      ws = null;
    }
    if (serverProcess) {
      serverProcess.kill();
      await new Promise<void>(resolve => {
        serverProcess!.on('close', () => resolve());
      });
      serverProcess = null;
    }
  });

  it('should start and accept WebSocket connections', async () => {
    return new Promise<void>((resolve, reject) => {
      ws = new WebSocket('ws://127.0.0.1:8765');

      ws.on('open', () => {
        expect(ws!.readyState).toBe(WebSocket.OPEN);
        resolve();
      });

      ws.on('error', (err) => reject(err));

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  });

  it('should respond to status API', async () => {
    const response = await fetch('http://127.0.0.1:8765/api/status');
    const data = await response.json();

    expect(data.status).toBe('running');
    expect(data.backend).toBeDefined();
    expect(Array.isArray(data.available_backends)).toBe(true);
  });

  it('should handle start/stop recording messages', async () => {
    return new Promise<void>((resolve, reject) => {
      ws = new WebSocket('ws://127.0.0.1:8765');

      ws.on('open', () => {
        // Send start recording
        ws!.send(JSON.stringify({ action: 'start_recording', language: 'zh' }));
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.event === 'recording_started') {
          // Send stop recording
          ws!.send(JSON.stringify({ action: 'stop_recording' }));
        }

        if (msg.event === 'result' || msg.event === 'error') {
          expect(msg.event).toBeDefined();
          resolve();
        }
      });

      ws.on('error', (err) => reject(err));
      setTimeout(() => reject(new Error('Test timeout')), 10000);
    });
  });
});
