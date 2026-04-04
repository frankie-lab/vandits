import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useRoutes, RouteWaypoint } from '@/hooks/use-routes';
import { useTravelAdvisor, RouteAlternative } from '@/hooks/use-travel-advisor';
import { useLocationsStore } from '@/store/locations-store';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation } from '@/types/location';
import { forwardGeocode, ForwardGeocodeResult } from '@/lib/geocoding';
import { Slider } from '@/components/ui/slider';

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
  const { routes, calculating, saveRoute, calculateRoute } = useRoutes();
  const { user } = useAuth();
  const getAllLocations = useLocationsStore(state => state.getAllLocations);
  const [userTravelProfile, setUserTravelProfile] = useState<string>('adventure');

  // Load user's travel profile preference
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('travel_profile')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if ((data as any)?.travel_profile) {
          setUserTravelProfile((data as any).travel_profile);
        }
      });
  }, [user]);

  const {
    profiles,
    alternatives,
    explanation,
    loading: advisorLoading,
    explaining,
    selectedProfile,
    customWeights,
    setCustomWeights,
    applyProfile,
    analyzeRoutes,
    getExplanation,
  } = useTravelAdvisor(userTravelProfile);

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
  const [advisorExpanded, setAdvisorExpanded] = useState<number>(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showWeights, setShowWeights] = useState(false);

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
        setWaypoints(route.waypoints);
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
      let updated: RouteWaypoint[];
      if (target === 'origin') {
        updated = [newWp, ...prev];
      } else if (target === 'destination') {
        updated = [...prev, newWp];
      } else {
        // Insert before last (destination) if exists, otherwise append
        if (prev.length >= 2) {
          updated = [...prev.slice(0, -1), newWp, prev[prev.length - 1]];
        } else {
          updated = [...prev, newWp];
        }
      }
      return updated.map((wp, i) => ({ ...wp, position: i }));
    });
    setShowLocationPicker(false);
    setSearchQuery('');
    setIsCalculated(false);
  }, []);

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
      let updated: RouteWaypoint[];
      if (target === 'origin') {
        updated = [newWp, ...prev];
      } else {
        updated = [...prev, newWp];
      }
      return updated.map((wp, i) => ({ ...wp, position: i }));
    });
    setIsCalculated(false);
  }, [homeLocation]);

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
      let updated: RouteWaypoint[];
      if (target === 'origin') {
        updated = [newWp, ...prev];
      } else if (target === 'destination') {
        updated = [...prev, newWp];
      } else {
        if (prev.length >= 2) {
          updated = [...prev.slice(0, -1), newWp, prev[prev.length - 1]];
        } else {
          updated = [...prev, newWp];
        }
      }
      return updated.map((wp, i) => ({ ...wp, position: i }));
    });
    setShowLocationPicker(false);
    setSearchQuery('');
    setGeoResults([]);
    setIsCalculated(false);
  }, []);

  const removeWaypoint = useCallback((index: number) => {
    setWaypoints(prev => prev.filter((_, i) => i !== index).map((wp, i) => ({ ...wp, position: i })));
    setIsCalculated(false);
    setSegments([]);
  }, []);

  const moveWaypoint = useCallback((fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    setWaypoints(prev => {
      const updated = [...prev];
      [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
      return updated.map((wp, i) => ({ ...wp, position: i }));
    });
    setIsCalculated(false);
    setSegments([]);
  }, []);

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
      const updated = [...prev];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(idx, 0, moved);
      return updated.map((wp, i) => ({ ...wp, position: i }));
    });
    setDragIndex(null);
    setDragOverIndex(null);
    setIsCalculated(false);
    setSegments([]);
  }, [dragIndex]);

  const updateTransportMode = useCallback((index: number, mode: RouteWaypoint['transportMode']) => {
    setWaypoints(prev => prev.map((wp, i) => i === index ? { ...wp, transportMode: mode } : wp));
    setIsCalculated(false);
    setSegments([]);
  }, []);

  const handleCalculate = useCallback(async () => {
    if (waypoints.length < 2) return;
    const result = await calculateRoute(waypoints);
    if (result) {
      setSegments(result.segments);
      setTotalDistance(result.totalDistance);
      setTotalDuration(result.totalDuration);
      setIsCalculated(true);
      onRouteCalculated?.(result.segments);
    }
  }, [waypoints, calculateRoute, onRouteCalculated]);

  const handleSave = useCallback(async () => {
    if (!routeName.trim()) return;
    if (!isCalculated) await handleCalculate();
    setIsSaving(true);
    await saveRoute(routeName, waypoints, segments, totalDistance, totalDuration, routeDescription || undefined);
    setIsSaving(false);
    onClose();
  }, [routeName, routeDescription, waypoints, segments, totalDistance, totalDuration, isCalculated, handleCalculate, saveRoute, onClose]);

  const hasOrigin = waypoints.length >= 1;
  const hasDestination = waypoints.length >= 2;

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

          <AnimatePresence>
            {waypoints.map((wp, idx) => {
              const isOrigin = idx === 0;
              const isDest = idx === waypoints.length - 1 && waypoints.length >= 2;
              const labelLetter = isOrigin ? 'A' : isDest ? 'B' : String(idx);
              const labelColor = isOrigin ? 'bg-green-600' : isDest ? 'bg-red-600' : 'bg-primary';

              return (
                <motion.div
                  key={`${wp.name}-${idx}`}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-1"
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                >
                  {/* Waypoint card */}
                  <div className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                    dragOverIndex === idx && dragIndex !== idx
                      ? 'bg-primary/10 border-primary/40'
                      : dragIndex === idx
                        ? 'opacity-50 bg-muted/30 border-border/30'
                        : 'bg-muted/50 border-border/50'
                  }`}>
                    <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
                      <GripVertical className="w-4 h-4" />
                    </div>

                    <div className={`flex items-center justify-center w-6 h-6 rounded-full ${labelColor} text-white text-xs font-bold shrink-0`}>
                      {labelLetter}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{wp.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {isOrigin ? 'Origen' : isDest ? 'Destino' : `Parada ${idx}`} · {wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}
                      </p>
                    </div>

                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeWaypoint(idx)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Transport mode selector between waypoints */}
                  {idx < waypoints.length - 1 && (
                    <div className="flex items-center justify-center gap-1 py-1">
                      <div className="h-4 w-px bg-border" />
                      <div className="flex items-center gap-0.5 bg-muted rounded-full px-1 py-0.5">
                        {TRANSPORT_MODES.map(mode => {
                          const Icon = mode.icon;
                          const isActive = wp.transportMode === mode.value;
                          return (
                            <Tooltip key={mode.value}>
                              <TooltipTrigger asChild>
                                <button
                                  className={`p-1 rounded-full transition-colors ${
                                    isActive
                                      ? 'bg-background shadow-sm ' + mode.color
                                      : 'text-muted-foreground hover:text-foreground'
                                  }`}
                                  onClick={() => updateTransportMode(idx, mode.value)}
                                >
                                  <Icon className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">
                                {mode.label}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="p-0.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            onClick={() => openPicker('intermediate')}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">Añadir parada</TooltipContent>
                      </Tooltip>

                      {segments[idx] && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span>{formatDistance(segments[idx].distance)}</span>
                          <span>·</span>
                          <span>{formatDuration(segments[idx].duration)}</span>
                        </div>
                      )}

                      <div className="h-4 w-px bg-border" />
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
                  })));
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
            className="overflow-hidden border-t border-border"
          >
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold">Asesor de Viaje</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 ml-auto"
                  onClick={() => setShowAdvisor(false)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              {/* Active profile indicator */}
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>Perfil:</span>
                <Badge variant="secondary" className="text-[10px] h-5">
                  {profiles.find(p => p.code === selectedProfile)?.icon} {profiles.find(p => p.code === selectedProfile)?.name || selectedProfile}
                </Badge>
                <span className="text-muted-foreground/60">(cambiar en Preferencias)</span>
              </div>

              {/* Weight sliders toggle */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-6 text-[10px]"
                onClick={() => setShowWeights(!showWeights)}
              >
                {showWeights ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                Ajustar pesos
              </Button>

              <AnimatePresence>
                {showWeights && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-1.5"
                  >
                    {[
                      { key: 'cost', label: '💰 Coste' },
                      { key: 'time', label: '⏱️ Tiempo' },
                      { key: 'flexibility', label: '🔀 Flex.' },
                      { key: 'autonomy', label: '🧭 Autonomía' },
                      { key: 'comfort', label: '🛋️ Confort' },
                      { key: 'risk', label: '🛡️ Seguridad' },
                      { key: 'scenic', label: '🌅 Paisaje' },
                      { key: 'load', label: '📦 Carga' },
                      { key: 'restrictions', label: '📋 Restric.' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[10px] w-20">{label}</span>
                        <Slider
                          value={[customWeights[key as keyof typeof customWeights]]}
                          onValueChange={([v]) => setCustomWeights(prev => ({ ...prev, [key]: v }))}
                          min={0} max={3} step={0.1}
                          className="flex-1"
                        />
                        <span className="text-[10px] w-5 text-right font-mono">
                          {customWeights[key as keyof typeof customWeights].toFixed(1)}
                        </span>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-6 text-[10px]"
                      onClick={() => analyzeRoutes(waypoints.map(wp => ({
                        name: wp.name, lat: wp.latitude, lng: wp.longitude,
                      })))}
                      disabled={advisorLoading}
                    >
                      {advisorLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      Recalcular
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Results */}
              {alternatives.length > 0 && (
                <ScrollArea className="max-h-[35vh]">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">{alternatives.length} alternativas</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[10px] px-1.5"
                        disabled={explaining}
                        onClick={() => {
                          setShowExplanation(true);
                          getExplanation(
                            profiles.find(p => p.code === selectedProfile)?.name,
                            waypoints.map(w => w.name)
                          );
                        }}
                      >
                        {explaining ? <Loader2 className="w-3 h-3 animate-spin mr-0.5" /> : <Sparkles className="w-3 h-3 mr-0.5" />}
                        IA
                      </Button>
                    </div>

                    {alternatives.map((alt, i) => {
                      const isTop = i === 0;
                      const isExpanded = advisorExpanded === i;
                      return (
                        <div
                          key={alt.id}
                          className={`rounded-md border p-2 cursor-pointer transition-colors ${
                            isTop ? 'border-primary/40 bg-primary/5' : 'border-border'
                          }`}
                          onClick={() => setAdvisorExpanded(isExpanded ? -1 : i)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Badge variant={isTop ? 'default' : 'outline'} className="text-[9px] h-4 px-1">#{i + 1}</Badge>
                              <span className="text-xs font-medium truncate">{alt.name}</span>
                            </div>
                            <Badge className="bg-primary/20 text-primary border-0 text-[10px] h-4 px-1.5">
                              {alt.scores.overall}/10
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-0.5"><DollarSign className="w-2.5 h-2.5" />~{alt.total_cost}€</span>
                            <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />~{alt.total_time_hours}h</span>
                            <span>{alt.total_distance_km}km</span>
                          </div>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden mt-1.5 space-y-1"
                              >
                                {[
                                  { label: '💰 Coste', val: alt.scores.cost },
                                  { label: '⏱️ Tiempo', val: alt.scores.time },
                                  { label: '🔀 Flex.', val: alt.scores.flexibility },
                                  { label: '🧭 Auton.', val: alt.scores.autonomy },
                                  { label: '🛋️ Confort', val: alt.scores.comfort },
                                  { label: '🛡️ Segur.', val: alt.scores.risk },
                                  { label: '🌅 Paisaje', val: alt.scores.scenic },
                                ].map(({ label, val }) => (
                                  <div key={label} className="flex items-center gap-1 text-[10px]">
                                    <span className="w-16 text-muted-foreground">{label}</span>
                                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${val >= 7 ? 'bg-green-500' : val >= 4 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                        style={{ width: `${(val / 10) * 100}%` }}
                                      />
                                    </div>
                                    <span className="w-4 text-right font-mono">{val}</span>
                                  </div>
                                ))}
                                <Separator className="my-1" />
                                {alt.segments.map((seg, si) => (
                                  <div key={si} className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <span>{seg.mode.icon}</span>
                                    <span className="truncate">{seg.from} → {seg.to}</span>
                                    <span className="shrink-0 ml-auto">{seg.distance_km}km · ~{seg.estimated_cost}€</span>
                                  </div>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}

              {/* AI Explanation */}
              <AnimatePresence>
                {showExplanation && explanation && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-muted/50 rounded-md p-2 text-[10px] whitespace-pre-wrap border max-h-40 overflow-y-auto">
                      <div className="flex items-center gap-1 mb-1 text-primary font-medium text-xs">
                        <Sparkles className="w-3 h-3" /> Análisis IA
                      </div>
                      {explanation}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
