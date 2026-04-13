import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Sparkles, Copy, Merge, Tag, Loader2, MapPin, Compass,
  MoreVertical, FileText, Globe, Navigation, Users, Leaf,
  Search, ExternalLink, ChevronLeft, Crosshair,
  Building2, Landmark, Anchor, UtensilsCrossed, TreePine, Mountain,
  Replace, Bookmark, Fuel, Coffee, BedDouble, Eye, ParkingCircle, Armchair,
} from 'lucide-react';
import { PlaceType, PLACE_TYPE_LABELS } from '@/types/location';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/store/locations-store';
import { toast } from 'sonner';

interface LocationRow {
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

interface NearbyPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance_m: number;
  source: 'own' | 'followed' | 'druid' | 'osm';
  source_label: string;
  place_type: string | null;
  enriched_data: any;
  country: string | null;
  region: string | null;
  description: string | null;
  document_name: string | null;
  enrichment_status: string | null;
  osm_link?: string;
}

interface PointContextActionsProps {
  location: LocationRow;
  docId: string;
  userId: string;
  onLocationUpdated: (loc: LocationRow) => void;
  onLocationDuplicated: (newLoc: LocationRow) => void;
  onLocationMerged: (mergedIntoId: string, removedId: string) => void;
  onOpenNearby?: (location: LocationRow) => void;
}

export interface NearbyPanelProps {
  location: LocationRow;
  docId: string;
  userId: string;
  onClose: () => void;
  onLocationUpdated: (loc: LocationRow) => void;
  onLocationMerged: (mergedIntoId: string, removedId: string) => void;
}

const PLACE_TYPE_ENTRIES = Object.entries(PLACE_TYPE_LABELS) as [PlaceType, string][];

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Semantic category classification ──
type SemanticCategory = 'settlements' | 'heritage' | 'infrastructure' | 'establishments' | 'nature' | 'landforms' | 'other';

const CATEGORY_META: Record<SemanticCategory, { label: string; icon: React.ReactNode; order: number }> = {
  settlements:     { label: 'Poblaciones',             icon: <Building2 className="w-3.5 h-3.5" />,         order: 1 },
  heritage:        { label: 'Patrimonio y turismo',    icon: <Landmark className="w-3.5 h-3.5" />,          order: 2 },
  infrastructure:  { label: 'Infraestructura',         icon: <Anchor className="w-3.5 h-3.5" />,            order: 3 },
  establishments:  { label: 'Establecimientos',        icon: <UtensilsCrossed className="w-3.5 h-3.5" />,   order: 4 },
  nature:          { label: 'Naturaleza y ocio',       icon: <TreePine className="w-3.5 h-3.5" />,          order: 5 },
  landforms:       { label: 'Accidentes geográficos',  icon: <Mountain className="w-3.5 h-3.5" />,          order: 6 },
  other:           { label: 'Otros',                   icon: <MapPin className="w-3.5 h-3.5" />,            order: 7 },
};

const SETTLEMENT_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'locality', 'suburb', 'neighbourhood', 'quarter', 'isolated_dwelling']);
const HERITAGE_TYPES = new Set(['historic', 'tourism', 'monument', 'museum', 'artwork', 'memorial', 'castle', 'ruins', 'archaeological_site', 'attraction', 'viewpoint', 'information', 'gallery', 'church', 'chapel', 'cathedral', 'monastery', 'light_major', 'survey_point']);
const INFRA_TYPES = new Set(['harbour', 'port', 'airport', 'ferry_terminal', 'bus_station', 'train_station', 'fuel', 'parking', 'marina']);
const ESTABLISHMENT_TYPES = new Set(['restaurant', 'bar', 'cafe', 'hotel', 'hostel', 'guest_house', 'motel', 'shop', 'supermarket', 'seafood', 'fast_food', 'pub', 'bakery', 'pharmacy', 'bank', 'craft']);
const NATURE_TYPES = new Set(['natural', 'leisure', 'beach', 'park', 'garden', 'forest', 'wetland', 'nature_reserve', 'swimming_pool', 'playground', 'sports_centre', 'pitch']);
const LANDFORM_TYPES = new Set(['cape', 'bay', 'islet', 'island', 'cliff', 'rock', 'bare_rock', 'cave_entrance', 'peak', 'ridge', 'valley', 'peninsula', 'reef', 'shoal', 'strait', 'coastline', 'saddle']);

// ── Quick personal category presets from OSM tags ──
interface PersonalCategoryPreset {
  label: string;
  icon: React.ReactNode;
  osmTypes: Set<string>;
  defaultPlaceType: PlaceType;
}

const PERSONAL_CATEGORY_PRESETS: PersonalCategoryPreset[] = [
  { label: 'Parada / Descanso', icon: <Armchair className="w-3 h-3" />, osmTypes: new Set(['rest_area', 'bench']), defaultPlaceType: 'other' },
  { label: 'Repostaje', icon: <Fuel className="w-3 h-3" />, osmTypes: new Set(['fuel']), defaultPlaceType: 'other' },
  { label: 'Comer', icon: <Coffee className="w-3 h-3" />, osmTypes: new Set(['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'bakery']), defaultPlaceType: 'restaurant' },
  { label: 'Dormir', icon: <BedDouble className="w-3 h-3" />, osmTypes: new Set(['hotel', 'camp_site', 'hostel', 'guest_house', 'motel']), defaultPlaceType: 'hotel' },
  { label: 'Mirador', icon: <Eye className="w-3 h-3" />, osmTypes: new Set(['viewpoint']), defaultPlaceType: 'viewpoint' },
  { label: 'Parking', icon: <ParkingCircle className="w-3 h-3" />, osmTypes: new Set(['parking']), defaultPlaceType: 'other' },
];

function suggestCategory(placeType: string | null): PersonalCategoryPreset | null {
  if (!placeType) return null;
  const pt = placeType.toLowerCase();
  return PERSONAL_CATEGORY_PRESETS.find(c => c.osmTypes.has(pt)) || null;
}

function classifyPoint(point: NearbyPoint): SemanticCategory {
  const pt = (point.place_type || '').toLowerCase();
  if (SETTLEMENT_TYPES.has(pt)) return 'settlements';
  if (HERITAGE_TYPES.has(pt)) return 'heritage';
  if (INFRA_TYPES.has(pt)) return 'infrastructure';
  if (ESTABLISHMENT_TYPES.has(pt)) return 'establishments';
  if (NATURE_TYPES.has(pt)) return 'nature';
  if (LANDFORM_TYPES.has(pt)) return 'landforms';
  return 'other';
}

function groupByCategory(points: NearbyPoint[]): { category: SemanticCategory; meta: typeof CATEGORY_META[SemanticCategory]; points: NearbyPoint[] }[] {
  const groups = new Map<SemanticCategory, NearbyPoint[]>();
  for (const p of points) {
    const cat = classifyPoint(p);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(p);
  }
  return Array.from(groups.entries())
    .map(([cat, pts]) => ({ category: cat, meta: CATEGORY_META[cat], points: pts.sort((a, b) => a.distance_m - b.distance_m) }))
    .sort((a, b) => a.meta.order - b.meta.order);
}

function NearbyPointCard({ point }: { point: NearbyPoint }) {
  const enriched = point.enriched_data;
  const desc = enriched?.descripcion_detallada || point.description;
  const tags: string[] = enriched?.tags || [];

  const sourceIcon = point.source === 'osm' ? (
    <Search className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
  ) : point.source === 'druid' ? (
    <Leaf className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
  ) : point.source === 'followed' ? (
    <Users className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
  ) : (
    <MapPin className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
  );

  return (
    <div className="w-full max-w-full overflow-hidden rounded-lg border border-border p-3 space-y-2 transition-colors hover:bg-muted/30">
      <div className="flex min-w-0 items-start gap-2">
        {sourceIcon}
        <div className="flex-1 min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 flex-1 break-words text-[13px] font-semibold leading-tight">{point.name}</p>
            <Badge variant="outline" className="text-[9px] shrink-0 tabular-nums">
              {point.distance_m}m
            </Badge>
            <Badge variant="secondary" className="text-[8px] h-4 px-1 shrink-0">
              {point.source_label}
            </Badge>
            {point.osm_link && (
              <a href={point.osm_link} target="_blank" rel="noopener noreferrer" className="shrink-0" onClick={e => e.stopPropagation()}>
                <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
            {point.place_type && <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{point.place_type}</Badge>}
            {point.country && (
              <span className="flex items-center gap-0.5">
                <Globe className="w-2.5 h-2.5" />
                {point.country}{point.region ? `, ${point.region}` : ''}
              </span>
            )}
            {point.enrichment_status === 'enriched' && <Sparkles className="w-3 h-3 text-amber-500" />}
          </div>
        </div>
      </div>
      {point.document_name && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pl-5">
          <FileText className="w-2.5 h-2.5" />
          <span className="truncate">{point.document_name}</span>
        </div>
      )}
      {desc && <p className="text-[11px] text-muted-foreground pl-5 line-clamp-3 leading-relaxed">{desc}</p>}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-5">
          {tags.slice(0, 6).map((t: string, i: number) => (
            <Badge key={i} variant="outline" className="text-[8px] h-3.5 px-1">{t}</Badge>
          ))}
          {tags.length > 6 && <span className="text-[8px] text-muted-foreground">+{tags.length - 6}</span>}
        </div>
      )}
      {point.source === 'osm' && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground pl-5"
          onClick={e => e.stopPropagation()}
        >
          <Globe className="w-2.5 h-2.5" />
          Ver en Google Maps
        </a>
      )}
    </div>
  );
}

// ── Exported inline nearby panel (renders in left sidebar) ──
export function NearbyPanel({ location, userId, onClose, onLocationUpdated, onLocationMerged }: NearbyPanelProps) {
  const [nearbyPoints, setNearbyPoints] = useState<NearbyPoint[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [radiusMeters, setRadiusMeters] = useState(500);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [replacingPoint, setReplacingPoint] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState<string | null>(null);
  const setFocusedLocation = useLocationsStore(state => state.setFocusedLocation);
  const documents = useLocationsStore(state => state.documents);
  const selectedRef = useRef<HTMLDivElement | null>(null);

  // Listen for marker clicks from the map
  useEffect(() => {
    const handler = (e: Event) => {
      const { id } = (e as CustomEvent).detail || {};
      if (!id) return;
      setSelectedPointId(id);
      // Pan map to that point
      const point = nearbyPoints.find(p => p.id === id);
      if (point) {
        window.dispatchEvent(new CustomEvent('map-fly-to', {
          detail: { lat: point.latitude, lng: point.longitude, zoom: 17 },
        }));
      }
    };
    window.addEventListener('nearby-marker-clicked', handler);
    return () => window.removeEventListener('nearby-marker-clicked', handler);
  }, [nearbyPoints]);

  // Auto-scroll to selected point
  useEffect(() => {
    if (selectedPointId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedPointId]);

  // Dispatch map event to show/clear nearby markers
  const dispatchMapMarkers = useCallback((points: NearbyPoint[], center: { lat: number; lng: number }, radius: number) => {
    window.dispatchEvent(new CustomEvent('map-show-nearby-ref', {
      detail: {
        center,
        radius,
        points: points.map(p => ({ id: p.id, lat: p.latitude, lng: p.longitude, name: p.name })),
      },
    }));
  }, []);

  const clearMapMarkers = useCallback(() => {
    window.dispatchEvent(new CustomEvent('map-clear-nearby-ref'));
  }, []);

  // Clear markers on unmount
  useEffect(() => {
    return () => { clearMapMarkers(); };
  }, [clearMapMarkers]);

  const searchNearby = useCallback(async () => {
    setLoadingNearby(true);
    setNearbyPoints([]);
    try {
      const degRadius = (radiusMeters / 111320) * 1.2; // approximate, with margin
      const minLat = location.latitude - degRadius;
      const maxLat = location.latitude + degRadius;
      const minLng = location.longitude - degRadius;
      const maxLng = location.longitude + degRadius;

      const [locsRes, druidRes] = await Promise.all([
        supabase.from('locations').select('id, name, latitude, longitude, place_type, enriched_data, country, region, description, enrichment_status, document_id')
          .gte('latitude', minLat).lte('latitude', maxLat).gte('longitude', minLng).lte('longitude', maxLng)
          .is('deleted_at', null).neq('id', location.id).limit(80),
        supabase.from('druid_locations').select('id, name, latitude, longitude, place_type, enriched_data, enrichment_status, druid_id')
          .gte('latitude', minLat).lte('latitude', maxLat).gte('longitude', minLng).lte('longitude', maxLng).limit(50),
      ]);

      const ownLocs = locsRes.data || [];
      const druidLocs = druidRes.data || [];
      const docIds = new Set<string>();
      ownLocs.forEach(l => { if (l.document_id) docIds.add(l.document_id); });
      const druidIds = new Set<string>();
      druidLocs.forEach(l => { if (l.druid_id) druidIds.add(l.druid_id); });

      const [docsRes, druidsRes, followedRes] = await Promise.all([
        docIds.size > 0 ? supabase.from('documents').select('id, name, user_id').in('id', Array.from(docIds)) : Promise.resolve({ data: [] as any[] }),
        druidIds.size > 0 ? supabase.from('druids').select('id, name').in('id', Array.from(druidIds)) : Promise.resolve({ data: [] as any[] }),
        supabase.from('follows').select('following_id').eq('follower_id', userId).eq('status', 'accepted'),
      ]);

      const docNameMap: Record<string, string> = {};
      const docOwnerMap: Record<string, string | null> = {};
      (docsRes.data || []).forEach((d: any) => { docNameMap[d.id] = d.name; docOwnerMap[d.id] = d.user_id; });
      const druidNameMap: Record<string, string> = {};
      (druidsRes.data || []).forEach((d: any) => { druidNameMap[d.id] = d.name; });
      const followedUserIds = new Set((followedRes.data || []).map((f: any) => f.following_id));

      const results: NearbyPoint[] = [];
      const seenIds = new Set<string>();

      ownLocs.forEach(l => {
        const dist = haversineDistance(location.latitude, location.longitude, l.latitude, l.longitude);
        if (dist <= radiusMeters && !seenIds.has(l.id)) {
          seenIds.add(l.id);
          const ownerUserId = l.document_id ? docOwnerMap[l.document_id] : null;
          const isOwn = ownerUserId === userId;
          const isFollowed = ownerUserId ? followedUserIds.has(ownerUserId) : false;
          results.push({
            id: l.id, name: l.name, latitude: l.latitude, longitude: l.longitude,
            distance_m: Math.round(dist), source: isOwn ? 'own' : 'followed',
            source_label: isOwn ? 'Tuyo' : isFollowed ? 'Seguido' : 'Curador',
            place_type: l.place_type, enriched_data: l.enriched_data, country: l.country,
            region: l.region, description: l.description,
            document_name: l.document_id ? docNameMap[l.document_id] || null : null,
            enrichment_status: l.enrichment_status,
          });
        }
      });

      druidLocs.forEach(l => {
        const dist = haversineDistance(location.latitude, location.longitude, l.latitude, l.longitude);
        if (dist <= radiusMeters && !seenIds.has(l.id)) {
          seenIds.add(l.id);
          results.push({
            id: l.id, name: l.name, latitude: l.latitude, longitude: l.longitude,
            distance_m: Math.round(dist), source: 'druid', source_label: druidNameMap[l.druid_id] || 'Druid',
            place_type: l.place_type, enriched_data: l.enriched_data, country: null, region: null,
            description: null, document_name: null, enrichment_status: l.enrichment_status,
          });
        }
      });

      try {
        const { data: osmData, error: osmError } = await supabase.functions.invoke('search-nearby-osm', {
          body: {
            latitude: location.latitude,
            longitude: location.longitude,
            radiusMeters,
            limit: 40,
          },
        });

        if (osmError) {
          console.warn('Nearby OSM search failed:', osmError);
        } else {
          (osmData?.results || []).forEach((el: any) => {
            if (seenIds.has(el.id)) return;
            seenIds.add(el.id);
            results.push({
              id: el.id,
              name: el.name,
              latitude: el.latitude,
              longitude: el.longitude,
              distance_m: el.distance_m,
              source: 'osm',
              source_label: 'OpenStreetMap',
              place_type: el.place_type,
              enriched_data: null,
              country: null,
              region: null,
              description: el.description,
              document_name: null,
              enrichment_status: null,
              osm_link: el.osm_link,
            });
          });
        }
      } catch (osmErr) {
        console.warn('Nearby OSM search failed:', osmErr);
      }

      results.sort((a, b) => a.distance_m - b.distance_m);
      setNearbyPoints(results);

      // Show results on the map
      dispatchMapMarkers(results, { lat: location.latitude, lng: location.longitude }, radiusMeters);
    } catch (e) {
      console.error('Error searching nearby:', e);
      toast.error('Error buscando puntos cercanos');
    } finally {
      setLoadingNearby(false);
    }
  }, [location, userId, radiusMeters, dispatchMapMarkers]);

  // Fly to the location on mount and whenever it changes
  useEffect(() => {
    const zoom = radiusMeters <= 300 ? 17 : radiusMeters <= 800 ? 16 : 15;
    window.dispatchEvent(new CustomEvent('map-fly-to', {
      detail: { lat: location.latitude, lng: location.longitude, zoom },
    }));
  }, [location.latitude, location.longitude, radiusMeters]);

  useEffect(() => { searchNearby(); }, [searchNearby]);

  const handleEnrichWithContext = async () => {
    setEnriching(true);
    try {
      const contextPoints = nearbyPoints.slice(0, 10).map(p => ({
        name: p.name, distance_m: p.distance_m, place_type: p.place_type,
        description: p.enriched_data?.descripcion_detallada?.slice(0, 200) || p.description?.slice(0, 200) || null,
      }));
      const { error } = await supabase.functions.invoke('enrich-location', {
        body: {
          location: { name: location.name, latitude: location.latitude, longitude: location.longitude, country: location.country, region: location.region, continent: location.continent, description: location.description },
          locationId: location.id, skipValidation: true, nearbyContext: contextPoints,
        },
      });
      if (error) throw error;
      const { data: updated } = await supabase.from('locations')
        .select('id, name, description, latitude, longitude, is_approved, enrichment_status, enriched_data, place_type, continent, country, region')
        .eq('id', location.id).single();
      if (updated) { onLocationUpdated(updated); toast.success('Punto enriquecido con contexto de proximidad'); }
    } catch { toast.error('Error al enriquecer el punto'); } finally { setEnriching(false); }
  };

  const handleMerge = async (targetPoint: NearbyPoint) => {
    try {
      const mergedData: Record<string, any> = {};
      if (!targetPoint.enriched_data && location.enriched_data) {
        mergedData.enriched_data = location.enriched_data;
        mergedData.enrichment_status = location.enrichment_status;
      }
      if (Object.keys(mergedData).length > 0) await supabase.from('locations').update(mergedData).eq('id', targetPoint.id);
      await supabase.from('locations').update({ deleted_at: new Date().toISOString() }).eq('id', location.id);
      onLocationMerged(targetPoint.id, location.id);
      toast.success(`Fusionado con "${targetPoint.name}"`);
      onClose();
    } catch { toast.error('Error al fusionar'); }
  };

  const handleSelectPoint = (point: NearbyPoint) => {
    setSelectedPointId(point.id);
    // For non-OSM points, focus them on the map
    if (point.source !== 'osm') {
      setFocusedLocation(point.id);
    }
    // Pan map to the point
    window.dispatchEvent(new CustomEvent('map-fly-to', {
      detail: { lat: point.latitude, lng: point.longitude, zoom: 17 },
    }));
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden overflow-x-hidden">
      {/* Header */}
      <div className="space-y-1 overflow-x-hidden border-b bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { clearMapMarkers(); onClose(); }}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Compass className="w-4 h-4 text-primary shrink-0" />
              <p className="text-sm font-medium truncate">Contexto de proximidad</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{location.name}</span>
              {' · '}Radio {radiusMeters}m · {nearbyPoints.length} puntos
            </p>
          </div>
          <Button
            variant={mergeMode ? 'default' : 'outline'}
            size="sm"
            className="h-6 text-[10px] gap-1 shrink-0"
            onClick={() => setMergeMode(!mergeMode)}
          >
            <Merge className="w-3 h-3" />
            {mergeMode ? 'Cancelar' : 'Fusionar'}
          </Button>
        </div>

        {/* Radius slider */}
        <div className="flex items-center gap-2 px-1 pt-1">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Radio</span>
          <Slider
            value={[radiusMeters]}
            onValueChange={([v]) => setRadiusMeters(v)}
            min={100}
            max={2000}
            step={100}
            className="flex-1"
          />
          <span className="text-[10px] font-medium tabular-nums w-10 text-right">{radiusMeters}m</span>
        </div>
      </div>

      {/* Current point card */}
      <div className="min-w-0 shrink-0 px-3 pt-3">
        <div className="w-full min-w-0 overflow-hidden rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Navigation className="w-3.5 h-3.5 text-primary" />
            <span className="min-w-0 truncate text-[12px] font-semibold">{location.name}</span>
            {location.place_type && <Badge variant="secondary" className="h-4 shrink-0 text-[9px]">{location.place_type}</Badge>}
          </div>
          <p className="text-[10px] text-muted-foreground pl-5">
            {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
          </p>
          {location.enrichment_status === 'enriched' ? (
            <p className="text-[10px] text-amber-600 pl-5 flex items-center gap-1"><Sparkles className="w-2.5 h-2.5" /> Ya enriquecido</p>
          ) : (
            <p className="text-[10px] text-muted-foreground pl-5">Sin enriquecer</p>
          )}
        </div>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="min-w-0 overflow-x-hidden px-3 pb-8 pt-3">
        {loadingNearby ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Buscando cercanos...</span>
          </div>
        ) : nearbyPoints.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <MapPin className="w-8 h-8 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No se encontraron puntos en {radiusMeters}m</p>
          </div>
        ) : mergeMode ? (
          <div className="min-w-0 space-y-2 pb-8">
            {nearbyPoints.filter(p => p.source !== 'osm').map(p => (
              <button key={p.id} onClick={() => handleMerge(p)}
                className="flex w-full max-w-full items-start gap-2 overflow-hidden rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/40">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{p.name}</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                    <span className="tabular-nums">{p.distance_m}m</span>
                    <span className="opacity-30">·</span>
                    <span>{p.place_type || 'sin tipo'}</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5">Fusionar aquí</Badge>
              </button>
            ))}
          </div>
        ) : (
          <div className="min-w-0 space-y-4 pb-8">
            {groupByCategory(nearbyPoints).map(group => (
              <div key={group.category} className="min-w-0">
                <div className="mb-2 flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  {group.meta.icon}
                  <span className="min-w-0 truncate text-[11px] font-semibold">{group.meta.label}</span>
                  <Badge variant="outline" className="ml-auto h-4 shrink-0 text-[9px]">{group.points.length}</Badge>
                </div>
                <div className="min-w-0 space-y-2">
                  {group.points.map(p => (
                    <div
                      key={p.id}
                      ref={selectedPointId === p.id ? selectedRef : undefined}
                      onClick={() => handleSelectPoint(p)}
                      className={`w-full min-w-0 max-w-full cursor-pointer rounded-lg transition-colors ${selectedPointId === p.id ? 'bg-primary/5 ring-2 ring-primary/50' : ''}`}
                    >
                      <NearbyPointCard point={p} />
                      {selectedPointId === p.id && (
                        <div className="flex items-center gap-1 px-5 pb-2 text-[10px] text-primary">
                          <Crosshair className="w-3 h-3" />
                          <span>Seleccionado en mapa</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </ScrollArea>

      {/* Footer */}
      {!mergeMode && (
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 overflow-hidden border-t bg-background px-3 py-2">
          <p className="truncate text-[10px] text-muted-foreground">
            {nearbyPoints.filter(p => p.enrichment_status === 'enriched').length} de {nearbyPoints.length} enriquecidos
          </p>
          <Button size="sm" className="h-7 shrink-0 gap-1.5 text-[11px]" onClick={handleEnrichWithContext} disabled={enriching}>
            {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Enriquecer este punto
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main dropdown (no more Sheet for nearby) ──
export function PointContextActions({
  location, docId, userId,
  onLocationUpdated, onLocationDuplicated, onLocationMerged, onOpenNearby,
}: PointContextActionsProps) {
  const [duplicating, setDuplicating] = useState(false);
  const [reclassifySheet, setReclassifySheet] = useState(false);

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const { data, error } = await supabase
        .from('locations')
        .insert({
          document_id: docId,
          name: `${location.name} (copia)`,
          description: location.description,
          latitude: location.latitude + 0.0002,
          longitude: location.longitude + 0.0002,
          place_type: location.place_type,
          continent: location.continent,
          country: location.country,
          region: location.region,
          is_approved: false,
        })
        .select('id, name, description, latitude, longitude, is_approved, enrichment_status, enriched_data, place_type, continent, country, region')
        .single();

      if (error) throw error;
      if (data) {
        onLocationDuplicated(data);
        toast.success(`Punto duplicado: "${data.name}"`);
      }
    } catch {
      toast.error('Error al duplicar');
    } finally {
      setDuplicating(false);
    }
  };

  const handleReclassify = async (newType: PlaceType) => {
    try {
      const { error } = await supabase
        .from('locations')
        .update({ place_type: newType })
        .eq('id', location.id);

      if (error) throw error;

      onLocationUpdated({ ...location, place_type: newType });
      useLocationsStore.getState().updateLocation(location.id, { placeType: newType });
      toast.success(`Reclasificado como "${newType}"`);
      setReclassifySheet(false);
    } catch {
      toast.error('Error al reclasificar');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground" title="Más acciones">
            <MoreVertical className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 z-[1100]">
          <DropdownMenuItem onClick={() => onOpenNearby?.(location)}>
            <Sparkles className="mr-2 h-3.5 w-3.5 text-amber-500" />
            Ver contexto cercano
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDuplicate} disabled={duplicating}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Duplicar punto
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onOpenNearby?.(location)}>
            <Merge className="mr-2 h-3.5 w-3.5" />
            Fusionar con cercano
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setReclassifySheet(true)}>
            <Tag className="mr-2 h-3.5 w-3.5" />
            Reclasificar tipo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reclassify Sheet */}
      <Sheet open={reclassifySheet} onOpenChange={setReclassifySheet}>
        <SheetContent side="bottom" className="h-[50vh]">
          <SheetHeader>
            <SheetTitle className="text-sm flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Reclasificar "{location.name}"
            </SheetTitle>
            <SheetDescription className="text-xs">
              Tipo actual: {location.place_type || 'sin tipo'}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[30vh] mt-3">
            <div className="grid grid-cols-2 gap-1.5">
              {PLACE_TYPE_ENTRIES.map(([type, label]) => (
                <Button
                  key={type}
                  variant={location.place_type === type ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-[11px] justify-start"
                  onClick={() => handleReclassify(type)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
