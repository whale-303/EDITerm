/**
 * Key test utility — captures raw terminal key codes.
 * Run: npx tsx src/debug/key-test.ts
 *
 * Prints each input sequence as:
 *   HEX: <byte> <byte> ...
 *   ESC: escaped representation (\x1b → \e, etc.)
 *   LEN: length in bytes
 *
 * Press Ctrl+C to exit.
 */

import * as readline from 'readline';
import * as tty from 'tty';

// ── Helpers ───────────────────────────────────────────

function toHex(bytes: Buffer | string): string {
  const buf = typeof bytes === 'string' ? Buffer.from(bytes) : bytes;
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

function toEscaped(input: string): string {
  return input
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code === 0x1b) return '\\e';
      if (code === 0x0d) return '\\r';
      if (code === 0x0a) return '\\n';
      if (code === 0x09) return '\\t';
      if (code === 0x7f) return '\\DEL';
      if (code < 0x20) return `\\x${code.toString(16).padStart(2, '0')}`;
      if (code > 0x7e) return `\\u{${code.toString(16)}}`;
      return ch;
    })
    .join('');
}

// ── Main ──────────────────────────────────────────────

function main() {
  const stdin = process.stdin;
  const stdout = process.stdout;

  // Check if stdin is a TTY
  if (!stdin.isTTY) {
    console.error('stdin is not a TTY. Run this script directly in a terminal.');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║           🔑  KEY TEST — Raw Terminal Input          ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║ Press keys to see their raw byte sequences.          ║');
  console.log('║ Try: Alt, Alt+key, Esc, arrows, F-keys, etc.        ║');
  console.log('║ Press Ctrl+C to exit.                               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Enable raw mode
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  let buf = '';

  stdin.on('data', (chunk: string) => {
    const raw = Buffer.from(chunk);

    // Ctrl+C (0x03) → exit
    if (raw.length === 1 && raw[0] === 0x03) {
      console.log('\n\n👋 Exiting...');
      stdin.setRawMode(false);
      stdin.pause();
      process.exit(0);
    }

    // Ctrl+D (0x04) — also exit
    if (raw.length === 1 && raw[0] === 0x04) {
      console.log('\n\n👋 Exiting (Ctrl+D)...');
      stdin.setRawMode(false);
      stdin.pause();
      process.exit(0);
    }

    const hex = toHex(raw);
    const esc = toEscaped(chunk);
    const len = raw.length;

    // Highlight ESC-starting sequences
    const marker = raw[0] === 0x1b ? '← ESC SEQ' : '';

    console.log(`HEX: ${hex.padEnd(40)} ESC: ${esc.padEnd(30)} LEN: ${len}  ${marker}`);

    // Special: detect Alt+key patterns (ESC + single char)
    if (raw[0] === 0x1b && raw.length === 2) {
      const key = raw[1];
      const keyChar = String.fromCharCode(key);
      console.log(`  >>> Alt+${keyChar} (0x${key.toString(16)}) detected`);
    }

    // Detect standalone ESC (1-byte 0x1b)
    if (raw.length === 1 && raw[0] === 0x1b) {
      console.log('  >>> Standalone ESC (could be Alt alone, or actual Esc)');
    }
  });
}

main();
