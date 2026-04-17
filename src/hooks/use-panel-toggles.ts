/**
 * usePanelToggles — Bundles the boolean panel-open flags that
 * `pages/Index.tsx` used to track as individual useState declarations.
 *
 * Each panel exposes a stable `set` setter. This is purely state
 * collocation — no business logic — so Index.tsx can stay focused
 * on composition.
 *
 * NOTE: `upload`, `documents` y `oneDrivePhotos` se han fusionado en un único
 * `importedContent` con `importedContentTab` para reflejar que las tres
 * entradas pertenecen al mismo flujo conceptual (fuentes + biblioteca).
 * Ver: mem://ui/imported-content-panel
 */
import { useState, useCallback } from 'react';
import type { ImportedContentTab } from '@/components/ImportedContentPanel';

export interface PanelTogglesState {
  importedContent: boolean;
  batchEnrichment: boolean;
  exportPanel: boolean;
  criteriaConfig: boolean;
  profileEditor: boolean;
  adminPanel: boolean;
  usersSidebar: boolean;
  trash: boolean;
  soundSettings: boolean;
  categories: boolean;
  preferences: boolean;
}

const INITIAL: PanelTogglesState = {
  importedContent: false,
  batchEnrichment: false,
  exportPanel: false,
  criteriaConfig: false,
  profileEditor: false,
  adminPanel: false,
  usersSidebar: false,
  trash: false,
  soundSettings: false,
  categories: false,
  preferences: false,
};

export function usePanelToggles() {
  const [panels, setPanels] = useState<PanelTogglesState>(INITIAL);
  const [importedContentTab, setImportedContentTab] =
    useState<ImportedContentTab>('documents');

  const set = useCallback(<K extends keyof PanelTogglesState>(key: K, value: boolean) => {
    setPanels((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const open = useCallback(<K extends keyof PanelTogglesState>(key: K) => set(key, true), [set]);
  const close = useCallback(<K extends keyof PanelTogglesState>(key: K) => set(key, false), [set]);

  /**
   * Abre el panel unificado de Contenido y (opcionalmente) en una pestaña
   * concreta. Preserva los atajos directos que existían cuando había 3
   * entradas separadas en el menú.
   */
  const openImportedContent = useCallback(
    (tab?: ImportedContentTab) => {
      if (tab) setImportedContentTab(tab);
      set('importedContent', true);
    },
    [set],
  );

  return {
    panels,
    set,
    open,
    close,
    importedContentTab,
    setImportedContentTab,
    openImportedContent,
  };
}
