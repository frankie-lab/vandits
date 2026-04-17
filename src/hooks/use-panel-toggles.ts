/**
 * usePanelToggles — Bundles the 12+ boolean panel-open flags that
 * `pages/Index.tsx` used to track as individual useState declarations.
 *
 * Each panel exposes a stable `set` setter. This is purely state
 * collocation — no business logic — so Index.tsx can stay focused
 * on composition.
 */
import { useState, useCallback } from 'react';

export interface PanelTogglesState {
  upload: boolean;
  batchEnrichment: boolean;
  exportPanel: boolean;
  criteriaConfig: boolean;
  profileEditor: boolean;
  adminPanel: boolean;
  usersSidebar: boolean;
  trash: boolean;
  soundSettings: boolean;
  documents: boolean;
  oneDrivePhotos: boolean;
  categories: boolean;
  preferences: boolean;
}

const INITIAL: PanelTogglesState = {
  upload: false,
  batchEnrichment: false,
  exportPanel: false,
  criteriaConfig: false,
  profileEditor: false,
  adminPanel: false,
  usersSidebar: false,
  trash: false,
  soundSettings: false,
  documents: false,
  oneDrivePhotos: false,
  categories: false,
  preferences: false,
};

export function usePanelToggles() {
  const [panels, setPanels] = useState<PanelTogglesState>(INITIAL);

  const set = useCallback(<K extends keyof PanelTogglesState>(key: K, value: boolean) => {
    setPanels((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const open = useCallback(<K extends keyof PanelTogglesState>(key: K) => set(key, true), [set]);
  const close = useCallback(<K extends keyof PanelTogglesState>(key: K) => set(key, false), [set]);

  return { panels, set, open, close };
}
