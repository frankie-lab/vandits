import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Sparkles,
  Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KMLDocument, GeoLocation } from '@/types/location';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface UploadPreviewOptions {
  autoEnrich: boolean;
  markRoutePointsVisited: boolean;
}

interface UploadPreviewDialogProps {
  open: boolean;
  document: KMLDocument;
  onConfirm: (locations: GeoLocation[], isSample: boolean, options: UploadPreviewOptions) => void;
  onCancel: () => void;
}

function getCountryStats(locations: GeoLocation[]): Record<string, number> {
  const countryMap: Record<string, number> = {};
  locations.forEach((loc) => {
    const country = loc.country || 'Sin clasificar';
    countryMap[country] = (countryMap[country] || 0) + 1;
  });
  return countryMap;
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
  const [markRouteVisited, setMarkRouteVisited] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const totalLocations = document.locations.length;
  const sampledLocations = useMemo(
    () => sampleLocations(document.locations, samplePercentage),
    [document.locations, samplePercentage]
  );
  const sampleCount = uploadMode === 'sample' ? sampledLocations.length : totalLocations;

  const countryStats = useMemo(() => getCountryStats(document.locations), [document.locations]);
  const countryCount = Object.keys(countryStats).length;

  const enrichedCount = document.locations.filter((loc) => loc.enrichedData?.descripcion).length;

  // Separate points and route-type locations
  const pointLocations = useMemo(
    () => document.locations.filter((loc) => loc.placeType !== 'route'),
    [document.locations]
  );
  const routeLocations = useMemo(
    () => document.locations.filter((loc) => loc.placeType === 'route'),
    [document.locations]
  );
  const routeCount = document.routes?.length || 0;

  // Initialize mini map
  useEffect(() => {
    if (!open || !mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    // Leaflet needs a tick to measure the container inside the dialog
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [open]);

  // Update markers + route lines when locations or mode changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    markersLayer.clearLayers();

    const locationsToShow = uploadMode === 'sample' ? sampledLocations : document.locations;
    const allBoundsPoints: [number, number][] = [];

    // Draw route polylines
    if (document.routes && document.routes.length > 0) {
      document.routes.forEach((route) => {
        if (route.coordinates.length > 1) {
          const latLngs = route.coordinates.map(([lat, lng]) => [lat, lng] as [number, number]);
          L.polyline(latLngs, {
            color: route.color || '#f97316',
            weight: 3,
            opacity: 0.8,
          }).addTo(markersLayer);
          latLngs.forEach((ll) => allBoundsPoints.push(ll));
        }
      });
    }

    // Draw point markers
    locationsToShow.forEach((loc) => {
      const isRoute = loc.placeType === 'route';
      L.circleMarker([loc.coordinates.lat, loc.coordinates.lng], {
        radius: isRoute ? 5 : 4,
        fillColor: isRoute ? '#f97316' : (uploadMode === 'sample' ? '#f97316' : '#3b82f6'),
        color: '#fff',
        weight: 1,
        fillOpacity: 0.8,
      }).addTo(markersLayer);
      allBoundsPoints.push([loc.coordinates.lat, loc.coordinates.lng]);
    });

    if (allBoundsPoints.length > 0) {
      map.invalidateSize();
      setTimeout(() => {
        const leafletBounds = L.latLngBounds(allBoundsPoints);
        map.fitBounds(leafletBounds, { padding: [20, 20] });
      }, 50);
    }
  }, [document.locations, document.routes, sampledLocations, uploadMode]);

  const handleConfirm = () => {
    const options: UploadPreviewOptions = { autoEnrich, markRoutePointsVisited: markRouteVisited };

    // If markRouteVisited, tag route points as visited before passing
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
            Vista previa del archivo
          </DialogTitle>
          <DialogDescription>
            Revisa los datos antes de añadirlos a tu colección.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Stats overview */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-muted rounded-lg text-center">
              <div className="flex items-center justify-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-500" />
                <p className="text-2xl font-bold">{pointLocations.length.toLocaleString()}</p>
              </div>
              <p className="text-xs text-muted-foreground">Puntos</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <div className="flex items-center justify-center gap-1.5">
                <Route className="w-4 h-4 text-orange-500" />
                <p className="text-2xl font-bold">{routeCount}</p>
              </div>
              <p className="text-xs text-muted-foreground">Rutas</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-2xl font-bold">{countryCount}</p>
              <p className="text-xs text-muted-foreground">
                {countryStats['Sin clasificar'] && countryCount === 1 ? 'Pendiente geocodificar' : 'Países'}
              </p>
            </div>
          </div>

          {/* Large file warning */}
          {isLargeFile && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-lg border flex items-start gap-3 ${
                isVeryLargeFile
                  ? 'bg-orange-500/10 border-orange-500/30'
                  : 'bg-amber-500/10 border-amber-500/30'
              }`}
            >
              <BarChart3 className={`w-5 h-5 mt-0.5 ${isVeryLargeFile ? 'text-orange-500' : 'text-amber-500'}`} />
              <div className="text-sm">
                <p className="font-medium">
                  {isVeryLargeFile ? 'Archivo muy grande' : 'Archivo grande'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isVeryLargeFile
                    ? 'Recomendamos subir una muestra del 10-25% para validar los datos.'
                    : 'Considera subir una muestra primero para verificar los datos.'}
                </p>
              </div>
            </motion.div>
          )}

          {/* Mini map preview */}
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
            <div
              ref={mapRef}
              className="h-48 rounded-lg border bg-muted overflow-hidden"
            />
          </div>

          {/* Items list */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <List className="w-4 h-4" />
              Contenido a importar ({totalLocations})
            </Label>
            <ScrollArea className="h-36 rounded-lg border">
              <div className="divide-y divide-border">
                {/* Routes first */}
                {document.routes && document.routes.length > 0 && document.routes.map((route) => (
                  <div key={route.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <Route className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <span className="truncate font-medium">{route.name}</span>
                    <Badge variant="outline" className="ml-auto text-[10px] shrink-0 bg-orange-500/10 text-orange-600 border-orange-500/30">
                      Ruta
                    </Badge>
                  </div>
                ))}
                {/* Points */}
                {pointLocations.map((loc) => (
                  <div key={loc.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">{loc.name || 'Sin nombre'}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                      {loc.coordinates.lat.toFixed(4)}, {loc.coordinates.lng.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <Separator />

          {/* Upload mode selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">¿Qué quieres subir?</Label>

            <button
              type="button"
              onClick={() => setUploadMode('full')}
              className={`w-full p-4 rounded-lg border text-left transition-all ${
                uploadMode === 'full'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:bg-muted/50'
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
                  <p className="text-xs text-muted-foreground mt-1">
                    Importa todas las ubicaciones y rutas del documento.
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setUploadMode('sample')}
              className={`w-full p-4 rounded-lg border text-left transition-all ${
                uploadMode === 'sample'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:bg-muted/50'
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
                  <p className="text-xs text-muted-foreground mt-1">
                    Prueba con una muestra antes de importar todo.
                  </p>
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
                    <Button
                      key={preset.value}
                      type="button"
                      variant={samplePercentage === preset.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSamplePercentage(preset.value)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>

                <Slider
                  value={[samplePercentage]}
                  onValueChange={([val]) => setSamplePercentage(val)}
                  min={5}
                  max={75}
                  step={5}
                  className="py-2"
                />

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
          <Button onClick={handleConfirm}>
            <CheckCircle className="w-4 h-4 mr-1" />
            {uploadMode === 'sample'
              ? `Subir muestra (${sampleCount.toLocaleString()} puntos)`
              : `Subir todo (${totalLocations.toLocaleString()} puntos)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
