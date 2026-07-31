/**
 * Barrel export for the contribution system.
 */

export { ContributionHost } from './contribution-host.js';
export { InputHandlerRegistry } from './input-handler-registry.js';
export { PopupRegistry } from './popup-registry.js';
export { ContextKeyRegistry } from './context-key-registry.js';
export { FocusTargetRegistry } from './focus-target-registry.js';
export { LifecycleRegistry } from './lifecycle-registry.js';
export { PanelRegistry } from './panel-registry.js';
export type {
  IInputHandler,
  IPopupProvider,
  IContextKeyProvider,
  IFocusTargetProvider,
  ILifecycleHook,
  IPanelContribution,
  PanelSlot,
  PanelRenderProps,
  WhenContext,
} from './types.js';
