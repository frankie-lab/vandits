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
  Settings2,
} from 'lucide-react';
import { FlightSegmentDetails } from '@/components/FlightSegmentDetails';
import { SegmentBreakdown } from '@/components/SegmentBreakdown';
import { RouteEngineSettings } from '@/components/RouteEngineSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useRoutes, RouteWaypoint, Route } from '@/hooks/use-routes';
import { useRouteCalculation } from '@/hooks/use-route-calculation';
import { useLocationsStore } from '@/store/locations-store';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation } from '@/types/location';
import { forwardGeocode, ForwardGeocodeResult } from '@/lib/geocoding';
import {
  formatDuration,
  formatDistance,
  getRouteColor,
  extractFlightLabel,
  extractPortNames,
  TRANSPORT_CODE_TO_ROUTE_MODE,
} from '@/lib/route-engine';

const ALL_TRANSPORT_MODES = [
  { value: 'walking', label: 'A pie', icon: Footprints, color: 'text-green-600', codes: ['walking', 'bicycle', 'rental_bicycle'] },
  { value: 'driving', label: 'Coche', icon: Car, color: 'text-blue-600', codes: ['own_car', 'own_motorcycle', 'camper_van', 'car_caravan', 'rental_car', 'rental_motorcycle', 'rental_camper', 'rental_caravan'] },
] as const;


export function RouteBuilder({ onClose, onRouteCalculated, onWaypointsChanged, editRouteId }: RouteBuilderProps) {
  const { user } = useAuth();
  const { routes, loading: routesLoading, calculating, saveRoute, updateRoute, calculateRoute } = useRoutes();
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
  const [resolvedDestAirport, setResolvedDestAirport] = useState<any | null>(null);
  const [routeImpossible, setRouteImpossible] = useState<{ reason: string; directDistanceKm: number; suggestedModes: string[] } | null>(null);
  const [routeAlternatives, setRouteAlternatives] = useState<{ mode: string; label: string; result: any; color: string }[]>([]);
  const [calculatingAlternatives, setCalculatingAlternatives] = useState(false);

  // User preferences
  const [availableTransportModes, setAvailableTransportModes] = useState<typeof ALL_TRANSPORT_MODES[number][]>([...ALL_TRANSPORT_MODES]);
  const [userPrefsLoaded, setUserPrefsLoaded] = useState(false);

  // Location picker
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'origin' | 'destination'>('origin');
  const [searchQuery, setSearchQuery] = useState('');
  const [homeLocation, setHomeLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [geoResults, setGeoResults] = useState<ForwardGeocodeResult[]>([]);
  const [searchingGeo, setSearchingGeo] = useState(false);
  const geoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load home location + user preferences (transport modes, priorities)
  useEffect(() => {
    if (!user) return;

    // Load home + priority ranking
    supabase.from('profiles').select('home_latitude, home_longitude, home_name, priority_ranking')
      .eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.home_latitude && data?.home_longitude) {
          setHomeLocation({ lat: data.home_latitude, lng: data.home_longitude, name: data.home_name || 'Casa' });
        }

        // Auto-set road preference from priority ranking
        if (data && (data as any).priority_ranking) {
          const ranking = (data as any).priority_ranking as string[];
          if (Array.isArray(ranking) && ranking.length > 0) {
            const scenicIdx = ranking.indexOf('scenic');
            const timeIdx = ranking.indexOf('time');
            // If scenic is prioritized higher than time (lower index = higher priority)
            if (scenicIdx !== -1 && timeIdx !== -1 && scenicIdx < timeIdx && !editRouteId) {
              setRoadPreference('scenic');
            }
          }
        }
      });

    // Load user transport modes
    supabase.from('user_transport_modes')
      .select('transport_mode_code, is_available, layer, preference')
      .eq('user_id', user.id)
      .eq('is_available', true)
      .then(({ data: userModes }) => {
        if (userModes && userModes.length > 0) {
          const availableCodes = new Set(userModes.map(m => m.transport_mode_code));
          
          // Filter ALL_TRANSPORT_MODES to only those that have at least one matching code
          const filtered = ALL_TRANSPORT_MODES.filter(mode =>
            mode.codes.some(code => availableCodes.has(code))
          );

          if (filtered.length > 0) {
            setAvailableTransportModes(filtered as any);
            // Auto-select first available mode if current isn't available
            if (!editRouteId) {
              const currentAvailable = filtered.find(m => m.value === transportMode);
              if (!currentAvailable) {
                setTransportMode(filtered[0].value as any);
              }
            }
          }
          // If no modes match, keep all modes available (don't restrict)
        }
        setUserPrefsLoaded(true);
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

  // Dispatch segments to map (primary route + alternatives)
  useEffect(() => {
    const allMapSegments: any[] = [];

    if (routeResult?.segments) {
      let finalSegments = [...routeResult.segments];

      // Replace single flight arc with chained arcs if we have resolved legs
      if (resolvedFlightLegs && resolvedFlightLegs.length >= 1) {
        const newSegments: any[] = [];
        for (const seg of finalSegments) {
          if (seg.transportMode === 'flight') {
            for (const leg of resolvedFlightLegs) {
              if (leg.origin.latitude && leg.origin.longitude && leg.destination.latitude && leg.destination.longitude) {
                const arcCoords = generateGreatCircleArc(
                  leg.origin.latitude, leg.origin.longitude,
                  leg.destination.latitude, leg.destination.longitude,
                  50,
                );
                const dist = haversineDistance(leg.origin.latitude, leg.origin.longitude, leg.destination.latitude, leg.destination.longitude);
                newSegments.push({
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
            newSegments.push(seg);
          }
        }
        finalSegments = newSegments;
      }

      allMapSegments.push(...finalSegments.map(seg => ({
        ...seg,
        routeColor: '#2563eb',
        stageNumber: 1,
      })));
    }

    // Add alternative routes as semi-transparent clickable lines
    for (const alt of routeAlternatives) {
      if (alt.result?.segments) {
        allMapSegments.push(...alt.result.segments.map((seg: any) => {
          // Use the alt color for the primary transport mode, blue for driving legs
          const isPrimaryMode = seg.transportMode === alt.mode;
          return {
            ...seg,
            routeColor: isPrimaryMode ? alt.color : '#64748b',
            isAlternative: true,
            alternativeMode: alt.mode,
            alternativeLabel: alt.label,
            stageNumber: 1,
          };
        }));
      }
    }

    onRouteCalculated?.(allMapSegments);
  }, [routeResult, resolvedFlightLegs, routeAlternatives, onRouteCalculated]);

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
    setRouteImpossible(null);
  }, [pickerTarget]);

  // handleCalculate removed — auto-calculate useEffect handles all recalculation

  const handleSwitchMode = useCallback((mode: 'flight' | 'ferry', altLabel?: string) => {
    // If altLabel provided, find that specific alternative
    const alt = altLabel 
      ? routeAlternatives.find(a => a.label === altLabel)
      : routeAlternatives.find(a => a.mode === mode);
    if (alt?.result) {
      setTransportMode(mode);
      setRouteImpossible(null);
      setRouteResult(alt.result);
      setRouteAlternatives([]);
      setResolvedFlightLegs(null);
      setResolvedDestAirport(null);
    } else {
      setTransportMode(mode);
      setRouteImpossible(null);
      setRouteResult(null);
      setRouteAlternatives([]);
      setResolvedFlightLegs(null);
      setResolvedDestAirport(null);
    }
  }, [routeAlternatives]);

  // Auto-calculate alternatives when route is impossible (legacy fallback)
  useEffect(() => {
    if (!routeImpossible || !origin || !destination) return;
    // The new unified API already returns alternatives in the response,
    // so this is only needed if the API returned routeImpossible with alternatives
    if (routeImpossible.suggestedModes.length === 0) return;

    let cancelled = false;
    setCalculatingAlternatives(true);

    const modes = routeImpossible.suggestedModes;
    const altConfigs = modes.map(mode => ({
      mode,
      label: mode === 'flight' ? 'Vuelo' : 'Ferry',
      color: mode === 'flight' ? '#9333ea' : '#0891b2',
    }));

    Promise.all(
      altConfigs.map(async (cfg) => {
        const result = await calculateRoute(origin, destination, cfg.mode, roadPreference);
        if (cancelled || !result || (result as any).routeImpossible) return null;
        if (!result.segments || result.segments.length === 0) return null;
        
        const alts: { mode: string; label: string; color: string; result: any }[] = [];
        alts.push({
          mode: cfg.mode,
          label: cfg.mode === 'flight' 
            ? extractFlightLabel(result)
            : `⛴ ${extractPortNames(result)}`,
          color: cfg.color,
          result: { segments: result.segments, totalDistance: result.totalDistance, totalDuration: result.totalDuration },
        });
        
        return alts;
      })
    ).then(results => {
      if (cancelled) return;
      const valid = results.filter(Boolean).flat() as { mode: string; label: string; color: string; result: any }[];
      setRouteAlternatives(valid);
      setCalculatingAlternatives(false);
    });

    return () => { cancelled = true; };
  }, [routeImpossible, origin, destination, roadPreference, calculateRoute]);

  // Listen for alternative route selection from map click
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const mode = detail?.mode;
      const label = detail?.label;
      if (mode && (mode === 'flight' || mode === 'ferry')) {
        handleSwitchMode(mode as 'flight' | 'ferry', label);
      }
    };
    window.addEventListener('route-alternative-selected', handler);
    return () => window.removeEventListener('route-alternative-selected', handler);
  }, [handleSwitchMode]);

  // Auto-calculate when origin, destination, or transport mode change
  useEffect(() => {
    if (!origin || !destination) return;
    let cancelled = false;

    (async () => {
      setRouteImpossible(null);
      setResolvedFlightLegs(null);
      setResolvedDestAirport(null);
      setRouteAlternatives([]);
      const result = await calculateRoute(origin, destination, transportMode, roadPreference);
      if (cancelled) return;
      if (result) {
        if ((result as any).routeImpossible) {
          // Check if the unified API already sent alternatives
          const apiAlts = (result as any).alternatives || [];
          if (apiAlts.length > 0) {
            // Use the first alternative as the primary result
            const best = apiAlts[0];
            setRouteResult({ segments: best.segments, totalDistance: best.totalDistance, totalDuration: best.totalDuration });
            // Remaining alternatives
            const remaining = apiAlts.slice(1).map((alt: any, idx: number) => ({
              mode: alt.mode,
              label: alt.label || (alt.mode === 'flight' ? '✈ Vuelo' : '⛴ Ferry'),
              color: alt.mode === 'flight' ? '#9333ea' : getRouteColor(idx),
              result: { segments: alt.segments, totalDistance: alt.totalDistance, totalDuration: alt.totalDuration },
            }));
            setRouteAlternatives(remaining);
          } else {
            setRouteImpossible({
              reason: (result as any).reason || 'no_road_connection',
              directDistanceKm: (result as any).directDistanceKm || 0,
              suggestedModes: (result as any).suggestedModes || ['flight'],
            });
            setRouteResult(null);
          }
        } else {
          setRouteResult(result);
          
          // Handle unified alternatives from the API
          const apiAlts = (result as any).alternatives || [];
          if (apiAlts.length > 0) {
            const alts = apiAlts.map((alt: any, idx: number) => ({
              mode: alt.mode,
              label: alt.label || (alt.mode === 'flight' ? '✈ Vuelo' : '⛴ Ferry'),
              color: alt.mode === 'flight' ? '#9333ea' : getRouteColor(idx),
              result: { segments: alt.segments, totalDistance: alt.totalDistance, totalDuration: alt.totalDuration },
            }));
            setRouteAlternatives(alts);
          } else {
            // Legacy: check ferryAlternatives for backward compatibility
            if ((result as any).ferryAlternatives?.length > 0) {
              const ferryAlts = (result as any).ferryAlternatives.map((alt: any, idx: number) => ({
                mode: 'ferry' as const,
                label: `⛴ ${alt.originPort?.name || '?'} → ${alt.destPort?.name || '?'}`,
                color: getRouteColor(idx),
                result: { segments: alt.segments, totalDistance: alt.totalDistance, totalDuration: alt.totalDuration },
              }));
              setRouteAlternatives(ferryAlts);
            }
          }
        }
      }
    })();

    return () => { cancelled = true; };
  }, [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude, transportMode, roadPreference]);

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
    if (editRouteId) {
      await updateRoute(
        editRouteId,
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
    } else {
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
    }
    setIsSaving(false);
    onClose();
  }, [routeName, routeDescription, origin, destination, transportMode, roadPreference, routeResult, calculateRoute, saveRoute, updateRoute, editRouteId, onClose]);

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
              {availableTransportModes.map(mode => {
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
          {transportMode === 'driving' && (
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

          {/* Calculating spinner */}
          {(calculating || calculatingAlternatives) && !routeResult && (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Calculando ruta…</span>
            </div>
          )}

          {/* Segment breakdown */}
          {(origin || destination) && (
            <div className="px-2 space-y-1.5">
              {/* Multi-segment breakdown */}
              {routeResult && routeResult.segments?.length > 0 && (
                <>
                  <SegmentBreakdown
                    segments={routeResult.segments}
                    totalDistance={routeResult.totalDistance}
                    totalDuration={routeResult.totalDuration}
                    originName={origin?.name}
                    destinationName={destination?.name}
                    resolvedFlightLegs={resolvedFlightLegs}
                    resolvedDestAirport={resolvedDestAirport}
                  />

                  {/* Duffel flight offers (when flight segments exist) */}
                  {routeResult.segments.some((s: any) => s.transportMode === 'flight') && (
                    <FlightSegmentDetails
                      segments={routeResult.segments}
                      onFlightLegsResolved={(legs, destAirport) => {
                        setResolvedFlightLegs(legs);
                        if (destAirport) setResolvedDestAirport(destAirport);
                      }}
                    />
                  )}
                  {/* Route alternatives panel (ferry, flight, etc.) */}
                  {routeAlternatives.length > 0 && !routeImpossible && (
                    <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-1.5">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        Alternativas disponibles — selecciona en el mapa o aquí:
                      </p>
                      {routeAlternatives.map(alt => (
                        <button
                          key={alt.label}
                          onClick={() => handleSwitchMode(alt.mode as 'flight' | 'ferry', alt.label)}
                          className="w-full flex items-center gap-2 p-2 rounded-lg border border-border/60 bg-card hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: alt.color }} />
                          {alt.mode === 'flight' ? <Plane className="w-3.5 h-3.5 text-purple-600 shrink-0" /> : <Ship className="w-3.5 h-3.5 text-cyan-600 shrink-0" />}
                          <span className="text-xs font-medium truncate">{alt.label}</span>
                          {alt.result?.totalDistance && (
                            <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                              {formatDistance(alt.result.totalDistance)} · {formatDuration(alt.result.totalDuration)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Simple connector when no result yet */}
              {!routeResult && !routeImpossible && (
                <div className="flex items-center gap-2">
                  <div className="w-6 flex justify-center">
                    <div className="w-0.5 h-6 bg-border" />
                  </div>
                </div>
              )}

              {/* Route impossible + alternatives */}
              {routeImpossible && (
                <div className="rounded-lg border-2 border-amber-400 dark:border-amber-600 bg-amber-50/80 dark:bg-amber-950/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      {routeImpossible.reason === 'ocean_or_continent_crossing'
                        ? `No es posible llegar en ${transportMode === 'driving' ? 'coche' : 'a pie'} — hay un océano o mar de por medio (${routeImpossible.directDistanceKm} km)`
                        : `No se encontró ruta terrestre (${routeImpossible.directDistanceKm} km)`
                      }
                    </p>
                  </div>

                  {calculatingAlternatives && (
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Calculando alternativas...</span>
                    </div>
                  )}

                  {routeAlternatives.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-amber-700 dark:text-amber-400">
                        Alternativas disponibles — selecciona en el mapa o aquí:
                      </p>
                      {routeAlternatives.map(alt => (
                        <button
                          key={alt.label}
                          onClick={() => handleSwitchMode(alt.mode as 'flight' | 'ferry', alt.label)}
                          className="w-full flex items-center gap-2 p-2 rounded-lg border border-border/60 bg-card hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: alt.color }} />
                          <div className="flex items-center gap-1.5">
                            {alt.mode === 'flight' ? <Plane className="w-3.5 h-3.5 text-purple-600" /> : <Ship className="w-3.5 h-3.5 text-cyan-600" />}
                            <span className="text-xs font-medium">{alt.label}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {formatDistance(alt.result.totalDistance)} · {formatDuration(alt.result.totalDuration)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!calculatingAlternatives && routeAlternatives.length === 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-amber-700 dark:text-amber-400">Cambia el modo de transporte:</p>
                      <div className="flex gap-1.5">
                        {routeImpossible.suggestedModes.includes('flight') && (
                          <Button variant="outline" size="sm"
                            className="h-7 text-xs gap-1.5 border-purple-300 bg-purple-50 hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-950 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300"
                            onClick={() => handleSwitchMode('flight')}>
                            <Plane className="w-3.5 h-3.5" /> Vuelo
                          </Button>
                        )}
                        {routeImpossible.suggestedModes.includes('ferry') && (
                          <Button variant="outline" size="sm"
                            className="h-7 text-xs gap-1.5 border-cyan-300 bg-cyan-50 hover:bg-cyan-100 dark:border-cyan-700 dark:bg-cyan-950 dark:hover:bg-cyan-900 text-cyan-700 dark:text-cyan-300"
                            onClick={() => handleSwitchMode('ferry')}>
                            <Ship className="w-3.5 h-3.5" /> Ferry
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
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
          <Button size="sm" className="flex-1" onClick={handleSave}
            disabled={!origin || !destination || !routeName.trim() || isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            {editRouteId ? 'Actualizar' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
