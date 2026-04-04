import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
 MapPin,
 Globe,
 FileText,
 Percent,
 CheckCircle,
 ArrowRight,
 Shuffle,
 X,
 Map,
 BarChart3,
 Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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

interface UploadPreviewDialogProps {
 open: boolean;
 document: KMLDocument;
 onConfirm: (locations: GeoLocation[], isSample: boolean) => void;
 onCancel: () => void;
}

// Get unique countries from locations
function getCountryStats(locations: GeoLocation[]): Record<string, number> {
 const countryMap: Record<string, number> = {};
 locations.forEach((loc) => {
    // Try to infer country from coordinates (rough estimation by longitude/latitude bands)
    // This is a placeholder - real country detection happens after geocoding
 const country = loc.country || 'Sin clasificar';
 countryMap[country] = (countryMap[country] || 0) + 1;
 });
 return countryMap;
}

// Get coordinate bounds
function getBounds(locations: GeoLocation[]): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
 if (locations.length === 0) return null;
 
 let minLat = Infinity, maxLat = -Infinity;
 let minLng = Infinity, maxLng = -Infinity;
 
 locations.forEach((loc) => {
 minLat = Math.min(minLat, loc.coordinates.lat);
 maxLat = Math.max(maxLat, loc.coordinates.lat);
 minLng = Math.min(minLng, loc.coordinates.lng);
 maxLng = Math.max(maxLng, loc.coordinates.lng);
 });
 
 return { minLat, maxLat, minLng, maxLng };
}

// Fisher-Yates shuffle for random sampling
function shuffleArray<T>(array: T[]): T[] {
 const result = [...array];
 for (let i = result.length - 1; i > 0; i--) {
 const j = Math.floor(Math.random() * (i + 1));
 [result[i], result[j]] = [result[j], result[i]];
 }
 return result;
}

// Sample random percentage of locations
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
 
 const hasEnriched = document.locations.some((loc) => loc.enrichedData?.descripcion);
 const enrichedCount = document.locations.filter((loc) => loc.enrichedData?.descripcion).length;

  // Initialize mini map
 useEffect(() => {
 if (!open || !mapRef.current) return;

    // Destroy previous instance
 if (mapInstanceRef.current) {
 mapInstanceRef.current.remove();
 mapInstanceRef.current = null;
 }

    // Create map
 const map = L.map(mapRef.current, {
 zoomControl: false,
 attributionControl: false,
 dragging: false,
 scrollWheelZoom: false,
 doubleClickZoom: false,
 touchZoom: false,
 });

    // Add tile layer
 L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
 maxZoom: 19,
 }).addTo(map);

    // Create markers layer
 markersLayerRef.current = L.layerGroup().addTo(map);

 mapInstanceRef.current = map;

 return () => {
 if (mapInstanceRef.current) {
 mapInstanceRef.current.remove();
 mapInstanceRef.current = null;
 }
 };
 }, [open]);

  // Update markers when locations or mode changes
 useEffect(() => {
 if (!mapInstanceRef.current || !markersLayerRef.current) return;

 const map = mapInstanceRef.current;
 const markersLayer = markersLayerRef.current;

    // Clear existing markers
 markersLayer.clearLayers();

    // Get locations to show
 const locationsToShow = uploadMode === 'sample' ? sampledLocations : document.locations;

    // Add circle markers
 locationsToShow.forEach((loc) => {
 L.circleMarker([loc.coordinates.lat, loc.coordinates.lng], {
 radius: 4,
 fillColor: uploadMode === 'sample' ? '#f97316' : '#3b82f6',
 color: '#fff',
 weight: 1,
 fillOpacity: 0.8,
 }).addTo(markersLayer);
 });

    // Fit bounds
 if (locationsToShow.length > 0) {
 const latLngs = locationsToShow.map((loc) => [loc.coordinates.lat, loc.coordinates.lng] as [number, number]);
 const leafletBounds = L.latLngBounds(latLngs);
 map.fitBounds(leafletBounds, { padding: [20, 20] });
 }
 }, [document.locations, sampledLocations, uploadMode]);

 const handleConfirm = () => {
 if (uploadMode === 'sample') {
 onConfirm(sampledLocations, true);
 } else {
 onConfirm(document.locations, false);
 }
 };

  // Size warning for large files
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
 Revisa los datos antes de añadirlos a tu colección. Puedes subir todo o una muestra aleatoria.
 </DialogDescription>
 </DialogHeader>

 <div className="flex-1 overflow-y-auto space-y-4 py-2">
 {/* Stats overview */}
 <div className="grid grid-cols-3 gap-3">
 <div className="p-3 bg-muted rounded-lg text-center">
 <p className="text-2xl font-bold">{totalLocations.toLocaleString()}</p>
 <p className="text-xs text-muted-foreground">Ubicaciones</p>
 </div>
 <div className="p-3 bg-muted rounded-lg text-center">
 <p className="text-2xl font-bold">{countryCount}</p>
 <p className="text-xs text-muted-foreground">
 {countryStats['Sin clasificar'] && countryCount === 1 ? 'Pendiente geocodificar' : 'Países'}
 </p>
 </div>
 <div className="p-3 bg-muted rounded-lg text-center">
 <p className="text-2xl font-bold">{enrichedCount}</p>
 <p className="text-xs text-muted-foreground">Con ficha IA</p>
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
 ? 'Recomendamos subir una muestra del 10-25% para validar los datos antes de importar todo.'
 : 'Considera subir una muestra primero para verificar que los datos son correctos.'}
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
 <Badge variant="secondary" className="text-xs">
 {uploadMode === 'sample' ? `${sampleCount} puntos (muestra)` : `${totalLocations} puntos`}
 </Badge>
 </div>
 <div
 ref={mapRef}
 className="h-48 rounded-lg border bg-muted overflow-hidden"
 />
 </div>

 <Separator />

 {/* Upload mode selection */}
 <div className="space-y-3">
 <Label className="text-sm font-medium">¿Qué quieres subir?</Label>
 
 {/* Full upload option */}
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
 Importa todas las ubicaciones del documento a tu colección.
 </p>
 </div>
 </div>
 </button>

 {/* Sample upload option */}
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
 Prueba con una muestra antes de importar todo el documento.
 </p>
 </div>
 </div>
 </button>

 {/* Sample percentage slider */}
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
 
 {/* Preset buttons */}
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

 {/* Slider */}
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
