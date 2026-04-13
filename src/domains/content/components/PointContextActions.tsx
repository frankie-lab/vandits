import React, { useState, useCallback } from 'react';
import {
  Sparkles, Copy, Merge, Tag, Loader2, MapPin, Compass,
  MoreVertical, FileText, Globe, Navigation, Users, Leaf,
  Search, ExternalLink,
} from 'lucide-react';
import { PlaceType, PLACE_TYPE_LABELS } from '@/types/location';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
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

function NearbyPointCard({ point }: { point: NearbyPoint }) {
  const enriched = point.enriched_data;
  const desc = enriched?.descripcion_detallada || point.description;
  const tags: string[] = enriched?.tags || [];

  const sourceIcon = point.source === 'osm' ? (
    <Search className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
  ) : point.source === 'druid' ? (
    <Leaf className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
  ) : point.source === 'followed' ? (
    <Users className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
  ) : (
    <MapPin className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
  );

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-2">
        {sourceIcon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold truncate">{point.name}</p>
            <Badge variant="outline" className="text-[9px] shrink-0 tabular-nums">
              {point.distance_m}m
            </Badge>
            <Badge
              variant="secondary"
              className="text-[8px] h-4 px-1 shrink-0"
            >
              {point.source_label}
            </Badge>
            {point.osm_link && (
              <a
                href={point.osm_link}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
            {point.place_type && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{point.place_type}</Badge>
            )}
            {point.country && (
              <span className="flex items-center gap-0.5">
                <Globe className="w-2.5 h-2.5" />
                {point.country}{point.region ? `, ${point.region}` : ''}
              </span>
            )}
            {point.enrichment_status === 'enriched' && (
              <Sparkles className="w-3 h-3 text-amber-500" />
            )}
          </div>
        </div>
      </div>

      {point.document_name && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pl-5">
          <FileText className="w-2.5 h-2.5" />
          <span className="truncate">{point.document_name}</span>
        </div>
      )}

      {desc && (
        <p className="text-[11px] text-muted-foreground pl-5 line-clamp-3 leading-relaxed">
          {desc}
        </p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-5">
          {tags.slice(0, 6).map((t: string, i: number) => (
            <Badge key={i} variant="outline" className="text-[8px] h-3.5 px-1">{t}</Badge>
          ))}
          {tags.length > 6 && (
            <span className="text-[8px] text-muted-foreground">+{tags.length - 6}</span>
          )}
        </div>
      )}

      {point.source === 'osm' && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
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

export function PointContextActions({
  location, docId, userId,
  onLocationUpdated, onLocationDuplicated, onLocationMerged,
}: PointContextActionsProps) {
  const [nearbyDialog, setNearbyDialog] = useState(false);
  const [nearbyPoints, setNearbyPoints] = useState<NearbyPoint[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [reclassifySheet, setReclassifySheet] = useState(false);
  const [mergeSheet, setMergeSheet] = useState(false);

  const searchNearby = useCallback(async () => {
    setLoadingNearby(true);
    setNearbyPoints([]);
    try {
      const radius = 0.005;
      const minLat = location.latitude - radius;
      const maxLat = location.latitude + radius;
      const minLng = location.longitude - radius;
      const maxLng = location.longitude + radius;

      // Fetch all visible locations (own + followed + curator) in parallel with druid locations
      const [locsRes, druidRes] = await Promise.all([
        supabase
          .from('locations')
          .select('id, name, latitude, longitude, place_type, enriched_data, country, region, description, enrichment_status, document_id')
          .gte('latitude', minLat).lte('latitude', maxLat)
          .gte('longitude', minLng).lte('longitude', maxLng)
          .is('deleted_at', null)
          .neq('id', location.id)
          .limit(80),
        supabase
          .from('druid_locations')
          .select('id, name, latitude, longitude, place_type, enriched_data, enrichment_status, druid_id')
          .gte('latitude', minLat).lte('latitude', maxLat)
          .gte('longitude', minLng).lte('longitude', maxLng)
          .limit(50),
      ]);

      const ownLocs = locsRes.data || [];
      const druidLocs = druidRes.data || [];

      // Collect document IDs and druid IDs for name resolution
      const docIds = new Set<string>();
      ownLocs.forEach(l => { if (l.document_id) docIds.add(l.document_id); });
      const druidIds = new Set<string>();
      druidLocs.forEach(l => { if (l.druid_id) druidIds.add(l.druid_id); });

      // Fetch document names and druid names in parallel
      const [docsRes, druidsRes, followedRes] = await Promise.all([
        docIds.size > 0
          ? supabase.from('documents').select('id, name, user_id').in('id', Array.from(docIds))
          : Promise.resolve({ data: [] as { id: string; name: string; user_id: string | null }[] }),
        druidIds.size > 0
          ? supabase.from('druids').select('id, name').in('id', Array.from(druidIds))
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        // Get list of followed user IDs to classify sources
        supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', userId)
          .eq('status', 'accepted'),
      ]);

      const docNameMap: Record<string, string> = {};
      const docOwnerMap: Record<string, string | null> = {};
      (docsRes.data || []).forEach(d => {
        docNameMap[d.id] = d.name;
        docOwnerMap[d.id] = d.user_id;
      });

      const druidNameMap: Record<string, string> = {};
      (druidsRes.data || []).forEach(d => { druidNameMap[d.id] = d.name; });

      const followedUserIds = new Set((followedRes.data || []).map(f => f.following_id));

      const results: NearbyPoint[] = [];
      const seenIds = new Set<string>();

      // Process user locations (own + followed + curator)
      ownLocs.forEach(l => {
        const dist = haversineDistance(location.latitude, location.longitude, l.latitude, l.longitude);
        if (dist <= 500 && !seenIds.has(l.id)) {
          seenIds.add(l.id);
          const ownerUserId = l.document_id ? docOwnerMap[l.document_id] : null;
          const isOwn = ownerUserId === userId;
          const isFollowed = ownerUserId ? followedUserIds.has(ownerUserId) : false;
          const source: 'own' | 'followed' | 'druid' = isOwn ? 'own' : 'followed';
          const sourceLabel = isOwn ? 'Tuyo' : isFollowed ? 'Seguido' : 'Curador';

          results.push({
            id: l.id, name: l.name,
            latitude: l.latitude, longitude: l.longitude,
            distance_m: Math.round(dist),
            source,
            source_label: sourceLabel,
            place_type: l.place_type,
            enriched_data: l.enriched_data,
            country: l.country,
            region: l.region,
            description: l.description,
            document_name: l.document_id ? docNameMap[l.document_id] || null : null,
            enrichment_status: l.enrichment_status,
          });
        }
      });

      // Process druid locations
      druidLocs.forEach(l => {
        const dist = haversineDistance(location.latitude, location.longitude, l.latitude, l.longitude);
        if (dist <= 500 && !seenIds.has(l.id)) {
          seenIds.add(l.id);
          results.push({
            id: l.id, name: l.name,
            latitude: l.latitude, longitude: l.longitude,
            distance_m: Math.round(dist),
            source: 'druid',
            source_label: druidNameMap[l.druid_id] || 'Druid',
            place_type: l.place_type,
            enriched_data: l.enriched_data,
            country: null,
            region: null,
            description: null,
            document_name: null,
            enrichment_status: l.enrichment_status,
          });
        }
      });

      // Search OpenStreetMap Overpass for nearby POIs
      try {
        const overpassQuery = `
          [out:json][timeout:10];
          (
            node["name"](around:500,${location.latitude},${location.longitude});
            way["name"]["tourism"](around:500,${location.latitude},${location.longitude});
            way["name"]["amenity"](around:500,${location.latitude},${location.longitude});
            way["name"]["shop"](around:500,${location.latitude},${location.longitude});
            way["name"]["historic"](around:500,${location.latitude},${location.longitude});
            way["name"]["natural"](around:500,${location.latitude},${location.longitude});
            way["name"]["leisure"](around:500,${location.latitude},${location.longitude});
            way["name"]["geological"](around:500,${location.latitude},${location.longitude});
            node["natural"](around:500,${location.latitude},${location.longitude});
            node["geological"](around:500,${location.latitude},${location.longitude});
            relation["name"]["natural"](around:500,${location.latitude},${location.longitude});
          );
          out center 60;
        `;
        const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: `data=${encodeURIComponent(overpassQuery)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        if (overpassRes.ok) {
          const osmData = await overpassRes.json();
          const elements: any[] = osmData.elements || [];
          elements.forEach((el: any) => {
            const lat = el.lat ?? el.center?.lat;
            const lng = el.lon ?? el.center?.lon;
            const name = el.tags?.name;
            if (!lat || !lng || !name) return;
            const osmId = `osm-${el.type}-${el.id}`;
            if (seenIds.has(osmId)) return;
            const dist = haversineDistance(location.latitude, location.longitude, lat, lng);
            if (dist > 500) return;
            seenIds.add(osmId);

            const osmType = el.tags?.natural || el.tags?.tourism || el.tags?.amenity || el.tags?.shop || el.tags?.historic || el.tags?.leisure || el.tags?.geological || null;
            const osmLink = `https://www.openstreetmap.org/${el.type}/${el.id}`;

            results.push({
              id: osmId, name,
              latitude: lat, longitude: lng,
              distance_m: Math.round(dist),
              source: 'osm',
              source_label: 'OpenStreetMap',
              place_type: osmType,
              enriched_data: null,
              country: null, region: null,
              description: el.tags?.description || el.tags?.['addr:street'] || null,
              document_name: null,
              enrichment_status: null,
              osm_link: osmLink,
            });
          });
        }
      } catch (osmErr) {
        console.warn('OSM Overpass search failed (non-blocking):', osmErr);
      }

      results.sort((a, b) => a.distance_m - b.distance_m);
      setNearbyPoints(results);
    } catch (e) {
      console.error('Error searching nearby:', e);
      toast.error('Error buscando puntos cercanos');
    } finally {
      setLoadingNearby(false);
    }
  }, [location, docId, userId]);

  const handleEnrichWithContext = async () => {
    setEnriching(true);
    try {
      const contextPoints = nearbyPoints.slice(0, 10).map(p => ({
        name: p.name,
        distance_m: p.distance_m,
        place_type: p.place_type,
        description: p.enriched_data?.descripcion_detallada?.slice(0, 200) || p.description?.slice(0, 200) || null,
      }));

      const { data, error } = await supabase.functions.invoke('enrich-location', {
        body: {
          location: {
            name: location.name,
            latitude: location.latitude,
            longitude: location.longitude,
            country: location.country,
            region: location.region,
            continent: location.continent,
            description: location.description,
          },
          locationId: location.id,
          skipValidation: true,
          nearbyContext: contextPoints,
        },
      });

      if (error) throw error;

      const { data: updated } = await supabase
        .from('locations')
        .select('id, name, description, latitude, longitude, is_approved, enrichment_status, enriched_data, place_type, continent, country, region')
        .eq('id', location.id)
        .single();

      if (updated) {
        onLocationUpdated(updated);
        toast.success('Punto enriquecido con contexto de proximidad');
      }
    } catch (e) {
      console.error('Error enriching:', e);
      toast.error('Error al enriquecer el punto');
    } finally {
      setEnriching(false);
    }
  };

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
    } catch (e) {
      console.error('Error duplicating:', e);
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
    } catch (e) {
      console.error('Error reclassifying:', e);
      toast.error('Error al reclasificar');
    }
  };

  const handleMerge = async (targetPoint: NearbyPoint) => {
    try {
      const mergedData: Record<string, any> = {};
      if (!targetPoint.enriched_data && location.enriched_data) {
        mergedData.enriched_data = location.enriched_data;
        mergedData.enrichment_status = location.enrichment_status;
      }

      if (Object.keys(mergedData).length > 0) {
        await supabase
          .from('locations')
          .update(mergedData)
          .eq('id', targetPoint.id);
      }

      await supabase
        .from('locations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', location.id);

      onLocationMerged(targetPoint.id, location.id);
      toast.success(`Fusionado con "${targetPoint.name}"`);
      setMergeSheet(false);
    } catch (e) {
      console.error('Error merging:', e);
      toast.error('Error al fusionar');
    }
  };

  const openNearbyAndEnrich = async () => {
    setNearbyDialog(true);
    await searchNearby();
  };

  const openMerge = async () => {
    setMergeSheet(true);
    if (nearbyPoints.length === 0) await searchNearby();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Más acciones">
            <MoreVertical className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 z-[1100]">
          <DropdownMenuItem onClick={openNearbyAndEnrich} disabled={enriching}>
            <Sparkles className="w-3.5 h-3.5 mr-2 text-amber-500" />
            Enriquecer con contexto
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDuplicate} disabled={duplicating}>
            <Copy className="w-3.5 h-3.5 mr-2" />
            Duplicar punto
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openMerge}>
            <Merge className="w-3.5 h-3.5 mr-2" />
            Fusionar con cercano
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setReclassifySheet(true)}>
            <Tag className="w-3.5 h-3.5 mr-2" />
            Reclasificar tipo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Nearby + Enrich — Right side panel */}
      <Sheet open={nearbyDialog} onOpenChange={setNearbyDialog}>
        <SheetContent side="right" className="w-[380px] sm:w-[420px] p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2 border-b">
            <SheetTitle className="text-sm flex items-center gap-2">
              <Compass className="w-4 h-4 text-primary" />
              Contexto de proximidad
            </SheetTitle>
            <SheetDescription className="text-xs">
              <span className="font-medium text-foreground">{location.name}</span>
              {' · '}Radio 500m · {nearbyPoints.length} puntos
              {nearbyPoints.filter(p => p.source === 'osm').length > 0 && (
                <span className="text-orange-500"> · {nearbyPoints.filter(p => p.source === 'osm').length} OSM</span>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pt-3">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2">
                <Navigation className="w-3.5 h-3.5 text-primary" />
                <span className="text-[12px] font-semibold">{location.name}</span>
                {location.place_type && (
                  <Badge variant="secondary" className="text-[9px] h-4">{location.place_type}</Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground pl-5">
                {[location.country, location.region, location.continent].filter(Boolean).join(' · ')}
                {' · '}{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
              </p>
              {location.enrichment_status === 'enriched' ? (
                <p className="text-[10px] text-amber-600 pl-5 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Ya enriquecido
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground pl-5">Sin enriquecer</p>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden px-4 pt-3">
            {loadingNearby ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Buscando cercanos...</span>
              </div>
            ) : nearbyPoints.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <MapPin className="w-8 h-8 mx-auto text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No se encontraron puntos en 500m</p>
                <p className="text-[11px] text-muted-foreground/60">
                  El enriquecimiento se hará sin contexto de proximidad
                </p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="space-y-2 pr-2 pb-2">
                  {nearbyPoints.map(p => (
                    <NearbyPointCard key={p.id} point={p} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="flex justify-between items-center px-4 py-3 border-t bg-background">
            <p className="text-[10px] text-muted-foreground">
              {nearbyPoints.filter(p => p.enrichment_status === 'enriched').length} de {nearbyPoints.length} enriquecidos
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleEnrichWithContext}
              disabled={enriching}
            >
              {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Enriquecer con contexto
            </Button>
          </div>
        </SheetContent>
      </Sheet>

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

      {/* Merge Dialog */}
      <Dialog open={mergeSheet} onOpenChange={setMergeSheet}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Merge className="w-4 h-4" />
              Fusionar "{location.name}" con...
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecciona el punto destino. Los datos enriquecidos se transfieren al punto destino.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {loadingNearby ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Buscando cercanos...</span>
              </div>
            ) : nearbyPoints.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No hay puntos cercanos para fusionar
              </div>
            ) : (
              <ScrollArea className="h-full max-h-[40vh]">
                <div className="space-y-2">
                  {nearbyPoints.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleMerge(p)}
                      className="flex items-start gap-2 w-full p-3 rounded-lg border border-border hover:bg-muted/40 text-left transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{p.name}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                          <span className="tabular-nums">{p.distance_m}m</span>
                          <span className="opacity-30">·</span>
                          <span>{p.place_type || 'sin tipo'}</span>
                          {p.document_name && (
                            <>
                              <span className="opacity-30">·</span>
                              <span className="truncate max-w-[120px]">{p.document_name}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5">
                        Fusionar aquí
                      </Badge>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
