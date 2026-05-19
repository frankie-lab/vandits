/**
 * useWelcomeCardEvents
 *
 * Primera extracción incremental de orquestación desde `src/pages/Index.tsx`
 * (deuda técnica ítem 5). Encapsula los listeners de eventos globales que
 * disparan los CTAs emitidos por el empty-state del mapa ("welcome card"):
 *
 * - `vandits:open-upload`         → abre panel ImportedContent en tab "upload"
 * - `vandits:open-profile`        → abre editor de perfil en el tab indicado
 * - `admin:open-geography`        → navega a /admin/geography
 * - `admin:open-data-sources`     → navega a /admin/image-recovery
 *
 * Restricciones (contrato invariante):
 * - NO renombra eventos.
 * - NO cambia payloads.
 * - NO cambia el comportamiento observable.
 * - SOLO mueve la lógica fuera de Index.tsx para reducir su responsabilidad.
 *
 * Ver `docs/tech-debt.md` ítem 5 y `docs/architecture/global-events.md`.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRightPanel } from '@/hooks/use-right-panel';

export function useWelcomeCardEvents(): void {
  const navigate = useNavigate();
  const { open } = useRightPanel();

  useEffect(() => {
    const onOpenUpload = () => open('importedContent', { tab: 'upload' });
    const onOpenProfile = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab ?? 'map';
      open('profileEditor', { tab });
    };
    // PR-BACKOFFICE-UX-CANON-3: geography e image-recovery viven en /admin/*.
    const onOpenGeography = () => navigate('/admin/geography');
    const onOpenDataSources = () => navigate('/admin/image-recovery');

    window.addEventListener('vandits:open-upload', onOpenUpload);
    window.addEventListener('vandits:open-profile', onOpenProfile as EventListener);
    window.addEventListener('admin:open-geography', onOpenGeography);
    window.addEventListener('admin:open-data-sources', onOpenDataSources);
    return () => {
      window.removeEventListener('vandits:open-upload', onOpenUpload);
      window.removeEventListener('vandits:open-profile', onOpenProfile as EventListener);
      window.removeEventListener('admin:open-geography', onOpenGeography);
      window.removeEventListener('admin:open-data-sources', onOpenDataSources);
    };
  }, [open, navigate]);
}
