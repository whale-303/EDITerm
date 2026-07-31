import React from 'react';
import { Box, Text } from 'ink';
import { getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILanguageService, Token } from '../../services/language/ilanguage-service.js';
import type { CompletionItem } from '../../services/completion/icompletion-service.js';
import type { SelectionRange } from '../app.js';
import type { DiffInfo, DiffLineType } from '../../services/git/igit-service.js';

interface EditorPaneProps {
  content: string[];
  cursorRow: number;
  cursorCol: number;
  scrollOffset?: number;
  selection?: SelectionRange | null;
  width: number;
  height: number;
  /** Language id for syntax highlighting (e.g. "typescript", "python"). */
  languageId?: string;
  /** Completion popup state — rendered as a floating window below the cursor. */
  completionOpen?: boolean;
  completionItems?: ReadonlyArray<CompletionItem>;
  completionSelected?: number;
  completionPrefix?: string;
  /** Git diff info — drives gutter marks and diff background. */
  diffInfo?: DiffInfo | null;
}

const GUTTER_WIDTH = 5; // " NNNN|" — 4-digit line number + diff mark

export const EditorPane: React.FC<EditorPaneProps> = ({
  content, cursorRow, cursorCol, scrollOffset = 0, selection, height,
  languageId, diffInfo,
  completionOpen, completionItems, completionSelected = 0, completionPrefix = '',
}) => {
  const langSvc = getService<ILanguageService>(TOKENS.LanguageService);
  const visible = content.slice(scrollOffset, scrollOffset + height);

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      {visible.map((line, i) => {
        const actualRow = scrollOffset + i;
        const isCursorRow = actualRow === cursorRow;
        const selInfo = getSelectionForLine(selection, actualRow, content);

        const tokens = languageId ? langSvc.tokenize(line, languageId) : [];
        const diffType = diffInfo?.lines.get(actualRow);
        const hasDeletionAbove = diffInfo?.deletionAbove.has(actualRow) ?? false;

        const ctx: LineContext = {
          line,
          row: actualRow,
          tokens,
          cursorCol: isCursorRow ? cursorCol : -1,
          sel: selInfo,
          diff: diffType ?? 'unchanged',
          hasDeletionAbove,
        };

        const lineEl = (
          <Box key={actualRow} flexDirection="row">
            <Text dimColor>{String(actualRow + 1).padStart(4, ' ')} </Text>
            {renderDiffGutter(ctx)}
            <Text>{renderContent(ctx)}</Text>
          </Box>
        );

        // Render completion popup right after the cursor line
        if (isCursorRow && completionOpen && completionItems && completionItems.length > 0) {
          return (
            <React.Fragment key={actualRow}>
              {lineEl}
              <CompletionPopup
                items={completionItems}
                prefix={completionPrefix}
                selectedIndex={completionSelected}
                indentCol={cursorCol}
              />
            </React.Fragment>
          );
        }

        return lineEl;
      })}
      {Array.from({ length: Math.max(0, height - visible.length) }).map((_, i) => (
        <Box key={`pad-${i}`} flexDirection="row">
          <Text dimColor>{String((scrollOffset + visible.length + i + 1)).padStart(4, ' ')} </Text>
          <Text dimColor>~</Text>
        </Box>
      ))}
    </Box>
  );
};

// ── LineContext — drives the modifier pipeline ─────────

interface LineContext {
  line: string;
  row: number;
  tokens: Token[];
  /** -1 if this line is not the cursor row. */
  cursorCol: number;
  sel: LineSel | null;
  diff: DiffLineType | 'unchanged';
  hasDeletionAbove: boolean;
}

// ── Diff gutter ─────────────────────────────────────

/** Render a single-char diff gutter mark. Always 1 char wide for alignment.
 *  Red _ above deletions, green | added, blue | modified, dim · unchanged. */
function renderDiffGutter(ctx: LineContext): React.ReactElement {
  const mark = diffGutterMark(ctx);
  return <Text color={mark.color}>{mark.ch}</Text>;
}

function diffGutterMark(ctx: LineContext): { ch: string; color: string } {
  if (ctx.hasDeletionAbove)  return { ch: '_', color: '#f38ba8' };  // red
  if (ctx.diff === 'added')    return { ch: '|', color: '#a6e3a1' };  // green
  if (ctx.diff === 'modified') return { ch: '|', color: '#89b4fa' };  // blue
  return { ch: ' ', color: 'dim' };
}

// ── Content modifier pipeline ─────────────────────────

// ANSI constants
const ANSI_RESET_FG = '\x1b[39m';
const ANSI_RESET_BG = '\x1b[49m';
const ANSI_RESET_ALL = '\x1b[0m';
const ANSI_INVERSE = '\x1b[7m';
const ANSI_INVERSE_OFF = '\x1b[27m';

// Diff background colours (subtle terminal-safe shades)
const DIFF_ADDED_BG    = '\x1b[48;2;25;50;25m';
const DIFF_MODIFIED_BG = '\x1b[48;2;30;35;60m';

// ── Segment builder ───────────────────────────────────

interface Segment {
  start: number;
  end: number;
  fg: string | null;
  bg: string | null;
  inverse: boolean;
}

/** Collect all breakpoints from tokens, selection, cursor. */
function collectBreakpoints(lineLen: number, tokens: Token[], sel: LineSel | null, cursorCol: number): number[] {
  const breaks = new Set<number>([0, lineLen]);
  for (const t of tokens) { breaks.add(clamp(t.start, lineLen)); breaks.add(clamp(t.end, lineLen)); }
  if (sel) { breaks.add(clamp(sel.startCol, lineLen)); breaks.add(clamp(sel.endCol, lineLen)); }
  if (cursorCol >= 0 && cursorCol <= lineLen) { breaks.add(cursorCol); breaks.add(cursorCol + 1); }
  return [...breaks].sort((a, b) => a - b);
}

function clamp(v: number, max: number): number {
  return Math.max(0, Math.min(v, max));
}

/** Build non-overlapping segments covering the line, each with uniform attrs. */
function buildSegments(line: string, ctx: LineContext): Segment[] {
  const lineLen = line.length;
  if (lineLen === 0) {
    // Edge case: empty line with cursor
    if (ctx.cursorCol === 0) {
      return [{ start: 0, end: 0, fg: null, bg: diffBg(ctx.diff), inverse: true }];
    }
    return [];
  }

  const breaks = collectBreakpoints(lineLen, ctx.tokens, ctx.sel, ctx.cursorCol);
  const segments: Segment[] = [];

  for (let i = 0; i < breaks.length - 1; i++) {
    const start = breaks[i];
    const end = breaks[i + 1];
    if (start >= end || start >= lineLen) continue;

    const seg: Segment = {
      start,
      end: Math.min(end, lineLen),
      fg: null,
      bg: diffBg(ctx.diff),
      inverse: false,
    };

    // Syntax fg: pick the highest-priority token covering this segment
    for (const t of ctx.tokens) {
      if (t.start <= start && t.end >= seg.end) {
        seg.fg = t.color;
        break;
      }
    }

    // Selection inverse
    if (ctx.sel) {
      const s = ctx.sel.startCol;
      const e = ctx.sel.endCol;
      if (start >= s && seg.end <= e) {
        seg.inverse = true;
      }
    }

    // Cursor inverse (applied on top of everything)
    if (ctx.cursorCol >= 0 && start === ctx.cursorCol) {
      seg.inverse = true; // cursor char always inverse
    }

    segments.push(seg);
  }

  // Merge adjacent segments with identical attrs
  return mergeSegments(segments);
}

function diffBg(diff: DiffLineType | 'unchanged'): string | null {
  if (diff === 'added') return DIFF_ADDED_BG;
  if (diff === 'modified') return DIFF_MODIFIED_BG;
  return null;
}

function mergeSegments(segs: Segment[]): Segment[] {
  if (segs.length <= 1) return segs;
  const merged: Segment[] = [];
  let cur = segs[0];
  for (let i = 1; i < segs.length; i++) {
    const next = segs[i];
    if (cur.fg === next.fg && cur.bg === next.bg && cur.inverse === next.inverse) {
      cur = { ...cur, end: next.end };
    } else {
      merged.push(cur);
      cur = next;
    }
  }
  merged.push(cur);
  return merged;
}

/** Emit a single ANSI string from segments. */
function emitSegments(line: string, segments: Segment[]): string {
  if (segments.length === 0) return '';
  const parts: string[] = [];
  for (const seg of segments) {
    const text = line.slice(seg.start, seg.end);
    const codes: string[] = [];
    if (seg.inverse) codes.push(ANSI_INVERSE);
    if (seg.bg) codes.push(seg.bg);
    if (seg.fg) codes.push(hexToAnsiFg(seg.fg));
    parts.push(...codes, text);
    // Reset in reverse order
    if (seg.fg) parts.push(ANSI_RESET_FG);
    if (seg.bg) parts.push(ANSI_RESET_BG);
    if (seg.inverse) parts.push(ANSI_INVERSE_OFF);
  }
  return parts.join('');
}

/** The unified content renderer: build segments → emit ANSI string. */
function renderContent(ctx: LineContext): string {
  // Special case: empty line, cursor at 0
  if (ctx.line.length === 0 && ctx.cursorCol === 0) {
    let text = ANSI_INVERSE + ' ' + ANSI_INVERSE_OFF;
    if (ctx.diff !== 'unchanged') {
      text = (diffBg(ctx.diff) ?? '') + text + ANSI_RESET_BG;
    }
    return text;
  }
  if (ctx.line.length === 0 && ctx.diff !== 'unchanged') {
    // Empty line with diff bg — need a space to show the colour
    return (diffBg(ctx.diff) ?? '') + ' ' + ANSI_RESET_BG;
  }
  if (ctx.line.length === 0) return '';

  const segments = buildSegments(ctx.line, ctx);
  return emitSegments(ctx.line, segments);
}

// ── ANSI helpers ────────────────────────────────────

function hexToAnsiFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

// ── Completion popup (floating below cursor) ──────────

const CompletionPopup: React.FC<{
  items: ReadonlyArray<CompletionItem>;
  prefix: string;
  selectedIndex: number;
  indentCol: number;
}> = ({ items, prefix, selectedIndex, indentCol }) => {
  const marginLeft = GUTTER_WIDTH + indentCol;
  const shown = items.slice(0, 8);

  return (
    <Box flexDirection="column" marginLeft={marginLeft}>
      <Box>
        <Text dimColor>┌ </Text>
        <Text color="yellow">{prefix}</Text>
        <Text dimColor> — ↑↓ nav  Enter/Tab accept  Esc cancel</Text>
      </Box>
      {shown.map((item, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={`${item.text}-${i}`}>
            <Text color={isSelected ? 'cyan' : undefined} inverse={isSelected}>
              {isSelected ? '▶' : ' '} {item.text}
            </Text>
            <Text dimColor>  {item.kind}</Text>
          </Box>
        );
      })}
      {items.length > 8 && (
        <Text dimColor>  … {items.length - 8} more</Text>
      )}
    </Box>
  );
};

// ── Selection info for a single line ──────────────────

interface LineSel {
  startCol: number; // inclusive
  endCol: number;   // exclusive
  partial: boolean;  // true = only part of line is selected (first/last row)
}

function getSelectionForLine(
  sel: SelectionRange | null | undefined,
  row: number,
  content: string[],
): LineSel | null {
  if (!sel) return null;
  if (row < sel.startRow || row > sel.endRow) return null;

  const lineLen = content[row]?.length ?? 0;

  if (sel.startRow === sel.endRow) {
    return { startCol: sel.startCol, endCol: Math.min(sel.endCol, lineLen), partial: false };
  }

  if (row === sel.startRow) {
    return { startCol: sel.startCol, endCol: lineLen, partial: true };
  }

  if (row === sel.endRow) {
    return { startCol: 0, endCol: Math.min(sel.endCol, lineLen), partial: true };
  }

  return { startCol: 0, endCol: lineLen, partial: false };
}
