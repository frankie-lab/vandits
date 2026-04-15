import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin,
  FileText,
  Percent,
  CheckCircle,
  Shuffle,
  X,
  Map,
  BarChart3,
  Eye,
  Route,
  List,
  CalendarIcon,
  Pencil,
  Sparkles,
  Tag,
  SkipForward,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { renderTransportModeIcon } from '@/lib/icon-utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MAP_TILE_LAYERS } from '@/components/MapThemeToggle';
import { KMLDocument, GeoLocation, ImportedRoute } from '@/types/location';
import { calculateDistance, deduplicateLocations, DEFAULT_DISTANCE_THRESHOLD, formatDistance, DuplicateMatch } from '@/lib/duplicate-detection';
import { useLocationsStore } from '@/store/locations-store';
import { loadAllLocationsFromDatabase } from '@/hooks/use-database-sync';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** What to do with new (non-matching) points */
export type NewPointAction = 'enrich' | 'category' | 'skip';

/** Predefined personal categories available during import */
export const PREDEFINED_PERSONAL_CATEGORIES = [
  { name: 'Zona de acampada', icon: 'tent', color: '#22c55e' },
  { name: 'Lugar de pesca', icon: 'fish', color: '#3b82f6' },
  { name: 'Parking / Parada', icon: 'circle-parking', color: '#6b7280' },
  { name: 'Punto de agua', icon: 'droplets', color: '#06b6d4' },
  { name: 'Área de descanso', icon: 'trees', color: '#f59e0b' },
  { name: 'Taller / Servicio', icon: 'wrench', color: '#ef4444' },
  { name: 'Aprovisionamiento', icon: 'shopping-cart', color: '#8b5cf6' },
  { name: 'Punto personal', icon: 'map-pin', color: '#64748b' },
] as const;

export interface UploadPreviewOptions {
  autoEnrich: boolean;
  /** IDs of points that match existing locations → always enriched */
  matchingPointIds: string[];
  /** What to do with non-matching points */
  newPointAction: NewPointAction;
  /** Selected personal category name (when newPointAction === 'category') */
  personalCategoryName?: string;
  personalCategoryIcon?: string;
  personalCategoryColor?: string;
  markRoutePointsVisited: boolean;
  saveRoutes: boolean;
  routesToSave: ImportedRoute[];
  /** Deduplication results — passed to parent so it doesn't re-calculate */
  uniqueLocations: GeoLocation[];
  possibleDuplicates: DuplicateMatch[];
  autoDiscardedCount: number;
  skippedFromPriorImportCount: number;
  /** Catalog locations loaded during dedup — reused for route linking */
  catalogLocations: GeoLocation[];
}

interface UploadPreviewDialogProps {
  open: boolean;
  document: KMLDocument;
  onConfirm: (locations: GeoLocation[], isSample: boolean, options: UploadPreviewOptions) => void;
  onCancel: () => void;
}

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sampleLocations(locations: GeoLocation[], percentage: number): GeoLocation[] {
  if (percentage >= 100) return locations;
  const count = Math.max(1, Math.round((locations.length * percentage) / 100));
  return shuffleArray(locations).slice(0, count);
}

/** Try to extract a date from the filename */
function extractDateFromFileName(fileName: string): Date | null {
  const match = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

const SAMPLE_PRESETS = [
  { label: '10%', value: 10 },
  { label: '25%', value: 25 },
  { label: '50%', value: 50 },
];

export function UploadPreviewDialog({
  open,
  document,
  onConfirm,
  onCancel,
}: UploadPreviewDialogProps) {
  const [uploadMode, setUploadMode] = useState<'full' | 'sample'>('full');
  const [samplePercentage, setSamplePercentage] = useState(25);
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [newPointAction, setNewPointAction] = useState<NewPointAction>('skip');
  const [selectedCategory, setSelectedCategory] = useState<{ name: string; icon: string; color: string }>(PREDEFINED_PERSONAL_CATEGORIES[0]);
  const [markRouteVisited, setMarkRouteVisited] = useState(true);
  const [saveRoutes, setSaveRoutes] = useState(true);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const previewLayerRef = useRef<L.FeatureGroup | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // Editable route state
  const [editableRoutes, setEditableRoutes] = useState<ImportedRoute[]>(() => {
    if (!document.routes?.length) return [];
    const detectedDate = extractDateFromFileName(document.fileName);
    return document.routes.map((r) => ({
      ...r,
      name: r.name || document.name,
      date: detectedDate || undefined,
    }));
  });
  const [routeDate, setRouteDate] = useState<Date | undefined>(() => {
    const detectedDate = extractDateFromFileName(document.fileName);
    return detectedDate || undefined;
  });
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);

  // ─── Deduplication (runs once when dialog opens) ───
  const [dedupResult, setDedupResult] = useState<{
    uniqueLocations: GeoLocation[];
    possibleDuplicates: DuplicateMatch[];
    autoDiscarded: DuplicateMatch[];
    skippedFromPriorImport: GeoLocation[];
    catalogLocations: GeoLocation[];
  } | null>(null);
  const [dedupLoading, setDedupLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setDedupResult(null);
      return;
    }
    let cancelled = false;
    const runDedup = async () => {
      setDedupLoading(true);
      try {
        const existingLocations = await loadAllLocationsFromDatabase();
        const catalogLocations = existingLocations.filter((loc) => loc.isApproved);
        const pointLocs = document.locations.filter((l) => l.placeType !== 'route');
        const result = deduplicateLocations(pointLocs, catalogLocations, DEFAULT_DISTANCE_THRESHOLD, document.fileName);
        if (!cancelled) {
          setDedupResult({ ...result, catalogLocations });
        }
      } catch (e) {
        console.error('Dedup error:', e);
        if (!cancelled) {
          // Fallback: treat all as unique
          setDedupResult({
            uniqueLocations: document.locations.filter((l) => l.placeType !== 'route'),
            possibleDuplicates: [],
            autoDiscarded: [],
            skippedFromPriorImport: [],
            catalogLocations: [],
          });
        }
      } finally {
        if (!cancelled) setDedupLoading(false);
      }
    };
    runDedup();
    return () => { cancelled = true; };
  }, [open, document]);

  // Build matching map from possibleDuplicates (these are "catalog matches")
  const existingMatches = useMemo(() => {
    if (!dedupResult) return {};
    const matchMap: Record<string, string> = {};
    for (const dup of dedupResult.possibleDuplicates) {
      matchMap[dup.newLocation.id] = dup.existingLocation.name;
    }
    return matchMap;
  }, [dedupResult]);

  const forcePreviewTilesVisible = useCallback(() => {
    if (!mapRef.current) return;
    mapRef.current.querySelectorAll<HTMLImageElement>('.leaflet-tile').forEach((tile) => {
      tile.style.opacity = '1';
      tile.style.visibility = 'inherit';
    });
  }, []);

  const getPreviewMinZoom = useCallback((container: HTMLDivElement) => {
    const coverMinZoom = Math.ceil(
      Math.max(
        Math.log2(Math.max(container.clientWidth, 1) / 256),
        Math.log2(Math.max(container.clientHeight, 1) / 170)
      )
    );
    return Math.max(coverMinZoom, 2);
  }, []);

  const totalLocations = document.locations.length;
  const sampledLocations = useMemo(
    () => sampleLocations(document.locations, samplePercentage),
    [document.locations, samplePercentage]
  );
  const sampleCount = uploadMode === 'sample' ? sampledLocations.length : totalLocations;

  const pointLocations = useMemo(
    () => document.locations.filter((loc) => loc.placeType !== 'route'),
    [document.locations]
  );
  const routeLocations = useMemo(
    () => document.locations.filter((loc) => loc.placeType === 'route'),
    [document.locations]
  );
  const routeCount = editableRoutes.length;

  // Dedup-derived counts
  const matchingCount = dedupResult?.possibleDuplicates.length ?? 0;
  const uniqueCount = dedupResult?.uniqueLocations.length ?? pointLocations.length;
  const discardedCount = (dedupResult?.autoDiscarded.length ?? 0) + (dedupResult?.skippedFromPriorImport.length ?? 0);

  // ─── Map setup ───
  useEffect(() => {
    if (!open) return;
    let frameId = 0;
    const ensureMap = () => {
      const container = mapRef.current;
      if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
        frameId = requestAnimationFrame(ensureMap);
        return;
      }
      if (!mapInstanceRef.current) {
        const worldBounds = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));
        const safeMinZoom = getPreviewMinZoom(container);
        const map = L.map(container, {
          center: [20, 0], zoom: safeMinZoom, minZoom: safeMinZoom,
          maxBounds: worldBounds, maxBoundsViscosity: 1,
          zoomControl: false, attributionControl: false,
          dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
          touchZoom: false, boxZoom: false, keyboard: false,
          worldCopyJump: false, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false,
        });
        const tileConfig = MAP_TILE_LAYERS.light;
        tileLayerRef.current = L.tileLayer(tileConfig.url, {
          attribution: tileConfig.attribution, maxZoom: 19, noWrap: true, updateWhenIdle: true,
        })
          .on('tileload', (event) => { event.tile.style.opacity = '1'; event.tile.style.visibility = 'inherit'; })
          .on('load', () => { requestAnimationFrame(() => { map.invalidateSize(); forcePreviewTilesVisible(); }); })
          .addTo(map);
        previewLayerRef.current = L.featureGroup().addTo(map);
        mapInstanceRef.current = map;
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = new ResizeObserver(() => {
          const cc = mapRef.current;
          const cm = mapInstanceRef.current;
          if (!cc || !cm) return;
          const newMinZoom = getPreviewMinZoom(cc);
          cm.invalidateSize();
          if (cm.getMinZoom() !== newMinZoom) { cm.setMinZoom(newMinZoom); if (cm.getZoom() < newMinZoom) cm.setZoom(newMinZoom); }
          forcePreviewTilesVisible();
        });
        resizeObserverRef.current.observe(container);
      }
      requestAnimationFrame(() => { mapInstanceRef.current?.invalidateSize(); forcePreviewTilesVisible(); setIsMapReady(true); });
    };
    frameId = requestAnimationFrame(ensureMap);
    return () => {
      cancelAnimationFrame(frameId);
      setIsMapReady(false);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      previewLayerRef.current = null;
      tileLayerRef.current = null;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, [open, forcePreviewTilesVisible, getPreviewMinZoom]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const previewLayer = previewLayerRef.current;
    if (!open || !isMapReady || !map || !previewLayer) return;
    previewLayer.clearLayers();
    const locationsToShow = uploadMode === 'sample' ? sampledLocations : document.locations;
    const allBoundsPoints: [number, number][] = [];
    editableRoutes.forEach((route) => {
      const latLngs = route.coordinates.filter(
        (coord): coord is [number, number] => Array.isArray(coord) && coord.length >= 2 && Number.isFinite(coord[0]) && Number.isFinite(coord[1])
      );
      if (latLngs.length > 1) {
        L.polyline(latLngs, { color: route.color || 'hsl(var(--destructive))', weight: 3, opacity: 0.9 }).addTo(previewLayer);
        latLngs.forEach((point) => allBoundsPoints.push(point));
      }
    });
    locationsToShow.forEach((loc) => {
      if (!Number.isFinite(loc.coordinates.lat) || !Number.isFinite(loc.coordinates.lng)) return;
      const isRoutePoint = loc.placeType === 'route';
      L.circleMarker([loc.coordinates.lat, loc.coordinates.lng], {
        radius: isRoutePoint ? 4 : 3,
        fillColor: isRoutePoint ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
        color: 'hsl(var(--background))', weight: 1, fillOpacity: 0.95,
      }).addTo(previewLayer);
      allBoundsPoints.push([loc.coordinates.lat, loc.coordinates.lng]);
    });
    requestAnimationFrame(() => {
      map.invalidateSize(); forcePreviewTilesVisible();
      if (allBoundsPoints.length === 0) { map.setView([20, 0], map.getMinZoom()); return; }
      const bounds = L.latLngBounds(allBoundsPoints);
      if (bounds.isValid()) { map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 }); requestAnimationFrame(forcePreviewTilesVisible); }
    });
  }, [document.locations, editableRoutes, sampledLocations, uploadMode, open, isMapReady, forcePreviewTilesVisible]);

  const updateRouteName = (routeId: string, newName: string) => {
    setEditableRoutes((prev) => prev.map((r) => (r.id === routeId ? { ...r, name: newName } : r)));
  };

  const handleDateChange = (date: Date | undefined) => {
    setRouteDate(date);
    setEditableRoutes((prev) => prev.map((r) => ({ ...r, date: date || undefined })));
  };

  const handleConfirm = () => {
    const routesToSave = saveRoutes ? editableRoutes : [];
    const matchingIds = Object.keys(existingMatches);

    const options: UploadPreviewOptions = {
      autoEnrich,
      matchingPointIds: matchingIds,
      newPointAction,
      personalCategoryName: newPointAction === 'category' ? selectedCategory.name : undefined,
      personalCategoryIcon: newPointAction === 'category' ? selectedCategory.icon : undefined,
      personalCategoryColor: newPointAction === 'category' ? selectedCategory.color : undefined,
      markRoutePointsVisited: markRouteVisited,
      saveRoutes,
      routesToSave,
      uniqueLocations: dedupResult?.uniqueLocations ?? pointLocations,
      possibleDuplicates: dedupResult?.possibleDuplicates ?? [],
      autoDiscardedCount: dedupResult?.autoDiscarded.length ?? 0,
      skippedFromPriorImportCount: dedupResult?.skippedFromPriorImport.length ?? 0,
      catalogLocations: dedupResult?.catalogLocations ?? [],
    };

    // Apply visited flag to route points
    const applyVisited = (locs: GeoLocation[]) => {
      if (!markRouteVisited) return locs;
      return locs.map((loc) =>
        loc.placeType === 'route'
          ? { ...loc, customData: { ...loc.customData, visited: 'true', visited_verified_at: new Date().toISOString() } }
          : loc
      );
    };

    if (uploadMode === 'sample') {
      onConfirm(applyVisited(sampledLocations), true, options);
    } else {
      onConfirm(applyVisited(document.locations), false, options);
    }
  };

  const isLargeFile = totalLocations > 500;
  const isVeryLargeFile = totalLocations > 2000;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col z-[2100] bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Revisión y confirmación
          </DialogTitle>
          <DialogDescription>
            Revisa los datos antes de importarlos a tu colección.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Stats overview */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-muted rounded-lg text-center">
              <div className="flex items-center justify-center gap-1.5">
                <MapPin className="w-4 h-4 text-sky-500" />
                <p className="text-2xl font-bold">{matchingCount}</p>
              </div>
              <p className="text-xs text-muted-foreground">Coincidentes</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <div className="flex items-center justify-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-500" />
                <p className="text-2xl font-bold">{uniqueCount}</p>
              </div>
              <p className="text-xs text-muted-foreground">Nuevos</p>
            </div>
            {discardedCount > 0 && (
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <X className="w-4 h-4 text-muted-foreground" />
                  <p className="text-2xl font-bold text-muted-foreground">{discardedCount}</p>
                </div>
                <p className="text-xs text-muted-foreground">Descartados</p>
              </div>
            )}
            {discardedCount === 0 && routeCount > 0 && (
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <Route className="w-4 h-4 text-orange-500" />
                  <p className="text-2xl font-bold">{routeCount}</p>
                </div>
                <p className="text-xs text-muted-foreground">Rutas</p>
              </div>
            )}
          </div>

          {/* Loading dedup */}
          {dedupLoading && (
            <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-center">
              <p className="text-xs text-muted-foreground animate-pulse">Analizando duplicados…</p>
            </div>
          )}

          {/* Large file warning */}
          {isLargeFile && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-lg border flex items-start gap-3 ${
                isVeryLargeFile ? 'bg-orange-500/10 border-orange-500/30' : 'bg-amber-500/10 border-amber-500/30'
              }`}
            >
              <BarChart3 className={`w-5 h-5 mt-0.5 ${isVeryLargeFile ? 'text-orange-500' : 'text-amber-500'}`} />
              <div className="text-sm">
                <p className="font-medium">{isVeryLargeFile ? 'Archivo muy grande' : 'Archivo grande'}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isVeryLargeFile
                    ? 'Recomendamos subir una muestra del 10-25% para validar los datos.'
                    : 'Considera subir una muestra primero para verificar los datos.'}
                </p>
              </div>
            </motion.div>
          )}

          {/* Mini map */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Map className="w-4 h-4" />
                Vista previa del mapa
              </Label>
              <div className="flex gap-1.5">
                {routeCount > 0 && (
                  <Badge variant="secondary" className="text-xs bg-orange-500/10 text-orange-600 border-orange-500/30">
                    {routeCount} rutas
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">
                  {pointLocations.length} puntos
                </Badge>
              </div>
            </div>
            <div className="relative h-48 rounded-lg border overflow-hidden bg-muted">
              <div ref={mapRef} className="h-full w-full" />
              {pointLocations.length === 0 && routeCount === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  No hay coordenadas válidas para mostrar
                </div>
              )}
            </div>
          </div>

          {/* Points list with dedup badges */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <List className="w-4 h-4" />
              Contenido ({matchingCount + uniqueCount} puntos{routeCount > 0 ? ` + ${routeCount} rutas` : ''})
            </Label>
            <ScrollArea className="h-44 rounded-lg border">
              <div className="divide-y divide-border">
                {/* Routes first */}
                {editableRoutes.map((route) => (
                  <div key={route.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <Route className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    {editingRouteId === route.id ? (
                      <Input
                        value={route.name}
                        onChange={(e) => updateRouteName(route.id, e.target.value)}
                        onBlur={() => setEditingRouteId(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingRouteId(null)}
                        autoFocus
                        className="h-6 text-sm py-0 px-1.5"
                      />
                    ) : (
                      <span
                        className="truncate font-medium cursor-pointer hover:text-primary flex items-center gap-1"
                        onClick={() => setEditingRouteId(route.id)}
                        title="Clic para editar nombre"
                      >
                        {route.name}
                        <Pencil className="w-3 h-3 text-muted-foreground" />
                      </span>
                    )}
                    <Badge variant="outline" className="ml-auto text-[10px] shrink-0 bg-orange-500/10 text-orange-600 border-orange-500/30">
                      Ruta
                    </Badge>
                  </div>
                ))}
                {/* Matching points (Catálogo) */}
                {dedupResult?.possibleDuplicates.map((dup) => (
                  <div key={dup.newLocation.id} className="flex items-center gap-2.5 px-3 py-2 text-sm bg-sky-500/5">
                    <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    <div className="truncate flex-1 min-w-0">
                      <span className="truncate block">{dup.newLocation.name || 'Sin nombre'}</span>
                      <span className="text-[10px] text-sky-600 truncate block">≈ {dup.existingLocation.name} ({formatDistance(dup.distance)})</span>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] shrink-0 bg-sky-500/10 text-sky-600 border-sky-300">
                      Catálogo
                    </Badge>
                  </div>
                ))}
                {/* New (unique) points */}
                {dedupResult?.uniqueLocations.map((loc) => (
                  <div key={loc.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="truncate flex-1">{loc.name || 'Sin nombre'}</span>
                    <Badge variant="outline" className="ml-auto text-[10px] shrink-0 bg-emerald-500/10 text-emerald-600 border-emerald-300">
                      Nuevo
                    </Badge>
                  </div>
                ))}
                {/* Discarded (collapsed) */}
                {discardedCount > 0 && (
                  <>
                    <button
                      type="button"
                      className="flex items-center gap-2 px-3 py-2 w-full text-left text-xs text-muted-foreground hover:bg-muted/30"
                      onClick={() => setShowDiscarded(!showDiscarded)}
                    >
                      {showDiscarded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {discardedCount} descartados (duplicados exactos / reimportados)
                    </button>
                    {showDiscarded && (
                      <>
                        {dedupResult?.autoDiscarded.map((dup) => (
                          <div key={dup.newLocation.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-muted-foreground line-through opacity-60">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate flex-1">{dup.newLocation.name}</span>
                            <span className="text-[10px] shrink-0">exacto</span>
                          </div>
                        ))}
                        {dedupResult?.skippedFromPriorImport.map((loc) => (
                          <div key={loc.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-muted-foreground line-through opacity-60">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate flex-1">{loc.name}</span>
                            <span className="text-[10px] shrink-0">reimportado</span>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
                {/* Fallback if dedup not loaded yet */}
                {!dedupResult && pointLocations.map((loc) => (
                  <div key={loc.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="truncate flex-1">{loc.name || 'Sin nombre'}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Route configuration — only if routes exist */}
          {routeCount > 0 && (
            <div className="space-y-3">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Configuración de rutas
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSaveRoutes(true)}
                  className={cn(
                    'flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all text-left',
                    saveRoutes ? 'border-orange-500/30 bg-orange-500/5' : 'border-border'
                  )}
                >
                  <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0', saveRoutes ? 'border-orange-500' : 'border-muted-foreground/40')}>
                    {saveRoutes && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-tight">Guardar rutas en mi colección</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {routeCount} ruta{routeCount !== 1 ? 's' : ''} se añadirán a tu lista
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setSaveRoutes(false)}
                  className={cn(
                    'flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all text-left',
                    !saveRoutes ? 'border-orange-500/30 bg-orange-500/5' : 'border-border'
                  )}
                >
                  <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0', !saveRoutes ? 'border-orange-500' : 'border-muted-foreground/40')}>
                    {!saveRoutes && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-tight">Añadir solo los puntos</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Sin asociar a ninguna ruta</p>
                  </div>
                </button>
              </div>
              {saveRoutes && (
                <div className="pl-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Nombre de las rutas</Label>
                      <Input
                        placeholder="Nombre del itinerario..."
                        value={editableRoutes[0]?.name || document.name || ''}
                        onChange={(e) => {
                          const newName = e.target.value;
                          setEditableRoutes((prev) => prev.map((r) => ({ ...r, name: newName })));
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Fecha de las rutas</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn('w-full justify-start text-left font-normal', !routeDate && 'text-muted-foreground')}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {routeDate ? format(routeDate, "PPP", { locale: es }) : 'Seleccionar fecha'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[2200]" align="start">
                          <Calendar
                            mode="single"
                            selected={routeDate}
                            onSelect={handleDateChange}
                            disabled={(date) => date > new Date()}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  {routeDate && (
                    <p className="text-[10px] text-muted-foreground">
                      Todas las rutas se guardarán con fecha {format(routeDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Import options */}
          <div className="space-y-3">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Opciones de importación</Label>

            {/* Matching points info */}
            {matchingCount > 0 && (
              <div className="p-2.5 rounded-lg border border-sky-500/30 bg-sky-500/5">
                <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                  <CheckCircle className="w-3.5 h-3.5 inline mr-1" />{matchingCount} puntos coincidentes se enriquecerán automáticamente
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Coinciden con puntos de tu colección existente
                </p>
              </div>
            )}

            {/* New points info */}
            {uniqueCount > 0 && (
              <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {uniqueCount} puntos nuevos se importarán como WayPoints
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Podrás enriquecerlos desde la mesa de trabajo
                </p>
              </div>
            )}

            {/* Route visited option */}
            {routeCount > 0 && (
              <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${markRouteVisited ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border'}`}>
                <Switch checked={markRouteVisited} onCheckedChange={setMarkRouteVisited} className="shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">Marcar como visitados</p>
                  <p className="text-[10px] text-muted-foreground truncate">{routeLocations.length} puntos en rutas</p>
                </div>
              </label>
            )}
          </div>

          <Separator />

          {/* Upload mode selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">¿Qué quieres subir?</Label>
            <button
              type="button"
              onClick={() => setUploadMode('full')}
              className={`w-full p-4 rounded-lg border text-left transition-all ${
                uploadMode === 'full' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-full ${uploadMode === 'full' ? 'bg-primary/20' : 'bg-muted'}`}>
                  <FileText className={`w-4 h-4 ${uploadMode === 'full' ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Subir archivo completo</span>
                    <Badge variant="outline">{totalLocations.toLocaleString()} puntos</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Importa todas las ubicaciones y rutas del documento.</p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('sample')}
              className={`w-full p-4 rounded-lg border text-left transition-all ${
                uploadMode === 'sample' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-full ${uploadMode === 'sample' ? 'bg-primary/20' : 'bg-muted'}`}>
                  <Shuffle className={`w-4 h-4 ${uploadMode === 'sample' ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Subir muestra aleatoria</span>
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                      {sampleCount.toLocaleString()} puntos
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Prueba con una muestra antes de importar todo.</p>
                </div>
              </div>
            </button>

            {uploadMode === 'sample' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="pl-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Porcentaje de muestra</Label>
                  <span className="text-sm font-bold text-primary">{samplePercentage}%</span>
                </div>
                <div className="flex gap-2">
                  {SAMPLE_PRESETS.map((preset) => (
                    <Button key={preset.value} type="button" variant={samplePercentage === preset.value ? 'default' : 'outline'} size="sm" onClick={() => setSamplePercentage(preset.value)}>
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <Slider value={[samplePercentage]} onValueChange={([val]) => setSamplePercentage(val)} min={5} max={75} step={5} className="py-2" />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Percent className="w-3 h-3" />
                  {sampleCount.toLocaleString()} de {totalLocations.toLocaleString()} puntos seleccionados aleatoriamente
                </p>
              </motion.div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onCancel}>
            <X className="w-4 h-4 mr-1" />
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={dedupLoading}>
            <CheckCircle className="w-4 h-4 mr-1" />
            {uploadMode === 'sample'
              ? `Importar muestra (${sampleCount.toLocaleString()} puntos)`
              : `Importar (${(matchingCount + uniqueCount).toLocaleString()} puntos${saveRoutes && routeCount > 0 ? ` + ${routeCount} rutas` : ''})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
