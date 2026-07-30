import { useState, useCallback, useMemo } from 'react';
import React from 'react';
import { useAnsiOverlay, buildOverlayBox } from '../overlay.js';

// ── Types ────────────────────────────────────────────

export interface MenuItem {
  key: string;       // single-char keyboard shortcut (e.g. 'd', 'r')
  label: string;     // display label
  action: () => void;
  disabled?: boolean;
}

export interface MenuState {
  x: number;         // column position (0-indexed)
  y: number;         // row position (0-indexed)
  items: MenuItem[];
}

// ── Reusable hook ────────────────────────────────────

export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const showMenu = useCallback((x: number, y: number, items: MenuItem[]) => {
    setMenu({ x, y, items });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  return { menu, showMenu, closeMenu };
}

// ── Component (ANSI overlay — renders nothing in Ink) ─

export interface ContextMenuProps {
  menu: MenuState | null;
  onClose: () => void;
  highlightIndex?: number;
  focused?: boolean;
}

const MENU_WIDTH = 30;

function formatItem(item: MenuItem): string {
  return item.disabled
    ? `   ${item.label}`
    : ` [${item.key.toUpperCase()}] ${item.label}`;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ menu, onClose: _onClose, highlightIndex = 0, focused = true }) => {
  const visible = menu !== null && menu.items.length > 0;

  const { x, y, boxLines } = useMemo(() => {
    if (!menu || menu.items.length === 0) {
      return { x: 0, y: 0, boxLines: [] as string[] };
    }

    // Build items with highlight support
    const displayItems: { text: string; highlight?: boolean; dim?: boolean }[] = menu.items.map((item, i) => ({
      text: formatItem(item),
      highlight: focused && i === highlightIndex,
      dim: !focused || item.disabled,
    }));

    // Add separator before footer
    displayItems.push({ text: '─'.repeat(MENU_WIDTH - 4), dim: true });

    const boxLines = buildOverlayBox(displayItems, MENU_WIDTH, '↑↓ to select  Enter/Key to act  Esc to close');
    // Dim entire border when unfocused
    const styledLines = focused ? boxLines : boxLines.map(l => `\x1b[2m${l}\x1b[0m`);
    return { x: menu.x, y: menu.y, boxLines: styledLines };
  }, [menu, highlightIndex, focused]);

  useAnsiOverlay(visible, x, y, boxLines, MENU_WIDTH);

  return null; // Nothing in Ink's render tree
};
