/**
 * Mouse tracking — sends DECSET sequences to enable SGR mouse reporting.
 *
 * Platform strategy:
 *   Windows  → skip DECSET. ConPTY intercepts mouse sequences without
 *              forwarding SGR to stdin, AND it blocks the terminal's
 *              native Shift+Click selection. By NOT sending DECSET on
 *              Windows, we keep Windows Terminal's native selection working.
 *   macOS / Linux → send DECSET. Terminals support SGR mouse natively,
 *              delivering press/drag/release/wheel events via stdin.
 *
 * Selection on Windows relies on our editor's visual mode (V/v/F3),
 * not on terminal mouse events. Native Shift+drag works for copy.
 */

const ENABLE_SGR  = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h';
const DISABLE_SGR = '\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l';

const IS_WINDOWS = process.platform === 'win32';

export type MouseCallback = (event: import('./mouse-protocol.js').MouseEvent) => void;

export class MouseHandler {
  private cb: MouseCallback | null = null;

  onMouse(cb: MouseCallback): void {
    this.cb = cb;
  }

  emit(event: import('./mouse-protocol.js').MouseEvent): void {
    this.cb?.(event);
  }

  start(): void {
    if (IS_WINDOWS) return; // keep native Windows Terminal selection working
    process.stdout.write(ENABLE_SGR);
  }

  stop(): void {
    if (IS_WINDOWS) return;
    process.stdout.write(DISABLE_SGR);
  }
}
