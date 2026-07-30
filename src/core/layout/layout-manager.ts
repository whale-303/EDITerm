import { register } from '../di/container.js';
import { TOKENS } from '../di/tokens.js';
import type { PanelDescriptor, PanelOrientation, SplitNode, LeafNode, LayoutNode } from '../../types/index.js';

export interface TabGroup {
  id: string;
  panels: PanelDescriptor[];
  activeIndex: number;
}

export interface ILayoutManager {
  readonly root: LayoutNode | null;
  readonly tabGroups: Map<string, TabGroup>;
  addPanel(panel: PanelDescriptor, groupId?: string): string;
  split(groupId: string, orientation: PanelOrientation, ratio?: number): void;
  removeGroup(groupId: string): void;
  focus(panelId: string): void;
}

export class LayoutManager implements ILayoutManager {
  root: LayoutNode | null = null;
  tabGroups = new Map<string, TabGroup>();

  addPanel(panel: PanelDescriptor, groupId?: string): string {
    const gid = groupId ?? `group-${Date.now()}`;
    let group = this.tabGroups.get(gid);
    if (!group) {
      group = { id: gid, panels: [], activeIndex: 0 };
      this.tabGroups.set(gid, group);
      if (!this.root) {
        this.root = { tabGroup: gid } as LeafNode;
      }
    }
    group.panels.push(panel);
    group.activeIndex = group.panels.length - 1;
    return panel.id;
  }

  split(groupId: string, orientation: PanelOrientation, ratio = 0.5): void {
    const leaf: LeafNode = { tabGroup: groupId };
    const newLeaf: LeafNode = { tabGroup: `group-${Date.now()}` };
    const split: SplitNode = {
      orientation,
      ratio,
      children: [leaf, newLeaf],
    };
    this.tabGroups.set(newLeaf.tabGroup, { id: newLeaf.tabGroup, panels: [], activeIndex: 0 });
    this.root = split;
  }

  removeGroup(groupId: string): void {
    this.tabGroups.delete(groupId);
    if (this.root && 'tabGroup' in this.root && this.root.tabGroup === groupId) {
      this.root = null;
    }
  }

  focus(panelId: string): void {
    for (const group of this.tabGroups.values()) {
      const idx = group.panels.findIndex((p) => p.id === panelId);
      if (idx !== -1) group.activeIndex = idx;
    }
  }
}

register(TOKENS.LayoutManager, () => new LayoutManager());
