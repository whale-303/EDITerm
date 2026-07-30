/**
 * Simple file-based error logger for debugging.
 * Usage: import { elog } from '../util/error-log.js';
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LOG_PATH = join(process.cwd(), 'editor-error.log');

/** Clear log on init. */
try { writeFileSync(LOG_PATH, ''); } catch {}

/** Append a message to the error log. */
export function elog(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  try { appendFileSync(LOG_PATH, `[${ts}] ${msg}\n`); } catch {}
}

/** Wrap a function with try/catch that logs errors. */
export function trap<T>(label: string, fn: () => T): T {
  try {
    return fn();
  } catch (e: any) {
    elog(`${label}: ${e.message || e}`);
    throw e;
  }
}

/** Async version of trap. */
export async function atrap<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e: any) {
    elog(`${label}: ${e.message || e}`);
    return undefined;
  }
}
