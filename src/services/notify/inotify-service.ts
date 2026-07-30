/**
 * INotifyService — notification queue management.
 * Pure logic, no React dependency.
 */

export interface NotifyItem {
  id: number;
  message: string;
  actions: NotifyAction[];
  /** Auto-dismiss timeout in ms. 0 or undefined = no auto-dismiss. */
  timeout?: number;
}

export interface NotifyAction {
  key: string;
  label: string;
  onPress: () => void;
}

export interface INotifyService {
  /** Current notifications (immutable snapshot). */
  readonly items: ReadonlyArray<NotifyItem>;

  /** Add a notification. Returns the id. timeout=0 for no auto-dismiss. */
  add(message: string, actions?: NotifyAction[], timeout?: number): number;

  /** Dismiss a notification by id. */
  dismiss(id: number): void;

  /** True if any notification has actionable buttons. */
  readonly hasActionable: boolean;

  /** Subscribe to state changes. Returns unsubscribe function. */
  onChange(fn: () => void): () => void;
}
