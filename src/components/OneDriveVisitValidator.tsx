import { useState, useCallback, useMemo } from 'react';
import { MapPin, Scan, CheckCircle2, Loader2, Image as ImageIcon, X, Globe, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useLocationsStore } from '@/store/locations-store';

interface GeoPhoto {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  takenDateTime: string | null;
  thumbnailUrl: string | null;
  // Assigned from nearest location after matching
  country?: string;
  region?: string;
  zone?: string;
}

interface LocationMatch {
  locationId: string;
  locationName: string;
  photoName: string;
  photoThumbnail: string | null;
  distanceM: number;
  takenDateTime: string | null;
  photoLat: number;
  photoLng: number;
}

const MATCH_RADIUS_M = 500;

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface GeoTreeNode {
  label: string;
  count: number;
  children?: GeoTreeNode[];
  photos?: GeoPhoto[];
}

/** Assign each photo to nearest location's geography (within 50km) */
function assignGeography(photos: GeoPhoto[], locations: any[]): GeoPhoto[] {
  const ASSIGN_RADIUS = 50000; // 50km
  return photos.map(p => {
    let bestDist = Infinity;
    let bestLoc: any = null;
    for (const loc of locations) {
      if (!loc.coordinates?.lat || !loc.coordinates?.lng) continue;
      const dist = haversineDistance(p.latitude, p.longitude, loc.coordinates.lat, loc.coordinates.lng);
      if (dist < bestDist) {
        bestDist = dist;
        bestLoc = loc;
      }
    }
    if (bestLoc && bestDist <= ASSIGN_RADIUS) {
      return { ...p, country: bestLoc.country || undefined, region: bestLoc.region || undefined, zone: bestLoc.zone || undefined };
    }
    return p;
  });
}

/** Build hierarchical tree: Country → Region → Zone → photos */
function buildGeoTree(photos: GeoPhoto[]): GeoTreeNode[] {
  const byCountry = new Map<string, GeoPhoto[]>();
  for (const p of photos) {
    const key = p.country || 'Sin ubicar';
    const arr = byCountry.get(key) || [];
    arr.push(p);
    byCountry.set(key, arr);
  }

  return Array.from(byCountry.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([country, countryPhotos]) => {
      const byRegion = new Map<string, GeoPhoto[]>();
      for (const p of countryPhotos) {
        const key = p.region || p.zone || 'General';
        const arr = byRegion.get(key) || [];
        arr.push(p);
        byRegion.set(key, arr);
      }

      const children: GeoTreeNode[] = Array.from(byRegion.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(([region, regionPhotos]) => {
          // If there's zone info, create sub-level
          const byZone = new Map<string, GeoPhoto[]>();
          for (const p of regionPhotos) {
            const key = p.zone && p.zone !== region ? p.zone : '';
            const arr = byZone.get(key) || [];
            arr.push(p);
            byZone.set(key, arr);
          }

          if (byZone.size > 1 || (byZone.size === 1 && !byZone.has(''))) {
            return {
              label: region,
              count: regionPhotos.length,
              children: Array.from(byZone.entries())
                .filter(([k]) => k !== '')
                .sort((a, b) => b[1].length - a[1].length)
                .map(([zone, zonePhotos]) => ({
                  label: zone,
                  count: zonePhotos.length,
                  photos: zonePhotos,
                })),
              photos: byZone.get(''),
            };
          }

          return { label: region, count: regionPhotos.length, photos: regionPhotos };
        });

      return { label: country, count: countryPhotos.length, children };
    });
}
interface OneDriveVisitValidatorProps {
  folderId?: string | null;
  onClose?: () => void;
}

export function OneDriveVisitValidator({ folderId, onClose }: OneDriveVisitValidatorProps) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    totalScanned: number;
    geoPhotos: GeoPhoto[];
    matches: LocationMatch[];
  } | null>(null);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState<Set<string>>(new Set());
  const [showIndex, setShowIndex] = useState(false);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  const locations = useLocationsStore((s) => s.documents.flatMap(d => d.locations));

  const geoTree = useMemo(() => {
    if (!scanResult?.geoPhotos.length) return [];
    const enriched = assignGeography(scanResult.geoPhotos, locations);
    return buildGeoTree(enriched);
  }, [scanResult?.geoPhotos, locations]);

  const startScan = useCallback(async () => {
    setScanning(true);
    setScanResult(null);
    setValidated(new Set());
    setShowIndex(false);

    try {
      const { data, error } = await supabase.functions.invoke('scan-onedrive-geo', {
        body: { folderId: folderId || null, recursive: true },
      });

      if (error) throw error;

      const geoPhotos: GeoPhoto[] = data.geoPhotos || [];

      // Match photos with user locations
      const matches: LocationMatch[] = [];
      for (const photo of geoPhotos) {
        for (const loc of locations) {
          if (!loc.coordinates?.lat || !loc.coordinates?.lng) continue;
          const dist = haversineDistance(photo.latitude, photo.longitude, loc.coordinates.lat, loc.coordinates.lng);
          if (dist <= MATCH_RADIUS_M) {
            const existing = matches.find(m => m.locationId === loc.id);
            if (!existing || dist < existing.distanceM) {
              if (existing) matches.splice(matches.indexOf(existing), 1);
              matches.push({
                locationId: loc.id,
                locationName: loc.name,
                photoName: photo.name,
                photoThumbnail: photo.thumbnailUrl,
                distanceM: dist,
                takenDateTime: photo.takenDateTime,
                photoLat: photo.latitude,
                photoLng: photo.longitude,
              });
            }
          }
        }
      }

      matches.sort((a, b) => a.distanceM - b.distanceM);

      setScanResult({ totalScanned: data.totalScanned, geoPhotos, matches });

      if (matches.length > 0) {
        toast.success(`${matches.length} coincidencias encontradas de ${geoPhotos.length} fotos con GPS`);
      } else if (geoPhotos.length > 0) {
        toast.info(`${geoPhotos.length} fotos con GPS encontradas, pero sin coincidencias dentro de 500m`);
      } else {
        toast.warning('No se encontraron fotos con datos GPS');
      }
    } catch (error: any) {
      console.error('Scan error:', error);
      toast.error('Error al escanear OneDrive');
    } finally {
      setScanning(false);
    }
  }, [folderId, locations]);

  const validateAll = useCallback(async () => {
    if (!scanResult?.matches.length) return;
    setValidating(true);

    const unvalidated = scanResult.matches.filter(m => !validated.has(m.locationId));
    let successCount = 0;

    for (const match of unvalidated) {
      try {
        const { data: dbLocation, error: fetchErr } = await supabase
          .from('locations')
          .select('custom_data')
          .eq('id', match.locationId)
          .single();

        if (fetchErr) continue;

        const currentCustomData = (dbLocation?.custom_data as Record<string, string>) || {};
        if (currentCustomData.visited === 'true') {
          setValidated(prev => new Set([...prev, match.locationId]));
          successCount++;
          continue;
        }

        const updatedCustomData: Record<string, string> = {
          ...currentCustomData,
          visited: 'true',
          visited_verified_at: match.takenDateTime || new Date().toISOString(),
          visited_distance_m: Math.round(match.distanceM).toString(),
          visited_source: 'onedrive_photo',
          visited_photo_name: match.photoName,
        };

        if (match.takenDateTime) {
          const existing = currentCustomData.oldest_geotagged_photo_date;
          if (!existing || match.takenDateTime < existing) {
            updatedCustomData.oldest_geotagged_photo_date = match.takenDateTime;
          }
        }

        const { error: updateErr } = await supabase
          .from('locations')
          .update({ custom_data: updatedCustomData, updated_at: new Date().toISOString() })
          .eq('id', match.locationId);

        if (updateErr) continue;

        window.dispatchEvent(new CustomEvent('visited-updated', {
          detail: { locationId: match.locationId, visited: true, distance: match.distanceM, customData: updatedCustomData }
        }));

        setValidated(prev => new Set([...prev, match.locationId]));
        successCount++;
      } catch { /* continue */ }
    }

    toast.success(`${successCount} puntos validados como visitados`);
    setValidating(false);
  }, [scanResult, validated]);

  const validateSingle = useCallback(async (match: LocationMatch) => {
    try {
      const { data: dbLocation, error: fetchErr } = await supabase
        .from('locations')
        .select('custom_data')
        .eq('id', match.locationId)
        .single();

      if (fetchErr) throw fetchErr;

      const currentCustomData = (dbLocation?.custom_data as Record<string, string>) || {};
      const updatedCustomData: Record<string, string> = {
        ...currentCustomData,
        visited: 'true',
        visited_verified_at: match.takenDateTime || new Date().toISOString(),
        visited_distance_m: Math.round(match.distanceM).toString(),
        visited_source: 'onedrive_photo',
        visited_photo_name: match.photoName,
      };

      if (match.takenDateTime) {
        const existing = currentCustomData.oldest_geotagged_photo_date;
        if (!existing || match.takenDateTime < existing) {
          updatedCustomData.oldest_geotagged_photo_date = match.takenDateTime;
        }
      }

      const { error: updateErr } = await supabase
        .from('locations')
        .update({ custom_data: updatedCustomData, updated_at: new Date().toISOString() })
        .eq('id', match.locationId);

      if (updateErr) throw updateErr;

      window.dispatchEvent(new CustomEvent('visited-updated', {
        detail: { locationId: match.locationId, visited: true, distance: match.distanceM, customData: updatedCustomData }
      }));

      setValidated(prev => new Set([...prev, match.locationId]));
      toast.success(`"${match.locationName}" validado como visitado`);
    } catch (error) {
      console.error('Validate error:', error);
      toast.error('Error al validar visita');
    }
  }, []);

  const toggleCell = (key: string) => {
    setExpandedCells(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Scan button */}
      {!scanResult && !scanning && (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="rounded-full bg-primary/10 p-4">
            <Scan className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">Validar visitas con fotos</p>
            <p className="text-xs text-muted-foreground max-w-[250px]">
              Escanea TODAS las fotos de OneDrive recursivamente, extrae GPS y cruza con tus puntos (radio 500m)
            </p>
          </div>
          <Button onClick={startScan} className="gap-2">
            <Scan className="w-4 h-4" />
            Escanear fotos geolocalizadas
          </Button>
        </div>
      )}

      {/* Scanning */}
      {scanning && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Escaneando OneDrive...</p>
          <p className="text-xs text-muted-foreground">Recorriendo todas las carpetas recursivamente y leyendo metadatos GPS</p>
        </div>
      )}

      {/* Results */}
      {scanResult && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-lg font-bold">{scanResult.totalScanned}</p>
              <p className="text-[10px] text-muted-foreground">Imágenes</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-lg font-bold text-emerald-600">{scanResult.geoPhotos.length}</p>
              <p className="text-[10px] text-muted-foreground">Con GPS</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-lg font-bold text-primary">{scanResult.matches.length}</p>
              <p className="text-[10px] text-muted-foreground">Coincidencias</p>
            </div>
          </div>

          {/* Geo index toggle */}
          {scanResult.geoPhotos.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs"
              onClick={() => setShowIndex(!showIndex)}
            >
              <Globe className="w-3.5 h-3.5" />
              {showIndex ? 'Ocultar' : 'Ver'} índice de coordenadas ({geoTree.length} zonas)
            </Button>
          )}

          {/* Geo coordinate tree */}
          {showIndex && geoTree.length > 0 && (
            <ScrollArea className="max-h-[35vh]">
              <div className="space-y-0.5">
                {geoTree.map(cell => {
                  const isExpanded = expandedCells.has(cell.key);
                  return (
                    <div key={cell.key}>
                      <button
                        onClick={() => toggleCell(cell.key)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-left"
                      >
                        {isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                        <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="text-xs font-mono">{cell.lat.toFixed(1)}°, {cell.lng.toFixed(1)}°</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{cell.photos.length} fotos</span>
                      </button>
                      {isExpanded && (
                        <div className="ml-6 space-y-0.5 pb-1">
                          {cell.photos.map(p => (
                            <div key={p.id} className="flex items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground">
                              <ImageIcon className="w-3 h-3 shrink-0 opacity-50" />
                              <span className="truncate flex-1">{p.name}</span>
                              <span className="font-mono text-[10px] shrink-0">{p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* Validate all button */}
          {scanResult.matches.length > 0 && (
            <div className="flex gap-2">
              <Button
                onClick={validateAll}
                disabled={validating || validated.size === scanResult.matches.length}
                className="flex-1 gap-2"
                variant={validated.size === scanResult.matches.length ? 'secondary' : 'default'}
              >
                {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {validated.size === scanResult.matches.length
                  ? 'Todos validados'
                  : `Validar todos (${scanResult.matches.length - validated.size})`}
              </Button>
              <Button variant="outline" size="icon" onClick={() => { setScanResult(null); setValidated(new Set()); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {scanResult.matches.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No hay coincidencias</p>
              <p className="text-xs">Ninguna foto geolocal coincide con tus puntos (radio 500m)</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setScanResult(null)}>
                Volver a intentar
              </Button>
            </div>
          )}

          {/* Match list */}
          {scanResult.matches.length > 0 && (
            <ScrollArea className="max-h-[40vh]">
              <div className="space-y-1">
                {scanResult.matches.map((match) => {
                  const isValidated = validated.has(match.locationId);
                  return (
                    <div
                      key={`${match.locationId}-${match.photoName}`}
                      className={cn(
                        'flex items-center gap-2 px-2 py-2 rounded-lg transition-colors',
                        isValidated ? 'bg-emerald-500/10' : 'bg-muted/30 hover:bg-muted/50'
                      )}
                    >
                      {match.photoThumbnail ? (
                        <img src={match.photoThumbnail} alt={match.photoName} className="w-10 h-10 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                          <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{match.locationName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{match.photoName}</p>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="text-emerald-600 dark:text-emerald-400">{Math.round(match.distanceM)}m</span>
                          {match.takenDateTime && (
                            <span className="text-muted-foreground">{new Date(match.takenDateTime).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      {isValidated ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => validateSingle(match)}>
                          <CheckCircle2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* Rescan */}
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={startScan}>
            <Scan className="w-3.5 h-3.5" />
            Volver a escanear
          </Button>
        </div>
      )}
    </div>
  );
}
