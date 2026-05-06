/**
 * OrphanFocusView — Vista enfocada del grupo virtual "Sin colección".
 *
 * Lista los puntos del usuario actual que NO pertenecen a ninguna colección.
 * Reusa la misma estética/jerarquía geo que CollectionFocusView, pero en
 * read-only (no se puede "quitar de la colección" porque no hay colección).
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ChevronLeft, MapPin, Loader2, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/domains/content';
import { toast } from 'sonner';
import {
  groupLocationsByHierarchy, compareLocationsHierarchical,
  getLocationHierarchy, type HierarchyGroupNode,
} from '@/shared/geography/hierarchy';
import type { GeoLocation } from '@/types/location';
import {
  getOrphanIds,
  recomputeOrphanPoints,
  subscribeOrphanPoints,
} from '@/domains/content/lib/orphan-points';
import { useAuth } from '@/domains/identity';

interface Props {
  onBack: () => void;
}

type SortMode = 'geo' | 'alpha';

export function OrphanFocusView({ onBack }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<GeoLocation[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('geo');

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      await recomputeOrphanPoints(user.id);
      const ids = getOrphanIds();
      if (ids.length === 0) { setPlaces([]); return; }
      // Chunked select.
      const CHUNK = 200;
      const out: any[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('locations').select('*').in('id', slice).is('deleted_at', null);
        if (error) throw error;
        out.push(...(data ?? []));
      }
      const mapped: GeoLocation[] = out.map((p: any) => ({
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
      setPlaces(mapped);
      if (mapped.length > 0) {
        const lats = mapped.map(p => p.coordinates.lat);
        const lngs = mapped.map(p => p.coordinates.lng);
        window.dispatchEvent(new CustomEvent('map-fit-bounds', {
          detail: {
            bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
            padding: [60, 60], maxZoom: 14,
          },
        }));
      }
    } catch (e) {
      toast.error('No se pudo cargar el grupo "Sin colección"');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => subscribeOrphanPoints(() => { fetchData(); }), [fetchData]);

  const grouped = useMemo<HierarchyGroupNode[] | null>(() => {
    if (sortMode !== 'geo') return null;
    return groupLocationsByHierarchy(places, 2);
  }, [places, sortMode]);

  const flatSorted = useMemo<GeoLocation[]>(() => {
    if (sortMode === 'alpha') {
      return [...places].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return [...places].sort(compareLocationsHierarchical);
  }, [places, sortMode]);

  const stats = useMemo(() => {
    const countries = new Set<string>();
    let enriched = 0;
    for (const p of places) {
      const h = getLocationHierarchy(p);
      if (h.country) countries.add(h.country);
      if ((p as any).enrichedData?.descripcion) enriched++;
    }
    return { points: places.length, countries: countries.size, enriched };
  }, [places]);

  const handleClickPlace = (p: GeoLocation) => {
    useLocationsStore.getState().setFocusedLocation(p.id);
  };

  const renderRow = (p: GeoLocation) => (
    <li key={p.id}>
      <button
        type="button"
        onClick={() => handleClickPlace(p)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 text-left text-xs"
      >
        <MapPin className="w-3 h-3 shrink-0 text-muted-foreground" />
        <span className="truncate flex-1">{p.name}</span>
      </button>
    </li>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="w-7 h-7 rounded-full flex items-center justify-center bg-muted">
          <Inbox className="w-4 h-4 text-muted-foreground" />
        </span>
        <h3 className="font-bold text-sm flex-1 truncate">Sin colección</h3>
      </div>

      <div className="px-3 py-2 grid grid-cols-3 gap-2 text-center text-xs border-b border-border/40">
        <div><div className="font-bold tabular-nums">{stats.points}</div><div className="text-[10px] text-muted-foreground">puntos</div></div>
        <div><div className="font-bold tabular-nums">{stats.countries}</div><div className="text-[10px] text-muted-foreground">países</div></div>
        <div><div className="font-bold tabular-nums">{stats.enriched}</div><div className="text-[10px] text-muted-foreground">enriquecidos</div></div>
      </div>

      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/40">
        {(['geo', 'alpha'] as SortMode[]).map(m => (
          <Button
            key={m}
            size="sm"
            variant={sortMode === m ? 'default' : 'ghost'}
            className="h-7 text-xs"
            onClick={() => setSortMode(m)}
          >
            {m === 'geo' ? 'Geográfico' : 'Alfabético'}
          </Button>
        ))}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 pb-8">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
              <Loader2 className="w-3 h-3 animate-spin" /> Cargando…
            </div>
          ) : places.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No hay puntos sin colección</p>
          ) : grouped ? (
            <div className="space-y-3">
              {grouped.map((g, i) => (
                <div key={`${g.value}-${i}`}>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 mb-1">{g.value} · {g.count}</p>
                  <ul className="space-y-0.5">{(g.locations.length > 0 ? g.locations : g.children.flatMap(c => c.locations)).map(renderRow)}</ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-0.5">{flatSorted.map(renderRow)}</ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
