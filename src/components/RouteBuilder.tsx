import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { renderTransportModeIcon } from '@/lib/icon-utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Route as RouteIcon,
  Plus,
  X,
  Footprints,
  Car,
  Plane,
  Ship,
  Save,
  Loader2,
  Trash2,
  GripVertical,
  MapPin,
  Clock,
  Navigation,
  Home,
  Search,
  Globe,
  Compass,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useRoutes, RouteWaypoint, Route } from '@/hooks/use-routes';
import { useTravelAdvisor } from '@/hooks/use-travel-advisor';
import { useLocationsStore } from '@/store/locations-store';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation } from '@/types/location';
import { forwardGeocode, ForwardGeocodeResult } from '@/lib/geocoding';
import { Slider } from '@/components/ui/slider';
import { TravelAdvisorResults } from '@/components/TravelAdvisorResults';
import { IntermodalSelector } from '@/components/IntermodalSelector';

const TRANSPORT_MODES = [
  { value: 'walking', label: 'A pie', icon: Footprints, color: 'text-green-600' },
  { value: 'driving', label: 'Coche', icon: Car, color: 'text-blue-600' },
  { value: 'flight', label: 'Vuelo', icon: Plane, color: 'text-purple-600' },
  { value: 'ferry', label: 'Ferry', icon: Ship, color: 'text-cyan-600' },
] as const;

// Self-powered modes where daily hour limits apply
const SELF_POWERED_MODES = new Set(['walking', 'driving']);

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

export interface ItineraryStage {
  id: string;
  name: string;
  waypoints: RouteWaypoint[];
  maxDrivingHours: number;
  collapsed: boolean;
  segments: any[];
  totalDistance: number;
  totalDuration: number;
  calculated: boolean;
  notes: string;
}

interface RouteBuilderProps {
  onClose: () => void;
  onRouteCalculated?: (segments: any[]) => void;
  onWaypointsChanged?: (waypoints: RouteWaypoint[]) => void;
  editRouteId?: string;
}

let stageIdCounter = 0;
const nextStageId = () => `stage-${++stageIdCounter}-${Date.now()}`;

export function RouteBuilder({ onClose, onRouteCalculated, onWaypointsChanged, editRouteId }: RouteBuilderProps) {
  const { routes, loading: routesLoading, calculating, saveRoute, calculateRoute } = useRoutes();
  const { user } = useAuth();
  const getAllLocations = useLocationsStore(state => state.getAllLocations);
  const [userTravelProfile, setUserTravelProfile] = useState<string>('adventure');
  const [userExcludedModes, setUserExcludedModes] = useState<string[]>([]);
  const [userAvailableModes, setUserAvailableModes] = useState<string[]>([]);

  const rankingToWeights = useCallback((ranking: string[]): Record<string, number> => {
    const weights: Record<string, number> = {};
    const total = ranking.length;
    ranking.forEach((code, idx) => {
      weights[code] = Math.max(0.5, 3.0 - (idx * 2.5 / (total - 1)));
    });
    return weights;
  }, []);

  // Load user's travel profile and transport modes
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profileRes, modesRes, allModesRes] = await Promise.all([
        supabase.from('profiles').select('travel_profile, priority_ranking').eq('id', user.id).maybeSingle(),
        supabase.from('user_transport_modes').select('transport_mode_code').eq('user_id', user.id).eq('is_available', true),
        supabase.from('transport_modes').select('code, name, icon, sub_category, is_complementary, category').eq('is_active', true).order('category').order('name'),
      ]);
      if ((profileRes.data as any)?.travel_profile) {
        setUserTravelProfile((profileRes.data as any).travel_profile);
      }
      const ranking = (profileRes.data as any)?.priority_ranking;
      if (Array.isArray(ranking) && ranking.length > 0) {
        const w = rankingToWeights(ranking);
        setCustomWeights(prev => ({
          ...prev,
          cost: w.cost ?? prev.cost,
          time: w.time ?? prev.time,
          comfort: w.comfort ?? prev.comfort,
          flexibility: w.flexibility ?? prev.flexibility,
          scenic: w.scenic ?? prev.scenic,
          risk: w.adventure ? (3.5 - (w.adventure ?? 1.5)) : prev.risk,
        }));
      }
      const OWNED_VEHICLE_CODES = new Set([
        'own_car', 'rental_car', 'own_motorcycle', 'rental_motorcycle',
        'camper_van', 'car_caravan', 'bicycle', 'own_boat', 'rental_boat', 'walking',
      ]);
      if (allModesRes.data) {
        setAllTransportModes(allModesRes.data as any);
        const userCodes = modesRes.data ? new Set(modesRes.data.map(m => m.transport_mode_code)) : null;
        const ownedModes = allModesRes.data.filter(m => OWNED_VEHICLE_CODES.has(m.code) && !m.is_complementary);
        const filtered = userCodes && userCodes.size > 0 ? ownedModes.filter(m => userCodes.has(m.code)) : ownedModes;
        setAvailableTransportModes(filtered as any);
      }
      if (modesRes.data && modesRes.data.length > 0) {
        setUserAvailableModes(modesRes.data.map(m => m.transport_mode_code));
      }
    })();
  }, [user, rankingToWeights]);

  const {
    profiles,
    alternatives,
    explanation,
    loading: advisorLoading,
    explaining,
    selectedProfile,
    customWeights,
    setCustomWeights,
    setExcludedModes,
    setUserOwnedModes,
    applyProfile,
    analyzeRoutes,
    getExplanation,
  } = useTravelAdvisor(userTravelProfile);

  useEffect(() => {
    if (userExcludedModes.length > 0) setExcludedModes(userExcludedModes);
    if (userAvailableModes.length > 0) {
      const ownedVehicleCodes = ['own_car', 'rental_car', 'own_motorcycle', 'rental_motorcycle', 'camper_van', 'car_caravan', 'bicycle', 'own_boat', 'rental_boat'];
      setUserOwnedModes(userAvailableModes.filter(code => ownedVehicleCodes.includes(code)));
    }
  }, [userExcludedModes, userAvailableModes, setExcludedModes, setUserOwnedModes]);

  // Core state
  const [routeName, setRouteName] = useState('');
  const [routeDescription, setRouteDescription] = useState('');
  const [departurePoint, setDeparturePoint] = useState<RouteWaypoint | null>(null);
  const [returnPoint, setReturnPoint] = useState<RouteWaypoint | null>(null);
  const [stages, setStages] = useState<ItineraryStage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{ type: 'departure' | 'return' | 'stage-waypoint'; stageId?: string; position?: 'start' | 'end' | 'intermediate' }>({ type: 'departure' });
  const [searchQuery, setSearchQuery] = useState('');
  const [homeLocation, setHomeLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [geoResults, setGeoResults] = useState<ForwardGeocodeResult[]>([]);
  const [searchingGeo, setSearchingGeo] = useState(false);
  const geoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAdvisor, setShowAdvisor] = useState(false);
  const [primaryVehicle, setPrimaryVehicle] = useState<string>('');
  const [setupDone, setSetupDone] = useState(!!editRouteId);
  const [availableTransportModes, setAvailableTransportModes] = useState<{ code: string; name: string; icon: string; sub_category: string; is_complementary: boolean; category: string }[]>([]);
  const [allTransportModes, setAllTransportModes] = useState<{ code: string; name: string; icon: string; sub_category: string; is_complementary: boolean; category: string }[]>([]);
  const [calculatingStageId, setCalculatingStageId] = useState<string | null>(null);

  const ROUTE_PALETTE = [
    { name: 'Azul', hex: '#2563eb' },
    { name: 'Rojo', hex: '#dc2626' },
    { name: 'Verde', hex: '#16a34a' },
    { name: 'Naranja', hex: '#ea580c' },
    { name: 'Violeta', hex: '#7c3aed' },
    { name: 'Rosa', hex: '#db2777' },
    { name: 'Cian', hex: '#0891b2' },
    { name: 'Ámbar', hex: '#d97706' },
  ];
  const [outboundColor, setOutboundColor] = useState('#2563eb');

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
        setDeparturePoint(route.waypoints[0]);
        setReturnPoint(route.waypoints[route.waypoints.length - 1]);
        // Put all intermediate waypoints into a single stage
        if (route.waypoints.length > 2) {
          setStages([{
            id: nextStageId(),
            name: 'Etapa 1',
            waypoints: route.waypoints.slice(1, -1),
            maxDrivingHours: 4,
            collapsed: false,
            segments: [],
            totalDistance: 0,
            totalDuration: 0,
            calculated: false,
            notes: '',
          }]);
        }
      }
    }
  }, [editRouteId, routes]);

  // Notify parent of all waypoints
  useEffect(() => {
    const allWps = buildFullWaypoints();
    onWaypointsChanged?.(allWps);
  }, [departurePoint, returnPoint, stages]);

  const allLocations = getAllLocations();
  const filteredLocations = searchQuery.trim()
    ? allLocations.filter(loc =>
      loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (loc.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 20)
    : allLocations.slice(0, 20);

  // Build full ordered waypoints from stages
  const buildFullWaypoints = useCallback((): RouteWaypoint[] => {
    const wps: RouteWaypoint[] = [];
    if (departurePoint) wps.push(departurePoint);
    for (const stage of stages) {
      wps.push(...stage.waypoints);
    }
    if (returnPoint) wps.push(returnPoint);
    return wps.map((wp, i) => ({ ...wp, position: i }));
  }, [departurePoint, returnPoint, stages]);

  // --- Location picker ---
  const openPicker = useCallback((target: typeof pickerTarget) => {
    setPickerTarget(target);
    setShowLocationPicker(true);
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
    transportMode: 'driving',
  }), []);

  const createWaypointFromGeo = useCallback((result: ForwardGeocodeResult): RouteWaypoint => ({
    position: 0,
    name: result.shortName,
    latitude: result.lat,
    longitude: result.lng,
    transportMode: 'driving',
  }), []);

  const createWaypointFromHome = useCallback((): RouteWaypoint | null => {
    if (!homeLocation) return null;
    return { position: 0, name: homeLocation.name, latitude: homeLocation.lat, longitude: homeLocation.lng, transportMode: 'driving' };
  }, [homeLocation]);

  const handlePickLocation = useCallback((wp: RouteWaypoint) => {
    const { type, stageId, position } = pickerTarget;
    if (type === 'departure') {
      setDeparturePoint(wp);
    } else if (type === 'return') {
      setReturnPoint(wp);
    } else if (type === 'stage-waypoint' && stageId) {
      setStages(prev => prev.map(s => {
        if (s.id !== stageId) return s;
        let newWps: RouteWaypoint[];
        if (position === 'end') {
          newWps = [...s.waypoints, wp];
        } else {
          newWps = [...s.waypoints, wp]; // default: append
        }
        return { ...s, waypoints: newWps, calculated: false };
      }));
    }
    setShowLocationPicker(false);
    setSearchQuery('');
    setGeoResults([]);
  }, [pickerTarget]);

  // --- Stage management ---
  const addStage = useCallback(() => {
    const stageNumber = stages.length + 1;
    // Auto-set start: departure point if first stage, else last waypoint of previous stage
    const newStage: ItineraryStage = {
      id: nextStageId(),
      name: `Etapa ${stageNumber}`,
      waypoints: [],
      maxDrivingHours: 4,
      collapsed: false,
      segments: [],
      totalDistance: 0,
      totalDuration: 0,
      calculated: false,
      notes: '',
    };
    setStages(prev => [...prev, newStage]);
  }, [stages.length]);

  const removeStage = useCallback((stageId: string) => {
    setStages(prev => prev.filter(s => s.id !== stageId));
  }, []);

  const toggleStageCollapse = useCallback((stageId: string) => {
    setStages(prev => prev.map(s => s.id === stageId ? { ...s, collapsed: !s.collapsed } : s));
  }, []);

  const updateStageName = useCallback((stageId: string, name: string) => {
    setStages(prev => prev.map(s => s.id === stageId ? { ...s, name } : s));
  }, []);

  const updateStageMaxHours = useCallback((stageId: string, hours: number) => {
    setStages(prev => prev.map(s => s.id === stageId ? { ...s, maxDrivingHours: hours } : s));
  }, []);

  const updateStageNotes = useCallback((stageId: string, notes: string) => {
    setStages(prev => prev.map(s => s.id === stageId ? { ...s, notes } : s));
  }, []);

  const removeWaypointFromStage = useCallback((stageId: string, wpIdx: number) => {
    setStages(prev => prev.map(s => {
      if (s.id !== stageId) return s;
      return { ...s, waypoints: s.waypoints.filter((_, i) => i !== wpIdx), calculated: false };
    }));
  }, []);

  const updateWaypointTransport = useCallback((stageId: string, wpIdx: number, mode: RouteWaypoint['transportMode']) => {
    setStages(prev => prev.map(s => {
      if (s.id !== stageId) return s;
      const newWps = s.waypoints.map((wp, i) => i === wpIdx ? { ...wp, transportMode: mode } : wp);
      return { ...s, waypoints: newWps, calculated: false };
    }));
  }, []);

  const moveStage = useCallback((fromIdx: number, direction: 'up' | 'down') => {
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
    setStages(prev => {
      const arr = [...prev];
      [arr[fromIdx], arr[toIdx]] = [arr[toIdx], arr[fromIdx]];
      return arr;
    });
  }, []);

  // Drag & drop waypoints within a stage
  const [dragState, setDragState] = useState<{ stageId: string; fromIdx: number } | null>(null);
  const [dragOverState, setDragOverState] = useState<{ stageId: string; idx: number } | null>(null);

  const handleWpDrop = useCallback((stageId: string, toIdx: number) => {
    if (!dragState || dragState.stageId !== stageId) { setDragState(null); setDragOverState(null); return; }
    const fromIdx = dragState.fromIdx;
    if (fromIdx === toIdx) { setDragState(null); setDragOverState(null); return; }
    setStages(prev => prev.map(s => {
      if (s.id !== stageId) return s;
      const wps = [...s.waypoints];
      const [moved] = wps.splice(fromIdx, 1);
      wps.splice(toIdx, 0, moved);
      return { ...s, waypoints: wps, calculated: false };
    }));
    setDragState(null);
    setDragOverState(null);
  }, [dragState]);

  // --- Calculate a single stage ---
  const calculateStage = useCallback(async (stageId: string) => {
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return;

    // Build waypoints for this stage: previous endpoint → stage waypoints
    const stageIdx = stages.findIndex(s => s.id === stageId);
    const stageWps: RouteWaypoint[] = [];

    // Start point: departure if first stage, else last wp of prev stage or departure
    if (stageIdx === 0 && departurePoint) {
      stageWps.push(departurePoint);
    } else if (stageIdx > 0) {
      const prevStage = stages[stageIdx - 1];
      if (prevStage.waypoints.length > 0) {
        stageWps.push(prevStage.waypoints[prevStage.waypoints.length - 1]);
      } else if (departurePoint) {
        stageWps.push(departurePoint);
      }
    }

    stageWps.push(...stage.waypoints);

    // End point: if last stage and returnPoint exists, add it
    if (stageIdx === stages.length - 1 && returnPoint) {
      stageWps.push(returnPoint);
    }

    if (stageWps.length < 2) {
      toast.error('La etapa necesita al menos 2 puntos para calcular');
      return;
    }

    setCalculatingStageId(stageId);
    const result = await calculateRoute(stageWps);
    setCalculatingStageId(null);

    if (result) {
      const markedSegments = result.segments.map((seg: any) => ({
        ...seg,
        stageId,
        routeColor: outboundColor,
        stageNumber: stageIdx + 1,
      }));

      setStages(prev => prev.map(s => {
        if (s.id !== stageId) return s;
        return {
          ...s,
          segments: markedSegments,
          totalDistance: result.totalDistance,
          totalDuration: result.totalDuration,
          calculated: true,
        };
      }));

      // Check if self-powered duration exceeds limit
      const selfPoweredDuration = result.segments
        .filter((seg: any) => SELF_POWERED_MODES.has(seg.transportMode || 'driving'))
        .reduce((sum: number, seg: any) => sum + (seg.duration || 0), 0);
      const limitSeconds = stage.maxDrivingHours * 3600;
      if (selfPoweredDuration > limitSeconds) {
        const excess = formatDuration(selfPoweredDuration - limitSeconds);
        toast.warning(`⚠️ ${stage.name} supera el límite de ${stage.maxDrivingHours}h por ${excess}`);
      }
    }
  }, [stages, departurePoint, returnPoint, calculateRoute, outboundColor]);

  // Calculate all stages and dispatch to map
  const calculateAllStages = useCallback(async () => {
    const allSegments: any[] = [];
    for (let i = 0; i < stages.length; i++) {
      await calculateStage(stages[i].id);
    }
    // After all calculated, dispatch to map
    setTimeout(() => {
      const updatedSegments: any[] = [];
      // Re-read stages from latest
      setStages(prev => {
        for (const s of prev) {
          updatedSegments.push(...s.segments);
        }
        return prev;
      });
      onRouteCalculated?.(updatedSegments);
    }, 100);
  }, [stages, calculateStage, onRouteCalculated]);

  // Dispatch segments to map whenever stages change
  useEffect(() => {
    const allSegs: any[] = [];
    for (const s of stages) {
      allSegs.push(...s.segments);
    }
    if (allSegs.length > 0) {
      onRouteCalculated?.(allSegs);
    }
  }, [stages, onRouteCalculated]);

  // --- Save ---
  const handleSave = useCallback(async () => {
    if (!routeName.trim()) { toast.error('Introduce un nombre para el itinerario'); return; }
    const allWps = buildFullWaypoints();
    if (allWps.length < 2) { toast.error('Necesitas al menos 2 puntos'); return; }

    // Calculate uncalculated stages first
    const uncalculated = stages.filter(s => !s.calculated && s.waypoints.length > 0);
    if (uncalculated.length > 0) {
      for (const s of uncalculated) await calculateStage(s.id);
    }

    const allSegments = stages.flatMap(s => s.segments);
    const totalDist = stages.reduce((sum, s) => sum + s.totalDistance, 0);
    const totalDur = stages.reduce((sum, s) => sum + s.totalDuration, 0);

    setIsSaving(true);
    await saveRoute(routeName, allWps, allSegments, totalDist, totalDur, routeDescription || undefined);
    setIsSaving(false);
    onClose();
  }, [routeName, routeDescription, stages, buildFullWaypoints, calculateStage, saveRoute, onClose]);

  // Clone route
  const cloneRoute = useCallback((route: Route) => {
    setRouteName(`${route.name} (copia)`);
    setRouteDescription(route.description || '');
    if (route.waypoints.length >= 2) {
      setDeparturePoint(route.waypoints[0]);
      setReturnPoint(route.waypoints[route.waypoints.length - 1]);
      if (route.waypoints.length > 2) {
        setStages([{
          id: nextStageId(),
          name: 'Etapa 1',
          waypoints: route.waypoints.slice(1, -1).map((wp, i) => ({ ...wp, position: i })),
          maxDrivingHours: 4,
          collapsed: false,
          segments: [],
          totalDistance: 0,
          totalDuration: 0,
          calculated: false,
          notes: '',
        }]);
      }
    }
    setSetupDone(true);
  }, []);

  const ownedVehiclesList = availableTransportModes
    .map(m => allTransportModes.find(am => am.code === m.code))
    .filter(Boolean) as typeof allTransportModes;

  // ============ SETUP PHASE ============
  if (!setupDone) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <RouteIcon className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Nuevo Itinerario</h3>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Configura tu viaje antes de empezar</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Primary vehicle */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Car className="w-4 h-4 text-primary" />
                ¿Con qué vehículo sales?
              </Label>
              <p className="text-xs text-muted-foreground">Elige con qué sales de casa.</p>
              {ownedVehiclesList.length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {ownedVehiclesList.map(mode => (
                    <button
                      key={mode.code}
                      onClick={() => setPrimaryVehicle(mode.code === primaryVehicle ? '' : mode.code)}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-left text-sm transition-colors ${
                        primaryVehicle === mode.code
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border bg-card hover:bg-muted/50 text-foreground'
                      }`}
                    >
                      {renderTransportModeIcon(mode.code, mode.icon, 'w-4 h-4')}
                      <span className="truncate text-xs">{mode.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic py-2">
                  {allTransportModes.length === 0 ? 'Cargando...' : 'No tienes vehículos configurados.'}
                </p>
              )}
            </div>

            <Separator />

            {/* Route color */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-primary" />
                Color del trazo
              </Label>
              <div className="flex flex-wrap gap-2">
                {ROUTE_PALETTE.map(c => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setOutboundColor(c.hex)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${outboundColor === c.hex ? 'border-foreground scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <Separator />

            {/* Clone existing */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Copy className="w-4 h-4 text-primary" />
                ¿Repetir una ruta existente?
              </Label>
              {routesLoading ? (
                <div className="flex items-center gap-2 py-3 justify-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">Cargando...</span>
                </div>
              ) : routes.length > 0 ? (
                <div className="space-y-1">
                  {routes.slice(0, 8).map(route => (
                    <button key={route.id} onClick={() => cloneRoute(route)}
                      className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/50 text-left transition-colors">
                      <RouteIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{route.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {route.waypoints.length} puntos{route.totalDistance ? ` · ${(route.totalDistance / 1000).toFixed(0)} km` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">Clonar</Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic py-2">No tienes rutas guardadas</p>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border">
          <Button className="w-full" onClick={() => setSetupDone(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Crear itinerario
          </Button>
        </div>
      </div>
    );
  }

  // ============ MAIN BUILDER ============
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <RouteIcon className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Crear Itinerario</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {primaryVehicle && (
            <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg px-3 py-1.5">
              <span className="text-muted-foreground">Vehículo:</span>
              <Badge variant="secondary" className="text-[10px]">
                {availableTransportModes.find(m => m.code === primaryVehicle)?.icon}
                {availableTransportModes.find(m => m.code === primaryVehicle)?.name || primaryVehicle}
              </Badge>
              <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={() => setSetupDone(false)}>
                <Pencil className="w-3 h-3" />
              </Button>
            </div>
          )}
          <Input placeholder="Nombre del itinerario..." value={routeName} onChange={(e) => setRouteName(e.target.value)} className="text-sm" />
          <Input placeholder="Descripción (opcional)..." value={routeDescription} onChange={(e) => setRouteDescription(e.target.value)} className="text-sm" />
        </div>
      </div>

      {/* Departure & Return */}
      <div className="px-3 pt-3 space-y-2">
        {/* Departure */}
        <div className={`flex items-center gap-2 p-2 rounded-lg border ${departurePoint ? 'bg-muted/30 border-border/40' : 'border-2 border-dashed border-green-500/40 bg-green-500/5'}`}>
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold shrink-0">S</div>
          {departurePoint ? (
            <>
              <span className="text-xs font-medium truncate flex-1">{departurePoint.name}</span>
              <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={() => openPicker({ type: 'departure' })}>
                <Pencil className="w-3 h-3" />
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-muted-foreground flex-1">Punto de salida</span>
              <div className="flex gap-1">
                {homeLocation && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => { const wp = createWaypointFromHome(); if (wp) setDeparturePoint(wp); }}>
                    <Home className="w-3.5 h-3.5" /> Casa
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openPicker({ type: 'departure' })}>
                  <MapPin className="w-3.5 h-3.5" /> Elegir
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Return */}
        <div className={`flex items-center gap-2 p-2 rounded-lg border ${returnPoint ? 'bg-muted/30 border-border/40' : 'border-2 border-dashed border-red-500/40 bg-red-500/5'}`}>
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold shrink-0">R</div>
          {returnPoint ? (
            <>
              <span className="text-xs font-medium truncate flex-1">{returnPoint.name}</span>
              {departurePoint && (
                <button className={`p-0.5 text-[9px] rounded px-1.5 ${returnPoint.latitude === departurePoint.latitude && returnPoint.longitude === departurePoint.longitude ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setReturnPoint({ ...departurePoint })}>
                  = Salida
                </button>
              )}
              <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={() => openPicker({ type: 'return' })}>
                <Pencil className="w-3 h-3" />
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-muted-foreground flex-1">Punto de regreso</span>
              <div className="flex gap-1">
                {departurePoint && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => setReturnPoint({ ...departurePoint })}>
                    = Salida
                  </Button>
                )}
                {homeLocation && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => { const wp = createWaypointFromHome(); if (wp) setReturnPoint(wp); }}>
                    <Home className="w-3.5 h-3.5" /> Casa
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openPicker({ type: 'return' })}>
                  <MapPin className="w-3.5 h-3.5" /> Elegir
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Separator className="mx-3 mt-3" />

      {/* Stages list */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {stages.length === 0 && departurePoint && returnPoint && (
            <div className="text-center py-4 text-muted-foreground">
              <Navigation className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Crea etapas para definir tu ruta</p>
              <p className="text-[10px]">Cada etapa es un tramo de tu viaje</p>
            </div>
          )}

          <AnimatePresence>
            {stages.map((stage, stageIdx) => {
              const isCalcThis = calculatingStageId === stage.id;
              const selfPoweredSec = stage.segments
                .filter((seg: any) => SELF_POWERED_MODES.has(seg.transportMode || 'driving'))
                .reduce((sum: number, seg: any) => sum + (seg.duration || 0), 0);
              const overLimit = stage.calculated && selfPoweredSec > stage.maxDrivingHours * 3600;

              return (
                <motion.div
                  key={stage.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={`rounded-lg border ${overLimit ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-card'}`}
                >
                  {/* Stage header */}
                  <div className="flex items-center gap-1.5 px-2.5 py-2 cursor-pointer" onClick={() => toggleStageCollapse(stage.id)}>
                    <Badge variant="secondary" className="text-[10px] shrink-0 w-5 h-5 flex items-center justify-center p-0 rounded-full">
                      {stageIdx + 1}
                    </Badge>
                    <input
                      className="text-xs font-semibold bg-transparent border-none outline-none flex-1 min-w-0 truncate"
                      value={stage.name}
                      onChange={(e) => { e.stopPropagation(); updateStageName(stage.id, e.target.value); }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {stage.calculated && (
                      <span className="text-[9px] text-muted-foreground whitespace-nowrap shrink-0">
                        {formatDistance(stage.totalDistance)} · {formatDuration(stage.totalDuration)}
                      </span>
                    )}
                    {overLimit && <span className="text-[9px] text-destructive shrink-0">⚠️</span>}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {stageIdx > 0 && (
                        <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); moveStage(stageIdx, 'up'); }}>
                          <ChevronUp className="w-3 h-3" />
                        </button>
                      )}
                      {stageIdx < stages.length - 1 && (
                        <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); moveStage(stageIdx, 'down'); }}>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      )}
                      <button className="p-0.5 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeStage(stage.id); }}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                      {stage.collapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Stage body */}
                  {!stage.collapsed && (
                    <div className="px-2.5 pb-2.5 pt-0 space-y-2 border-t border-border/30">
                      {/* Max driving hours */}
                      <div className="flex items-center gap-2 pt-1.5">
                        <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-[10px] text-muted-foreground shrink-0">Máx. conducción propia:</span>
                        <Slider
                          value={[stage.maxDrivingHours]}
                          onValueChange={(v) => updateStageMaxHours(stage.id, v[0])}
                          min={1} max={12} step={0.5}
                          className="flex-1"
                        />
                        <span className="text-[10px] font-medium tabular-nums w-8 text-right">{stage.maxDrivingHours}h</span>
                      </div>

                      {/* Start point indicator */}
                      <div className="flex items-center gap-1.5 px-1 py-0.5 text-[10px] text-muted-foreground">
                        <div className="w-3 h-3 rounded-full bg-green-600/30 flex items-center justify-center text-[7px] text-green-600 font-bold">↓</div>
                        <span className="italic truncate">
                          Desde: {stageIdx === 0
                            ? (departurePoint?.name || 'Punto de salida')
                            : (stages[stageIdx - 1].waypoints.length > 0
                              ? stages[stageIdx - 1].waypoints[stages[stageIdx - 1].waypoints.length - 1].name
                              : departurePoint?.name || '...')}
                        </span>
                      </div>

                      {/* Waypoints */}
                      {stage.waypoints.map((wp, wpIdx) => (
                        <div
                          key={`${stage.id}-wp-${wpIdx}`}
                          draggable
                          onDragStart={() => setDragState({ stageId: stage.id, fromIdx: wpIdx })}
                          onDragOver={(e) => { e.preventDefault(); setDragOverState({ stageId: stage.id, idx: wpIdx }); }}
                          onDrop={() => handleWpDrop(stage.id, wpIdx)}
                          onDragEnd={() => { setDragState(null); setDragOverState(null); }}
                          className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md border transition-colors ${
                            dragOverState?.stageId === stage.id && dragOverState?.idx === wpIdx && dragState?.fromIdx !== wpIdx
                              ? 'bg-primary/10 border-primary/40'
                              : dragState?.stageId === stage.id && dragState?.fromIdx === wpIdx
                              ? 'opacity-50 bg-muted/30 border-border/30'
                              : 'bg-muted/20 border-border/30'
                          }`}
                        >
                          <GripVertical className="w-3 h-3 cursor-grab active:cursor-grabbing text-muted-foreground shrink-0" />
                          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center text-[8px] text-primary-foreground font-bold shrink-0">
                            {wpIdx + 1}
                          </div>
                          <span className="text-xs font-medium truncate flex-1 min-w-0">{wp.name}</span>

                          {/* Transport mode */}
                          {wpIdx < stage.waypoints.length - 1 && (
                            <div className="flex items-center bg-muted rounded-full px-0.5 shrink-0">
                              {TRANSPORT_MODES.map(mode => {
                                const ModeIcon = mode.icon;
                                const isActive = wp.transportMode === mode.value;
                                return (
                                  <button key={mode.value}
                                    className={`p-0.5 rounded-full transition-colors ${isActive ? 'bg-background shadow-sm ' + mode.color : 'text-muted-foreground/50 hover:text-foreground'}`}
                                    onClick={() => updateWaypointTransport(stage.id, wpIdx, mode.value)}>
                                    <ModeIcon className="w-3 h-3" />
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Segment info */}
                          {stage.segments[wpIdx] && (
                            <span className="text-[8px] text-muted-foreground whitespace-nowrap shrink-0">
                              {formatDistance(stage.segments[wpIdx].distance)} · {formatDuration(stage.segments[wpIdx].duration)}
                            </span>
                          )}

                          <button className="p-0.5 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => removeWaypointFromStage(stage.id, wpIdx)}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}

                      {/* End point indicator */}
                      {stageIdx === stages.length - 1 && returnPoint && (
                        <div className="flex items-center gap-1.5 px-1 py-0.5 text-[10px] text-muted-foreground">
                          <div className="w-3 h-3 rounded-full bg-red-600/30 flex items-center justify-center text-[7px] text-red-600 font-bold">↓</div>
                          <span className="italic truncate">Hasta: {returnPoint.name}</span>
                        </div>
                      )}

                      {/* Stage actions */}
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="flex-1 h-6 text-[10px]"
                          onClick={() => openPicker({ type: 'stage-waypoint', stageId: stage.id, position: 'end' })}>
                          <Plus className="w-3 h-3 mr-0.5" /> Destino
                        </Button>
                        <Button variant="secondary" size="sm" className="h-6 text-[10px]"
                          disabled={isCalcThis || stage.waypoints.length === 0}
                          onClick={() => calculateStage(stage.id)}>
                          {isCalcThis ? <Loader2 className="w-3 h-3 animate-spin" /> : <RouteIcon className="w-3 h-3" />}
                        </Button>
                      </div>

                      {/* Notes */}
                      <Input
                        placeholder="Notas de esta etapa..."
                        value={stage.notes}
                        onChange={(e) => updateStageNotes(stage.id, e.target.value)}
                        className="h-6 text-[10px]"
                      />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Location picker */}
      <AnimatePresence>
        {showLocationPicker && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-t border-border overflow-hidden">
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {pickerTarget.type === 'departure' ? 'Punto de salida' : pickerTarget.type === 'return' ? 'Punto de regreso' : 'Añadir destino'}
                </span>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowLocationPicker(false)}>
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
        {/* Summary */}
        {stages.some(s => s.calculated) && (
          <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1">
              <RouteIcon className="w-3.5 h-3.5" />
              <span>{formatDistance(stages.reduce((s, st) => s + st.totalDistance, 0))}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDuration(stages.reduce((s, st) => s + st.totalDuration, 0))}</span>
            </div>
            <Badge variant="secondary" className="text-[10px]">{stages.length} etapa{stages.length !== 1 ? 's' : ''}</Badge>
          </div>
        )}

        <div className="flex gap-2">
          {departurePoint && returnPoint && (
            <Button variant="outline" size="sm" className="flex-1" onClick={addStage}>
              <Plus className="w-4 h-4 mr-1" /> Etapa
            </Button>
          )}

          <Button variant="secondary" size="sm"
            onClick={calculateAllStages}
            disabled={stages.length === 0 || calculating || !!calculatingStageId}>
            {calculating || calculatingStageId ? <Loader2 className="w-4 h-4 animate-spin" /> : <RouteIcon className="w-4 h-4" />}
          </Button>

          <Button size="sm" onClick={handleSave}
            disabled={!departurePoint || !returnPoint || stages.length === 0 || !routeName.trim() || isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
