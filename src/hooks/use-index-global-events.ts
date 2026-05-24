/**
 * useIndexGlobalEvents
 *
 * Tercera extracción incremental desde `src/pages/Index.tsx` (deuda técnica
 * ítem 5). Agrupa los listeners globales restantes que orquestaban en línea
 * dentro de la página:
 *
 * - `enrichment-criteria-changed` → bump de `criteriaVersion`
 * - `import:open-categories`      → abre panel "categories"
 * - `lovable:follow-changed`      → recarga datos del mapa con 500ms de gracia
 * - `popup-action`                → delega en `handlePopupAction(e)`
 *
 * Migrado en v1.2.7 al helper tipado `addGlobalEventListener`
 * (`src/lib/global-events.ts`). Sin cambios de nombres de eventos, payloads,
 * delays, `console.log` ni contratos de popup.
 */
import { useEffect } from 'react';
import { addGlobalEventListener } from '@/lib/global-events';

interface UseIndexGlobalEventsParams {
  setCriteriaVersion: (updater: (v: number) => number) => void;
  open: (panelId: string) => void;
  loadFromDatabase: () => Promise<void> | void;
  handlePopupAction: (e: CustomEvent) => void;
}

export function useIndexGlobalEvents({
  setCriteriaVersion,
  open,
  loadFromDatabase,
  handlePopupAction,
}: UseIndexGlobalEventsParams): void {
  useEffect(() => {
    const off = addGlobalEventListener('enrichment-criteria-changed', () => {
      setCriteriaVersion((v) => v + 1);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const off = addGlobalEventListener('import:open-categories', () => {
      open('categories');
    });
    return off;
  }, [open]);

  useEffect(() => {
    const off = addGlobalEventListener('lovable:follow-changed', async () => {
      console.log('[Index] Follow changed, refreshing map data...');
      await new Promise((resolve) => setTimeout(resolve, 500));
      await loadFromDatabase();
    });
    return off;
  }, [loadFromDatabase]);

  useEffect(() => {
    const off = addGlobalEventListener('popup-action', (_detail, event) => {
      handlePopupAction(event as CustomEvent);
    });
    return off;
  }, [handlePopupAction]);
}
