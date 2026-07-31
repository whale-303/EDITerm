/**
 * Pure path utility functions for VFS ↔ OS path conversion.
 *
 * These are STANDALONE functions with NO filesystem access.
 * They only depend on node:path (pure string manipulation).
 *
 * Used by:
 *   - LocalFileProvider (maps VFS paths ↔ Windows real paths)
 *   - GitService        (gets real paths for git CLI)
 *   - EditorAPI         (converts user-provided real paths to VFS)
 */

import { resolve, sep } from 'node:path';

// ── VFS → Real ──────────────────────────────────────

/**
 * Convert a VFS path (/c/Users/foo) to a real OS path (C:\Users\foo).
 * Root (/) returns '' (filesystem root — no single path on Windows).
 */
export function vfsToReal(vpath: string): string {
  const cleaned = vpath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  if (cleaned === '/') return '';
  const parts = cleaned.split('/').filter(Boolean);
  const first = parts[0] ?? '';
  if (/^[a-zA-Z]$/.test(first)) {
    const rest = parts.slice(1).join(sep);
    return rest ? `${first.toUpperCase()}:${sep}${rest}` : `${first.toUpperCase()}:${sep}`;
  }
  // Fallback: resolve relative to cwd
  return resolve(cleaned);
}

// ── Real → VFS ──────────────────────────────────────

/**
 * Convert a real OS path (C:\Users\foo) to a VFS path (/c/Users/foo).
 */
export function realToVfs(realPath: string): string {
  const normalized = resolve(realPath).replace(/\\/g, '/');
  const match = /^([a-zA-Z]):(.*)$/.exec(normalized);
  if (match) {
    const drive = match[1].toLowerCase();
    const rest = match[2].replace(/\/+$/, '');
    return rest ? `/${drive}${rest}` : `/${drive}`;
  }
  return normalized;
}

// ── VFS path components ─────────────────────────────

/** Get the parent VFS path. "/c/Users" → "/c", "/c" → "/", "/" → "/". */
export function vfsParent(vpath: string): string {
  const cleaned = vpath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (cleaned === '' || cleaned === '/') return '/';
  const last = cleaned.lastIndexOf('/');
  return last <= 0 ? '/' : cleaned.slice(0, last);
}

/** Get the base name of a VFS path. "/c/Users/foo.txt" → "foo.txt". */
export function vfsBaseName(vpath: string): string {
  const parts = vpath.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/**
 * Normalize a VFS path to a canonical form for case-insensitive comparison.
 *
 * Lowercases the entire path and normalizes slashes. This is the canonical
 * key used for Map/Set lookups and `===` comparisons throughout the system.
 *
 * Why: Windows NTFS is case-preserving but case-insensitive. Git on Windows
 * (with core.ignorecase=true) may return paths with different casing than
 * node:fs. Normalizing to a single canonical form eliminates mismatches.
 *
 * On case-sensitive filesystems (Linux/SSH), the original casing is still
 * used for actual filesystem operations — this function is only for
 * COMPARISON purposes within the VFS routing and UI layers.
 */
export function normalizeVfsPath(vpath: string): string {
  return vpath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase() || '/';
}

/** Resolve segments into a VFS path. */
export function vfsResolve(...segments: string[]): string {
  const joined = segments.join('/').replace(/\\/g, '/');
  const parts = joined.split('/').filter(Boolean);
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === '.') continue;
    if (p === '..') { resolved.pop(); continue; }
    resolved.push(p);
  }
  return '/' + resolved.join('/');
}
