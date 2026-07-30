/**
 * OverlayLayer — renders notify stack + context menu + prompt + command palette.
 *
 * State comes from DI services + promptValue prop (input managed by app.tsx).
 */
import React from 'react';
import { Box, Text } from 'ink';
import { ContextMenu } from '../components/context-menu.js';
import { NotifyStack } from '../components/notify.js';
import { CommandPalette } from '../components/command-palette.js';
import { useService } from '../hooks/use-service.js';
import { useEditorAPI } from '../hooks/use-service.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { INotifyService } from '../../services/notify/inotify-service.js';
import type { IPromptService } from '../../services/prompt/iprompt-service.js';
import type { IMenuService } from '../../services/menu/imenu-service.js';
import type { IFocusService } from '../../services/focus/ifocus-service.js';

export interface OverlayLayerProps {
  cols: number;
  rows: number;
  showPalette: boolean;
  onClosePalette: () => void;
  promptValue: string;
}

export const OverlayLayer: React.FC<OverlayLayerProps> = ({
  cols, rows, showPalette, onClosePalette, promptValue,
}) => {
  const api = useEditorAPI();
  const notify = useService<INotifyService>(TOKENS.NotifyService);
  const prompt = useService<IPromptService>(TOKENS.PromptService);
  const menu = useService<IMenuService>(TOKENS.MenuService);
  const focus = useService<IFocusService>(TOKENS.FocusService);

  return (
    <>
      <ContextMenu
        menu={menu.state}
        onClose={() => menu.close()}
        highlightIndex={menu.highlightIndex}
        focused={focus.current === 'menu'}
      />

      <NotifyStack
        items={notify.items as any}
        rows={rows}
        cols={cols}
        focused={focus.current === 'notify'}
      />

      {prompt.isOpen && prompt.state && (
        <Box flexDirection="row" width={cols} paddingX={1}>
          <Text bold>{prompt.state.title}: </Text>
          <Text>{prompt.state.password ? '*'.repeat(promptValue.length) : promptValue}</Text>
          <Text dimColor>█</Text>
          <Box marginLeft={2}>
            <Text dimColor>Enter to confirm, Esc to cancel</Text>
          </Box>
        </Box>
      )}

      {showPalette && (
        <Box>
          <CommandPalette
            commands={api.commands.getAll()}
            visible={showPalette}
            onExecute={() => onClosePalette()}
            onClose={() => onClosePalette()}
          />
        </Box>
      )}
    </>
  );
};
