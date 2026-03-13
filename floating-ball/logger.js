// logger.js
import fs from 'fs';
import path from 'path';

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

export class Logger {
  constructor(config = {}) {
    this.logDir = config.logDir || './logs';
    this.level = LEVELS[config.level] ?? LEVELS.INFO;
    this.maxFileSize = config.maxFileSize || 5242880; // 5MB
    this.maxFiles = config.maxFiles || 5;
    this.logFile = path.join(this.logDir, 'app.log');

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this._rotateIfNeeded();
  }

  _formatTimestamp() {
    const now = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
           `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
  }

  _rotateIfNeeded() {
    if (!fs.existsSync(this.logFile)) return;

    const stats = fs.statSync(this.logFile);
    if (stats.size >= this.maxFileSize) {
      this._rotate();
    }
  }

  _rotate() {
    // Delete oldest file if at max
    const oldestFile = path.join(this.logDir, `app.log.${this.maxFiles}`);
    if (fs.existsSync(oldestFile)) {
      fs.unlinkSync(oldestFile);
    }

    // Shift existing files
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const oldFile = path.join(this.logDir, `app.log.${i}`);
      const newFile = path.join(this.logDir, `app.log.${i + 1}`);
      if (fs.existsSync(oldFile)) {
        fs.renameSync(oldFile, newFile);
      }
    }

    // Rename current to .1
    fs.renameSync(this.logFile, path.join(this.logDir, 'app.log.1'));
  }

  _write(level, module, message) {
    if (LEVELS[level] < this.level) return;

    this._rotateIfNeeded();

    const timestamp = this._formatTimestamp();
    const logLine = `[${timestamp}] [${level}] [${module}] ${message}\n`;
    fs.appendFileSync(this.logFile, logLine);
  }

  debug(module, message) { this._write('DEBUG', module, message); }
  info(module, message) { this._write('INFO', module, message); }
  warn(module, message) { this._write('WARN', module, message); }
  error(module, message) { this._write('ERROR', module, message); }
}

export default Logger;
