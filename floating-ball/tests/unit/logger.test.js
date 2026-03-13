// tests/unit/logger.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Logger } from '../../logger.js';

describe('Logger', () => {
  const testLogDir = './test-logs';
  let logger;

  beforeEach(() => {
    if (!fs.existsSync(testLogDir)) fs.mkdirSync(testLogDir, { recursive: true });
    logger = new Logger({ logDir: testLogDir, level: 'DEBUG' });
  });

  afterEach(() => {
    fs.rmSync(testLogDir, { recursive: true, force: true });
  });

  it('should write INFO level log', () => {
    logger.info('main', 'Test info message');
    const logFile = path.join(testLogDir, 'app.log');
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('[INFO]');
    expect(content).toContain('[main]');
    expect(content).toContain('Test info message');
  });

  it('should format timestamp correctly', () => {
    logger.info('main', 'Test');
    const logFile = path.join(testLogDir, 'app.log');
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/);
  });

  it('should not write DEBUG logs when level is INFO', () => {
    const infoLogger = new Logger({ logDir: testLogDir, level: 'INFO' });
    infoLogger.info('main', 'This should appear');
    infoLogger.debug('main', 'Should not appear');
    const logFile = path.join(testLogDir, 'app.log');
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('This should appear');
    expect(content).not.toContain('Should not appear');
  });

  it('should rotate log file when size exceeds maxFileSize', () => {
    const smallLogger = new Logger({
      logDir: testLogDir,
      level: 'DEBUG',
      maxFileSize: 100  // 100 bytes for testing
    });

    // Write more than 100 bytes
    for (let i = 0; i < 20; i++) {
      smallLogger.info('main', 'This is a test message that will exceed limit');
    }

    expect(fs.existsSync(path.join(testLogDir, 'app.log.1'))).toBe(true);
  });

  it('should delete old logs when maxFiles exceeded', () => {
    const rotatingLogger = new Logger({
      logDir: testLogDir,
      level: 'DEBUG',
      maxFileSize: 50,
      maxFiles: 2
    });

    // Trigger multiple rotations
    for (let i = 0; i < 50; i++) {
      rotatingLogger.info('main', `Message ${i}`);
    }

    const files = fs.readdirSync(testLogDir).filter(f => f.startsWith('app.log'));
    expect(files.length).toBeLessThanOrEqual(3); // app.log + app.log.1 + app.log.2
  });
});
