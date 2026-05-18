/**
 * CollectionFocusView — Vista enfocada de una colección.
 *
 * - Pestañas Puntos / Rutas con conteo.
 * - Puntos agrupados por país → región (orden jerárquico canónico) o
 *   alfabético / por orden de adición según el selector.
 * - Click en punto: focus (pan + popup) usando el sistema central
 *   `setFocusedLocation` que ya respeta el panel derecho (sidebar-aware).
 * - Header con micro-estadísticas (puntos, países, enriquecidos, km de rutas).
 * - Tinte de la colección activo durante toda la vista.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ChevronLeft, MapPin, Route as RouteIcon, Loader2, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PanelTabs } from '@/shared/components/ui/panel';
import { supabase } from '@/integrations/supabase/client';
import { collectionService } from '@/services/collection.service';
import type { Collection } from '@/domains/v2';
import { getCollectionIconComponent } from './CollectionAppearanceDialog';
import { getReadableForeground, isLightColor } from '@/shared/lib/color-contrast';
import { useLocationsStore } from '@/domains/content';
import { toast } from 'sonner';
import {
  groupLocationsByHierarchy, compareLocationsHierarchical,
  getLocationHierarchy, type HierarchyGroupNode,
} from '@/shared/geography/hierarchy';
import type { GeoLocation } from '@/types/location';
import { COLLECTION_VISIBILITY_EVENT } from '@/domains/content/lib/collection-visibility';

interface RouteRow { id: string; name: string; transport_mode: string; total_distance_meters?: number | null }

interface Props {
  collection: Collection;
  onBack: () => void;
}

type SortMode = 'geo' | 'alpha' | 'added';

export function CollectionFocusView({ collection, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<GeoLocation[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('geo');

  const Icon = getCollectionIconComponent(collection.icon);
  const tint = collection.color || '#6b7280';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const items = await collectionService.getItems(collection.id);
      // Mantener orden de adición (items vienen ordenados por position).
      const placeIdsOrdered = items
        .filter(i => i.itemType === 'place' || i.itemType === 'waypoint')
        .map(i => i.itemId);
      const routeIdsOrdered = items.filter(i => i.itemType === 'route').map(i => i.itemId);

      const [placesRes, routesRes] = await Promise.all([
        placeIdsOrdered.length > 0
          ? supabase.from('locations').select('*').in('id', placeIdsOrdered).is('deleted_at', null)
          : Promise.resolve({ data: [], error: null } as any),
        routeIdsOrdered.length > 0
          ? supabase.from('routes').select('id, name, transport_mode, total_distance_meters').in('id', routeIdsOrdered)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      // Mapeamos rows a GeoLocation mínimo (camelCase) — sólo necesitamos lo esencial
      // para el orden y los stats; el resto lo lee LocationMap por su id.
      const placesMapped: GeoLocation[] = (placesRes.data || []).map((p: any) => ({
        id: p.id,
        name: p.name || 'Sin nombre',
        coordinates: { lat: Number(p.latitude), lng: Number(p.longitude) },
        continent: p.continent,
        country: p.country,
        region: p.region,
        zone: p.zone,
        placeType: p.place_type,
        enrichedData: p.enriched_data,
        isApproved: p.is_approved,
      } as any));

      // Conservar orden de adición en una propiedad lateral.
      const addedOrder = new Map(placeIdsOrdered.map((id, i) => [id, i]));
      placesMapped.sort((a, b) => (addedOrder.get(a.id) ?? 0) - (addedOrder.get(b.id) ?? 0));

      setPlaces(placesMapped);
      setRoutes((routesRes.data || []) as RouteRow[]);

      // Auto-fit map to collection content
      if (placesMapped.length > 0) {
        const lats = placesMapped.map(p => p.coordinates.lat);
        const lngs = placesMapped.map(p => p.coordinates.lng);
        window.dispatchEvent(new CustomEvent('map-fit-bounds', {
          detail: {
            bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
            padding: [60, 60], maxZoom: 14,
          },
        }));
      }
    } catch (e) {
      toast.error('No se pudo cargar la colección');
    } finally {
      setLoading(false);
    }
  }, [collection.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-render cuando el ojo de la colección cambia (no afecta a esta vista
  // pero sí podríamos querer reflejar algo). Lo dejamos como hook ligero.
  useEffect(() => {
    const noop = () => {};
    window.addEventListener(COLLECTION_VISIBILITY_EVENT, noop);
    return () => window.removeEventListener(COLLECTION_VISIBILITY_EVENT, noop);
  }, []);

  // Agrupado / orden según sortMode.
  const grouped = useMemo<HierarchyGroupNode[] | null>(() => {
    if (sortMode !== 'geo') return null;
    // Profundidad 2: país → región. Suficiente como header visible.
    return groupLocationsByHierarchy(places, 2);
  }, [places, sortMode]);

  const flatSorted = useMemo<GeoLocation[]>(() => {
    if (sortMode === 'alpha') {
      return [...places].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    if (sortMode === 'added') return places;
    return [...places].sort(compareLocationsHierarchical);
  }, [places, sortMode]);

  // Estadísticas del header.
  const stats = useMemo(() => {
    const countries = new Set<string>();
    let enriched = 0;
    for (const p of places) {
      const h = getLocationHierarchy(p);
      if (h.country) countries.add(h.country);
      if (p.enrichedData?.descripcion) enriched++;
    }
    const totalKm = routes.reduce((acc, r) => acc + (Number(r.total_distance_meters) || 0), 0) / 1000;
    return {
      points: places.length,
      countries: countries.size,
      enriched,
      routesKm: totalKm,
    };
  }, [places, routes]);

  const handleRemovePlace = async (id: string) => {
    try {
      await collectionService.removeItem(collection.id, 'place', id);
      setPlaces(prev => prev.filter(p => p.id !== id));
      window.dispatchEvent(new CustomEvent('collection-items-changed', { detail: { collectionId: collection.id } }));
      toast.success('Punto retirado de la colección');
    } catch (e: any) {
      toast.error('No se pudo quitar', { description: e?.message });
    }
  };

  const handleRemoveRoute = async (id: string) => {
    try {
      await collectionService.removeItem(collection.id, 'route', id);
      setRoutes(prev => prev.filter(r => r.id !== id));
      window.dispatchEvent(new CustomEvent('collection-items-changed', { detail: { collectionId: collection.id } }));
      toast.success('Ruta retirada de la colección');
    } catch (e: any) {
      toast.error('No se pudo quitar', { description: e?.message });
    }
  };

  const handleClickPlace = (p: GeoLocation) => {
    // setFocusedLocation hace pan + openPopup automáticamente y respeta el
    // ancho del panel derecho (data-collection-focus-panel).
    useLocationsStore.getState().setFocusedLocation(p.id);
  };

  const renderPlaceRow = (p: GeoLocation) => (
    <div
      key={p.id}
      className="flex items-center gap-2 rounded-lg border border-border/60 bg-card hover:bg-accent/30 px-2 py-2"
    >
      <button
        type="button"
        onClick={() => handleClickPlace(p)}
        className="flex items-center gap-2 min-w-0 flex-1 text-left"
        title="Enfocar en el mapa"
      >
        <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: tint }} />
        <span className="text-sm truncate">{p.name}</span>
      </button>
      <Button
        variant="ghost" size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        onClick={() => handleRemovePlace(p.id)}
        title="Quitar de la colección"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  return (
    <div data-collection-focus-panel="true" className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-3 pt-3 pb-2 border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onBack}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor: tint,
              borderColor: isLightColor(tint) ? 'hsl(var(--border))' : 'transparent',
            }}
          >
            <Icon className="w-4 h-4" style={{ color: getReadableForeground(tint) }} />
          </span>
          <h3 className="font-bold text-sm truncate flex-1">{collection.name}</h3>
        </div>
        {!loading && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="bg-muted/60 rounded-full px-1.5 py-0.5 tabular-nums">
              {stats.points} puntos
            </span>
            {stats.countries > 0 && (
              <span className="bg-muted/60 rounded-full px-1.5 py-0.5 tabular-nums">
                {stats.countries} {stats.countries === 1 ? 'país' : 'países'}
              </span>
            )}
            {stats.enriched > 0 && (
              <span className="bg-muted/60 rounded-full px-1.5 py-0.5 tabular-nums">
                {stats.enriched} enriquecidos
              </span>
            )}
            {stats.routesKm > 0 && (
              <span className="bg-muted/60 rounded-full px-1.5 py-0.5 tabular-nums">
                {stats.routesKm.toFixed(0)} km rutas
              </span>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <PanelTabs defaultValue="places">
          <div className="shrink-0 px-3 pt-2 pb-2 border-b">
            <PanelTabs.Group>
              <PanelTabs.Trigger value="places">Puntos · {places.length}</PanelTabs.Trigger>
              <PanelTabs.Trigger value="routes">Rutas · {routes.length}</PanelTabs.Trigger>
            </PanelTabs.Group>
          </div>

          <PanelTabs.Content value="places" className="flex-1 min-h-0 outline-none">
            <div className="px-3 pt-2 pb-1 flex items-center gap-1 text-[10px]">
              <span className="text-muted-foreground mr-1">Orden:</span>
              {([
                ['geo', 'Geográfico'],
                ['alpha', 'Alfabético'],
                ['added', 'Añadido'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortMode(key)}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${
                    sortMode === key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-accent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <ScrollArea className="h-full">
              <div className="p-3 pt-1 space-y-1.5">
                {places.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No hay puntos en esta colección
                  </p>
                ) : sortMode === 'geo' && grouped ? (
                  grouped.map(country => (
                    <div key={country.value} className="space-y-1">
                      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-1">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                          {country.value === '__unclassified__' ? 'Sin localizar' : country.value}
                          <span className="ml-1 opacity-60 normal-case font-normal">· {country.count}</span>
                        </p>
                      </div>
                      {country.children.length === 0 || country.locations.length > 0
                        ? country.locations.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(renderPlaceRow)
                        : country.children.map(region => (
                            <div key={region.value} className="space-y-1">
                              <p className="text-[10px] text-muted-foreground/80 pl-1">
                                {region.value === '__unclassified__' ? '—' : region.value}
                              </p>
                              {collectAllLocations(region).map(renderPlaceRow)}
                            </div>
                          ))}
                    </div>
                  ))
                ) : (
                  flatSorted.map(renderPlaceRow)
                )}
              </div>
            </ScrollArea>
          </PanelTabs.Content>

          <PanelTabs.Content value="routes" className="flex-1 min-h-0 outline-none">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-1.5">
                {routes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No hay rutas en esta colección
                  </p>
                ) : (
                  [...routes]
                    .sort((a, b) =>
                      a.transport_mode.localeCompare(b.transport_mode)
                      || (a.name || '').localeCompare(b.name || '')
                    )
                    .map(r => (
                      <div
                        key={r.id}
                        className="flex items-center gap-2 rounded-lg border border-border/60 bg-card hover:bg-accent/30 px-2 py-2"
                      >
                        <RouteIcon className="w-3.5 h-3.5 shrink-0" style={{ color: tint }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{r.name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">
                            {r.transport_mode}
                            {r.total_distance_meters ? ` · ${(r.total_distance_meters / 1000).toFixed(1)} km` : ''}
                          </p>
                        </div>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveRoute(r.id)}
                          title="Quitar de la colección"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))
                )}
              </div>
            </ScrollArea>
          </PanelTabs.Content>
        </PanelTabs>
      )}
    </div>
  );
}

/** Recorre recursivamente un nodo y devuelve todas sus locations en hojas. */
function collectAllLocations(node: HierarchyGroupNode): GeoLocation[] {
  const out: GeoLocation[] = [...node.locations];
  for (const child of node.children) out.push(...collectAllLocations(child));
  return out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}
