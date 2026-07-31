/**
 * SidebarPanel — file tree with keyboard navigation and context menu.
 *
 * Subscribes to WorkspaceService for tree data, EditorService for active/dirty state,
 * and handles sidebar-focused keyboard input (arrow keys, enter, shortcuts).
 */
import React, { useCallback, useEffect } from 'react';
import { Sidebar } from '../components/sidebar.js';
import { useService } from '../hooks/use-service.js';
import { useEditorAPI } from '../hooks/use-service.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { IWorkspaceService } from '../../services/workspace/iworkspace-service.js';
import type { IEditorService } from '../../core/editor/editor-service.js';
import type { IGitService } from '../../services/git/igit-service.js';
import type { FileEntry } from '../../types/index.js';

export interface SidebarPanelProps {
  width: number;
  editorHeight: number;
  onScrollChange?: (offset: number) => void;
}

export const SidebarPanel: React.FC<SidebarPanelProps> = ({ width, editorHeight, onScrollChange }) => {
  const api = useEditorAPI();
  const ws = useService<IWorkspaceService>(TOKENS.WorkspaceService);
  const editor = useService<IEditorService>(TOKENS.EditorService);

  // Git workspace status — via useService to re-render on async cache updates
  const git = useService<IGitService>(TOKENS.GitService);
  const gitStatus = git.getWorkspaceStatus();

  // Load tree on mount
  useEffect(() => {
    api.bootstrap();
  }, [api]);

  // Handle file selection (double-click / enter)
  const handleSelectFile = useCallback((entry: FileEntry) => {
    if (entry.isDirectory) {
      // Load children if not yet loaded, then toggle expand
      ws.toggleExpand(entry.path);
      return;
    }
    if (entry.path === editor.activePath) return;
    if (editor.activePath && editor.isDirty(editor.activePath)) {
      // Note: the actual current content is managed by EditorPanel
    }
    const cached = editor.getDirtyCache(entry.path);
    if (cached !== undefined) {
      editor.open(entry.path);
      api.mode.setMode('auto');
      api.focus.set('editor');
    } else {
      (async () => {
        try {
          // Binary detection — prompt before potentially garbled read
          if (await api.fs.isProbablyBinary(entry.path)) {
            const answer = await api.prompt.open(
              'File appears to be binary. Open anyway? [y/N]',
            );
            if (answer === null || (answer !== 'y' && answer !== 'yes')) return;
          }
          const text = await api.fs.readFile(entry.path);
          editor.setLoadedContent(entry.path, text);
          editor.markClean(entry.path);
          editor.open(entry.path);
          api.mode.setMode('auto');
          api.focus.set('editor');
          api.events.emit('file:opened', { path: entry.path });
        } catch {
          api.notify.add(`Cannot read: ${entry.name}`, [], 5000);
        }
      })();
    }
  }, [api, ws, editor]);

  return (
    <Sidebar
      entries={[
        { name: '/', path: '/', isDirectory: true, children: ws.tree },
      ]}
      activePath={editor.activePath ?? undefined}
      selectedPath={ws.sidebarPath}
      dirtyFiles={editor.dirtyFiles}
      gitStatus={gitStatus}
      height={Math.max(1, editorHeight - 4)}
      expandedPaths={new Set(ws.expandedPaths)}
      onSelectFile={handleSelectFile}
      onScrollChange={onScrollChange}
      width={width}
    />
  );
};
