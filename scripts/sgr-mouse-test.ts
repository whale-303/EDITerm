#!/usr/bin/env tsx
/**
 * SGR mouse diagnostic v2 — queries terminal state to find the gap.
 *
 * Uses fs.writeSync(1, ...) to ensure sequences reach the terminal
 * without Node.js stream buffering. Adds DECRQM to check whether
 * the terminal actually enabled mouse tracking.
 */

import fs from 'node:fs';

if (!process.stdin.isTTY) {
  process.stderr.write('STDIN is NOT a TTY.\n');
  process.exit(1);
}

const w = (s: string) => fs.writeSync(1, s);

// ── Enter alt screen ──────────────────────────────────
w('\x1b[?1049h\x1b[2J\x1b[H');
process.stderr.write('=== SGR Mouse Diagnostic v2 ===\n\n');

// ── Phase 1: Query mode BEFORE enabling ───────────────
process.stderr.write('--- Phase 1: Query modes BEFORE ---\n');
w('\x1b[?1000$p');  // query basic mouse
w('\x1b[?1002$p');  // query button-event
w('\x1b[?1003$p');  // query any-event
w('\x1b[?1006$p');  // query SGR
process.stderr.write('Sent DECRQM for 1000 1002 1003 1006 — watch for CSI ? ... $y responses\n\n');

// ── Raw mode + stdin ──────────────────────────────────
process.stdin.setEncoding('utf8');
process.stdin.setRawMode(true);
process.stdin.ref();

let buf = '';
process.stdin.on('readable', () => {
  let chunk: string | null;
  while ((chunk = process.stdin.read() as string | null) !== null) {
    buf += chunk;

    // Show everything — especially DECRQM responses
    const display = chunk.replace(/\x1b/g, '<ESC>').replace(/\x03/g, '<C-c>');
    process.stderr.write(`[IN] "${display}"\n`);

    if (chunk === '\x03') { cleanup(); return; }

    // Detect DECRQM responses: CSI ? Ps ; Pm $ y
    const dr = /^\x1b\[\?(\d+);(\d)\$y/.exec(buf);
    if (dr) {
      buf = buf.slice(dr[0].length);
      const mode = dr[1];
      const state = { '0': 'UNKNOWN', '1': 'SET', '2': 'RESET', '3': 'PERM-SET', '4': 'PERM-RESET' }[dr[2]] || dr[2];
      process.stderr.write(`  >>> DECRQM: mode ${mode} = ${state}\n`);
    }

    // SGR mouse
    while (buf.length >= 9) {
      const m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(buf);
      if (!m) {
        // X10 mouse
        const x10 = /^\x1b\[M([\x20-\x7e])([\x20-\x7e])([\x20-\x7e])/.exec(buf);
        if (x10) {
          buf = buf.slice(6);
          const btn  = x10[1].charCodeAt(0) - 32;
          const col  = x10[2].charCodeAt(0) - 32 - 1;
          const row  = x10[3].charCodeAt(0) - 32 - 1;
          process.stderr.write(`  >>> [X10] btn=${btn} col=${col} row=${row}\n`);
          continue;
        }
        const escIdx = buf.indexOf('\x1b', 1);
        if (escIdx > 0) { buf = buf.slice(escIdx); continue; }
        if (buf.length > 64) buf = buf.slice(-32);
        break;
      }
      buf = buf.slice(m[0].length);
      const btn  = parseInt(m[1], 10);
      const col  = parseInt(m[2], 10) - 1;
      const row  = parseInt(m[3], 10) - 1;
      process.stderr.write(`  >>> [SGR] btn=${btn} col=${col} row=${row} ${m[4] === 'M' ? 'DOWN' : 'UP'}\n`);
    }
  }
});

// ── Phase 2: Enable mouse after 1s delay ──────────────
setTimeout(() => {
  process.stderr.write('\n--- Phase 2: Enabling SGR mouse ---\n');
  // Send each mode individually with a tiny gap
  w('\x1b[?1000h');
  w('\x1b[?1002h');
  w('\x1b[?1003h');
  w('\x1b[?1006h');
  process.stderr.write('Sent: 1000h 1002h 1003h 1006h\n\n');
}, 1000);

// ── Phase 3: Query modes AFTER enable ─────────────────
setTimeout(() => {
  process.stderr.write('--- Phase 3: Query modes AFTER ---\n');
  w('\x1b[?1000$p');
  w('\x1b[?1002$p');
  w('\x1b[?1003$p');
  w('\x1b[?1006$p');
  process.stderr.write('Now CLICK in the terminal. Press q to quit.\n\n');
}, 2000);

// ── Cleanup ───────────────────────────────────────────
function cleanup(): void {
  w('\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l');
  w('\x1b[?1049l');
  process.stdin.setRawMode(false);
  process.stderr.write('\nQuit.\n');
  process.exit(0);
}

process.on('SIGINT', () => {});
