import React, { useState, useEffect, useCallback } from 'react';
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
  MapPin,
  Clock,
  ArrowDown,
  Navigation,
  Home,
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
import { useLocationsStore } from '@/store/locations-store';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation } from '@/types/location';

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
  const getAllLocations = useLocationsStore(state => state.getAllLocations);

  const [routeName, setRouteName] = useState('');
  const [routeDescription, setRouteDescription] = useState('');
  const [waypoints, setWaypoints] = useState<RouteWaypoint[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCalculated, setIsCalculated] = useState(false);

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

  const addLocationAsWaypoint = useCallback((loc: GeoLocation) => {
    const newWp: RouteWaypoint = {
      locationId: loc.id,
      position: waypoints.length,
      name: loc.name,
      latitude: loc.coordinates.lat,
      longitude: loc.coordinates.lng,
      transportMode: 'driving',
    };
    setWaypoints(prev => [...prev, newWp]);
    setShowLocationPicker(false);
    setSearchQuery('');
    setIsCalculated(false);
  }, [waypoints.length]);

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
    if (!routeName.trim()) {
      return;
    }
    if (!isCalculated) {
      await handleCalculate();
    }
    setIsSaving(true);
    await saveRoute(
      routeName,
      waypoints,
      segments,
      totalDistance,
      totalDuration,
      routeDescription || undefined,
    );
    setIsSaving(false);
    onClose();
  }, [routeName, routeDescription, waypoints, segments, totalDistance, totalDuration, isCalculated, handleCalculate, saveRoute, onClose]);

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

      {/* Waypoints list */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {waypoints.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Navigation className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Añade puntos para crear tu itinerario</p>
            </div>
          )}

          <AnimatePresence>
            {waypoints.map((wp, idx) => (
              <motion.div
                key={`${wp.position}-${wp.name}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-1"
              >
                {/* Waypoint card */}
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border/50">
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost" size="icon"
                      className="h-5 w-5"
                      disabled={idx === 0}
                      onClick={() => moveWaypoint(idx, 'up')}
                    >
                      <ArrowDown className="w-3 h-3 rotate-180" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-5 w-5"
                      disabled={idx === waypoints.length - 1}
                      onClick={() => moveWaypoint(idx, 'down')}
                    >
                      <ArrowDown className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                    {idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{wp.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}
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

                    {/* Show segment info if calculated */}
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
            ))}
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
              <Input
                placeholder="Buscar ubicación..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-sm"
                autoFocus
              />
              <ScrollArea className="h-40">
                <div className="space-y-1">
                  {filteredLocations.map(loc => (
                    <button
                      key={loc.id}
                      className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-left text-sm"
                      onClick={() => addLocationAsWaypoint(loc)}
                    >
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{loc.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {loc.coordinates.lat.toFixed(4)}, {loc.coordinates.lng.toFixed(4)}
                        </p>
                      </div>
                    </button>
                  ))}
                  {filteredLocations.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No se encontraron ubicaciones
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
        {/* Stats */}
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
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setShowLocationPicker(!showLocationPicker)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Añadir punto
          </Button>

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
    </div>
  );
}
