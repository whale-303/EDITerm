import React from 'react';
import type { MouseEvent } from '../../core/interaction/mouse-protocol.js';
import type { EditorMode, VimSubMode } from '../../core/interaction/mode-manager.js';

export interface InputContextValue {
  /** Latest mouse event (null if none since last consume). */
  mouse: MouseEvent | null;
  /** Consume the pending mouse event. */
  consumeMouse: () => void;
  /** Current top-level editor mode. */
  mode: EditorMode;
  /** Current VIM sub-mode (only meaningful when mode='vim'). */
  vimSub: VimSubMode;
  /** Request a mode transition by key. */
  dispatchKey: (key: string) => void;
  /** Force a mode (e.g. after command execution). */
  setMode: (m: EditorMode) => void;
}

export const InputContext = React.createContext<InputContextValue>({
  mouse: null,
  consumeMouse: () => {},
  mode: 'normal',
  vimSub: 'vim-normal',
  dispatchKey: () => {},
  setMode: () => {},
});
