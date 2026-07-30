/**
 * Input capture stack — routes keyboard input to the topmost handler.
 *
 * Handlers are LIFO: the most recently pushed handler receives input first.
 * A handler returns `true` to consume the input, `false` to pass it down.
 *
 * Uses refs (NOT state) for the stack — handlers don't affect rendering,
 * so state updates here would trigger needless Ink re-renders that clear
 * ANSI overlay output via log-update.
 *
 * Usage:
 *   const stack = useInputStack();
 *   stack.push('menu', (input, key) => { ... });
 *   stack.pop('menu');
 *   useInput((input, key) => stack.dispatch(input, key));
 */

import { useCallback, useRef } from 'react';

export interface Key {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  return: boolean;
  escape: boolean;
  backspace: boolean;
  delete: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
}

export type InputHandlerFn = (input: string, key: Key) => boolean;

interface HandlerEntry {
  id: string;
  fn: InputHandlerFn;
}

export function useInputStack() {
  const stackRef = useRef<HandlerEntry[]>([]);

  /** Push a handler onto the stack. Silently replaces an existing handler with the same id. */
  const push = useCallback((id: string, fn: InputHandlerFn) => {
    const prev = stackRef.current;
    const filtered = prev.filter((h) => h.id !== id);
    stackRef.current = [...filtered, { id, fn }];
  }, []);

  /** Remove a handler by id. */
  const pop = useCallback((id: string) => {
    stackRef.current = stackRef.current.filter((h) => h.id !== id);
  }, []);

  /** Check if a handler is currently on the stack. */
  const has = useCallback((id: string) => {
    return stackRef.current.some((h) => h.id === id);
  }, []);

  /** Dispatch input to the topmost handler. Returns true if consumed. */
  const dispatch = useCallback((input: string, key: Key): boolean => {
    const s = stackRef.current;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].fn(input, key)) return true;
    }
    return false;
  }, []);

  return { push, pop, has, dispatch };
}
