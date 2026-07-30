/**
 * SidebarPanel — file tree with keyboard navigation and context menu.
 *
 * Subscribes to WorkspaceService for tree data, EditorService for active/dirty state,
 * and handles sidebar-focused keyboard input (arrow keys, enter, shortcuts).
 */
import React, { useCallback, useRef, useEffect } from 'react';
import { Sidebar } from '../components/sidebar.js';
import { showContextMenu } from './context-menu-builder.js';
import { useService } from '../hooks/use-service.js';
import { useEditorAPI } from '../hooks/use-service.js';
import { TOKENS } from '../../core/di/tokens.js';
import type { IWorkspaceService } from '../../services/workspace/iworkspace-service.js';
import type { IEditorService } from '../../core/editor/editor-service.js';
import type { IFocusService } from '../../services/focus/ifocus-service.js';
import type { IModeService } from '../../core/interaction/mode-service.js';
import type { IClipboardService } from '../../services/clipboard/iclipboard-service.js';
import type { FileEntry } from '../../types/index.js';

export interface SidebarPanelProps {
  width: number;
  editorHeight: number;
}

export const SidebarPanel: React.FC<SidebarPanelProps> = ({ width, editorHeight }) => {
  const api = useEditorAPI();
  const ws = useService<IWorkspaceService>(TOKENS.WorkspaceService);
  const editor = useService<IEditorService>(TOKENS.EditorService);

  // Load tree on mount
  useEffect(() => {
    api.bootstrap();
  }, [api]);

  // Handle file selection (double-click / enter)
  const handleSelectFile = useCallback((entry: FileEntry) => {
    if (entry.isDirectory) {
      ws.toggleExpand(entry.path);
      // Children lazy-loaded by toggleExpand — no need for full refreshTree
      return;
    }
    // If same file, skip
    if (entry.path === editor.activePath) return;
    // Cache dirty content of current file
    if (editor.activePath && editor.isDirty(editor.activePath)) {
      // Note: the actual current content is managed by EditorPanel
      // For now, trust the EditorService's dirty tracking
    }
    // Check cached dirty version
    const cached = editor.getDirtyCache(entry.path);
    if (cached !== undefined) {
      editor.open(entry.path);
      api.mode.setMode('auto');
      api.focus.set('editor');
    } else {
      api.fs.readFile(entry.path).then((text) => {
        editor.setLoadedContent(entry.path, text);
        editor.markClean(entry.path);
        editor.open(entry.path);
        api.mode.setMode('auto');
        api.focus.set('editor');
        api.events.emit('file:opened', { path: entry.path });
      }).catch(() => {
        api.notify.add(`Cannot read: ${entry.name}`, [], 5000);
        // File no longer exists — reset cursor to root
        ws.setSidebarPath('/');
      });
    }
  }, [api, ws, editor]);

  return (
    <Sidebar
      entries={[
        { name: '/ (workspace)', path: '/', isDirectory: true, children: ws.tree },
      ]}
      activePath={editor.activePath ?? undefined}
      selectedPath={ws.sidebarPath}
      dirtyFiles={editor.dirtyFiles}
      height={Math.max(1, editorHeight - 4)}
      expandedPaths={new Set(ws.expandedPaths)}
      onSelectFile={handleSelectFile}
      width={width}
    />
  );
};
