#!/usr/bin/env tsx
/**
 * Mouse test v10 — CONIN$ real console handle.
 *
 * GetStdHandle(STD_INPUT_HANDLE) returns the ConPTY virtual handle
 * (mode=0x0, immutable). We bypass it by opening CONIN$ directly,
 * which gives us the REAL console input buffer that Windows Terminal
 * writes MOUSE_EVENT_RECORD to.
 */

import koffi from 'koffi';

if (!process.stdin.isTTY) {
  process.stderr.write('STDIN is NOT a TTY.\n');
  process.exit(1);
}

const lib = koffi.load('kernel32.dll');

// ── FFI declarations ──────────────────────────────────
const CreateFileW       = lib.func('CreateFileW',       'int32',  ['str', 'uint32', 'uint32', 'void *', 'uint32', 'uint32', 'int32']);
const GetConsoleMode    = lib.func('GetConsoleMode',    'bool',   ['int32', 'uint32_t *']);
const SetConsoleMode    = lib.func('SetConsoleMode',    'bool',   ['int32', 'uint32']);
const PeekConsoleInputW = lib.func('PeekConsoleInputW', 'bool',   ['int32', 'void *', 'uint32', 'uint32_t *']);
const ReadConsoleInputW = lib.func('ReadConsoleInputW', 'bool',   ['int32', 'void *', 'uint32', 'uint32_t *']);

// ── Open REAL console handle via CONIN$ ───────────────
const GENERIC_READ  = 0x80000000;
const GENERIC_WRITE = 0x40000000;
const FILE_SHARE_READ  = 1;
const FILE_SHARE_WRITE = 2;
const OPEN_EXISTING = 3;

const hConPTY = lib.func('GetStdHandle', 'int32', ['int32'])(-10);
process.stderr.write(`hConPTY (StdHandle -10) = ${hConPTY}\n`);

const hConIn = CreateFileW(
  'CONIN$',
  GENERIC_READ | GENERIC_WRITE,
  FILE_SHARE_READ | FILE_SHARE_WRITE,
  null,
  OPEN_EXISTING,
  0,
  0,
);
process.stderr.write(`hConIn (CONIN$) = ${hConIn}\n`);

if (hConIn === -1 || hConIn === 0xFFFFFFFF) {
  process.stderr.write('CreateFileW CONIN$ FAILED — cannot open real console.\n');
  process.exit(1);
}

// ── Read + set console mode on REAL handle ────────────
const mode = [0];
if (GetConsoleMode(hConIn, mode)) {
  process.stderr.write(`BEFORE on CONIN$: 0x${mode[0].toString(16).padStart(8, '0')}\n`);
} else {
  process.stderr.write('GetConsoleMode on CONIN$ FAILED\n');
}

// ENABLE_MOUSE_INPUT=0x0010  ENABLE_VT_INPUT=0x0200  ENABLE_EXTENDED=0x0080
const NEW_MODE = mode[0] | 0x0010 | 0x0200 | 0x0080;
if (SetConsoleMode(hConIn, NEW_MODE)) {
  const verify = [0];
  GetConsoleMode(hConIn, verify);
  process.stderr.write(`AFTER on CONIN$:  0x${verify[0].toString(16).padStart(8, '0')}\n`);
} else {
  process.stderr.write('SetConsoleMode on CONIN$ FAILED\n');
}

// Also send SGR enable via stdout
process.stdout.write('\x1b[?1000h\x1b[?1002h\x1b[?1006h');
process.stderr.write('\n=== Click / Drag / Scroll (Ctrl+C to quit) ===\n\n');

// ── Poll REAL console handle ─────────────────────────
const INPUT_RECORD_SIZE = 20;
const buf = Buffer.alloc(INPUT_RECORD_SIZE * 16);
const avail = [0];
const got = [0];

const timer = setInterval(() => {
  if (!PeekConsoleInputW(hConIn, null as any, 0, avail)) return;
  if (avail[0] === 0) return;

  if (!ReadConsoleInputW(hConIn, buf as any, 16, got)) return;

  for (let i = 0; i < got[0]; i++) {
    const off = i * INPUT_RECORD_SIZE;
    const evType = buf.readUInt16LE(off);

    if (evType === 2) { // MOUSE_EVENT_RECORD
      const x  = buf.readInt16LE(off + 4);
      const y  = buf.readInt16LE(off + 6);
      const bs = buf.readUInt32LE(off + 8);
      const ef = buf.readUInt32LE(off + 16);

      const L = !!(bs & 1), R = !!(bs & 2), M = !!(bs & 4);

      let t: string;
      if (ef & 4) {
        const delta = (bs >> 16) & 0xFFFF;
        t = delta >= 0x8000 ? 'WHEEL-DN' : 'WHEEL-UP';
      } else if (ef & 2) {
        t = 'DCLICK';
      } else if (ef & 1) {
        t = 'MOVE';
      } else if (L || R || M) {
        t = 'DOWN';
      } else {
        t = 'UP';
      }

      const b = L ? 'L' : R ? 'R' : M ? 'M' : '-';
      process.stderr.write(`[MOUSE] ${t} ${b} x=${x} y=${y}\n`);
    }
  }
}, 16);

// ── Cleanup ───────────────────────────────────────────
process.on('SIGINT', () => {
  clearInterval(timer);
  SetConsoleMode(hConIn, mode[0]); // restore original
  process.stdout.write('\x1b[?1006l\x1b[?1002l\x1b[?1000l');
  process.stderr.write('\nQuit.\n');
  process.exit(0);
});
