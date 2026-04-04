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
 ArrowDown,
 Navigation,
 Home,
 Search,
 Globe,
 Compass,
 Sparkles,
 ChevronDown,
 ChevronUp,
 DollarSign,
 Copy,
  Pencil,
  Repeat,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import {
 Tooltip,
 TooltipContent,
 TooltipTrigger,
} from '@/components/ui/tooltip';
import { useRoutes, RouteWaypoint, Route } from '@/hooks/use-routes';
import { useTravelAdvisor, RouteAlternative } from '@/hooks/use-travel-advisor';
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

interface RouteBuilderProps {
 onClose: () => void;
 onRouteCalculated?: (segments: any[]) => void;
 onWaypointsChanged?: (waypoints: RouteWaypoint[]) => void;
 editRouteId?: string;
}

export function RouteBuilder({ onClose, onRouteCalculated, onWaypointsChanged, editRouteId }: RouteBuilderProps) {
 const { routes, loading: routesLoading, calculating, saveRoute, calculateRoute } = useRoutes();
 const { user } = useAuth();
 const getAllLocations = useLocationsStore(state => state.getAllLocations);
 const [userTravelProfile, setUserTravelProfile] = useState<string>('adventure');
 const [userExcludedModes, setUserExcludedModes] = useState<string[]>([]);
 const [userAvailableModes, setUserAvailableModes] = useState<string[]>([]);

  // Convert priority ranking to weights
 const rankingToWeights = useCallback((ranking: string[]): Record<string, number> => {
 const weights: Record<string, number> = {};
 const total = ranking.length;
 ranking.forEach((code, idx) => {
      // Rank 1 = highest weight (3.0), last = lowest (0.5)
 weights[code] = Math.max(0.5, 3.0 - (idx * 2.5 / (total - 1)));
 });
 return weights;
 }, []);

  // Load user's travel profile, priority ranking, and available transport modes
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
      // Apply priority ranking as weights
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
      // Build available transport modes for setup — only OWNED vehicles, not services
  const OWNED_VEHICLE_CODES = new Set([
  'own_car', 'rental_car', 'own_motorcycle', 'rental_motorcycle',
  'camper_van', 'car_caravan',
  'bicycle', 'own_boat', 'rental_boat', 'walking',
  ]);
  if (allModesRes.data) {
  setAllTransportModes(allModesRes.data as any);
  const userCodes = modesRes.data ? new Set(modesRes.data.map(m => m.transport_mode_code)) : null;
  const ownedModes = allModesRes.data.filter(m => OWNED_VEHICLE_CODES.has(m.code) && !m.is_complementary);
  const filtered = userCodes && userCodes.size > 0
  ? ownedModes.filter(m => userCodes.has(m.code))
  : ownedModes;
  setAvailableTransportModes(filtered as any);
  const serviceModes = allModesRes.data.filter(m => !OWNED_VEHICLE_CODES.has(m.code));
  setAcceptedTripModes(new Set(serviceModes.map(m => m.code)));
  }
      // If user has selected specific modes, exclude all others
 if (modesRes.data && modesRes.data.length > 0 && allModesRes.data) {
 const availableCodes = new Set(modesRes.data.map(m => m.transport_mode_code));
 setUserAvailableModes(modesRes.data.map(m => m.transport_mode_code));
 const excluded = allModesRes.data
 .map(m => m.code)
 .filter(code => !availableCodes.has(code));
 setUserExcludedModes(excluded);
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

  // Apply user's excluded and owned modes to advisor
 useEffect(() => {
 if (userExcludedModes.length > 0) {
 setExcludedModes(userExcludedModes);
 }
 if (userAvailableModes.length > 0) {
      // Owned vehicles are the available modes that are physical vehicles (not services)
 const ownedVehicleCodes = ['own_car', 'rental_car', 'own_motorcycle', 'rental_motorcycle', 'camper_van', 'car_caravan', 'bicycle', 'own_boat', 'rental_boat'];
 const owned = userAvailableModes.filter(code => ownedVehicleCodes.includes(code));
 setUserOwnedModes(owned);
 }
 }, [userExcludedModes, userAvailableModes, setExcludedModes, setUserOwnedModes]);

 const [routeName, setRouteName] = useState('');
 const [routeDescription, setRouteDescription] = useState('');
 const [waypoints, setWaypoints] = useState<RouteWaypoint[]>([]);
 const [segments, setSegments] = useState<any[]>([]);
 const [totalDistance, setTotalDistance] = useState(0);
 const [totalDuration, setTotalDuration] = useState(0);
 const [isSaving, setIsSaving] = useState(false);
 const [showLocationPicker, setShowLocationPicker] = useState(false);
 const [pickerTarget, setPickerTarget] = useState<'origin' | 'destination' | 'intermediate'>('intermediate');
 const [searchQuery, setSearchQuery] = useState('');
 const [isCalculated, setIsCalculated] = useState(false);
 const [homeLocation, setHomeLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
 const [geoResults, setGeoResults] = useState<ForwardGeocodeResult[]>([]);
 const [searchingGeo, setSearchingGeo] = useState(false);
 const geoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showAdvisor, setShowAdvisor] = useState(false);
  const [routeTab, setRouteTab] = useState<'outbound' | 'return'>('outbound');
  const [stageStopMeta, setStageStopMeta] = useState<Record<string, { notes: string; restHours: number }>>({});
  const [editingStopIdx, setEditingStopIdx] = useState<number | null>(null);

   // Intermodal state
  const [intermodalCheck, setIntermodalCheck] = useState<{
    originIdx: number;
    destIdx: number;
    originName: string;
    originLat: number;
    originLng: number;
    destName: string;
    destLat: number;
    destLng: number;
  } | null>(null);

   // Setup phase state
  const [setupDone, setSetupDone] = useState(!!editRouteId);
   const [primaryVehicle, setPrimaryVehicle] = useState<string>('');
    const [tripType, setTripType] = useState<'one_way' | 'round_trip'>('one_way');

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

    const deriveReturnColor = (hex: string): string => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      // Lighten by ~35% toward white and shift hue slightly
      const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * 0.4));
      return `#${mix(r).toString(16).padStart(2,'0')}${mix(g).toString(16).padStart(2,'0')}${mix(b).toString(16).padStart(2,'0')}`;
    };

    const [outboundColor, setOutboundColor] = useState('#2563eb');
    const returnColor = deriveReturnColor(outboundColor);
    const [maxDrivingHours, setMaxDrivingHours] = useState(4);
  const [availableTransportModes, setAvailableTransportModes] = useState<{ code: string; name: string; icon: string; sub_category: string; is_complementary: boolean; category: string }[]>([]);
  const [allTransportModes, setAllTransportModes] = useState<{ code: string; name: string; icon: string; sub_category: string; is_complementary: boolean; category: string }[]>([]);
  const [acceptedTripModes, setAcceptedTripModes] = useState<Set<string>>(new Set());

  // Load home location from profile
 useEffect(() => {
 if (!user) return;
 supabase
 .from('profiles')
 .select('home_latitude, home_longitude, home_name')
 .eq('id', user.id)
 .maybeSingle()
 .then(({ data }) => {
 if (data?.home_latitude && data?.home_longitude) {
 setHomeLocation({
 lat: data.home_latitude,
 lng: data.home_longitude,
 name: data.home_name || 'Casa',
 });
 }
 });
 }, [user]);

  // Load existing route if editing
 useEffect(() => {
 if (editRouteId) {
 const route = routes.find(r => r.id === editRouteId);
 if (route) {
 setRouteName(route.name);
 setRouteDescription(route.description || '');
  setWaypoints(route.waypoints.map((wp, idx) => ({ ...wp, position: idx })));
 }
 }
  }, [editRouteId, routes]);

   // Notify parent of waypoint changes
  useEffect(() => {
  onWaypointsChanged?.(waypoints);
  }, [waypoints, onWaypointsChanged]);


 const allLocations = getAllLocations();

 const filteredLocations = searchQuery.trim()
 ? allLocations.filter(loc =>
  loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
  (loc.description || '').toLowerCase().includes(searchQuery.toLowerCase())
 ).slice(0, 20)
 : allLocations.slice(0, 20);

 const areWaypointsEquivalent = useCallback((a: RouteWaypoint, b: RouteWaypoint) => {
  const sameLocationId = a.locationId && b.locationId && a.locationId === b.locationId;
  const sameName = a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
  const closeEnough = Math.abs(a.latitude - b.latitude) < 0.02 && Math.abs(a.longitude - b.longitude) < 0.02;
  return Boolean(sameLocationId || closeEnough || (sameName && closeEnough));
 }, []);

 const stripRoundTripWaypoints = useCallback((waypointsToNormalize: RouteWaypoint[]) => {
  const inputNames = waypointsToNormalize.map(w => w.name);
  if (waypointsToNormalize.length < 3) {
   const result = waypointsToNormalize.map((wp, idx) => ({ ...wp, position: idx }));
   console.log('[strip] <3 items, passthrough', { inputNames, outputNames: result.map(w => w.name) });
   return result;
  }

  for (let outboundLength = Math.ceil(waypointsToNormalize.length / 2); outboundLength >= 2; outboundLength -= 1) {
   const outbound = waypointsToNormalize.slice(0, outboundLength);
   const rebuilt = [...outbound, ...outbound.slice(0, -1).reverse()];

   if (
    rebuilt.length === waypointsToNormalize.length &&
    rebuilt.every((wp, idx) => areWaypointsEquivalent(wp, waypointsToNormalize[idx]))
   ) {
    const result = outbound.map((wp, idx) => ({ ...wp, position: idx }));
    console.log('[strip] DETECTED round trip pattern, stripped', { inputNames, outboundLength, outputNames: result.map(w => w.name) });
    return result;
   }
  }

  const result = waypointsToNormalize.map((wp, idx) => ({ ...wp, position: idx }));
  console.log('[strip] no pattern found, passthrough', { inputNames, outputNames: result.map(w => w.name) });
  return result;
 }, [areWaypointsEquivalent]);

  // Build full waypoints array with return leg for calculation only (not stored in state)
  const buildCalculationWaypoints = useCallback((baseWaypoints: RouteWaypoint[]) => {
    if (tripType !== 'round_trip' || baseWaypoints.length < 2) {
      return baseWaypoints;
    }
    const returnLeg = baseWaypoints
      .slice(0, -1)
      .reverse()
      .map((wp, idx) => ({
        ...wp,
        id: undefined,
        position: baseWaypoints.length + idx,
        preferAlternative: true,
      }));
    return [...baseWaypoints, ...returnLeg].map((wp, idx) => ({ ...wp, position: idx }));
  }, [tripType]);

  // For normalizing stored waypoints — just strip any old return leg, never add one
  const normalizeWaypointsForTripType = useCallback((nextWaypoints: RouteWaypoint[]) => {
    const stripped = stripRoundTripWaypoints(nextWaypoints);
    return stripped.map((wp, idx) => ({ ...wp, position: idx }));
  }, [stripRoundTripWaypoints]);

  // Re-normalize waypoints when tripType changes (strip or add return leg)
  useEffect(() => {
  setWaypoints(prev => {
    return normalizeWaypointsForTripType(prev);
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripType]);

  // Track which segment pairs have already been resolved for intermodal
  const resolvedIntermodalRef = useRef<Set<string>>(new Set());

   // Check ALL segments for intermodal needs, starting from a given index
  const checkIntermodal = useCallback((updatedWaypoints: RouteWaypoint[], startFromIdx = 0) => {
    const outboundWaypoints = stripRoundTripWaypoints(updatedWaypoints);
    if (outboundWaypoints.length < 2) return;
    const R = 6371;
    for (let i = Math.max(startFromIdx, 0); i < outboundWaypoints.length - 1; i++) {
      const wp = outboundWaypoints[i];
      const next = outboundWaypoints[i + 1];
      // Skip segments that already have non-driving transport (user already chose flight/ferry)
      if (next.transportMode === 'flight' || next.transportMode === 'ferry') continue;
      // Skip already resolved pairs
      const pairKey = `${wp.latitude.toFixed(4)},${wp.longitude.toFixed(4)}->${next.latitude.toFixed(4)},${next.longitude.toFixed(4)}`;
      if (resolvedIntermodalRef.current.has(pairKey)) continue;
      // Haversine check — trigger for segments > 100km direct
      const dLat = (next.latitude - wp.latitude) * Math.PI / 180;
      const dLng = (next.longitude - wp.longitude) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(wp.latitude*Math.PI/180)*Math.cos(next.latitude*Math.PI/180)*Math.sin(dLng/2)**2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      if (dist > 100) {
        setIntermodalCheck({
          originIdx: i,
          destIdx: i + 1,
          originName: wp.name,
          originLat: wp.latitude,
          originLng: wp.longitude,
          destName: next.name,
          destLat: next.latitude,
          destLng: next.longitude,
        });
        return; // Show one at a time
      }
    }
  }, [stripRoundTripWaypoints]);

  const handleIntermodalSelect = useCallback((segments: { name: string; lat: number; lng: number; transportMode: 'driving' | 'walking' | 'flight' | 'ferry' }[]) => {
    if (!intermodalCheck) return;
    const { originIdx, destIdx } = intermodalCheck;
    // Mark this pair as resolved
    resolvedIntermodalRef.current.add(
      `${intermodalCheck.originLat.toFixed(4)},${intermodalCheck.originLng.toFixed(4)}->${intermodalCheck.destLat.toFixed(4)},${intermodalCheck.destLng.toFixed(4)}`
    );
    setWaypoints(prev => {
      const baseWaypoints = stripRoundTripWaypoints(prev);
      const before = baseWaypoints.slice(0, originIdx + 1);
      const after = baseWaypoints.slice(destIdx);
      const intermodalWps: RouteWaypoint[] = segments.map((seg) => ({
        position: 0,
        name: seg.name,
        latitude: seg.lat,
        longitude: seg.lng,
        transportMode: seg.transportMode,
      }));
      const updated = [...before, ...intermodalWps.slice(0, -1), ...after];
      const normalized = normalizeWaypointsForTripType(updated);
      // Continue checking remaining segments after a short delay
      setTimeout(() => checkIntermodal(normalized, originIdx + intermodalWps.length), 200);
      return normalized;
    });
    setIntermodalCheck(null);
    setIsCalculated(false);
  }, [intermodalCheck, normalizeWaypointsForTripType, stripRoundTripWaypoints]);

 const addWaypointFromLocation = useCallback((loc: GeoLocation, target: 'origin' | 'destination' | 'intermediate') => {
   const newWp: RouteWaypoint = {
    locationId: loc.id,
    position: 0,
    name: loc.name,
    latitude: loc.coordinates.lat,
    longitude: loc.coordinates.lng,
    transportMode: 'driving',
   };
   setWaypoints(prev => {
    const baseWaypoints = stripRoundTripWaypoints(prev);
    let updated: RouteWaypoint[];
    if (target === 'origin') {
     updated = [newWp, ...baseWaypoints];
    } else if (target === 'destination') {
     updated = [...baseWaypoints, newWp];
    } else {
     if (baseWaypoints.length >= 2) {
      updated = [...baseWaypoints.slice(0, -1), newWp, baseWaypoints[baseWaypoints.length - 1]];
     } else {
      updated = [...baseWaypoints, newWp];
     }
    }
     const result = updated.map((wp, idx) => ({ ...wp, position: idx }));
     console.log('[RouteBuilder] addWaypointFromLocation', { target, prevLen: prev.length, baseLen: baseWaypoints.length, updatedLen: updated.length, resultLen: result.length, resultNames: result.map(w => w.name) });
    // Check for intermodal after adding destination or intermediate
    if (target !== 'origin') {
      setTimeout(() => checkIntermodal(result), 100);
    }
    return result;
   });
   setShowLocationPicker(false);
   setSearchQuery('');
   setIsCalculated(false);
   }, [stripRoundTripWaypoints, checkIntermodal]);

 const addHomeAsWaypoint = useCallback((target: 'origin' | 'destination') => {
  if (!homeLocation) return;
  const newWp: RouteWaypoint = {
   position: 0,
   name: homeLocation.name,
   latitude: homeLocation.lat,
   longitude: homeLocation.lng,
   transportMode: 'driving',
  };
  setWaypoints(prev => {
   const baseWaypoints = stripRoundTripWaypoints(prev);
   const updated = target === 'origin' ? [newWp, ...baseWaypoints] : [...baseWaypoints, newWp];
    const result = updated.map((wp, idx) => ({ ...wp, position: idx }));
    console.log('[RouteBuilder] addHomeAsWaypoint', { target, prevLen: prev.length, baseLen: baseWaypoints.length, resultLen: result.length, resultNames: result.map(w => w.name) });
    return result;
   });
   setIsCalculated(false);
   }, [homeLocation, stripRoundTripWaypoints]);

 const openPicker = useCallback((target: 'origin' | 'destination' | 'intermediate') => {
 setPickerTarget(target);
 setShowLocationPicker(true);
 setSearchQuery('');
 setGeoResults([]);
 }, []);

 const handlePickerSearch = useCallback((query: string) => {
 setSearchQuery(query);
 if (geoSearchTimer.current) clearTimeout(geoSearchTimer.current);
 if (query.trim().length < 3) {
 setGeoResults([]);
 return;
 }
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

 const addWaypointFromGeoResult = useCallback((result: ForwardGeocodeResult, target: 'origin' | 'destination' | 'intermediate') => {
  const newWp: RouteWaypoint = {
  position: 0,
  name: result.shortName,
  latitude: result.lat,
  longitude: result.lng,
  transportMode: 'driving',
  };
  setWaypoints(prev => {
  const baseWaypoints = stripRoundTripWaypoints(prev);
  let updated: RouteWaypoint[];
  if (target === 'origin') {
  updated = [newWp, ...baseWaypoints];
  } else if (target === 'destination') {
  updated = [...baseWaypoints, newWp];
  } else {
  if (baseWaypoints.length >= 2) {
  updated = [...baseWaypoints.slice(0, -1), newWp, baseWaypoints[baseWaypoints.length - 1]];
  } else {
  updated = [...baseWaypoints, newWp];
  }
  }
   const result2 = updated.map((wp, idx) => ({ ...wp, position: idx }));
   console.log('[RouteBuilder] addWaypointFromGeoResult', { target, prevLen: prev.length, baseLen: baseWaypoints.length, updatedLen: updated.length, resultLen: result2.length, resultNames: result2.map(w => w.name) });
  if (target !== 'origin') {
    setTimeout(() => checkIntermodal(result2), 100);
  }
  return result2;
  });
  setShowLocationPicker(false);
  setSearchQuery('');
  setGeoResults([]);
  setIsCalculated(false);
  }, [checkIntermodal, stripRoundTripWaypoints]);

 const removeWaypoint = useCallback((index: number) => {
 setWaypoints(prev => {
 const baseWaypoints = stripRoundTripWaypoints(prev);
 return normalizeWaypointsForTripType(baseWaypoints.filter((_, i) => i !== index));
 });
 setIsCalculated(false);
 setSegments([]);
 }, [normalizeWaypointsForTripType, stripRoundTripWaypoints]);

 const moveWaypoint = useCallback((fromIndex: number, direction: 'up' | 'down') => {
 const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
 setWaypoints(prev => {
 const updated = [...stripRoundTripWaypoints(prev)];
 [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
 return normalizeWaypointsForTripType(updated);
 });
 setIsCalculated(false);
 setSegments([]);
 }, [normalizeWaypointsForTripType, stripRoundTripWaypoints]);

 const handleDragStart = useCallback((idx: number) => {
 setDragIndex(idx);
 }, []);

 const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
 e.preventDefault();
 setDragOverIndex(idx);
 }, []);

 const handleDrop = useCallback((idx: number) => {
 if (dragIndex === null || dragIndex === idx) {
 setDragIndex(null);
 setDragOverIndex(null);
 return;
 }
 setWaypoints(prev => {
 const updated = [...stripRoundTripWaypoints(prev)];
 const [moved] = updated.splice(dragIndex, 1);
 updated.splice(idx, 0, moved);
 return normalizeWaypointsForTripType(updated);
 });
 setDragIndex(null);
 setDragOverIndex(null);
 setIsCalculated(false);
 setSegments([]);
 }, [dragIndex, normalizeWaypointsForTripType, stripRoundTripWaypoints]);

 const updateTransportMode = useCallback((index: number, mode: RouteWaypoint['transportMode']) => {
 setWaypoints(prev => {
 const baseWaypoints = stripRoundTripWaypoints(prev);
 const updated = baseWaypoints.map((wp, i) => i === index ? { ...wp, transportMode: mode } : wp);
 return normalizeWaypointsForTripType(updated);
 });
 setIsCalculated(false);
 setSegments([]);
 }, [normalizeWaypointsForTripType, stripRoundTripWaypoints]);

  const handleCalculate = useCallback(async () => {
   if (waypoints.length < 2) return;
   const calcWaypoints = buildCalculationWaypoints(waypoints);
   const result = await calculateRoute(calcWaypoints);
    if (result) {
      const outboundSegCount = waypoints.length - 1;
       const markedSegments = result.segments.map((seg: any, i: number) => ({
        ...seg,
        isReturnLeg: seg.isReturnLeg === true || (tripType === 'round_trip' && i >= outboundSegCount),
        routeColor: (seg.isReturnLeg === true || (tripType === 'round_trip' && i >= outboundSegCount)) ? returnColor : outboundColor,
       }));

      // --- Auto-split: find stage break points along geometry ---
      const maxSeconds = maxDrivingHours * 3600;
      let accumulatedDuration = 0;
      let stageNum = 1;
      const stageBreakCoords: { lat: number; lng: number; afterSegIdx: number }[] = [];

      for (let i = 0; i < markedSegments.length; i++) {
        const segDuration = markedSegments[i].duration || 0;
        const segCoords = markedSegments[i].geometry?.coordinates || [];

        if (accumulatedDuration + segDuration >= maxSeconds && segCoords.length >= 2 && i < markedSegments.length - 1) {
          const remainingTime = maxSeconds - accumulatedDuration;
          const fraction = segDuration > 0 ? Math.min(remainingTime / segDuration, 1) : 0.5;
          const coordIdx = Math.min(Math.floor(fraction * (segCoords.length - 1)), segCoords.length - 1);
          const coord = segCoords[coordIdx];
          if (coord && Array.isArray(coord) && coord.length >= 2) {
            stageBreakCoords.push({ lat: coord[1], lng: coord[0], afterSegIdx: i });
          }
          stageNum++;
          accumulatedDuration = segDuration - remainingTime;
        } else {
          accumulatedDuration += segDuration;
        }
        markedSegments[i].stageNumber = stageNum;
      }

      const stages = stageBreakCoords.map((c, idx) => ({
        stageNumber: idx + 1,
        segmentIndex: c.afterSegIdx,
        cumulativeDuration: maxSeconds,
      }));
      (markedSegments as any)._stageBreaks = stages;

     setSegments(markedSegments);
    setTotalDistance(result.totalDistance);
    setTotalDuration(result.totalDuration);
    setIsCalculated(true);
     onRouteCalculated?.(markedSegments);

      // If there are stage breaks, reverse geocode them and auto-insert as waypoints
      // But skip if waypoints already contain stage stops (avoid duplicates on recalculate)
      const existingStops = waypoints.some(wp => wp.name.startsWith('🛏️'));
      if (stageBreakCoords.length > 0 && !existingStops) {
        const newStops: { name: string; lat: number; lng: number }[] = [];
        for (const coord of stageBreakCoords) {
          try {
            const resp = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coord.lat}&lon=${coord.lng}&zoom=10&addressdetails=1`,
              { headers: { 'Accept-Language': 'es', 'User-Agent': 'VANDITS/1.0' } }
            );
            const data = await resp.json();
            const city = data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || data.display_name?.split(',')[0] || 'Parada';
            newStops.push({ name: `🛏️ ${city}`, lat: coord.lat, lng: coord.lng });
            await new Promise(r => setTimeout(r, 1100));
          } catch {
            newStops.push({ name: `🛏️ Parada etapa`, lat: coord.lat, lng: coord.lng });
          }
        }

        if (newStops.length > 0) {
          setWaypoints(prev => {
            const base = stripRoundTripWaypoints(prev);
            const withStops = [...base];
            let offset = 0;
            for (let s = 0; s < newStops.length; s++) {
              const insertAfter = stageBreakCoords[s].afterSegIdx + 1 + offset;
              const stopWp: RouteWaypoint = {
                position: 0,
                name: newStops[s].name,
                latitude: newStops[s].lat,
                longitude: newStops[s].lng,
                transportMode: 'driving',
              };
              withStops.splice(insertAfter, 0, stopWp);
              offset++;
            }
            return normalizeWaypointsForTripType(withStops);
          });
          toast.success(`${newStops.length} parada(s) de etapa añadida(s) automáticamente`);
        }
      }
    }
   }, [waypoints, calculateRoute, onRouteCalculated, buildCalculationWaypoints, tripType, maxDrivingHours, outboundColor, returnColor, stripRoundTripWaypoints, normalizeWaypointsForTripType]);

  const handleSave = useCallback(async () => {
  if (!routeName.trim()) return;
  if (!isCalculated) await handleCalculate();
  setIsSaving(true);
  // Save full waypoints (including return leg) so the route can be displayed later
  const fullWaypoints = buildCalculationWaypoints(waypoints);
  await saveRoute(routeName, fullWaypoints, segments, totalDistance, totalDuration, routeDescription || undefined);
  setIsSaving(false);
  onClose();
  }, [routeName, routeDescription, waypoints, segments, totalDistance, totalDuration, isCalculated, handleCalculate, saveRoute, onClose, buildCalculationWaypoints]);

 const hasOrigin = waypoints.length >= 1;
 const hasDestination = waypoints.length >= 2;

  // Clone an existing route
 const cloneRoute = useCallback((route: Route) => {
  setRouteName(`${route.name} (copia)`);
  setRouteDescription(route.description || '');
  const clonedWaypoints = route.waypoints.map((wp, i) => ({
   ...wp,
   id: undefined,
   position: i,
   transportMode: primaryVehicle 
   ? (primaryVehicle === 'walking' || primaryVehicle === 'driving' || primaryVehicle === 'flight' || primaryVehicle === 'ferry'
   ? primaryVehicle as RouteWaypoint['transportMode']
   : 'driving')
   : wp.transportMode,
  }));
   setWaypoints(normalizeWaypointsForTripType(clonedWaypoints));
   setSetupDone(true);
   setIsCalculated(false);
  }, [primaryVehicle, normalizeWaypointsForTripType]);

  // Section 1: User's OWNED vehicles only (from their inventory)
  const ownedVehiclesList = availableTransportModes
    .map(m => allTransportModes.find(am => am.code === m.code))
    .filter(Boolean) as typeof allTransportModes;

  // Section 2: ALL non-complementary modes except the selected primary vehicle
  const excludableModes = allTransportModes
    .filter(m => !m.is_complementary && m.code !== primaryVehicle);

  const CATEGORY_ORDER: Record<string, number> = {
    autonomous: 1, habitable: 2, collective: 3, maritime: 4, air: 5,
  };
  const CATEGORY_LABELS: Record<string, string> = {
    autonomous: 'Desplazamiento autónomo',
    habitable: 'Vehículos habitables',
    collective: 'Transporte colectivo',
    maritime: 'Transporte marítimo',
    air: 'Transporte aéreo',
  };

  const groupedExcludable = excludableModes.reduce((acc, mode) => {
    const cat = mode.sub_category || mode.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mode);
    return acc;
  }, {} as Record<string, typeof allTransportModes>);

  const sortedExcludableGroups = Object.entries(groupedExcludable)
    .sort(([a], [b]) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99));

  const toggleAcceptedMode = useCallback((code: string) => {
    setAcceptedTripModes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

   // Setup phase
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
  {/* Section 1: Departure vehicle */}
  <div className="space-y-2">
  <Label className="text-sm font-medium flex items-center gap-1.5">
  <Car className="w-4 h-4 text-primary" />
  ¿Con qué vehículo sales?
  </Label>
  <p className="text-xs text-muted-foreground">
  Elige con qué sales de casa. Deberás volver con él.
  </p>
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
  {allTransportModes.length === 0
  ? 'Cargando...'
  : 'No tienes vehículos configurados en tu perfil.'}
  </p>
  )}
  {primaryVehicle === '' && ownedVehiclesList.length > 0 && (
  <p className="text-[11px] text-muted-foreground italic">
  Sin selección = viajas sin vehículo propio.
  </p>
  )}
  </div>

  <Separator />

  {/* Section 2: Exclusions */}
  <div className="space-y-2">
  <Label className="text-sm font-medium flex items-center gap-1.5">
  <Compass className="w-4 h-4 text-primary" />
  ¿Hay algo que NO quieras usar?
  </Label>
  <p className="text-xs text-muted-foreground">
  Todo está aceptado por defecto. Toca para descartar.
  </p>
  <div className="space-y-3">
  {sortedExcludableGroups.map(([cat, modes]) => (
  <div key={cat} className="space-y-1">
  <p className="text-[11px] font-medium text-muted-foreground">
  {CATEGORY_LABELS[cat] || cat}
  </p>
  <div className="grid grid-cols-2 gap-1.5">
  {modes.map(mode => {
  const isAccepted = acceptedTripModes.has(mode.code);
  return (
  <button
  key={mode.code}
  onClick={() => toggleAcceptedMode(mode.code)}
  className={`flex items-center gap-2 p-2 rounded-lg border text-left text-sm transition-colors ${
  isAccepted
  ? 'border-border bg-card text-foreground hover:bg-muted/50'
  : 'border-destructive/30 bg-destructive/5 text-muted-foreground line-through'
  }`}
  >
  {renderTransportModeIcon(mode.code, mode.icon, 'w-4 h-4')}
  <span className="truncate text-xs">{mode.name}</span>
  </button>
  );
  })}
  </div>
  </div>
  ))}
  </div>
  </div>

  <Separator />

 {/* Trip type */}
 <div className="space-y-2">
  <Label className="text-sm font-medium flex items-center gap-1.5">
   <Repeat className="w-4 h-4 text-primary" />
   ¿Quieres usar la misma ruta para ir y volver?
  </Label>
  <p className="text-xs text-muted-foreground">
   Si eliges ida y vuelta, el punto final volverá a ser el mismo que el punto de inicio.
  </p>
  <div className="grid grid-cols-1 gap-1.5">
   <button
    onClick={() => setTripType('one_way')}
    className={`flex items-start gap-2 p-2.5 rounded-lg border text-left text-sm transition-colors ${
     tripType === 'one_way'
      ? 'border-primary bg-primary/10 text-primary font-medium'
      : 'border-border bg-card hover:bg-muted/50 text-foreground'
    }`}
   >
    <div>
     <p className="text-sm">Solo ida</p>
     <p className="text-[11px] text-muted-foreground">Origen y destino distintos</p>
    </div>
   </button>
    <button
     onClick={() => setTripType('round_trip')}
     className={`flex items-start gap-2 p-2.5 rounded-lg border text-left text-sm transition-colors ${
      tripType === 'round_trip'
       ? 'border-primary bg-primary/10 text-primary font-medium'
       : 'border-border bg-card hover:bg-muted/50 text-foreground'
     }`}
    >
     <div>
      <p className="text-sm">Ida y vuelta</p>
      <p className="text-[11px] text-muted-foreground">Se calcula el regreso por una ruta alternativa cuando sea posible</p>
     </div>
    </button>
  </div>
 </div>

  {/* Route colors */}
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
   <div className="flex items-center gap-3 mt-1">
    <div className="flex items-center gap-1.5">
     <span className="w-4 h-2 rounded-sm" style={{ backgroundColor: outboundColor }} />
     <span className="text-xs text-muted-foreground">Ida</span>
    </div>
    {tripType === 'round_trip' && (
     <div className="flex items-center gap-1.5">
      <span className="w-4 h-2 rounded-sm" style={{ backgroundColor: returnColor }} />
      <span className="text-xs text-muted-foreground">Vuelta</span>
     </div>
    )}
   </div>
  </div>

  {/* Max driving hours per stage */}
  <div className="space-y-2">
   <Label className="text-sm font-medium flex items-center gap-1.5">
    <Clock className="w-4 h-4 text-primary" />
    Horas de conducción por etapa
   </Label>
   <div className="flex items-center gap-3">
    <Slider
     value={[maxDrivingHours]}
     onValueChange={(v) => setMaxDrivingHours(v[0])}
     min={1}
     max={12}
     step={0.5}
     className="flex-1"
    />
    <span className="text-sm font-medium tabular-nums w-10 text-right">{maxDrivingHours}h</span>
   </div>
   <p className="text-[10px] text-muted-foreground">
    La ruta se dividirá en etapas de máximo {maxDrivingHours} horas
   </p>
  </div>

  <Separator />

 {/* Repeat existing route */}
 <div className="space-y-2">
 <Label className="text-sm font-medium flex items-center gap-1.5">
 <Copy className="w-4 h-4 text-primary" />
 ¿Repetir una ruta existente?
 </Label>
 <p className="text-xs text-muted-foreground">
 Puedes clonar una ruta anterior y modificarla
 </p>
 {routesLoading ? (
 <div className="flex items-center gap-2 py-3 justify-center text-muted-foreground">
 <Loader2 className="w-4 h-4 animate-spin" />
 <span className="text-xs">Cargando rutas...</span>
 </div>
 ) : routes.length > 0 ? (
 <div className="space-y-1">
 {routes.slice(0, 8).map(route => (
 <button
 key={route.id}
 onClick={() => cloneRoute(route)}
 className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/50 text-left transition-colors"
 >
 <RouteIcon className="w-4 h-4 text-muted-foreground shrink-0" />
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium truncate">{route.name}</p>
 <p className="text-[10px] text-muted-foreground">
 {route.waypoints.length} puntos
 {route.totalDistance ? ` · ${(route.totalDistance / 1000).toFixed(0)} km` : ''}
 </p>
 </div>
 <Badge variant="outline" className="text-[10px] shrink-0">Clonar</Badge>
 </button>
 ))}
 </div>
 ) : (
 <p className="text-xs text-muted-foreground italic py-2">
 No tienes rutas guardadas aún
 </p>
 )}
 </div>
 </div>
 </ScrollArea>

 {/* Continue button */}
 <div className="p-3 border-t border-border">
   <Button
    className="w-full"
     onClick={() => {
      setWaypoints(prev => normalizeWaypointsForTripType(prev));
      const rejected = allTransportModes
        .filter(m => !acceptedTripModes.has(m.code) && m.code !== primaryVehicle)
        .map(m => m.code);
      setExcludedModes([...new Set([...userExcludedModes, ...rejected])]);
      setSetupDone(true);
     }}
   >
    <Plus className="w-4 h-4 mr-1.5" />
     {tripType === 'round_trip'
      ? 'Crear ruta de ida y vuelta'
      : primaryVehicle ? 'Crear ruta' : 'Crear ruta sin vehículo propio'}
   </Button>
 </div>
 </div>
 );
 }

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
 {availableTransportModes.find(m => m.code === primaryVehicle)?.icon}{''}
 {availableTransportModes.find(m => m.code === primaryVehicle)?.name || primaryVehicle}
 </Badge>
 <Button
 variant="ghost"
 size="icon"
 className="h-5 w-5 ml-auto"
 onClick={() => { setSetupDone(false); }}
 >
 <Pencil className="w-3 h-3" />
 </Button>
 </div>
 )}
 <Input
 placeholder="Nombre del itinerario..."
 value={routeName}
 onChange={(e) => setRouteName(e.target.value)}
 className="text-sm"
 />
 <Input
 placeholder="Descripción (opcional)..."
 value={routeDescription}
 onChange={(e) => setRouteDescription(e.target.value)}
 className="text-sm"
 />
 </div>
 </div>

 {/* Origin & Destination slots */}
 <div className="px-3 pt-3 space-y-2">
 {/* Origin slot */}
 {!hasOrigin ? (
 <div className="flex items-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-green-500/40 bg-green-500/5">
 <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold shrink-0">
 A
 </div>
 <span className="text-sm text-muted-foreground flex-1">Punto de partida</span>
 <div className="flex gap-1">
 {homeLocation && (
 <Tooltip>
 <TooltipTrigger asChild>
 <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addHomeAsWaypoint('origin')}>
 <Home className="w-3.5 h-3.5" />
 Casa
 </Button>
 </TooltipTrigger>
 <TooltipContent>{homeLocation.name}</TooltipContent>
 </Tooltip>
 )}
 <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openPicker('origin')}>
 <MapPin className="w-3.5 h-3.5" />
 Elegir
 </Button>
 </div>
 </div>
 ) : null}

 {/* Destination slot (show when origin exists but no destination yet) */}
 {hasOrigin && !hasDestination ? (
 <div className="flex items-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-red-500/40 bg-red-500/5">
 <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold shrink-0">
 B
 </div>
 <span className="text-sm text-muted-foreground flex-1">Punto de destino</span>
 <div className="flex gap-1">
 {homeLocation && (
 <Tooltip>
 <TooltipTrigger asChild>
 <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addHomeAsWaypoint('destination')}>
 <Home className="w-3.5 h-3.5" />
 Casa
 </Button>
 </TooltipTrigger>
 <TooltipContent>{homeLocation.name}</TooltipContent>
 </Tooltip>
 )}
 <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openPicker('destination')}>
 <MapPin className="w-3.5 h-3.5" />
 Elegir
 </Button>
 </div>
 </div>
 ) : null}
 </div>

 {/* Waypoints list */}
  <ScrollArea className="flex-1">
  <div className="p-3 space-y-1">
  {waypoints.length === 0 && (
  <div className="text-center py-6 text-muted-foreground">
  <Navigation className="w-8 h-8 mx-auto mb-2 opacity-50" />
  <p className="text-sm">Selecciona un punto de partida</p>
  </div>
  )}

  {waypoints.length >= 2 && isCalculated && tripType === 'round_trip' && (
    <div className="flex gap-1 mb-2 bg-muted/50 rounded-lg p-0.5">
      <button
        onClick={() => setRouteTab('outbound')}
        className={`flex-1 text-xs py-1.5 px-2 rounded-md font-medium transition-colors ${
          routeTab === 'outbound' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        🚗 Ida ({(() => {
          const outbound = stripRoundTripWaypoints(waypoints);
          const outSegs = segments.filter(s => !s.isReturnLeg);
          const stageCount = new Set(outSegs.map((s: any) => s.stageNumber || 1)).size;
          return `${stageCount} etapa${stageCount !== 1 ? 's' : ''}`;
        })()})
      </button>
      <button
        onClick={() => setRouteTab('return')}
        className={`flex-1 text-xs py-1.5 px-2 rounded-md font-medium transition-colors ${
          routeTab === 'return' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        🔄 Vuelta ({(() => {
          const retSegs = segments.filter(s => s.isReturnLeg);
          const stageCount = new Set(retSegs.map((s: any) => s.stageNumber || 1)).size;
          return `${stageCount} etapa${stageCount !== 1 ? 's' : ''}`;
        })()})
      </button>
    </div>
  )}

  {(() => {
    // Determine which waypoints to show based on tab
    const outboundWps = stripRoundTripWaypoints(waypoints);
    const isRoundTrip = tripType === 'round_trip';
    const showReturn = isRoundTrip && routeTab === 'return' && isCalculated;

    // For return tab, show origin as destination and vice versa
    const displayWps = showReturn
      ? [...outboundWps].reverse()
      : outboundWps;

    // Group into stages based on segments
    const relevantSegs = showReturn
      ? segments.filter(s => s.isReturnLeg)
      : segments.filter(s => !s.isReturnLeg);

    // Find stage break indices
    const stageBreaks: number[] = [];
    let lastStage = 0;
    relevantSegs.forEach((seg: any, i: number) => {
      const sn = seg.stageNumber || 1;
      if (sn !== lastStage && lastStage !== 0) {
        stageBreaks.push(i);
      }
      lastStage = sn;
    });

    // Compute stage boundaries for waypoints
    const stages: { stageNum: number; startIdx: number; endIdx: number; duration: number; distance: number }[] = [];
    if (isCalculated && relevantSegs.length > 0) {
      let currentStage = relevantSegs[0]?.stageNumber || 1;
      let stageStart = 0;
      let stageDuration = 0;
      let stageDistance = 0;
      for (let i = 0; i < relevantSegs.length; i++) {
        const sn = relevantSegs[i].stageNumber || 1;
        if (sn !== currentStage) {
          stages.push({ stageNum: currentStage, startIdx: stageStart, endIdx: i, duration: stageDuration, distance: stageDistance });
          currentStage = sn;
          stageStart = i;
          stageDuration = 0;
          stageDistance = 0;
        }
        stageDuration += relevantSegs[i].duration || 0;
        stageDistance += relevantSegs[i].distance || 0;
      }
      stages.push({ stageNum: currentStage, startIdx: stageStart, endIdx: relevantSegs.length, duration: stageDuration, distance: stageDistance });
    }

    return (
      <AnimatePresence>
      {displayWps.map((wp, idx) => {
        const realIdx = showReturn ? outboundWps.length - 1 - idx : idx;
        const isOrigin = idx === 0;
        const isDest = idx === displayWps.length - 1 && displayWps.length >= 2;
        const labelLetter = isOrigin ? (showReturn ? 'B' : 'A') : isDest ? (showReturn ? 'A' : 'B') : String(idx);
        const labelColor = isOrigin ? 'bg-green-600' : isDest ? 'bg-red-600' : 'bg-primary';
        const isStageStop = wp.name.startsWith('🛏️');
        const stopKey = `${wp.latitude.toFixed(4)}-${wp.longitude.toFixed(4)}`;
        const meta = stageStopMeta[stopKey] || { notes: '', restHours: 0 };
        const isEditing = editingStopIdx === idx;

        // Stage separator
        const currentSegStage = relevantSegs[Math.min(idx, relevantSegs.length - 1)]?.stageNumber;
        const prevSegStage = idx > 0 ? relevantSegs[Math.min(idx - 1, relevantSegs.length - 1)]?.stageNumber : null;
        const showStageSeparator = isCalculated && idx > 0 && currentSegStage !== prevSegStage && currentSegStage && prevSegStage;
        const stageInfo = stages.find(s => s.stageNum === currentSegStage);

        return (
          <React.Fragment key={`${wp.name}-${idx}-${routeTab}`}>
            {showStageSeparator && (
              <div className="flex items-center gap-2 py-1.5 px-1">
                <div className="flex-1 border-t border-dashed border-primary/30" />
                <Badge variant="outline" className="text-[9px] gap-0.5 shrink-0">
                  <Navigation className="w-2.5 h-2.5" />
                  Etapa {currentSegStage}
                  {stageInfo && ` · ${formatDistance(stageInfo.distance)} · ${formatDuration(stageInfo.duration)}`}
                </Badge>
                <div className="flex-1 border-t border-dashed border-primary/30" />
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              draggable={!showReturn}
              onDragStart={() => !showReturn && handleDragStart(realIdx)}
              onDragOver={(e) => !showReturn && handleDragOver(e, realIdx)}
              onDrop={() => !showReturn && handleDrop(realIdx)}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
            >
              <div className={`flex flex-col rounded-md border transition-colors ${
                isStageStop ? 'bg-amber-500/5 border-amber-500/30' :
                dragOverIndex === realIdx && dragIndex !== realIdx
                  ? 'bg-primary/10 border-primary/40'
                  : dragIndex === realIdx
                  ? 'opacity-50 bg-muted/30 border-border/30'
                  : 'bg-muted/30 border-border/40'
              }`}>
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  {!showReturn && <GripVertical className="w-3 h-3 cursor-grab active:cursor-grabbing text-muted-foreground shrink-0" />}
                  <div className={`flex items-center justify-center w-5 h-5 rounded-full ${labelColor} text-white text-[10px] font-bold shrink-0`}>
                    {labelLetter}
                  </div>
                  <span className="text-xs font-medium truncate flex-1 min-w-0">{wp.name}</span>

                  {!showReturn && idx < displayWps.length - 1 && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <div className="flex items-center bg-muted rounded-full px-0.5">
                        {TRANSPORT_MODES.map(mode => {
                          const ModeIcon = mode.icon;
                          const isActive = wp.transportMode === mode.value;
                          return (
                            <button
                              key={mode.value}
                              className={`p-0.5 rounded-full transition-colors ${
                                isActive ? 'bg-background shadow-sm ' + mode.color : 'text-muted-foreground/50 hover:text-foreground'
                              }`}
                              onClick={() => updateTransportMode(realIdx, mode.value)}
                            >
                              <ModeIcon className="w-3 h-3" />
                            </button>
                          );
                        })}
                      </div>
                      {segments[realIdx] && (
                        <span className="text-[9px] text-muted-foreground whitespace-nowrap ml-0.5">
                          {formatDistance(segments[realIdx].distance)} · {formatDuration(segments[realIdx].duration)}
                        </span>
                      )}
                    </div>
                  )}

                  {isStageStop && (
                    <button
                      className="p-0.5 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => setEditingStopIdx(isEditing ? null : idx)}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}

                  {!showReturn && (
                    <button
                      className="p-0.5 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeWaypoint(realIdx)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Expandable edit panel for stage stops */}
                {isStageStop && isEditing && (
                  <div className="px-3 pb-2 pt-1 border-t border-border/30 space-y-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Tiempo de descanso</Label>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[meta.restHours]}
                          onValueChange={(v) => setStageStopMeta(prev => ({
                            ...prev,
                            [stopKey]: { ...meta, restHours: v[0] }
                          }))}
                          min={0}
                          max={24}
                          step={0.5}
                          className="flex-1"
                        />
                        <span className="text-[10px] font-medium tabular-nums w-8 text-right">{meta.restHours}h</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Notas de viaje</Label>
                      <Input
                        placeholder="Hotel, camping, POI..."
                        value={meta.notes}
                        onChange={(e) => setStageStopMeta(prev => ({
                          ...prev,
                          [stopKey]: { ...meta, notes: e.target.value }
                        }))}
                        className="h-7 text-[11px]"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-6 text-[10px]"
                      onClick={() => {
                        openPicker('intermediate');
                      }}
                    >
                      <Search className="w-3 h-3 mr-1" />
                      Cambiar ubicación
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          </React.Fragment>
        );
      })}
      </AnimatePresence>
    );
  })()}

  {/* Round trip return indicator (only in outbound tab or non-round-trip) */}
  {tripType === 'round_trip' && waypoints.length >= 2 && routeTab === 'outbound' && !isCalculated && (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/20 border border-dashed border-border/40 opacity-60">
      <Repeat className="w-3 h-3 text-muted-foreground shrink-0" />
      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-green-600/50 text-white text-[10px] font-bold shrink-0">
        A
      </div>
      <span className="text-[11px] text-muted-foreground italic truncate flex-1">
        Vuelta a {waypoints[0]?.name}
      </span>
    </div>
  )}
  </div>
  </ScrollArea>

 {/* Location picker */}
 <AnimatePresence>
 {showLocationPicker && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: 'auto', opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 className="border-t border-border overflow-hidden"
 >
 <div className="p-3 space-y-2">
 <div className="flex items-center justify-between">
 <span className="text-xs font-medium text-muted-foreground">
 {pickerTarget === 'origin' ? 'Elegir punto de partida' : pickerTarget === 'destination' ? 'Elegir destino' : 'Añadir parada'}
 </span>
 <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowLocationPicker(false)}>
 <X className="w-3 h-3" />
 </Button>
 </div>
 <div className="relative">
 <Input
 placeholder="Buscar lugar, dirección o ubicación..."
 value={searchQuery}
 onChange={(e) => handlePickerSearch(e.target.value)}
 className="text-sm pr-8"
 autoFocus
 />
 {searchingGeo && (
 <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2.5 top-2.5 text-muted-foreground" />
 )}
 </div>
 <ScrollArea className="h-52">
 <div className="space-y-0.5">
 {/* User's saved locations */}
 {filteredLocations.length > 0 && (
 <>
 <p className="text-[10px] font-medium text-muted-foreground px-2 pt-1 flex items-center gap-1">
 <MapPin className="w-3 h-3" /> Mis ubicaciones
 </p>
 {filteredLocations.map(loc => (
 <button
 key={loc.id}
 className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-left text-sm"
 onClick={() => addWaypointFromLocation(loc, pickerTarget)}
 >
 <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
 <div className="min-w-0">
 <p className="font-medium truncate">{loc.name}</p>
 <p className="text-[10px] text-muted-foreground">
 {loc.coordinates.lat.toFixed(4)}, {loc.coordinates.lng.toFixed(4)}
 </p>
 </div>
 </button>
 ))}
 </>
 )}

 {/* General places from Nominatim */}
 {geoResults.length > 0 && (
 <>
 {filteredLocations.length > 0 && <Separator className="my-1" />}
 <p className="text-[10px] font-medium text-muted-foreground px-2 pt-1 flex items-center gap-1">
 <Globe className="w-3 h-3" /> Lugares generales
 </p>
 {geoResults.map((result, index) => (
 <button
 key={`geo-${index}`}
 className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-left text-sm"
 onClick={() => addWaypointFromGeoResult(result, pickerTarget)}
 >
 <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
 <div className="min-w-0">
 <p className="font-medium truncate">{result.shortName}</p>
 <p className="text-[10px] text-muted-foreground truncate">
 {result.displayName}
 </p>
 </div>
 </button>
 ))}
 </>
 )}

 {filteredLocations.length === 0 && geoResults.length === 0 && !searchingGeo && searchQuery.trim().length >= 3 && (
 <p className="text-sm text-muted-foreground text-center py-4">
 No se encontraron resultados
 </p>
 )}

 {!searchQuery.trim() && filteredLocations.length === 0 && (
 <p className="text-xs text-muted-foreground text-center py-4">
 Escribe para buscar lugares o direcciones
 </p>
 )}
 </div>
 </ScrollArea>
 </div>
 </motion.div>
 )}
 </AnimatePresence>


  {/* Footer actions */}
 <div className="p-3 border-t border-border space-y-2">
 {isCalculated && (
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
  {waypoints.length} puntos
  </Badge>
  {(segments as any)?._stageBreaks?.length > 0 && (
   <Badge variant="outline" className="text-[10px] gap-0.5">
    <Navigation className="w-2.5 h-2.5" />
    {(segments as any)._stageBreaks.length + 1} etapas
   </Badge>
  )}
 </div>
 )}

 <div className="flex gap-2">
 {hasDestination && (
 <Button
 variant="outline"
 size="sm"
 className="flex-1"
 onClick={() => openPicker('intermediate')}
 >
 <Plus className="w-4 h-4 mr-1" />
 Parada
 </Button>
 )}

 <Button
 variant="secondary"
 size="sm"
 onClick={handleCalculate}
 disabled={waypoints.length < 2 || calculating}
 >
 {calculating ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <RouteIcon className="w-4 h-4" />
 )}
 </Button>

 {waypoints.length >= 2 && (
 <Button
 variant={showAdvisor ? 'default' : 'outline'}
 size="sm"
 onClick={() => {
 if (!showAdvisor) {
 setShowAdvisor(true);
 analyzeRoutes(waypoints.map(wp => ({
 name: wp.name,
 lat: wp.latitude,
 lng: wp.longitude,
 })), undefined, undefined, undefined, primaryVehicle || undefined);
 } else {
 setShowAdvisor(false);
 }
 }}
 disabled={advisorLoading}
 >
 {advisorLoading ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <Compass className="w-4 h-4" />
 )}
 </Button>
 )}

 <Button
 size="sm"
 onClick={handleSave}
 disabled={waypoints.length < 2 || !routeName.trim() || isSaving}
 >
 {isSaving ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <Save className="w-4 h-4" />
 )}
 </Button>
 </div>
 </div>

 {/* Travel Advisor Section */}
 <AnimatePresence>
 {showAdvisor && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: 'auto', opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 className="overflow-hidden"
 >
 <TravelAdvisorResults
 alternatives={alternatives}
 profiles={profiles}
 selectedProfile={selectedProfile}
 explanation={explanation}
 explaining={explaining}
 advisorLoading={advisorLoading}
 customWeights={customWeights}
 onClose={() => setShowAdvisor(false)}
 onGetExplanation={getExplanation}
 onRecalculate={() => analyzeRoutes(waypoints.map(wp => ({
 name: wp.name, lat: wp.latitude, lng: wp.longitude,
 })), undefined, undefined, undefined, primaryVehicle || undefined)}

 onWeightsChange={setCustomWeights}
 onProfileChange={(code) => {
 applyProfile(code);
 const prof = profiles.find(p => p.code === code);
 if (prof) {
 const newWeights = {
 cost: prof.weight_cost, time: prof.weight_time,
 flexibility: prof.weight_flexibility, autonomy: prof.weight_autonomy,
 comfort: prof.weight_comfort, risk: prof.weight_risk,
 scenic: prof.weight_scenic, load: prof.weight_load,
 restrictions: prof.weight_restrictions,
 };
 analyzeRoutes(waypoints.map(wp => ({
 name: wp.name, lat: wp.latitude, lng: wp.longitude,
 })), undefined, undefined, newWeights, primaryVehicle || undefined);
 }
 }}
 waypointNames={waypoints.map(w => w.name)}
 />
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
}
