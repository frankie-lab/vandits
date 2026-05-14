/**
 * SourceFilterBridge — listener global para `lovable:apply-source-filter`.
 *
 * Cuando un `<SourceHashtag />` (u otra UI) dispara el evento, este puente
 * aplica el filtro canónico `filterBySource` en `useLocationsStore` sin
 * acoplar el componente al store.
 *
 * Mantiene el alias legacy `filterByUserId` sincronizado para que código
 * que aún lo lea (FloatingToolbar buckets, badges) siga funcionando hasta
 * su limpieza definitiva.
 */

import { useEffect } from 'react';
import { useLocationsStore } from '@/domains/content/store/locations-store';
import {
  SOURCE_FILTER_EVENT,
  type SourceFilterEventDetail,
} from '@/components/poi/SourceHashtag';

export function SourceFilterBridge() {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SourceFilterEventDetail>).detail;
      if (!detail) return;
      const { type, id, label } = detail;
      const current = useLocationsStore.getState().filters;

      // Toggle: si ya está aplicado el mismo filtro, lo quitamos.
      const isActive =
        current.filterBySource?.type === type && current.filterBySource?.id === id;

      useLocationsStore.getState().setFilters({
        ...current,
        filterBySource: isActive ? undefined : { type, id, label },
        // Alias legacy: solo own/followed
        filterByUserId: isActive
          ? undefined
          : type === 'own' || type === 'followed'
            ? id
            : undefined,
        filterByUserName: isActive
          ? undefined
          : type === 'own' || type === 'followed'
            ? label
            : undefined,
      });
    };
    window.addEventListener(SOURCE_FILTER_EVENT, handler);
    return () => window.removeEventListener(SOURCE_FILTER_EVENT, handler);
  }, []);
  return null;
}
