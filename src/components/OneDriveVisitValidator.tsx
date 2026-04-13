import { useState, useCallback } from 'react';
import { MapPin, Scan, CheckCircle2, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
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

  const locations = useLocationsStore((s) => s.documents.flatMap(d => d.locations));

  const startScan = useCallback(async () => {
    setScanning(true);
    setScanResult(null);
    setValidated(new Set());

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
          if (!loc.latitude || !loc.longitude) continue;
          const dist = haversineDistance(photo.latitude, photo.longitude, loc.latitude, loc.longitude);
          if (dist <= MATCH_RADIUS_M) {
            // Only keep the closest photo per location
            const existing = matches.find(m => m.locationId === loc.id);
            if (!existing || dist < existing.distanceM) {
              if (existing) {
                matches.splice(matches.indexOf(existing), 1);
              }
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

      // Sort by distance
      matches.sort((a, b) => a.distanceM - b.distanceM);

      setScanResult({
        totalScanned: data.totalScanned,
        geoPhotos,
        matches,
      });

      if (matches.length > 0) {
        toast.success(`${matches.length} coincidencias encontradas`);
      } else {
        toast.info('No se encontraron coincidencias dentro de 500m');
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

        // Skip already visited
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
          // Track oldest geotagged photo date
          const existing = currentCustomData.oldest_geotagged_photo_date;
          if (!existing || match.takenDateTime < existing) {
            updatedCustomData.oldest_geotagged_photo_date = match.takenDateTime;
          }
        }

        const { error: updateErr } = await supabase
          .from('locations')
          .update({
            custom_data: updatedCustomData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', match.locationId);

        if (updateErr) continue;

        window.dispatchEvent(new CustomEvent('visited-updated', {
          detail: {
            locationId: match.locationId,
            visited: true,
            distance: match.distanceM,
            customData: updatedCustomData,
          }
        }));

        setValidated(prev => new Set([...prev, match.locationId]));
        successCount++;
      } catch {
        // Continue with next
      }
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
        .update({
          custom_data: updatedCustomData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', match.locationId);

      if (updateErr) throw updateErr;

      window.dispatchEvent(new CustomEvent('visited-updated', {
        detail: {
          locationId: match.locationId,
          visited: true,
          distance: match.distanceM,
          customData: updatedCustomData,
        }
      }));

      setValidated(prev => new Set([...prev, match.locationId]));
      toast.success(`"${match.locationName}" validado como visitado`);
    } catch (error) {
      console.error('Validate error:', error);
      toast.error('Error al validar visita');
    }
  }, []);

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
              Escanea tus fotos de OneDrive y valida automáticamente los puntos donde hayas estado (radio de 500m)
            </p>
          </div>
          <Button onClick={startScan} className="gap-2">
            <Scan className="w-4 h-4" />
            Escanear fotos geolocalizadas
          </Button>
        </div>
      )}

      {/* Scanning progress */}
      {scanning && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Escaneando OneDrive...</p>
          <p className="text-xs text-muted-foreground">Leyendo metadatos GPS de todas las fotos</p>
        </div>
      )}

      {/* Results */}
      {scanResult && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-lg font-bold">{scanResult.totalScanned}</p>
              <p className="text-[10px] text-muted-foreground">Fotos escaneadas</p>
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

          {/* Validate all button */}
          {scanResult.matches.length > 0 && (
            <div className="flex gap-2">
              <Button
                onClick={validateAll}
                disabled={validating || validated.size === scanResult.matches.length}
                className="flex-1 gap-2"
                variant={validated.size === scanResult.matches.length ? 'secondary' : 'default'}
              >
                {validating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
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
            <ScrollArea className="max-h-[50vh]">
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
                        <img
                          src={match.photoThumbnail}
                          alt={match.photoName}
                          className="w-10 h-10 rounded object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                          <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{match.locationName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{match.photoName}</p>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {Math.round(match.distanceM)}m
                          </span>
                          {match.takenDateTime && (
                            <span className="text-muted-foreground">
                              {new Date(match.takenDateTime).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {isValidated ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => validateSingle(match)}
                        >
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
          {scanResult.matches.length > 0 && (
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={startScan}>
              <Scan className="w-3.5 h-3.5" />
              Volver a escanear
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
