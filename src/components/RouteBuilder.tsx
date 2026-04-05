import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { renderTransportModeIcon } from '@/lib/icon-utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Route as RouteIcon,
  X,
  Footprints,
  Car,
  Plane,
  Ship,
  Save,
  Loader2,
  MapPin,
  Clock,
  Navigation,
  Home,
  Globe,
  Pencil,
} from 'lucide-react';
import { FlightSegmentDetails } from '@/components/FlightSegmentDetails';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useRoutes, RouteWaypoint, Route } from '@/hooks/use-routes';
import { useLocationsStore } from '@/store/locations-store';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation } from '@/types/location';
import { forwardGeocode, ForwardGeocodeResult } from '@/lib/geocoding';

const TRANSPORT_MODES = [
  { value: 'walking', label: 'A pie', icon: Footprints, color: 'text-green-600' },
  { value: 'driving', label: 'Coche', icon: Car, color: 'text-blue-600' },
  { value: 'flight', label: 'Vuelo', icon: Plane, color: 'text-purple-600' },
  { value: 'ferry', label: 'Ferry', icon: Ship, color: 'text-cyan-600' },
] as const;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateGreatCircleArc(lat1: number, lng1: number, lat2: number, lng2: number, numPoints: number): number[][] {
  const coords: number[][] = [];
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const lam1 = lng1 * Math.PI / 180;
  const lam2 = lng2 * Math.PI / 180;
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((phi2 - phi1) / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2
  ));
  if (d === 0) return [[lng1, lat1], [lng2, lat2]];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
    const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);
    coords.push([Math.atan2(y, x) * 180 / Math.PI, Math.atan2(z, Math.sqrt(x ** 2 + y ** 2)) * 180 / Math.PI]);
  }
  return coords;
}

interface RouteBuilderProps {
  onClose: () => void;
  onRouteCalculated?: (segments: any[]) => void;
  onWaypointsChanged?: (waypoints: RouteWaypoint[]) => void;
  editRouteId?: string;
}

export function RouteBuilder({ onClose, onRouteCalculated, onWaypointsChanged, editRouteId }: RouteBuilderProps) {
  const { user } = useAuth();
  const { routes, loading: routesLoading, calculating, saveRoute, calculateRoute } = useRoutes();
  const { getAllLocations } = useLocationsStore();

  // Core state
  const [routeName, setRouteName] = useState('');
  const [routeDescription, setRouteDescription] = useState('');
  const [origin, setOrigin] = useState<RouteWaypoint | null>(null);
  const [destination, setDestination] = useState<RouteWaypoint | null>(null);
  const [transportMode, setTransportMode] = useState<'walking' | 'driving' | 'flight' | 'ferry'>('driving');
  const [roadPreference, setRoadPreference] = useState<'fastest' | 'scenic'>('fastest');
  const [isSaving, setIsSaving] = useState(false);
  const [routeResult, setRouteResult] = useState<{ segments: any[]; totalDistance: number; totalDuration: number } | null>(null);
  const [resolvedFlightLegs, setResolvedFlightLegs] = useState<any[] | null>(null);
  const [routeImpossible, setRouteImpossible] = useState<{ reason: string; directDistanceKm: number; suggestedModes: string[] } | null>(null);

  // Location picker
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'origin' | 'destination'>('origin');
  const [searchQuery, setSearchQuery] = useState('');
  const [homeLocation, setHomeLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [geoResults, setGeoResults] = useState<ForwardGeocodeResult[]>([]);
  const [searchingGeo, setSearchingGeo] = useState(false);
  const geoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load home location
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('home_latitude, home_longitude, home_name')
      .eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.home_latitude && data?.home_longitude) {
          setHomeLocation({ lat: data.home_latitude, lng: data.home_longitude, name: data.home_name || 'Casa' });
        }
      });
  }, [user]);

  // Load existing route if editing
  useEffect(() => {
    if (editRouteId) {
      const route = routes.find(r => r.id === editRouteId);
      if (route && route.waypoints.length >= 2) {
        setRouteName(route.name);
        setRouteDescription(route.description || '');
        setOrigin(route.waypoints[0]);
        setDestination(route.waypoints[route.waypoints.length - 1]);
        setTransportMode(route.transportMode as any || 'driving');
        setRoadPreference(route.roadPreference as any || 'fastest');
      }
    }
  }, [editRouteId, routes]);

  // Notify parent of waypoints
  useEffect(() => {
    const wps: RouteWaypoint[] = [];
    if (origin) wps.push({ ...origin, position: 0 });
    if (destination) wps.push({ ...destination, position: 1 });
    onWaypointsChanged?.(wps);
  }, [origin, destination]);

  // Dispatch segments to map
  useEffect(() => {
    if (routeResult?.segments) {
      let finalSegments = routeResult.segments;

      // Replace single flight arc with chained arcs if we have resolved legs
      if (resolvedFlightLegs && resolvedFlightLegs.length >= 1) {
        finalSegments = [];
        for (const seg of routeResult.segments) {
          if (seg.transportMode === 'flight') {
            // Replace with one arc per leg
            for (const leg of resolvedFlightLegs) {
              if (leg.origin.latitude && leg.origin.longitude && leg.destination.latitude && leg.destination.longitude) {
                const arcCoords = generateGreatCircleArc(
                  leg.origin.latitude, leg.origin.longitude,
                  leg.destination.latitude, leg.destination.longitude,
                  50,
                );
                const dist = haversineDistance(leg.origin.latitude, leg.origin.longitude, leg.destination.latitude, leg.destination.longitude);
                finalSegments.push({
                  geometry: { type: 'LineString', coordinates: arcCoords },
                  distance: dist,
                  duration: dist / (800 * 1000 / 3600),
                  transportMode: 'flight',
                  originAirport: { name: leg.origin.name, iata: leg.origin.iata },
                  destinationAirport: { name: leg.destination.name, iata: leg.destination.iata },
                });
              }
            }
          } else {
            finalSegments.push(seg);
          }
        }
      }

      onRouteCalculated?.(finalSegments.map(seg => ({
        ...seg,
        routeColor: '#2563eb',
        stageNumber: 1,
      })));
    }
  }, [routeResult, resolvedFlightLegs, onRouteCalculated]);

  const allLocations = getAllLocations();
  const filteredLocations = searchQuery.trim()
    ? allLocations.filter(loc =>
      loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (loc.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 20)
    : allLocations.slice(0, 20);

  const openPicker = useCallback((target: 'origin' | 'destination') => {
    setPickerTarget(target);
    setShowPicker(true);
    setSearchQuery('');
    setGeoResults([]);
  }, []);

  const handlePickerSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (geoSearchTimer.current) clearTimeout(geoSearchTimer.current);
    if (query.trim().length < 3) { setGeoResults([]); return; }
    setSearchingGeo(true);
    geoSearchTimer.current = setTimeout(async () => {
      try {
        const results = await forwardGeocode(query);
        setGeoResults(results);
      } catch (e) {
        console.error('Geo search error:', e);
      } finally {
        setSearchingGeo(false);
      }
    }, 300);
  }, []);

  const createWaypointFromLocation = useCallback((loc: GeoLocation): RouteWaypoint => ({
    locationId: loc.id,
    position: 0,
    name: loc.name,
    latitude: loc.coordinates.lat,
    longitude: loc.coordinates.lng,
    transportMode,
  }), [transportMode]);

  const createWaypointFromGeo = useCallback((result: ForwardGeocodeResult): RouteWaypoint => ({
    position: 0,
    name: result.shortName,
    latitude: result.lat,
    longitude: result.lng,
    transportMode,
  }), [transportMode]);

  const createWaypointFromHome = useCallback((): RouteWaypoint | null => {
    if (!homeLocation) return null;
    return { position: 0, name: homeLocation.name, latitude: homeLocation.lat, longitude: homeLocation.lng, transportMode };
  }, [homeLocation, transportMode]);

  const handlePickLocation = useCallback((wp: RouteWaypoint) => {
    if (pickerTarget === 'origin') {
      setOrigin(wp);
    } else {
      setDestination(wp);
    }
    setShowPicker(false);
    setSearchQuery('');
    setGeoResults([]);
    // Reset calculation when points change
    setRouteResult(null);
  }, [pickerTarget]);

  // Calculate
  const handleCalculate = useCallback(async () => {
    if (!origin || !destination) {
      toast.error('Define origen y destino');
      return;
    }
    setRouteImpossible(null);
    const result = await calculateRoute(origin, destination, transportMode, roadPreference);
    if (result) {
      if ((result as any).routeImpossible) {
        setRouteImpossible({
          reason: (result as any).reason || 'no_road_connection',
          directDistanceKm: (result as any).directDistanceKm || 0,
          suggestedModes: (result as any).suggestedModes || ['flight'],
        });
        setRouteResult(null);
      } else {
        setRouteResult(result);
      }
    }
  }, [origin, destination, transportMode, roadPreference, calculateRoute]);

  const handleSwitchMode = useCallback((mode: 'flight' | 'ferry') => {
    setTransportMode(mode);
    setRouteImpossible(null);
    setRouteResult(null);
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    if (!routeName.trim()) { toast.error('Introduce un nombre para el itinerario'); return; }
    if (!origin || !destination) { toast.error('Necesitas origen y destino'); return; }

    // Calculate if not done
    let result = routeResult;
    if (!result) {
      result = await calculateRoute(origin, destination, transportMode, roadPreference);
      if (!result) return;
      setRouteResult(result);
    }

    setIsSaving(true);
    await saveRoute(
      routeName,
      origin,
      destination,
      result.segments,
      result.totalDistance,
      result.totalDuration,
      transportMode,
      roadPreference,
      routeDescription || undefined,
    );
    setIsSaving(false);
    onClose();
  }, [routeName, routeDescription, origin, destination, transportMode, roadPreference, routeResult, calculateRoute, saveRoute, onClose]);

  // ============ RENDER ============
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <RouteIcon className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">
              {editRouteId ? 'Editar Itinerario' : 'Crear Itinerario'}
            </h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="space-y-2">
          <Input placeholder="Nombre del itinerario..." value={routeName} onChange={(e) => setRouteName(e.target.value)} className="text-sm" />
          <Input placeholder="Descripción (opcional)..." value={routeDescription} onChange={(e) => setRouteDescription(e.target.value)} className="text-sm" />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 pt-3 space-y-3">
          {/* Transport mode selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Modo de transporte</Label>
            <div className="flex gap-1.5">
              {TRANSPORT_MODES.map(mode => {
                const ModeIcon = mode.icon;
                const isActive = transportMode === mode.value;
                return (
                  <button
                    key={mode.value}
                    onClick={() => { setTransportMode(mode.value); setRouteResult(null); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                      isActive
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <ModeIcon className="w-3.5 h-3.5" />
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Road preference (only for driving/walking) */}
          {(transportMode === 'driving' || transportMode === 'walking') && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Preferencia de vía</Label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setRoadPreference('fastest'); setRouteResult(null); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                    roadPreference === 'fastest'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Rápida
                </button>
                <button
                  onClick={() => { setRoadPreference('scenic'); setRouteResult(null); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                    roadPreference === 'scenic'
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Paisajística
                </button>
              </div>
            </div>
          )}

          <Separator />

          {/* Origin */}
          <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${
            origin ? 'bg-muted/30 border-border/40' : 'border-2 border-dashed border-primary/40 bg-primary/5'
          }`}>
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">A</div>
            {origin ? (
              <>
                <span className="text-xs font-medium truncate flex-1">{origin.name}</span>
                <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={() => openPicker('origin')}>
                  <Pencil className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-muted-foreground flex-1">Punto de origen</span>
                <div className="flex gap-1">
                  {homeLocation && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                      onClick={() => { const wp = createWaypointFromHome(); if (wp) { setOrigin(wp); setRouteResult(null); } }}>
                      <Home className="w-3.5 h-3.5" /> Casa
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openPicker('origin')}>
                    <MapPin className="w-3.5 h-3.5" /> Elegir
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Connector line / segment details */}
          {(origin || destination) && (
            <div className="px-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-6 flex justify-center">
                  <div className="w-0.5 h-6 bg-border" />
                </div>
                {routeResult && (
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistance(routeResult.totalDistance)} · {formatDuration(routeResult.totalDuration)}
                  </span>
                )}
              </div>

              {/* Rich flight details when route has flight segments */}
              {routeResult?.segments?.some((s: any) => s.transportMode === 'flight') && (
                <FlightSegmentDetails
                  segments={routeResult.segments}
                  onFlightLegsResolved={(legs) => setResolvedFlightLegs(legs)}
                />
              )}

              {/* Route impossible alert */}
              {routeImpossible && (
                <div className="rounded-lg border-2 border-amber-400 dark:border-amber-600 bg-amber-50/80 dark:bg-amber-950/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      {routeImpossible.reason === 'ocean_or_continent_crossing'
                        ? `No es posible llegar en ${transportMode === 'driving' ? 'coche' : 'a pie'} — hay un océano o mar de por medio (${routeImpossible.directDistanceKm} km en línea recta)`
                        : `No se encontró ruta terrestre para este trayecto (${routeImpossible.directDistanceKm} km)`
                      }
                    </p>
                  </div>
                  <p className="text-[10px] text-amber-700 dark:text-amber-400">¿Quieres cambiar el modo de transporte?</p>
                  <div className="flex gap-1.5">
                    {routeImpossible.suggestedModes.includes('flight') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5 border-purple-300 bg-purple-50 hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-950 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300"
                        onClick={() => handleSwitchMode('flight')}
                      >
                        <Plane className="w-3.5 h-3.5" />
                        Cambiar a Vuelo
                      </Button>
                    )}
                    {routeImpossible.suggestedModes.includes('ferry') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5 border-cyan-300 bg-cyan-50 hover:bg-cyan-100 dark:border-cyan-700 dark:bg-cyan-950 dark:hover:bg-cyan-900 text-cyan-700 dark:text-cyan-300"
                        onClick={() => handleSwitchMode('ferry')}
                      >
                        <Ship className="w-3.5 h-3.5" />
                        Cambiar a Ferry
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Destination */}
          <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${
            destination ? 'bg-muted/30 border-border/40' : 'border-2 border-dashed border-destructive/40 bg-destructive/5'
          }`}>
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-destructive text-destructive-foreground text-xs font-bold shrink-0">B</div>
            {destination ? (
              <>
                <span className="text-xs font-medium truncate flex-1">{destination.name}</span>
                <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={() => openPicker('destination')}>
                  <Pencil className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-muted-foreground flex-1">Punto de destino</span>
                <div className="flex gap-1">
                  {homeLocation && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                      onClick={() => { const wp = createWaypointFromHome(); if (wp) { setDestination(wp); setRouteResult(null); } }}>
                      <Home className="w-3.5 h-3.5" /> Casa
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openPicker('destination')}>
                    <MapPin className="w-3.5 h-3.5" /> Elegir
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Empty state */}
          {!origin && !destination && (
            <div className="text-center py-6 text-muted-foreground">
              <Navigation className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Define origen y destino</p>
              <p className="text-[10px]">Selecciona los puntos A y B de tu itinerario</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Location picker */}
      <AnimatePresence>
        {showPicker && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-t border-border overflow-hidden">
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {pickerTarget === 'origin' ? 'Punto de origen' : 'Punto de destino'}
                </span>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowPicker(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <div className="relative">
                <Input placeholder="Buscar lugar, dirección o ubicación..." value={searchQuery}
                  onChange={(e) => handlePickerSearch(e.target.value)} className="text-sm pr-8" autoFocus />
                {searchingGeo && <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2.5 top-2.5 text-muted-foreground" />}
              </div>
              <ScrollArea className="h-52">
                <div className="space-y-0.5">
                  {filteredLocations.length > 0 && (
                    <>
                      <p className="text-[10px] font-medium text-muted-foreground px-2 pt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> Mis ubicaciones
                      </p>
                      {filteredLocations.map(loc => (
                        <button key={loc.id} className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-left text-sm"
                          onClick={() => handlePickLocation(createWaypointFromLocation(loc))}>
                          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{loc.name}</p>
                            <p className="text-[10px] text-muted-foreground">{loc.coordinates.lat.toFixed(4)}, {loc.coordinates.lng.toFixed(4)}</p>
                          </div>
                        </button>
                      ))}
                    </>
                  )}

                  {geoResults.length > 0 && (
                    <>
                      {filteredLocations.length > 0 && <Separator className="my-1" />}
                      <p className="text-[10px] font-medium text-muted-foreground px-2 pt-1 flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Lugares generales
                      </p>
                      {geoResults.map((result, index) => (
                        <button key={`geo-${index}`} className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-left text-sm"
                          onClick={() => handlePickLocation(createWaypointFromGeo(result))}>
                          <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{result.shortName}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{result.displayName}</p>
                          </div>
                        </button>
                      ))}
                    </>
                  )}

                  {filteredLocations.length === 0 && geoResults.length === 0 && !searchingGeo && searchQuery.trim().length >= 3 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No se encontraron resultados</p>
                  )}
                  {!searchQuery.trim() && filteredLocations.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">Escribe para buscar lugares</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-2">
        {routeResult && (
          <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1">
              <RouteIcon className="w-3.5 h-3.5" />
              <span>{formatDistance(routeResult.totalDistance)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDuration(routeResult.totalDuration)}</span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1"
            onClick={handleCalculate}
            disabled={!origin || !destination || calculating}>
            {calculating
              ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
              : <RouteIcon className="w-4 h-4 mr-1" />}
            Calcular ruta
          </Button>

          <Button size="sm" onClick={handleSave}
            disabled={!origin || !destination || !routeName.trim() || isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
