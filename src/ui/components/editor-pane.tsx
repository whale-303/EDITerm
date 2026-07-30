import React from 'react';
import { Box, Text } from 'ink';
import { getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILanguageService, Token } from '../../services/language/ilanguage-service.js';
import type { CompletionItem } from '../../services/completion/icompletion-service.js';
import type { SelectionRange } from '../app.js';

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
}

const GUTTER_WIDTH = 5; // 4-digit line number + space

export const EditorPane: React.FC<EditorPaneProps> = ({
  content, cursorRow, cursorCol, scrollOffset = 0, selection, height,
  languageId,
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

        const lineEl = (
          <Box key={actualRow} flexDirection="row">
            <Text dimColor>{String(actualRow + 1).padStart(4, ' ')} </Text>
            {selInfo ? (
              <SelectedLine line={line} sel={selInfo} isCursorRow={isCursorRow} cursorCol={cursorCol} />
            ) : isCursorRow ? (
              <CursorLine line={line} cursorCol={cursorCol} />
            ) : languageId ? (
              <HighlightedLine line={line} tokens={langSvc.tokenize(line, languageId)} />
            ) : (
              <Text>{line}</Text>
            )}
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
          <Text>~</Text>
        </Box>
      ))}
    </Box>
  );
};

// ── Completion popup (floating below cursor) ──────────────

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
    // Single-line selection
    return { startCol: sel.startCol, endCol: Math.min(sel.endCol, lineLen), partial: false };
  }

  if (row === sel.startRow) {
    // First line: from startCol to end of line
    return { startCol: sel.startCol, endCol: lineLen, partial: true };
  }

  if (row === sel.endRow) {
    // Last line: from start of line to endCol
    return { startCol: 0, endCol: Math.min(sel.endCol, lineLen), partial: true };
  }

  // Middle line: entire line selected
  return { startCol: 0, endCol: lineLen, partial: false };
}

// ── Line renderers ────────────────────────────────────

// ── ANSI helpers — inline color codes avoid multi-Text layout drift ──

const ANSI_RESET = '\x1b[39m';
const ANSI_INVERSE = '\x1b[7m';
const ANSI_INVERSE_OFF = '\x1b[27m';

/** Convert hex color like "#cba6f7" to ANSI true-color foreground sequence. */
function hexToAnsiFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/** Build a single string with embedded ANSI color codes from tokens. */
function colorizeLine(line: string, tokens: Token[]): string {
  if (tokens.length === 0) return line;
  const parts: string[] = [];
  let pos = 0;
  for (const t of tokens) {
    if (t.start > pos) {
      parts.push(line.slice(pos, t.start));
    }
    parts.push(hexToAnsiFg(t.color));
    parts.push(line.slice(t.start, t.end));
    parts.push(ANSI_RESET);
    pos = t.end;
  }
  if (pos < line.length) {
    parts.push(line.slice(pos));
  }
  return parts.join('');
}

// ── Line renderers — each returns a SINGLE <Text> node ──

/** Render a line with syntax-highlighted tokens as inline ANSI. */
const HighlightedLine: React.FC<{ line: string; tokens: Token[] }> = React.memo(({ line, tokens }) => {
  const colored = colorizeLine(line, tokens);
  return <Text>{colored}</Text>;
});

const CursorLine: React.FC<{ line: string; cursorCol: number }> = ({ line, cursorCol }) => {
  const c = cursorCol;
  const text = line.slice(0, c)
    + ANSI_INVERSE + (line[c] || ' ') + ANSI_INVERSE_OFF
    + line.slice(c + 1);
  return <Text>{text}</Text>;
};

/** Line with selection — cursor may also be on this line.
 *  Returns a single <Text> with inverse ANSI for the selected range. */
const SelectedLine: React.FC<{
  line: string; sel: LineSel; isCursorRow: boolean; cursorCol: number;
}> = ({ line, sel, isCursorRow, cursorCol }) => {
  const s = sel.startCol;
  const e = sel.endCol;
  const before = line.slice(0, s);
  const selected = line.slice(s, e);
  const after = line.slice(e);

  if (!isCursorRow) {
    return <Text>{before + ANSI_INVERSE + selected.padEnd(e - s, ' ') + ANSI_INVERSE_OFF + after}</Text>;
  }

  // Cursor + selection on same line
  const c = cursorCol;

  if (c < s) {
    const text = line.slice(0, c)
      + ANSI_INVERSE + (line[c] || ' ') + ANSI_INVERSE_OFF
      + line.slice(c + 1, s)
      + ANSI_INVERSE + selected.padEnd(e - s, ' ') + ANSI_INVERSE_OFF
      + after;
    return <Text>{text}</Text>;
  } else if (c < e) {
    const text = before
      + ANSI_INVERSE + line.slice(s, c)
      + line[c]
      + line.slice(c + 1, e).padEnd(e - c - 1, ' ') + ANSI_INVERSE_OFF
      + after;
    return <Text>{text}</Text>;
  } else {
    const text = before
      + ANSI_INVERSE + selected.padEnd(e - s, ' ') + ANSI_INVERSE_OFF
      + line.slice(e, c)
      + ANSI_INVERSE + (line[c] || ' ') + ANSI_INVERSE_OFF
      + line.slice(c + 1);
    return <Text>{text}</Text>;
  }
};
