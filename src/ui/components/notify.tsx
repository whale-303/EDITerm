import React, { useMemo } from 'react';
import { useAnsiOverlay, buildOverlayBox } from '../overlay.js';

export interface NotifyAction {
  key: string;      // keyboard shortcut, e.g. 'o', 'c'
  label: string;    // e.g. 'Override', 'Cancel'
  onPress: () => void;
}

export interface NotifyItem {
  id: number;
  message: string;
  actions: NotifyAction[];
  /** Auto-dismiss timeout in ms. 0 = no auto-dismiss. */
  timeout?: number;
}

interface NotifyStackProps {
  items: NotifyItem[];
  maxWidth?: number;
  rows: number;     // terminal rows
  cols: number;     // terminal columns
  focused?: boolean;
}

/** Stackable bottom-right notifications — rendered via ANSI overlay. */
export const NotifyStack: React.FC<NotifyStackProps> = ({ items, maxWidth = 40, rows, cols: _cols, focused = true }) => {
  const visible = useMemo(() => items.length === 0 ? [] : items.slice(-3), [items]);

  const { x, y, boxLines } = useMemo(() => {
    if (visible.length === 0) return { x: 0, y: 0, boxLines: [] as string[] };

    // Build lines for each notification card (stacked vertically)
    const allLines: string[] = [];
    for (let ni = 0; ni < visible.length; ni++) {
      const item = visible[ni];
      const items: { text: string; dim?: boolean }[] = [];

      // Message lines — split \n into multiple rows
      const messageLines = item.message.split('\n');
      for (let mi = 0; mi < messageLines.length; mi++) {
        // const prefix = mi === 0 ? '⚠ ' : '  ';
        const prefix = '  ';
        items.push({ text: prefix + messageLines[mi] });
      }

      // Actions line (if any)
      if (item.actions.length > 0) {
        const actionText = item.actions
          .map((a) => `[${a.key.toUpperCase()}] ${a.label}`)
          .join('  ');
        items.push({ text: actionText });
      }

      const card = buildOverlayBox(items, maxWidth);
      // Dim unfocused cards
      const styledCard = focused ? card : card.map(l => `\x1b[2m${l}\x1b[0m`);
      allLines.push(...styledCard);

      // Gap between cards
      if (ni < visible.length - 1) {
        allLines.push(''); // blank separator line
      }
    }

    // Position: bottom-right, above status bar
    const totalHeight = allLines.length;
    const x = Math.max(0, _cols - maxWidth - 1);
    const y = Math.max(0, rows - totalHeight - 2);

    return { x, y, boxLines: allLines };
  }, [visible, maxWidth, rows, _cols, focused]);

  useAnsiOverlay(visible.length > 0, x, y, boxLines, maxWidth);

  return null; // Nothing in Ink's render tree
};
