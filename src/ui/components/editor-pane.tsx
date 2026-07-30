import React from 'react';
import { Box, Text } from 'ink';
import { getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { ILanguageService, Token } from '../../services/language/ilanguage-service.js';
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
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  content, cursorRow, cursorCol, scrollOffset = 0, selection, height,
  languageId,
}) => {
  const langSvc = getService<ILanguageService>(TOKENS.LanguageService);
  const visible = content.slice(scrollOffset, scrollOffset + height);

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      {visible.map((line, i) => {
        const actualRow = scrollOffset + i;
        const isCursorRow = actualRow === cursorRow;
        const selInfo = getSelectionForLine(selection, actualRow, content);

        return (
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

/** Render a line with syntax-highlighted tokens. */
const HighlightedLine: React.FC<{ line: string; tokens: Token[] }> = ({ line, tokens }) => {
  if (tokens.length === 0) return <Text>{line}</Text>;

  const segments: Array<{ text: string; color?: string }> = [];
  let pos = 0;
  for (const t of tokens) {
    if (t.start > pos) {
      segments.push({ text: line.slice(pos, t.start) }); // uncolored text between tokens
    }
    segments.push({ text: line.slice(t.start, t.end), color: t.color });
    pos = t.end;
  }
  if (pos < line.length) {
    segments.push({ text: line.slice(pos) }); // remaining uncolored text
  }

  return (
    <Box>
      {segments.map((seg, i) =>
        seg.color
          ? <Text key={i} color={seg.color}>{seg.text}</Text>
          : <Text key={i}>{seg.text}</Text>
      )}
    </Box>
  );
};

const CursorLine: React.FC<{ line: string; cursorCol: number }> = ({ line, cursorCol }) => (
  <Box>
    <Text>{line.slice(0, cursorCol)}</Text>
    <Text inverse>{line[cursorCol] || ' '}</Text>
    <Text>{line.slice(cursorCol + 1)}</Text>
  </Box>
);

/** Line with selection — cursor may also be on this line. */
const SelectedLine: React.FC<{
  line: string; sel: LineSel; isCursorRow: boolean; cursorCol: number;
}> = ({ line, sel, isCursorRow, cursorCol }) => {
  const s = sel.startCol;
  const e = sel.endCol;
  const before = line.slice(0, s);
  const selected = line.slice(s, e);
  const after = line.slice(e);

  if (!isCursorRow) {
    return (
      <Box>
        <Text>{before}</Text>
        <Text inverse>{selected.padEnd(e - s, ' ')}</Text>
        <Text>{after}</Text>
      </Box>
    );
  }

  // Cursor + selection on same line
  const c = cursorCol;

  if (c < s) {
    return (
      <Box>
        <Text>{line.slice(0, c)}</Text>
        <Text inverse>{line[c] || ' '}</Text>
        <Text>{line.slice(c + 1, s)}</Text>
        <Text inverse>{selected.padEnd(e - s, ' ')}</Text>
        <Text>{after}</Text>
      </Box>
    );
  } else if (c < e) {
    return (
      <Box>
        <Text>{before}</Text>
        <Text inverse>{line.slice(s, c)}</Text>
        <Text inverse>{line[c] || ' '}</Text>
        <Text inverse>{line.slice(c + 1, e).padEnd(e - c - 1, ' ')}</Text>
        <Text>{after}</Text>
      </Box>
    );
  } else {
    return (
      <Box>
        <Text>{before}</Text>
        <Text inverse>{selected.padEnd(e - s, ' ')}</Text>
        <Text>{line.slice(e, c)}</Text>
        <Text inverse>{line[c] || ' '}</Text>
        <Text>{line.slice(c + 1)}</Text>
      </Box>
    );
  }
};
