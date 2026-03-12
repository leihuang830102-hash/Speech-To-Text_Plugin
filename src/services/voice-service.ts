import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type SttBackend = 'moonshine' | 'whisper' | 'faster-whisper' | 'auto';
export type MoonshineModel = 'tiny' | 'base';
export type WhisperModel = 'tiny' | 'base' | 'small' | 'medium' | 'large';

export interface SpeechToTextConfig {
  backend?: SttBackend;
  model?: string;
  language?: string;
  maxDuration?: number;
  pythonPath?: string;
}

export interface SttResult {
  success: boolean;
  text?: string;
  error?: string;
  backend?: string;
  model?: string;
}

export interface PluginConfig {
  pythonPath: string;
  sttBackend: SttBackend;
  modelSize: string;
  language: string;
  maxDuration: number;
  hotkey: string;
}

const DEFAULT_CONFIG: Required<PluginConfig> = {
  pythonPath: 'python',
  sttBackend: 'faster-whisper',
  modelSize: 'tiny',
  language: 'zh',
  maxDuration: 30,
  hotkey: 'Ctrl+Shift+V',
};

function getScriptPath(): string {
  return join(__dirname, 'scripts', 'stt.py');
}

export async function transcribe(
  config: SpeechToTextConfig = {}
): Promise<SttResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const scriptPath = getScriptPath();

  const args = [
    scriptPath,
    '--backend', mergedConfig.sttBackend,
    '--model', mergedConfig.modelSize,
    '--language', mergedConfig.language,
    '--duration', mergedConfig.maxDuration.toString(),
  ];

  return new Promise((resolve) => {
    const process = spawn(mergedConfig.pythonPath, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0 && !stdout) {
        resolve({
          success: false,
          error: stderr || `Process exited with code ${code}`,
        });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch {
        resolve({
          success: false,
          error: `Failed to parse output: ${stdout}`,
        });
      }
    });

    process.on('error', (err) => {
      resolve({
        success: false,
        error: `Failed to start STT process: ${err.message}`,
      });
    });
  });
}

export async function listBackends(pythonPath: string = 'python'): Promise<string[]> {
  const scriptPath = getScriptPath();

  return new Promise((resolve) => {
    const process = spawn(pythonPath, [scriptPath, '--list-backends'], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.on('close', () => {
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result.available_backends || []);
      } catch {
        resolve([]);
      }
    });

    process.on('error', () => {
      resolve([]);
    });
  });
}

export async function checkEnvironment(pythonPath: string = 'python'): Promise<{
  python: boolean;
  backends: string[];
  missingDeps: string[];
}> {
  const backends = await listBackends(pythonPath);
  
  const required = ['sounddevice', 'soundfile', 'numpy'];
  const missing: string[] = [];
  
  for (const dep of required) {
    try {
      await new Promise((resolve, reject) => {
        const p = spawn(pythonPath, ['-c', `import ${dep}`], { stdio: 'ignore' });
        p.on('close', (code) => (code === 0 ? resolve(true) : reject()));
        p.on('error', reject);
      });
    } catch {
      missing.push(dep);
    }
  }

  return {
    python: true,
    backends,
    missingDeps: missing,
  };
}

export { DEFAULT_CONFIG, getScriptPath };
