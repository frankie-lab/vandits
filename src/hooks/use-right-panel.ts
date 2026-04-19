/**
 * useRightPanel — Centralized registry for the single right-side panel slot.
 *
 * Rule: Only one panel can be open at a time on the right column.
 * Opening a new one automatically closes the previous one. This eliminates
 * z-index/overlap bugs that were caused by multiple independent boolean
 * flags racing for the same fixed `right-4` slot.
 *
 * Modal dialogs (shadcn `<Dialog>`) are intentionally OUT of this registry —
 * they are overlays, not side panels (e.g. `exportPanel`, `batchEnrichment`,
 * `criteriaConfig`).
 *
 * Optional `payload` covers panels that need a sub-state (e.g.
 * ImportedContent's tab, ProfileEditor's tab, AdminPanel's tab).
 */
import { create } from 'zustand';

export type RightPanelId =
  // Content / curation
  | 'importedContent'
  | 'categories'
  | 'preferences'
  | 'profileEditor'
  | 'soundSettings'
  | 'trash'
  | 'adminPanel'
  | 'usersSidebar'
  // Discovery
  | 'filters'
  | 'locations'
  | 'gallery'
  | 'semanticSearch'
  | 'duplicates'
  | 'incomplete'
  | 'unresolved'
  | 'layers'
  // Routes
  | 'routes'
  | 'routeBuilder'
  | 'routeSettings';

export type RightPanelPayload = Record<string, unknown> | undefined;

interface RightPanelState {
  activeId: RightPanelId | null;
  payload: RightPanelPayload;
  open: (id: RightPanelId, payload?: RightPanelPayload) => void;
  close: (id?: RightPanelId) => void;
  toggle: (id: RightPanelId, payload?: RightPanelPayload) => void;
}

export const useRightPanelStore = create<RightPanelState>((set, get) => ({
  activeId: null,
  payload: undefined,
  open: (id, payload) => set({ activeId: id, payload }),
  close: (id) => {
    if (id && get().activeId !== id) return;
    set({ activeId: null, payload: undefined });
  },
  toggle: (id, payload) => {
    const current = get().activeId;
    if (current === id) {
      set({ activeId: null, payload: undefined });
    } else {
      set({ activeId: id, payload });
    }
  },
}));

/**
 * Hook with `isOpen(id)` helper. Subscribes to activeId so consumers
 * re-render when the active panel changes.
 */
export function useRightPanel() {
  const activeId = useRightPanelStore((s) => s.activeId);
  const payload = useRightPanelStore((s) => s.payload);
  const open = useRightPanelStore((s) => s.open);
  const close = useRightPanelStore((s) => s.close);
  const toggle = useRightPanelStore((s) => s.toggle);

  return {
    activeId,
    payload,
    open,
    close,
    toggle,
    isOpen: (id: RightPanelId) => activeId === id,
  };
}
