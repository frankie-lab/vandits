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
 * Restricciones (contrato invariante):
 * - NO renombra eventos.
 * - NO cambia payloads.
 * - NO cambia contratos de popup.
 * - SOLO mueve la lógica fuera de Index.tsx para reducir su responsabilidad.
 *
 * Ver `docs/tech-debt.md` ítem 5.
 */
import { useEffect } from 'react';

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
    const handleCriteriaChange = () => setCriteriaVersion(v => v + 1);
    window.addEventListener('enrichment-criteria-changed', handleCriteriaChange);
    return () => window.removeEventListener('enrichment-criteria-changed', handleCriteriaChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleOpenCategories = () => open('categories');
    window.addEventListener('import:open-categories', handleOpenCategories);
    return () => window.removeEventListener('import:open-categories', handleOpenCategories);
  }, [open]);

  useEffect(() => {
    const handleFollowChanged = async () => {
      console.log('[Index] Follow changed, refreshing map data...');
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadFromDatabase();
    };
    window.addEventListener('lovable:follow-changed', handleFollowChanged);
    return () => window.removeEventListener('lovable:follow-changed', handleFollowChanged);
  }, [loadFromDatabase]);

  useEffect(() => {
    const handler = (e: Event) => handlePopupAction(e as CustomEvent);
    window.addEventListener('popup-action', handler);
    return () => window.removeEventListener('popup-action', handler);
  }, [handlePopupAction]);
}
