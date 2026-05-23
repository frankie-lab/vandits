// React Context que expone el universo base activo del panel "Buscar y Filtrar".
//
// Consumido por los 4 árboles (GeographyTree, ClassificationTree, TagsTree,
// PlaceTypeFilter): cuando hay provider, sustituyen `getAllLocations()` por
// `universeBase`. Sin provider, comportamiento idéntico al actual (Explorar/all).
//
// Ver `docs/audits/search-filter-maintain-tree-universe-plan.md`.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { GeoLocation } from '@/types/location';
import {
  resolveUniverseBase,
  type ActiveModeUniverse,
} from '@/domains/content/lib/resolve-universe-base';

interface UniverseBaseContextValue {
  mode: ActiveModeUniverse;
  /** Subconjunto resuelto. Inmutable durante el render. */
  universeBase: GeoLocation[];
  /** Set de ids para intersecciones O(1). */
  universeBaseIds: Set<string>;
}

const UniverseBaseContext = createContext<UniverseBaseContextValue | null>(null);

export function UniverseBaseProvider({
  mode,
  allLocations,
  children,
}: {
  mode: ActiveModeUniverse;
  allLocations: GeoLocation[];
  children: ReactNode;
}) {
  const value = useMemo<UniverseBaseContextValue>(() => {
    const universeBase = resolveUniverseBase(mode, allLocations);
    return {
      mode,
      universeBase,
      universeBaseIds: new Set(universeBase.map((l) => l.id)),
    };
  }, [mode, allLocations]);
  return (
    <UniverseBaseContext.Provider value={value}>{children}</UniverseBaseContext.Provider>
  );
}

/**
 * Devuelve el universo base activo. Si no hay provider, devuelve `null` y
 * el consumidor debe caer al comportamiento legacy (`getAllLocations()`).
 */
export function useUniverseBase(): UniverseBaseContextValue | null {
  return useContext(UniverseBaseContext);
}

/**
 * Helper para árboles: devuelve el subset sobre el que deben calcular nodos
 * y counts. Si hay provider activo, usa `universeBase`. Si no, devuelve
 * `fallback` (típicamente `getAllLocations()`).
 */
export function useScopedLocations(fallback: GeoLocation[]): GeoLocation[] {
  const ctx = useContext(UniverseBaseContext);
  if (!ctx) return fallback;
  return ctx.universeBase;
}
