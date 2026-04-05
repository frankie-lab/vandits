import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  ArrowDown,
  Train,
  Shuffle,
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

/** A destination point the user adds. Stages are auto-derived between consecutive destinations. */
export interface ItineraryDestination {
  id: string;
  waypoint: RouteWaypoint;
  /** Transport mode for the segment leading TO this destination from the previous point */
  transportMode: RouteWaypoint['transportMode'];
  /** Max self-powered driving hours for the stage leading to this destination */
  maxDrivingHours: number;
  notes: string;
  /** Calculated segment data from previous point to this one */
  segmentDistance?: number;
  segmentDuration?: number;
  segmentGeometry?: any;
  segmentParts?: any[];
  calculated: boolean;
}

/** Auto-derived stage = the segment between two consecutive points */
export interface DerivedStage {
  stageNumber: number;
  from: { name: string; lat: number; lng: number };
  to: { name: string; lat: number; lng: number };
  destination: ItineraryDestination; // the destination that owns this stage's config
  distance: number;
  duration: number;
  overLimit: boolean;
}

interface RouteBuilderProps {
  onClose: () => void;
  onRouteCalculated?: (segments: any[]) => void;
  onWaypointsChanged?: (waypoints: RouteWaypoint[]) => void;
  editRouteId?: string;
}

let destIdCounter = 0;
const nextDestId = () => `dest-${++destIdCounter}-${Date.now()}`;

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

  // Load user's travel profile and transport modes
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profileRes, modesRes, allModesRes] = await Promise.all([
        supabase.from('profiles').select('travel_profile, priority_ranking').eq('id', user.id).maybeSingle(),
        supabase.from('user_transport_modes').select('transport_mode_code, layer').eq('user_id', user.id).eq('is_available', true),
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
      if (allModesRes.data) {
        setAllTransportModes(allModesRes.data as any);
        const userCodes = modesRes.data ? new Set(modesRes.data.map(m => m.transport_mode_code)) : null;
        // All departure-eligible modes grouped by sub_category
        const departureEligible = allModesRes.data.filter(m => !m.is_complementary);
        const filtered = userCodes && userCodes.size > 0 
          ? departureEligible.filter(m => userCodes.has(m.code)) 
          : departureEligible;
        setAvailableTransportModes(filtered as any);
      }
      if (modesRes.data && modesRes.data.length > 0) {
        setUserAvailableModes(modesRes.data.map(m => m.transport_mode_code));
        // Pre-select hirable modes from user preferences ONLY if no localStorage data
        const storedAccepted = localStorage.getItem('itinerary_acceptedModes');
        if (!storedAccepted) {
          const hirableCodes = modesRes.data
            .filter(m => m.layer === 'hirable' || m.layer === 'rentable' || m.layer === 'infrastructure')
            .map(m => m.transport_mode_code);
          if (hirableCodes.length > 0) {
            setAcceptedModes(new Set(hirableCodes));
          }
        }
      }
    })();
  }, [user, rankingToWeights]);

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
  const [destinations, setDestinations] = useState<ItineraryDestination[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{ type: 'departure' | 'return' | 'destination'; insertIndex?: number }>({ type: 'departure' });
  const [searchQuery, setSearchQuery] = useState('');
  const [homeLocation, setHomeLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [geoResults, setGeoResults] = useState<ForwardGeocodeResult[]>([]);
  const [searchingGeo, setSearchingGeo] = useState(false);
  const geoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [primaryVehicle, setPrimaryVehicleRaw] = useState<string>(() => {
    try { return localStorage.getItem('itinerary_primaryVehicle') || ''; } catch { return ''; }
  });
  const setPrimaryVehicle = useCallback((v: string) => {
    setPrimaryVehicleRaw(v);
    try { localStorage.setItem('itinerary_primaryVehicle', v); } catch {}
  }, []);
  const [setupDone, setSetupDone] = useState(!!editRouteId);
  const [availableTransportModes, setAvailableTransportModes] = useState<{ code: string; name: string; icon: string; sub_category: string; is_complementary: boolean; category: string }[]>([]);
  const [allTransportModes, setAllTransportModes] = useState<{ code: string; name: string; icon: string; sub_category: string; is_complementary: boolean; category: string }[]>([]);
  const [acceptedModes, setAcceptedModesRaw] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('itinerary_acceptedModes');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const setAcceptedModes = useCallback((updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setAcceptedModesRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem('itinerary_acceptedModes', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);
  const [calculatingIdx, setCalculatingIdx] = useState<number | null>(null);
  const [expandedDest, setExpandedDest] = useState<string | null>(null);

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
  const [outboundColor, setOutboundColorRaw] = useState(() => {
    try { return localStorage.getItem('itinerary_outboundColor') || '#2563eb'; } catch { return '#2563eb'; }
  });
  const setOutboundColor = useCallback((c: string) => {
    setOutboundColorRaw(c);
    try { localStorage.setItem('itinerary_outboundColor', c); } catch {}
  }, []);
  const [isRoundTrip, setIsRoundTripRaw] = useState(() => {
    try { const v = localStorage.getItem('itinerary_isRoundTrip'); return v !== null ? v === 'true' : true; } catch { return true; }
  });
  const setIsRoundTrip = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    setIsRoundTripRaw(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      try { localStorage.setItem('itinerary_isRoundTrip', String(next)); } catch {}
      return next;
    });
  }, []);
  const [avoidSameRoute, setAvoidSameRouteRaw] = useState(() => {
    try { const v = localStorage.getItem('itinerary_avoidSameRoute'); return v !== null ? v === 'true' : true; } catch { return true; }
  });
  const setAvoidSameRoute = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    setAvoidSameRouteRaw(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      try { localStorage.setItem('itinerary_avoidSameRoute', String(next)); } catch {}
      return next;
    });
  }, []);

  // Generate 40% lighter color for return leg
  const lightenColor = (hex: string, amount = 0.4): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lr = Math.round(r + (255 - r) * amount);
    const lg = Math.round(g + (255 - g) * amount);
    const lb = Math.round(b + (255 - b) * amount);
    return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
  };
  const returnColor = lightenColor(outboundColor);

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
        if (route.waypoints.length > 2) {
          setDestinations(route.waypoints.slice(1, -1).map(wp => ({
            id: nextDestId(),
            waypoint: wp,
            transportMode: wp.transportMode || 'driving',
            maxDrivingHours: 4,
            notes: '',
            calculated: false,
          })));
        }
      }
    }
  }, [editRouteId, routes]);

  // Derive stages from destinations
  const derivedStages = useMemo((): DerivedStage[] => {
    if (!departurePoint) return [];
    const stages: DerivedStage[] = [];
    const points = [
      { name: departurePoint.name, lat: departurePoint.latitude, lng: departurePoint.longitude },
      ...destinations.map(d => ({ name: d.waypoint.name, lat: d.waypoint.latitude, lng: d.waypoint.longitude })),
    ];
    // If return point exists, add it as last
    if (returnPoint) {
      points.push({ name: returnPoint.name, lat: returnPoint.latitude, lng: returnPoint.longitude });
    }

    // Each destination owns the stage FROM previous point TO it
    // The return point stage is owned by a virtual "return destination"
    for (let i = 0; i < points.length - 1; i++) {
      const dest = i < destinations.length
        ? destinations[i]
        : (returnPoint ? {
            id: 'return',
            waypoint: { position: 0, name: returnPoint.name, latitude: returnPoint.latitude, longitude: returnPoint.longitude, transportMode: 'driving' as const },
            transportMode: 'driving' as const,
            maxDrivingHours: 4,
            notes: '',
            calculated: false,
          } : null);

      if (!dest) continue;

      const selfPoweredDur = SELF_POWERED_MODES.has(dest.transportMode)
        ? (dest.segmentDuration || 0) : 0;
      const overLimit = dest.calculated && selfPoweredDur > dest.maxDrivingHours * 3600;

      stages.push({
        stageNumber: i + 1,
        from: points[i],
        to: points[i + 1],
        destination: dest as ItineraryDestination,
        distance: dest.segmentDistance || 0,
        duration: dest.segmentDuration || 0,
        overLimit,
      });
    }
    return stages;
  }, [departurePoint, returnPoint, destinations]);

  // Notify parent of all waypoints
  useEffect(() => {
    const allWps: RouteWaypoint[] = [];
    if (departurePoint) allWps.push(departurePoint);
    for (const d of destinations) allWps.push(d.waypoint);
    if (returnPoint) allWps.push(returnPoint);
    onWaypointsChanged?.(allWps.map((wp, i) => ({ ...wp, position: i })));
  }, [departurePoint, returnPoint, destinations]);

  // Dispatch segments to map is handled below together with return stages


  const allLocations = getAllLocations();
  const filteredLocations = searchQuery.trim()
    ? allLocations.filter(loc =>
      loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (loc.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 20)
    : allLocations.slice(0, 20);

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
    const { type, insertIndex } = pickerTarget;
    if (type === 'departure') {
      setDeparturePoint(wp);
    } else if (type === 'return') {
      setReturnPoint(wp);
    } else if (type === 'destination') {
      const newDest: ItineraryDestination = {
        id: nextDestId(),
        waypoint: wp,
        transportMode: 'driving',
        maxDrivingHours: 4,
        notes: '',
        calculated: false,
      };
      setDestinations(prev => {
        const idx = insertIndex !== undefined ? insertIndex : prev.length;
        const arr = [...prev];
        arr.splice(idx, 0, newDest);
        return arr;
      });
      // Auto expand the new destination
      setExpandedDest(newDest.id);
    }
    setShowLocationPicker(false);
    setSearchQuery('');
    setGeoResults([]);
  }, [pickerTarget]);

  // --- Destination management ---
  const removeDestination = useCallback((destId: string) => {
    setDestinations(prev => prev.filter(d => d.id !== destId));
  }, []);

  const moveDestination = useCallback((fromIdx: number, direction: 'up' | 'down') => {
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
    setDestinations(prev => {
      const arr = [...prev];
      [arr[fromIdx], arr[toIdx]] = [arr[toIdx], arr[fromIdx]];
      // Mark both as uncalculated since stage connections changed
      arr[fromIdx] = { ...arr[fromIdx], calculated: false };
      arr[toIdx] = { ...arr[toIdx], calculated: false };
      return arr;
    });
  }, []);

  const updateDestTransport = useCallback((destId: string, mode: RouteWaypoint['transportMode']) => {
    setDestinations(prev => prev.map(d => d.id === destId ? { ...d, transportMode: mode, calculated: false } : d));
  }, []);

  const updateDestMaxHours = useCallback((destId: string, hours: number) => {
    setDestinations(prev => prev.map(d => d.id === destId ? { ...d, maxDrivingHours: hours } : d));
  }, []);

  const updateDestNotes = useCallback((destId: string, notes: string) => {
    setDestinations(prev => prev.map(d => d.id === destId ? { ...d, notes } : d));
  }, []);

  // Drag & drop
  const [dragState, setDragState] = useState<{ fromIdx: number } | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const isDraggingRef = useRef(false);

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    isDraggingRef.current = true;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    setDragState({ fromIdx: idx });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const fromIdx = dragState?.fromIdx ?? parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (isNaN(fromIdx) || fromIdx === toIdx) { setDragState(null); setDragOverIdx(null); return; }
    setDestinations(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return arr.map(d => ({ ...d, calculated: false }));
    });
    setDragState(null);
    setDragOverIdx(null);
    setTimeout(() => { isDraggingRef.current = false; }, 100);
  }, [dragState]);

  const handleDragEnd = useCallback(() => {
    setDragState(null);
    setDragOverIdx(null);
    setTimeout(() => { isDraggingRef.current = false; }, 100);
  }, []);

  // --- Calculate a single stage (segment from prev point to this destination) ---
  const calculateSingleStage = useCallback(async (destIdx: number) => {
    const dest = destinations[destIdx];
    if (!dest) return;

    // Determine the "from" point
    let fromWp: RouteWaypoint;
    if (destIdx === 0) {
      if (!departurePoint) { toast.error('Define el punto de salida primero'); return; }
      fromWp = departurePoint;
    } else {
      fromWp = destinations[destIdx - 1].waypoint;
    }

    const toWp = dest.waypoint;
    const wps: RouteWaypoint[] = [
      { ...fromWp, transportMode: dest.transportMode },
      { ...toWp, transportMode: dest.transportMode },
    ];

    setCalculatingIdx(destIdx);
    const result = await calculateRoute(wps);
    setCalculatingIdx(null);

    if (result) {
      const markedSegments = result.segments.map((seg: any) => ({
        ...seg,
        routeColor: outboundColor,
        stageNumber: destIdx + 1,
      }));

      setDestinations(prev => prev.map((d, i) => {
        if (i !== destIdx) return d;
        return {
          ...d,
          segmentDistance: result.totalDistance,
          segmentDuration: result.totalDuration,
          segmentGeometry: result.segments[0]?.geometry,
          segmentParts: markedSegments,
          calculated: true,
        };
      }));

      // Check limit
      if (SELF_POWERED_MODES.has(dest.transportMode)) {
        const limitSec = dest.maxDrivingHours * 3600;
        if (result.totalDuration > limitSec) {
          const excess = formatDuration(result.totalDuration - limitSec);
          toast.warning(`⚠️ Etapa ${destIdx + 1} supera el límite de ${dest.maxDrivingHours}h por ${excess}`);
        }
      }
    }
  }, [destinations, departurePoint, calculateRoute, outboundColor]);

  // Also handle return stage
  const [returnStage, setReturnStage] = useState<{ distance: number; duration: number; parts: any[]; calculated: boolean }>({
    distance: 0, duration: 0, parts: [], calculated: false,
  });
  const [returnTransport, setReturnTransport] = useState<RouteWaypoint['transportMode']>('driving');
  const [returnMaxHours, setReturnMaxHours] = useState(4);

  const calculateReturnStage = useCallback(async () => {
    if (!returnPoint || !isRoundTrip) return;
    const lastPoint = destinations.length > 0
      ? destinations[destinations.length - 1].waypoint
      : departurePoint;
    if (!lastPoint) return;

    const wps: RouteWaypoint[] = [
      { ...lastPoint, transportMode: returnTransport, preferAlternative: avoidSameRoute },
      { ...returnPoint, transportMode: returnTransport, preferAlternative: avoidSameRoute },
    ];

    setCalculatingIdx(-1);
    const result = await calculateRoute(wps);
    setCalculatingIdx(null);

    if (result) {
      const markedSegments = result.segments.map((seg: any) => ({
        ...seg,
        routeColor: returnColor,
        stageNumber: destinations.length + 1,
        isReturnLeg: true,
      }));
      setReturnStage({
        distance: result.totalDistance,
        duration: result.totalDuration,
        parts: markedSegments,
        calculated: true,
      });
    }
  }, [returnPoint, destinations, departurePoint, returnTransport, calculateRoute, returnColor, isRoundTrip, avoidSameRoute]);

  // Calculate all
  const calculateAll = useCallback(async () => {
    for (let i = 0; i < destinations.length; i++) {
      await calculateSingleStage(i);
    }
    if (isRoundTrip && returnPoint) {
      await calculateReturnStage();
    }
  }, [destinations.length, calculateSingleStage, calculateReturnStage, returnPoint, isRoundTrip]);

  // Dispatch all segments to the map whenever stages or return change
  useEffect(() => {
    const allSegs: any[] = [];
    for (const d of destinations) {
      if (d.segmentParts) allSegs.push(...d.segmentParts);
    }
    if (isRoundTrip && returnStage.parts.length > 0) {
      allSegs.push(...returnStage.parts);
    }
    if (allSegs.length > 0) {
      onRouteCalculated?.(allSegs);
    }
  }, [destinations, returnStage, isRoundTrip, onRouteCalculated]);

  // --- Save ---
  const handleSave = useCallback(async () => {
    if (!routeName.trim()) { toast.error('Introduce un nombre para el itinerario'); return; }
    const allWps: RouteWaypoint[] = [];
    if (departurePoint) allWps.push(departurePoint);
    for (const d of destinations) allWps.push(d.waypoint);
    if (returnPoint) allWps.push(returnPoint);
    if (allWps.length < 2) { toast.error('Necesitas al menos 2 puntos'); return; }

    // Calculate uncalculated
    for (let i = 0; i < destinations.length; i++) {
      if (!destinations[i].calculated) await calculateSingleStage(i);
    }
    if (returnPoint && !returnStage.calculated) await calculateReturnStage();

    const returnParts = isRoundTrip ? returnStage.parts : [];
    const allSegments = [
      ...destinations.flatMap(d => d.segmentParts || []),
      ...returnParts,
    ];
    const totalDist = destinations.reduce((s, d) => s + (d.segmentDistance || 0), 0) + (isRoundTrip ? returnStage.distance : 0);
    const totalDur = destinations.reduce((s, d) => s + (d.segmentDuration || 0), 0) + (isRoundTrip ? returnStage.duration : 0);

    setIsSaving(true);
    await saveRoute(routeName, allWps.map((wp, i) => ({ ...wp, position: i })), allSegments, totalDist, totalDur, routeDescription || undefined, 'private', {
      outboundColor,
      isRoundTrip,
      avoidSameReturn: avoidSameRoute,
      acceptedModes: Array.from(acceptedModes),
    });
    setIsSaving(false);
    onClose();
  }, [routeName, routeDescription, departurePoint, returnPoint, destinations, returnStage, calculateSingleStage, calculateReturnStage, saveRoute, onClose]);

  // Clone route
  const cloneRoute = useCallback((route: Route) => {
    setRouteName(`${route.name} (copia)`);
    setRouteDescription(route.description || '');
    if (route.outboundColor) setOutboundColor(route.outboundColor);
    if (route.isRoundTrip !== undefined) setIsRoundTrip(route.isRoundTrip);
    if (route.avoidSameReturn !== undefined) setAvoidSameRoute(route.avoidSameReturn);
    if (route.acceptedModes && route.acceptedModes.length > 0) setAcceptedModes(new Set(route.acceptedModes));
    if (route.waypoints.length >= 2) {
      setDeparturePoint(route.waypoints[0]);
      setReturnPoint(route.waypoints[route.waypoints.length - 1]);
      if (route.waypoints.length > 2) {
        setDestinations(route.waypoints.slice(1, -1).map(wp => ({
          id: nextDestId(),
          waypoint: wp,
          transportMode: wp.transportMode || 'driving',
          maxDrivingHours: 4,
          notes: '',
          calculated: false,
        })));
      }
    }
    setSetupDone(true);
  }, []);

  const DEPARTURE_GROUPS = [
    { label: 'Autónomo (sin vehículo)', codes: ['walking', 'bicycle'] },
    { label: 'Vehículo propio', codes: ['own_motorcycle', 'own_car', 'camper_van', 'car_caravan', 'own_boat', 'private_plane'] },
    { label: 'Vehículo contratado', codes: ['rental_bicycle', 'rental_motorcycle', 'rental_car', 'rental_camper', 'rental_caravan', 'rental_boat'] },
    { label: 'Transporte público', codes: ['public_bus', 'train', 'airline', 'ferry'] },
    { label: 'Bajo demanda', codes: ['taxi'] },
  ];

  const HIRABLE_GROUPS = [
    { label: 'Vehículos de alquiler', codes: ['rental_bicycle', 'rental_motorcycle', 'rental_car', 'rental_camper', 'rental_caravan', 'rental_boat'] },
    { label: 'Transporte público', codes: ['public_bus', 'train', 'airline', 'ferry'] },
    { label: 'Bajo demanda', codes: ['taxi'] },
  ];

  const userModeSet = new Set(availableTransportModes.map(m => m.code));

  // Total stats
  const returnDist = isRoundTrip ? returnStage.distance : 0;
  const returnDur = isRoundTrip ? returnStage.duration : 0;
  const totalDistance = destinations.reduce((s, d) => s + (d.segmentDistance || 0), 0) + returnDist;
  const totalDuration = destinations.reduce((s, d) => s + (d.segmentDuration || 0), 0) + returnDur;
  const hasAnyCalculated = destinations.some(d => d.calculated) || returnStage.calculated;

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
            {/* Departure mode - 5 groups */}
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Car className="w-4 h-4 text-primary" />
                  ¿Cómo inicias tu viaje?
                </Label>
                <p className="text-xs text-muted-foreground">Selecciona tu medio de salida.</p>
              </div>
              {allTransportModes.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">Cargando...</p>
              ) : (
                DEPARTURE_GROUPS.map(group => {
                  const modesInGroup = group.codes
                    .map(code => allTransportModes.find(m => m.code === code))
                    .filter(Boolean)
                    .filter(m => userModeSet.has(m!.code)) as typeof allTransportModes;
                  if (modesInGroup.length === 0) return null;
                  return (
                    <div key={group.label} className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {modesInGroup.map(mode => (
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
                    </div>
                  );
                })
              )}
            </div>

            <Separator />

            {/* Accepted modes during trip */}
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Shuffle className="w-4 h-4 text-primary" />
                  ¿Qué aceptas usar en ruta?
                </Label>
                <p className="text-xs text-muted-foreground">Medios que contratarías durante el viaje.</p>
              </div>
              {HIRABLE_GROUPS.map(group => {
                const modesInGroup = group.codes
                  .map(code => allTransportModes.find(m => m.code === code))
                  .filter(Boolean) as typeof allTransportModes;
                if (modesInGroup.length === 0) return null;
                return (
                  <div key={group.label} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {modesInGroup.map(mode => {
                        const isAccepted = acceptedModes.has(mode.code);
                        return (
                          <button
                            key={mode.code}
                            onClick={() => setAcceptedModes(prev => {
                              const next = new Set(prev);
                              if (next.has(mode.code)) next.delete(mode.code);
                              else next.add(mode.code);
                              return next;
                            })}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-left text-sm transition-colors ${
                              isAccepted
                                ? 'border-primary bg-primary/10 text-primary font-medium'
                                : 'border-border bg-card hover:bg-muted/50 text-foreground'
                            }`}
                          >
                            {renderTransportModeIcon(mode.code, mode.icon, 'w-4 h-4')}
                            <span className="truncate text-xs">{mode.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <Separator />
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-primary" />
                Color del trazo
              </Label>
              <div className="flex flex-wrap gap-2">
                {ROUTE_PALETTE.map(c => {
                  const isSelected = outboundColor === c.hex;
                  const lighter = lightenColor(c.hex);
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setOutboundColor(c.hex)}
                      className={`w-8 h-8 rounded-full border-2 transition-all overflow-hidden ${isSelected ? 'border-foreground scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                      title={c.name}
                      style={{ background: isRoundTrip
                        ? `linear-gradient(135deg, ${c.hex} 50%, ${lighter} 50%)`
                        : c.hex
                      }}
                    />
                  );
                })}
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

      {/* Content */}
      <ScrollArea className="flex-1">
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

          {/* Destinations list - each one auto-creates a stage */}
          <AnimatePresence>
            {destinations.map((dest, idx) => {
              const isExpanded = expandedDest === dest.id;
              const isCalcThis = calculatingIdx === idx;
              const prevName = idx === 0 ? departurePoint?.name || '...' : destinations[idx - 1].waypoint.name;
              const selfPowered = SELF_POWERED_MODES.has(dest.transportMode);
              const overLimit = dest.calculated && selfPowered && (dest.segmentDuration || 0) > dest.maxDrivingHours * 3600;

              return (
                <div
                  key={dest.id}
                  className="space-y-0"
                >
                  {/* Stage connector line */}
                  <div className="flex items-center gap-2 px-2 py-0.5">
                    <div className="w-6 flex justify-center">
                      <div className="w-0.5 h-4 bg-border" />
                    </div>
                    <div className="flex items-center gap-1 flex-1">
                      <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${overLimit ? 'border-destructive text-destructive' : ''}`}>
                        Etapa {idx + 1}
                      </Badge>
                      {/* Transport mode selector inline */}
                      <div className="flex items-center bg-muted rounded-full px-0.5 shrink-0">
                        {TRANSPORT_MODES.map(mode => {
                          const ModeIcon = mode.icon;
                          const isActive = dest.transportMode === mode.value;
                          return (
                            <button key={mode.value}
                              className={`p-0.5 rounded-full transition-colors ${isActive ? 'bg-background shadow-sm ' + mode.color : 'text-muted-foreground/50 hover:text-foreground'}`}
                              onClick={() => updateDestTransport(dest.id, mode.value)}>
                              <ModeIcon className="w-3 h-3" />
                            </button>
                          );
                        })}
                      </div>
                      {dest.calculated && (
                        <span className="text-[8px] text-muted-foreground ml-auto">
                          {formatDistance(dest.segmentDistance || 0)} · {formatDuration(dest.segmentDuration || 0)}
                        </span>
                      )}
                      {overLimit && <span className="text-[9px] text-destructive">⚠️</span>}
                    </div>
                  </div>

                  {/* Destination card */}
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIdx(idx); }}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 p-2 rounded-lg border transition-colors cursor-pointer ${
                      dragOverIdx === idx && dragState?.fromIdx !== idx
                        ? 'bg-primary/10 border-primary/40'
                        : dragState?.fromIdx === idx
                        ? 'opacity-50 bg-muted/30 border-border/30'
                        : overLimit
                        ? 'border-destructive/40 bg-destructive/5'
                        : 'bg-card border-border/40 hover:bg-muted/30'
                    }`}
                    onClick={() => { if (!isDraggingRef.current) setExpandedDest(isExpanded ? null : dest.id); }}
                  >
                    <GripVertical className="w-3 h-3 cursor-grab active:cursor-grabbing text-muted-foreground shrink-0" />
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[9px] text-primary-foreground font-bold shrink-0">
                      {idx + 1}
                    </div>
                    <span className="text-xs font-medium truncate flex-1 min-w-0">{dest.waypoint.name}</span>

                    <div className="flex items-center gap-0.5 shrink-0">
                      {idx > 0 && (
                        <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); moveDestination(idx, 'up'); }}>
                          <ChevronUp className="w-3 h-3" />
                        </button>
                      )}
                      {idx < destinations.length - 1 && (
                        <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); moveDestination(idx, 'down'); }}>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      )}
                      <button className="p-0.5 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeDestination(dest.id); }}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-3 py-2 space-y-2 border-x border-b border-border/40 rounded-b-lg -mt-1 bg-muted/10"
                    >
                      <div className="text-[10px] text-muted-foreground italic">
                        Desde: {prevName} → {dest.waypoint.name}
                      </div>

                      {/* Max driving hours (only for self-powered) */}
                      {selfPowered && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-[10px] text-muted-foreground shrink-0">Máx:</span>
                          <Slider
                            value={[dest.maxDrivingHours]}
                            onValueChange={(v) => updateDestMaxHours(dest.id, v[0])}
                            min={1} max={12} step={0.5}
                            className="flex-1"
                          />
                          <span className="text-[10px] font-medium tabular-nums w-8 text-right">{dest.maxDrivingHours}h</span>
                        </div>
                      )}

                      <Input
                        placeholder="Notas de esta etapa..."
                        value={dest.notes}
                        onChange={(e) => { e.stopPropagation(); updateDestNotes(dest.id, e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 text-[10px]"
                      />

                      <Button variant="secondary" size="sm" className="h-6 text-[10px] w-full"
                        disabled={isCalcThis || !departurePoint}
                        onClick={(e) => { e.stopPropagation(); calculateSingleStage(idx); }}>
                        {isCalcThis ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RouteIcon className="w-3 h-3 mr-1" />}
                        Calcular etapa
                      </Button>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </AnimatePresence>

          {/* Round trip toggle */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded-lg">
            <Label className="text-xs font-medium flex items-center gap-1.5 cursor-pointer" htmlFor="round-trip-toggle">
              <Navigation className="w-3.5 h-3.5 text-primary" />
              Ida y vuelta
            </Label>
            <button
              id="round-trip-toggle"
              onClick={() => setIsRoundTrip(prev => !prev)}
              className={`relative w-9 h-5 rounded-full transition-colors ${isRoundTrip ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isRoundTrip ? 'translate-x-4' : ''}`} />
            </button>
          </div>

          {isRoundTrip && (
            <>
              {/* Avoid same route toggle */}
              <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded-lg">
                <Label className="text-xs font-medium flex items-center gap-1.5 cursor-pointer" htmlFor="alt-route-toggle">
                  <Shuffle className="w-3.5 h-3.5 text-primary" />
                  Evitar misma ruta de vuelta
                </Label>
                <button
                  id="alt-route-toggle"
                  onClick={() => setAvoidSameRoute(prev => !prev)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${avoidSameRoute ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${avoidSameRoute ? 'translate-x-4' : ''}`} />
                </button>
              </div>

              {/* Return color preview */}
              <div className="flex items-center gap-2 px-2 py-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-1 rounded-full" style={{ backgroundColor: outboundColor }} />
                  <span className="text-[9px] text-muted-foreground">Ida</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-1 rounded-full" style={{ backgroundColor: returnColor }} />
                  <span className="text-[9px] text-muted-foreground">Vuelta</span>
                </div>
              </div>

              {/* Return stage connector */}
              {returnPoint && destinations.length > 0 && (
                <div className="flex items-center gap-2 px-2 py-0.5">
                  <div className="w-6 flex justify-center">
                    <div className="w-0.5 h-4 bg-border" />
                  </div>
                  <div className="flex items-center gap-1 flex-1">
                    <Badge variant="outline" className="text-[8px] px-1.5 py-0">
                      Etapa {destinations.length + 1}
                    </Badge>
                    <div className="flex items-center bg-muted rounded-full px-0.5 shrink-0">
                      {TRANSPORT_MODES.map(mode => {
                        const ModeIcon = mode.icon;
                        const isActive = returnTransport === mode.value;
                        return (
                          <button key={mode.value}
                            className={`p-0.5 rounded-full transition-colors ${isActive ? 'bg-background shadow-sm ' + mode.color : 'text-muted-foreground/50 hover:text-foreground'}`}
                            onClick={() => setReturnTransport(mode.value)}>
                            <ModeIcon className="w-3 h-3" />
                          </button>
                        );
                      })}
                    </div>
                    {returnStage.calculated && (
                      <span className="text-[8px] text-muted-foreground ml-auto">
                        {formatDistance(returnStage.distance)} · {formatDuration(returnStage.duration)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Return point */}
              <div className={`flex items-center gap-2 p-2 rounded-lg border ${returnPoint ? 'bg-muted/30 border-border/40' : 'border-2 border-dashed border-red-500/40 bg-red-500/5'}`}>
                <div className="flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold shrink-0" style={{ backgroundColor: returnColor }}>R</div>
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
            </>
          )}

          {/* Add destination button */}
          {departurePoint && (
            <Button
              variant="outline"
              className="w-full border-dashed h-9 text-xs"
              onClick={() => openPicker({ type: 'destination', insertIndex: destinations.length })}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Añadir destino
            </Button>
          )}

          {/* Empty state */}
          {destinations.length === 0 && departurePoint && (
            <div className="text-center py-4 text-muted-foreground">
              <Navigation className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Añade destinos a tu viaje</p>
              <p className="text-[10px]">Las etapas se crearán automáticamente entre cada punto</p>
            </div>
          )}
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
        {hasAnyCalculated && (
          <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1">
              <RouteIcon className="w-3.5 h-3.5" />
              <span>{formatDistance(totalDistance)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDuration(totalDuration)}</span>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {destinations.length + (returnPoint ? 1 : 0)} etapa{destinations.length + (returnPoint ? 1 : 0) !== 1 ? 's' : ''}
            </Badge>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1"
            onClick={calculateAll}
            disabled={destinations.length === 0 || calculating || calculatingIdx !== null}>
            {calculating || calculatingIdx !== null
              ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
              : <RouteIcon className="w-4 h-4 mr-1" />}
            Calcular todo
          </Button>

          <Button size="sm" onClick={handleSave}
            disabled={!departurePoint || destinations.length === 0 || !routeName.trim() || isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
