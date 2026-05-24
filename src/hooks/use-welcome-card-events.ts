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
 * Migrado en v1.2.7 al helper tipado `addGlobalEventListener`
 * (`src/lib/global-events.ts`). Sin cambios de contrato, payload o efectos.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRightPanel } from '@/hooks/use-right-panel';
import { addGlobalEventListener } from '@/lib/global-events';

export function useWelcomeCardEvents(): void {
  const navigate = useNavigate();
  const { open } = useRightPanel();

  useEffect(() => {
    const offUpload = addGlobalEventListener('vandits:open-upload', () => {
      open('importedContent', { tab: 'upload' });
    });
    const offProfile = addGlobalEventListener('vandits:open-profile', (detail) => {
      const tab = detail?.tab ?? 'map';
      open('profileEditor', { tab });
    });
    // PR-BACKOFFICE-UX-CANON-3: geography e image-recovery viven en /admin/*.
    const offGeography = addGlobalEventListener('admin:open-geography', () => {
      navigate('/admin/geography');
    });
    const offDataSources = addGlobalEventListener('admin:open-data-sources', () => {
      navigate('/admin/image-recovery');
    });
    return () => {
      offUpload();
      offProfile();
      offGeography();
      offDataSources();
    };
  }, [open, navigate]);
}
