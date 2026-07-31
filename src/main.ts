#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { MouseHandler } from './core/interaction/mouse-handler.js';
import type { MouseEvent } from './core/interaction/mouse-protocol.js';

// Boot: import all services so they self-register with the DI container
import './core/editor/editor-service.js';
import './core/layout/layout-manager.js';
import './core/commands/command-registry.js';
import './core/extensions/extension-host.js';
import './services/file/vfs.js';
import './services/theme/theme-service.js';
import './services/tts/TTSService.js';

if (!process.stdin.isTTY) {
  console.error('EDITerm requires a real terminal (TTY).');
  process.exit(1);
}

// ── Mouse via SGR tracking (Claude Code approach) ─────
// Uses 'readable' + read() on stdin, sends DECSET 1000/1002/1003/1006.
// Mouse events and keyboard coexist on the same stdin stream.
const mouse = new MouseHandler();
const mouseSink: { cb: ((e: MouseEvent) => void) | null } = { cb: null };
mouse.onMouse((e) => mouseSink.cb?.(e));
mouse.start();

// Lazy import App
import('./ui/app.js').then(({ App }) => {
  const { waitUntilExit } = render(
    React.createElement(App, { mouseSink }),
    {
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
    },
  );

  waitUntilExit().then(() => {
    mouse.stop();
    process.exit(0);
  });
});

// Safety net
process.on('exit', () => {
  process.stdin.setRawMode?.(false);
  process.stdout.write('\x1b[?25h'); // show cursor
});
