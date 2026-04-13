import React, { useState, useCallback } from 'react';
import {
  Sparkles, Copy, Merge, Tag, Loader2, MapPin, Users, Compass,
  MoreVertical,
} from 'lucide-react';
import { PlaceType, PLACE_TYPE_LABELS } from '@/types/location';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  source: 'own' | 'followed' | 'poi';
  place_type: string | null;
  enriched_data: any;
  country: string | null;
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

export function PointContextActions({
  location, docId, userId,
  onLocationUpdated, onLocationDuplicated, onLocationMerged,
}: PointContextActionsProps) {
  const [nearbySheet, setNearbySheet] = useState(false);
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
      const radius = 0.005; // ~500m in degrees
      const minLat = location.latitude - radius;
      const maxLat = location.latitude + radius;
      const minLng = location.longitude - radius;
      const maxLng = location.longitude + radius;

      // Fetch own locations (from all documents)
      const { data: ownLocs } = await supabase
        .from('locations')
        .select('id, name, latitude, longitude, place_type, enriched_data, country')
        .gte('latitude', minLat).lte('latitude', maxLat)
        .gte('longitude', minLng).lte('longitude', maxLng)
        .is('deleted_at', null)
        .neq('id', location.id)
        .limit(50);

      const results: NearbyPoint[] = [];

      (ownLocs || []).forEach(l => {
        const dist = haversineDistance(location.latitude, location.longitude, l.latitude, l.longitude);
        if (dist <= 500) {
          results.push({
            id: l.id, name: l.name,
            latitude: l.latitude, longitude: l.longitude,
            distance_m: Math.round(dist),
            source: 'poi', // will be reclassified below
            place_type: l.place_type,
            enriched_data: l.enriched_data,
            country: l.country,
          });
        }
      });

      // Sort by distance
      results.sort((a, b) => a.distance_m - b.distance_m);
      setNearbyPoints(results);
    } catch (e) {
      console.error('Error searching nearby:', e);
      toast.error('Error buscando puntos cercanos');
    } finally {
      setLoadingNearby(false);
    }
  }, [location]);

  const handleEnrichWithContext = async () => {
    setEnriching(true);
    try {
      // Build context from nearby points
      const contextPoints = nearbyPoints.slice(0, 10).map(p => ({
        name: p.name,
        distance_m: p.distance_m,
        place_type: p.place_type,
        description: p.enriched_data?.descripcion_detallada?.slice(0, 200) || null,
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

      // Refresh location data
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

  const handleReclassify = async (newType: string) => {
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
      // Merge: update target with any missing data from current, then delete current
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

      // Soft-delete the current location
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
    setNearbySheet(true);
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
        <DropdownMenuContent align="end" className="w-48">
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

      {/* Nearby + Enrich Sheet */}
      <Sheet open={nearbySheet} onOpenChange={setNearbySheet}>
        <SheetContent side="bottom" className="h-[60vh]">
          <SheetHeader>
            <SheetTitle className="text-sm flex items-center gap-2">
              <Compass className="w-4 h-4" />
              Puntos cercanos a "{location.name}"
            </SheetTitle>
            <SheetDescription className="text-xs">
              Radio de 500m · {nearbyPoints.length} puntos encontrados
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3 space-y-3">
            {loadingNearby ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Buscando cercanos...</span>
              </div>
            ) : nearbyPoints.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No se encontraron puntos en 500m
              </div>
            ) : (
              <>
                <ScrollArea className="h-[30vh]">
                  <div className="space-y-1">
                    {nearbyPoints.map(p => (
                      <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 text-sm">
                        <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate">{p.name}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="tabular-nums">{p.distance_m}m</span>
                            {p.place_type && (
                              <>
                                <span className="opacity-30">·</span>
                                <span>{p.place_type}</span>
                              </>
                            )}
                            {p.country && (
                              <>
                                <span className="opacity-30">·</span>
                                <span>{p.country}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {p.enriched_data && (
                          <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="flex justify-end pt-2 border-t">
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={handleEnrichWithContext}
                    disabled={enriching}
                  >
                    {enriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Enriquecer con este contexto
                  </Button>
                </div>
              </>
            )}
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
            <div className="grid grid-cols-3 gap-1.5">
              {PLACE_TYPES.map(type => (
                <Button
                  key={type}
                  variant={location.place_type === type ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-[11px] justify-start"
                  onClick={() => handleReclassify(type)}
                >
                  {type}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Merge Sheet */}
      <Sheet open={mergeSheet} onOpenChange={setMergeSheet}>
        <SheetContent side="bottom" className="h-[50vh]">
          <SheetHeader>
            <SheetTitle className="text-sm flex items-center gap-2">
              <Merge className="w-4 h-4" />
              Fusionar "{location.name}" con...
            </SheetTitle>
            <SheetDescription className="text-xs">
              Selecciona el punto destino. Los datos enriquecidos se transfieren al punto destino.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3">
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
              <ScrollArea className="h-[30vh]">
                <div className="space-y-1">
                  {nearbyPoints.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleMerge(p)}
                      className="flex items-center gap-2 w-full px-2 py-2 rounded hover:bg-muted/40 text-left transition-colors"
                    >
                      <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {p.distance_m}m · {p.place_type || 'sin tipo'}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[9px] shrink-0">
                        Fusionar aquí
                      </Badge>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
