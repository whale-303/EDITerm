/**
 * editor-stats — example EDITerm extension.
 *
 * Demonstrates the ExtensionAPI:
 *  - activate(api) convention (VSCode-style)
 *  - Registering commands with keybindings
 *  - Subscribing to events (file:opened, file:saved, mode:changed)
 *  - Using api.notify for user feedback
 *  - Reading editor state via api.editor
 *
 * Usage in EDITerm:
 *   Press '!' — show accumulated stats
 *   Press '@' — show word count of current file (when focus==editor)
 */

/** @param {import('../../src/core/extensions/extension-host').ExtensionAPI} api */
export async function activate(api) {
  const stats = {
    filesOpened: 0,
    filesSaved: 0,
    modeChanges: 0,
  };

  // ── Subscribe to domain events ────────────────────────

  api.events.on('file:opened', () => {
    stats.filesOpened++;
  });

  api.events.on('file:saved', () => {
    stats.filesSaved++;
  });

  api.events.on('mode:changed', () => {
    stats.modeChanges++;
  });

  // ── Command: show stats report ────────────────────────

  api.commands.register({
    id: 'editor-stats.show',
    label: 'Show Editor Stats',
    keybinding: '!',
    when: 'global',
    run: () => {
      api.notify.add(
        `Stats | Files opened: ${stats.filesOpened} | Saved: ${stats.filesSaved} | Mode changes: ${stats.modeChanges}`,
        [],
        8000,
      );
    },
  });

  // ── Command: word count in current file ───────────────

  api.commands.register({
    id: 'editor-stats.wordCount',
    label: 'Word Count (current file)',
    keybinding: '@',
    when: 'focus==editor',
    run: async () => {
      const path = api.editor.activePath;
      if (!path) {
        api.notify.add('No file open', [], 5000);
        return;
      }

      try {
        const content = await api.fs.readFile(path);
        const words = content.trim().split(/\s+/).filter(Boolean).length;
        const lines = content.split('\n').length;
        const chars = content.length;
        api.notify.add(
          `${api.fs.baseName(path)} | ${words} words | ${lines} lines | ${chars} chars`,
          [],
          8000,
        );
      } catch (e) {
        api.notify.add(`Word count failed: ${e.message}`, [], 5000);
      }
    },
  });
}
