/**
 * Session logger — writes to log_{timestamp}.log in the project root.
 *
 * Usage:
 *   import { logger } from '../util/logger.js';
 *   logger.info('GitService', 'cache hit', { path: '/src/foo.ts' });
 *   logger.warn('GitService', 'empty porcelain output');
 *   logger.error('GitService', 'git command failed', { cmd, stderr });
 *
 * Each session creates a new log file. The logger writes synchronously
 * so messages are never lost on crash.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ── Log file setup ──────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function timestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function timeMs(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

const SESSION_TS = timestamp();
const CWD = process.cwd();
// Put logs inside the project's logs/ directory (cwd is typically the project root)
const LOG_FILE = join(CWD, 'logs', `log_${SESSION_TS}.log`);
const LOG_FALLBACK = join(CWD, '..', 'logs', `log_${SESSION_TS}.log`);

let _logPath = '';
function ensureLogFile(): string {
  if (_logPath) return _logPath;
  for (const p of [LOG_FILE, LOG_FALLBACK]) {
    try {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, `╭── EDITerm session log ─────────────────────────────────\n` +
        `│ started: ${new Date().toISOString()}\n` +
        `│ pid:     ${process.pid}\n` +
        `╰──────────────────────────────────────────────────────\n\n`, 'utf-8');
      _logPath = p;
      return p;
    } catch { /* try next */ }
  }
  return '';
}

// ── Log levels ──────────────────────────────────────

type Level = 'TRACE' | 'INFO' | 'WARN' | 'ERROR' | 'HIT' | 'MISS' | 'FALLBACK';

const LEVEL_ORDER: Record<Level, number> = {
  TRACE: 0, INFO: 1, HIT: 1, MISS: 1, WARN: 2, FALLBACK: 2, ERROR: 3,
};

// ── Logger ───────────────────────────────────────────

class Logger {
  private _minLevel: number = 0; // log everything

  setLevel(level: Level): void {
    this._minLevel = LEVEL_ORDER[level] ?? 0;
  }

  /** Trace — detailed flow info. */
  trace(tag: string, msg: string, data?: Record<string, unknown>): void {
    this._write('TRACE', tag, msg, data);
  }

  /** Info — general events. */
  info(tag: string, msg: string, data?: Record<string, unknown>): void {
    this._write('INFO', tag, msg, data);
  }

  /** Cache / lookup hit. */
  hit(tag: string, msg: string, data?: Record<string, unknown>): void {
    this._write('HIT', tag, msg, data);
  }

  /** Cache / lookup miss. */
  miss(tag: string, msg: string, data?: Record<string, unknown>): void {
    this._write('MISS', tag, msg, data);
  }

  /** Warning — non-fatal issue. */
  warn(tag: string, msg: string, data?: Record<string, unknown>): void {
    this._write('WARN', tag, msg, data);
  }

  /** Fallback — tried one path, fell back to another. */
  fallback(tag: string, msg: string, data?: Record<string, unknown>): void {
    this._write('FALLBACK', tag, msg, data);
  }

  /** Error — something failed. */
  error(tag: string, msg: string, data?: Record<string, unknown>): void {
    this._write('ERROR', tag, msg, data);
  }

  // ── Internal ─────────────────────────────────────

  private _write(level: Level, tag: string, msg: string, data?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < this._minLevel) return;
    const path = ensureLogFile();
    if (!path) return;

    const ts = timeMs();
    let line = `[${ts}] [${level.padEnd(8)}] [${tag}] ${msg}`;
    if (data) {
      const entries = Object.entries(data);
      if (entries.length > 0) {
        line += '  ' + entries.map(([k, v]) => `${k}=${this._fmt(v)}`).join(' ');
      }
    }
    line += '\n';
    try { appendFileSync(path, line, 'utf-8'); } catch { /* can't log */ }
  }

  private _fmt(v: unknown): string {
    if (typeof v === 'string') {
      if (v.length > 200) return JSON.stringify(v.slice(0, 200) + '…');
      return JSON.stringify(v);
    }
    if (v instanceof Error) return v.message;
    if (typeof v === 'object' && v !== null) {
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
  }
}

export const logger = new Logger();
