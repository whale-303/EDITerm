/**
 * StatusBarPanel — thin wrapper that reads mode/focus from DI services
 * and renders the status bar.
 */
import React from 'react';
import { StatusBar } from '../components/status-bar.js';
import { getService } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { IModeService } from '../../core/interaction/mode-service.js';
import type { IFocusService } from '../../services/focus/ifocus-service.js';
import type { IEditorService } from '../../core/editor/editor-service.js';

export interface StatusBarPanelProps {
  cols: number;
  cursorRow: number;
  cursorCol: number;
}

export const StatusBarPanel: React.FC<StatusBarPanelProps> = ({ cols, cursorRow, cursorCol }) => {
  const modeSvc = getService<IModeService>(TOKENS.ModeService);
  const focusSvc = getService<IFocusService>(TOKENS.FocusService);
  const editorSvc = getService<IEditorService>(TOKENS.EditorService);

  const mode = modeSvc.mode;
  const vimSub = modeSvc.vimSubMode;
  const focusTarget = focusSvc.current;
  const fileName = editorSvc.activePath ? editorSvc.activePath.split('/').pop() ?? 'untitled' : 'untitled';

  const modeLabel = mode === 'vim'
    ? `VIM:${vimSub.toUpperCase().replace('VIM-NORMAL', 'NORMAL')}`
    : mode.toUpperCase();

  return (
    <StatusBar
      fileName={fileName}
      cursorLine={cursorRow + 1}
      cursorCol={cursorCol + 1}
      mode={modeLabel}
      cols={cols}
      focusTarget={focusTarget}
    />
  );
};
