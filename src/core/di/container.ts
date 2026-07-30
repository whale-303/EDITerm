/**
 * Minimal DI container for EDITerm.
 *
 * Services register themselves at import time via register().
 * The container lazily creates singletons on first get().
 */

type ServiceFactory<T> = (get: typeof getService) => T;

interface ServiceEntry<T = unknown> {
  token: symbol;
  factory: ServiceFactory<T>;
  instance?: T;
}

const registry = new Map<symbol, ServiceEntry>();

/**
 * Register a service factory. The factory receives `get` so it can
 * resolve its own dependencies at construction time.
 */
export function register<T>(token: symbol, factory: ServiceFactory<T>): void {
  if (registry.has(token)) {
    throw new Error(`Duplicate service token: ${token.description}`);
  }
  registry.set(token, { token, factory });
}

/** Retrieve (or lazily create) a service singleton. */
export function getService<T>(token: symbol): T {
  const entry = registry.get(token);
  if (!entry) throw new Error(`Service not registered: ${token.description}`);
  if (!entry.instance) {
    entry.instance = entry.factory(getService);
  }
  return entry.instance as T;
}

/** Test helper: reset all services. */
export function resetContainer(): void {
  registry.clear();
}
