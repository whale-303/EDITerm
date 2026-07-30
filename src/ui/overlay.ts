/**
 * ANSI overlay system — writes content at absolute (x, y) terminal coordinates
 * using cursor-positioning escape sequences, completely outside Ink's flex layout.
 *
 * Usage: call `useAnsiOverlay(visible, x, y, lines, width)` in a component.
 * The component should return null — it doesn't participate in Ink's render tree.
 */
import { useLayoutEffect, useRef } from 'react';

// ── Core write helpers ─────────────────────────────────

function ansiCursorPos(row: number, col: number): string {
  return `\x1b[${row};${col}H`;  // 1-indexed
}

const ANSI_SAVE    = '\x1b[s';
const ANSI_RESTORE = '\x1b[u';

/** Write an array of strings at absolute terminal position (x, y are 0-indexed). */
export function writeAnsiRegion(x: number, y: number, lines: string[]): void {
  if (lines.length === 0) return;
  const parts: string[] = [ANSI_SAVE];
  for (let i = 0; i < lines.length; i++) {
    parts.push(ansiCursorPos(y + 1 + i, x + 1));
    parts.push(lines[i]);
  }
  parts.push(ANSI_RESTORE);
  process.stdout.write(parts.join(''));
}

/** Clear a rectangular region by writing spaces. */
function clearRegion(x: number, y: number, width: number, height: number): void {
  if (height <= 0) return;
  const blank = ' '.repeat(width);
  const lines = Array.from({ length: height }, () => blank);
  writeAnsiRegion(x, y, lines);
}

// ── Hook ───────────────────────────────────────────────

/**
 * React hook: renders an ANSI overlay region.
 * Continuously redraws on a fast interval to survive Ink's log-update clears.
 *
 * @param visible  Whether the overlay is currently shown
 * @param x        Left column (0-indexed)
 * @param y        Top row (0-indexed)
 * @param lines    Array of pre-formatted strings (each exactly `width` chars)
 * @param width    Width of each line (used for clearing)
 */
export function useAnsiOverlay(
  visible: boolean,
  x: number,
  y: number,
  lines: string[],
  width: number,
): void {
  const prev = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Track the latest lines/x/y for the interval callback (avoids stale closure)
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const posRef = useRef({ x, y });
  posRef.current = { x, y };

  // Continuous redraw interval — survives Ink's log-update clears
  useLayoutEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (visible) {
      intervalRef.current = setInterval(() => {
        if (visibleRef.current && linesRef.current.length > 0) {
          writeAnsiRegion(posRef.current.x, posRef.current.y, linesRef.current);
        }
      }, 16);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [visible]);

  // Draw + clear logic — runs on content/position changes
  useLayoutEffect(() => {
    if (visible && lines.length > 0) {
      // Draw new content immediately
      writeAnsiRegion(x, y, lines);

      // Clear non-overlapping portion of old region
      if (prev.current && prev.current.h > 0) {
        const p = prev.current;
        const newStart = y;
        const newEnd = y + lines.length;
        const oldStart = p.y;
        const oldEnd = p.y + p.h;

        if (p.x === x && oldStart < newStart) {
          const clearEnd = Math.min(oldEnd, newStart);
          if (clearEnd > oldStart) {
            clearRegion(x, oldStart, width, clearEnd - oldStart);
          }
        }
        if (p.x === x && oldEnd > newEnd) {
          const clearStart = Math.max(oldStart, newEnd);
          if (oldEnd > clearStart) {
            clearRegion(x, clearStart, width, oldEnd - clearStart);
          }
        }
        if (p.x !== x) {
          clearRegion(p.x, p.y, p.w, p.h);
        }
      }

      prev.current = { x, y, w: width, h: lines.length };
    } else if (!visible) {
      // Hiding — clear old region
      if (prev.current && prev.current.h > 0) {
        clearRegion(prev.current.x, prev.current.y, prev.current.w, prev.current.h);
      }
      prev.current = null;
    }
  }, [visible, x, y, lines, width]);

  // Cleanup on unmount
  useLayoutEffect(() => () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (prev.current && prev.current.h > 0) {
      clearRegion(prev.current.x, prev.current.y, prev.current.w, prev.current.h);
    }
    prev.current = null;
  }, []);
}

// ── Box-drawing helpers ────────────────────────────────

export function buildOverlayBox(
  items: { text: string; dim?: boolean; highlight?: boolean }[],
  width: number,
  footer?: string,
): string[] {
  const inner = width - 2; // │ borders
  const pad = (s: string) => {
    // Strip ANSI for length calculation — simple approach: just use string length
    const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
    const len = visible.length;
    return len >= inner ? s.slice(0, inner) : s + ' '.repeat(inner - len);
  };

  const lines: string[] = [];
  lines.push(`╭${'─'.repeat(inner)}╮`);

  for (const item of items) {
    let style = '';
    let reset = '';
    if (item.highlight) { style += '\x1b[7m'; reset = '\x1b[0m'; }
    else if (item.dim) { style += '\x1b[2m'; reset = '\x1b[0m'; }
    lines.push(`│${style}${pad(item.text)}${reset}│`);
  }

  if (footer) {
    lines.push(`│\x1b[2m${pad(footer)}\x1b[0m│`);
  }

  lines.push(`╰${'─'.repeat(inner)}╯`);
  return lines;
}
