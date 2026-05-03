/**
 * DocumentWaypointsTabs — 4-tab view for any imported document.
 *
 * Tabs (norma `mem://ui/document-view-tabs`):
 *  1. Importados (gris)     · status = 'unknown'
 *  2. Vacíos (naranja)      · status = 'new'
 *  3. Enriquecidos (verde)  · status = 'current' | 'previous'
 *  4. Rutas (azul)          · routes belonging to the document
 *
 * Cada lista de waypoints está virtualizada con @tanstack/react-virtual para
 * sostener documentos de miles de puntos sin perder fluidez.
 *
 * Las pestañas son uniformes en mobile y desktop — no hay colapsos a 2
 * columnas. Los colores del dot indicador son SOLO del tab; no contradicen
 * la simbología real de los marcadores en mapa.
 */
import React, { useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles, Pencil, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MiniMarker } from './MiniMarker';
import { triggerEnrichLocation } from '@/domains/content/lib/enrich-location';
import { ListGroupingSelect } from '@/shared/components/ListGroupingSelect';
import { useListGrouping } from '@/shared/preferences/use-list-grouping';
import { groupLocationsBy } from '@/shared/geography/hierarchy';
import type { GeoLocation } from '@/types/location';

type EnrichmentStatus = 'unknown' | 'new' | 'current' | 'previous';

export interface DocWaypointRow {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  is_approved: boolean;
  enrichment_status: string | null;
  enriched_data: any;
  place_type: string | null;
  continent: string | null;
  country: string | null;
  region: string | null;
}

export interface DocRouteRow {
  id: string;
  name: string;
  transport_mode: string;
  status: string;
  total_distance_meters: number | null;
  total_duration_seconds: number | null;
}

function classifyStatus(loc: DocWaypointRow): EnrichmentStatus {
  const hasEnriched = !!loc.enriched_data && !!loc.enriched_data.descripcion;
  if (hasEnriched) return 'current';
  if (loc.description && loc.description.trim().length > 0) return 'unknown';
  return 'new';
}

interface DocumentWaypointsTabsProps {
  locations: DocWaypointRow[];
  routes: DocRouteRow[];
  selectedIds: Set<string>;
  selectedRouteIds: Set<string>;
  focusedId: string | null;
  highlightedRouteId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleRouteSelect: (id: string) => void;
  onHighlight: (loc: DocWaypointRow) => void;
  onOpenNearby: (loc: DocWaypointRow) => void;
  onEditRoute: (id: string) => void;
}

const TAB_DOT: Record<'importados' | 'vacios' | 'enriquecidos' | 'rutas', string> = {
  importados: 'bg-gray-400',
  vacios: 'bg-orange-500',
  enriquecidos: 'bg-emerald-500',
  rutas: 'bg-blue-500',
};

export function DocumentWaypointsTabs({
  locations,
  routes,
  selectedIds,
  selectedRouteIds,
  focusedId,
  highlightedRouteId,
  onToggleSelect,
  onToggleRouteSelect,
  onHighlight,
  onOpenNearby,
  onEditRoute,
}: DocumentWaypointsTabsProps) {
  const groups = useMemo(() => {
    const g = { unknown: [] as DocWaypointRow[], new: [] as DocWaypointRow[], enriched: [] as DocWaypointRow[] };
    for (const loc of locations) {
      const status = classifyStatus(loc);
      if (status === 'new') g.new.push(loc);
      else if (status === 'unknown') g.unknown.push(loc);
      else g.enriched.push(loc);
    }
    return g;
  }, [locations]);

  const counts = {
    importados: groups.unknown.length,
    vacios: groups.new.length,
    enriquecidos: groups.enriched.length,
    rutas: routes.length,
  };

  // Default tab: first non-empty
  const defaultTab = useMemo(() => {
    if (counts.importados > 0) return 'importados';
    if (counts.vacios > 0) return 'vacios';
    if (counts.enriquecidos > 0) return 'enriquecidos';
    if (counts.rutas > 0) return 'rutas';
    return 'importados';
  }, [counts.importados, counts.vacios, counts.enriquecidos, counts.rutas]);

  const [groupingMode] = useListGrouping();

  return (
    <Tabs defaultValue={defaultTab} className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 mt-2 mb-1 shrink-0">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Puntos del documento</span>
        <ListGroupingSelect />
      </div>
      <TabsList className="grid grid-cols-4 mx-3 shrink-0 h-9">
        <TabTrigger value="importados" dot={TAB_DOT.importados} label="Importados" count={counts.importados} />
        <TabTrigger value="vacios" dot={TAB_DOT.vacios} label="Vacíos" count={counts.vacios} />
        <TabTrigger value="enriquecidos" dot={TAB_DOT.enriquecidos} label="Enriquecidos" count={counts.enriquecidos} />
        <TabTrigger value="rutas" dot={TAB_DOT.rutas} label="Rutas" count={counts.rutas} />
      </TabsList>

      <TabsContent value="importados" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden">
        <VirtualWaypointList
          items={groups.unknown}
          emptyLabel="Sin puntos importados"
          selectedIds={selectedIds}
          focusedId={focusedId}
          groupingMode={groupingMode}
          onToggleSelect={onToggleSelect}
          onHighlight={onHighlight}
          onOpenNearby={onOpenNearby}
        />
      </TabsContent>

      <TabsContent value="vacios" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden">
        <VirtualWaypointList
          items={groups.new}
          emptyLabel="Sin puntos vacíos"
          selectedIds={selectedIds}
          focusedId={focusedId}
          groupingMode={groupingMode}
          onToggleSelect={onToggleSelect}
          onHighlight={onHighlight}
          onOpenNearby={onOpenNearby}
        />
      </TabsContent>

      <TabsContent value="enriquecidos" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden">
        <VirtualWaypointList
          items={groups.enriched}
          emptyLabel="Sin puntos enriquecidos"
          selectedIds={selectedIds}
          focusedId={focusedId}
          groupingMode={groupingMode}
          onToggleSelect={onToggleSelect}
          onHighlight={onHighlight}
          onOpenNearby={onOpenNearby}
        />
      </TabsContent>

      <TabsContent value="rutas" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden">
        <RoutesList
          routes={routes}
          selectedRouteIds={selectedRouteIds}
          highlightedRouteId={highlightedRouteId}
          onToggleRouteSelect={onToggleRouteSelect}
          onEditRoute={onEditRoute}
        />
      </TabsContent>
    </Tabs>
  );
}

function TabTrigger({ value, dot, label, count }: { value: string; dot: string; label: string; count: number }) {
  return (
    <TabsTrigger value={value} className="text-[11px] gap-1.5 px-1.5">
      <span className={cn('w-2 h-2 rounded-full shrink-0', dot)} />
      <span className="truncate">{label}</span>
      <span className="text-[10px] text-muted-foreground tabular-nums">({count})</span>
    </TabsTrigger>
  );
}

interface VirtualWaypointListProps {
  items: DocWaypointRow[];
  emptyLabel: string;
  selectedIds: Set<string>;
  focusedId: string | null;
  groupingMode: import('@/shared/geography/hierarchy').GroupingMode;
  onToggleSelect: (id: string) => void;
  onHighlight: (loc: DocWaypointRow) => void;
  onOpenNearby: (loc: DocWaypointRow) => void;
}

const ROW_HEIGHT = 56; // px
const HEADER_HEIGHT = 28; // px

type ListRow =
  | { kind: 'header'; key: string; label: string; count: number }
  | { kind: 'item'; loc: DocWaypointRow };

/** Adapt a DocWaypointRow into the minimal GeoLocation shape needed by groupLocationsBy. */
function rowToGeoLike(loc: DocWaypointRow): GeoLocation {
  return {
    id: loc.id,
    name: loc.name,
    description: loc.description ?? undefined,
    latitude: loc.latitude,
    longitude: loc.longitude,
    continent: loc.continent ?? undefined,
    country: loc.country ?? undefined,
    region: loc.region ?? undefined,
    placeType: (loc.place_type as GeoLocation['placeType']) ?? undefined,
    enrichedData: loc.enriched_data ?? undefined,
  } as unknown as GeoLocation;
}

function VirtualWaypointList({
  items, emptyLabel, selectedIds, focusedId, groupingMode,
  onToggleSelect, onHighlight, onOpenNearby,
}: VirtualWaypointListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<ListRow[]>(() => {
    if (items.length === 0) return [];
    const geoItems = items.map(rowToGeoLike);
    const idToRow = new Map(items.map(r => [r.id, r]));
    const groups = groupLocationsBy(geoItems, groupingMode);
    const out: ListRow[] = [];
    for (const g of groups) {
      out.push({ kind: 'header', key: g.key, label: g.label, count: g.count });
      for (const gloc of g.locations) {
        const row = idToRow.get(gloc.id);
        if (row) out.push({ kind: 'item', loc: row });
      }
    }
    return out;
  }, [items, groupingMode]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i]?.kind === 'header' ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: 8,
  });

  // Auto-scroll to focused item when it changes
  useEffect(() => {
    if (!focusedId) return;
    const idx = rows.findIndex(r => r.kind === 'item' && r.loc.id === focusedId);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center' });
  }, [focusedId, rows, virtualizer]);

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const row = rows[virtualRow.index];
          const baseStyle: React.CSSProperties = {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: virtualRow.size,
            transform: `translateY(${virtualRow.start}px)`,
          };

          if (row.kind === 'header') {
            return (
              <div
                key={`h-${row.key}`}
                style={baseStyle}
                className="px-3 flex items-center gap-2 bg-muted/30 border-b text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                <span className="truncate font-medium">{row.label}</span>
                <span className="tabular-nums opacity-70">({row.count})</span>
              </div>
            );
          }

          const loc = row.loc;
          const isSelected = selectedIds.has(loc.id);
          const isFocused = focusedId === loc.id;
          const isWaypoint = !loc.is_approved;
          const isEnriched = !!loc.enriched_data?.descripcion;

          return (
            <div
              key={loc.id}
              style={baseStyle}
              className={cn(
                'px-3 py-2 border-b transition-colors group',
                isFocused
                  ? 'bg-primary/10 border-l-2 border-l-primary'
                  : isSelected
                    ? 'bg-primary/5'
                    : 'hover:bg-muted/40',
              )}
            >
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelect(loc.id)}
                  className="mt-0.5 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <MiniMarker loc={loc} size={14} />
                    <button
                      onClick={() => onHighlight(loc)}
                      className="text-[13px] font-medium truncate text-left hover:text-primary transition-colors"
                    >
                      {loc.name}
                    </button>
                    {isEnriched && (
                      <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                    {loc.country && <span className="truncate">{loc.country}</span>}
                    {loc.region && <><span className="opacity-30">·</span><span className="truncate">{loc.region}</span></>}
                    <span className="opacity-30">·</span>
                    <span className="tabular-nums">{loc.latitude.toFixed(3)}, {loc.longitude.toFixed(3)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isWaypoint && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => onOpenNearby(loc)}
                        >
                          <Compass className="w-3.5 h-3.5 text-amber-500" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        Ver contexto cercano
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerEnrichLocation(loc.id, { regenerate: isEnriched });
                        }}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs">
                      {isEnriched ? 'Re-enriquecer' : 'Enriquecer'}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RoutesListProps {
  routes: DocRouteRow[];
  selectedRouteIds: Set<string>;
  highlightedRouteId: string | null;
  onToggleRouteSelect: (id: string) => void;
  onEditRoute: (id: string) => void;
}

function RoutesList({
  routes, selectedRouteIds, highlightedRouteId, onToggleRouteSelect, onEditRoute,
}: RoutesListProps) {
  if (routes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Este documento no contiene rutas
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {routes.map(route => (
        <div
          key={route.id}
          data-route-id={route.id}
          className={cn(
            'px-3 py-2 hover:bg-muted/40 transition-all group cursor-pointer border-b',
            highlightedRouteId === route.id && 'bg-primary/10 ring-1 ring-primary/30',
          )}
          onClick={() => onEditRoute(route.id)}
        >
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedRouteIds.has(route.id)}
              onCheckedChange={() => onToggleRouteSelect(route.id)}
              className="mt-0.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            />
            <MiniMarker route={route} size={14} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium truncate">{route.name}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                <span>{route.transport_mode}</span>
                {route.total_distance_meters != null && (
                  <>
                    <span className="opacity-30">·</span>
                    <span className="tabular-nums">{(route.total_distance_meters / 1000).toFixed(1)} km</span>
                  </>
                )}
                {route.total_duration_seconds != null && (
                  <>
                    <span className="opacity-30">·</span>
                    <span className="tabular-nums">
                      {Math.round(route.total_duration_seconds / 3600)}h {Math.round((route.total_duration_seconds % 3600) / 60)}m
                    </span>
                  </>
                )}
                <span className="opacity-30">·</span>
                <Badge variant="outline" className="text-[9px] h-4 px-1">{route.status}</Badge>
              </div>
            </div>
            <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}
