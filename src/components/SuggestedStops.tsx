import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Loader2, Plus, X, Sparkles, AlertTriangle, ChevronDown, ChevronUp, Clock, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export interface SuggestedStop {
  name: string;
  lat: number;
  lng: number;
  type: string;
  reason: string;
  estimatedStopMinutes?: number;
  highlights?: string[];
  accepted?: boolean;
}

interface SuggestedStopsProps {
  origin: { name: string; latitude: number; longitude: number } | null;
  destination: { name: string; latitude: number; longitude: number } | null;
  totalDistanceKm: number;
  transportMode: string;
  travelProfile?: string;
  existingWaypoints?: { name: string; lat: number; lng: number }[];
  onAcceptStop?: (stop: SuggestedStop) => void;
  onRemoveStop?: (stop: SuggestedStop) => void;
  /** Engine config thresholds */
  stopsMinKm?: number;
  stopsMaxKm?: number;
  /** User locations near the route to consider as stop candidates */
  userLocationsNearRoute?: { name: string; lat: number; lng: number }[];
}

const TYPE_COLORS: Record<string, string> = {
  city: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  town: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
  viewpoint: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  nature: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  gastronomy: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
  monument: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
};

const TYPE_LABELS: Record<string, string> = {
  city: 'Ciudad',
  town: 'Pueblo',
  viewpoint: 'Mirador',
  nature: 'Naturaleza',
  gastronomy: 'Gastronomía',
  monument: 'Monumento',
};

export function SuggestedStops({
  origin,
  destination,
  totalDistanceKm,
  transportMode,
  travelProfile = 'balanced',
  existingWaypoints = [],
  onAcceptStop,
  onRemoveStop,
  stopsMinKm = 50,
  stopsMaxKm = 1000,
  userLocationsNearRoute = [],
}: SuggestedStopsProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedStop[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldShow = origin && destination && totalDistanceKm >= stopsMinKm && totalDistanceKm <= stopsMaxKm &&
    (transportMode === 'driving' || transportMode === 'walking');
  if (!shouldShow) return null;

  const askAI = async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    setSuggestions([]);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-suggest-stops', {
        body: {
          origin: { name: origin.name, lat: origin.latitude, lng: origin.longitude },
          destination: { name: destination.name, lat: destination.latitude, lng: destination.longitude },
          existingWaypoints,
          totalDistanceKm,
          transportMode,
          travelProfile,
          userLocationsNearRoute: userLocationsNearRoute.length > 0 ? userLocationsNearRoute : undefined,
        },
      });

      if (fnError) throw fnError;
      if (data?.suggestions && data.suggestions.length > 0) {
        setSuggestions(data.suggestions.map((s: SuggestedStop) => ({ ...s, accepted: false })));
        setExpanded(true);
      } else {
        setError('No se encontraron sugerencias para esta ruta');
      }
    } catch (e: any) {
      console.error('Suggest stops error:', e);
      if (e?.status === 429) {
        setError('Límite de peticiones alcanzado. Inténtalo en unos segundos.');
      } else if (e?.status === 402) {
        setError('Créditos insuficientes.');
      } else {
        setError('Error al buscar sugerencias');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleStop = (index: number) => {
    setSuggestions(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const newAccepted = !s.accepted;
      if (newAccepted) {
        onAcceptStop?.(s);
      } else {
        onRemoveStop?.(s);
      }
      return { ...s, accepted: newAccepted };
    }));
  };

  const acceptedCount = suggestions.filter(s => s.accepted).length;

  return (
    <div className="space-y-1.5">
      {/* Trigger button */}
      {suggestions.length === 0 && !loading && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs gap-1.5 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
          onClick={askAI}
        >
          <MapPin className="w-3.5 h-3.5" />
          Sugerir paradas intermedias
        </Button>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          <span className="text-xs text-emerald-700 dark:text-emerald-300">Buscando lugares interesantes con IA…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span className="text-xs text-red-700 dark:text-red-300">{error}</span>
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-[10px]" onClick={askAI}>Reintentar</Button>
        </div>
      )}

      {/* Suggestions */}
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/80 to-green-50/50 dark:from-emerald-950/40 dark:to-green-950/30 overflow-hidden"
          >
            {/* Header */}
            <button
              className="w-full flex items-center gap-2 p-2.5 text-left"
              onClick={() => setExpanded(!expanded)}
            >
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                  {suggestions.length} paradas sugeridas
                  {acceptedCount > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400"> · {acceptedCount} aceptadas</span>
                  )}
                </p>
              </div>
              {expanded ? <ChevronUp className="w-3.5 h-3.5 text-emerald-500" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-500" />}
            </button>

            {/* Expanded */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-2.5 pb-2.5 space-y-1.5">
                    {suggestions.map((stop, index) => (
                      <motion.div
                        key={index}
                        layout
                        className={`rounded-lg border p-2 transition-colors ${
                          stop.accepted
                            ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-100/60 dark:bg-emerald-900/30'
                            : 'border-border/60 bg-white/60 dark:bg-white/5'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => toggleStop(index)}
                            className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                              stop.accepted
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-muted-foreground/30 hover:border-emerald-400'
                            }`}
                          >
                            {stop.accepted && <Plus className="w-3 h-3 rotate-45" />}
                            {!stop.accepted && <Plus className="w-3 h-3" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[11px] font-medium">{stop.name}</span>
                              <Badge variant="outline" className={`text-[8px] px-1 py-0 ${TYPE_COLORS[stop.type] || 'bg-muted text-muted-foreground'}`}>
                                {TYPE_LABELS[stop.type] || stop.type}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">{stop.reason}</p>
                            {stop.estimatedStopMinutes && (
                              <div className="flex items-center gap-1 mt-0.5 text-[9px] text-muted-foreground">
                                <Clock className="w-2.5 h-2.5" />
                                <span>~{stop.estimatedStopMinutes} min</span>
                              </div>
                            )}
                            {stop.highlights && stop.highlights.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {stop.highlights.map((h, i) => (
                                  <span key={i} className="text-[8px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    {h}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}

                    {/* Actions */}
                    <div className="flex gap-1.5 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          suggestions.forEach(s => { if (s.accepted) onRemoveStop?.(s); });
                          setSuggestions([]);
                          setExpanded(false);
                        }}
                      >
                        Descartar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={askAI}
                      >
                        <Sparkles className="w-3 h-3" /> Más sugerencias
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
