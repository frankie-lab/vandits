import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Loader2, MapPin, Moon, Utensils, Lightbulb, ChevronDown, ChevronUp, Sparkles, AlertTriangle, Clock, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface JourneyDay {
  dayNumber: number;
  title: string;
  departureTime?: string;
  arrivalTime?: string;
  drivingHours: number;
  distanceKm: number;
  overnightStop: string;
  overnightLat?: number;
  overnightLng?: number;
  accommodationType?: string;
  lunchStop?: string;
  highlights?: string[];
  tips?: string[];
}

interface JourneyPlan {
  totalDays: number;
  summary: string;
  days: JourneyDay[];
  generalTips?: string[];
}

interface JourneyPlannerProps {
  origin: { name: string; latitude: number; longitude: number } | null;
  destination: { name: string; latitude: number; longitude: number } | null;
  totalDistanceKm: number;
  totalDurationHours: number;
  transportMode: string;
  travelProfile?: string;
  /** Engine config thresholds */
  plannerMinHours?: number;
  plannerMaxHours?: number;
  /** User locations near the route to consider as stop candidates */
  userLocationsNearRoute?: { name: string; lat: number; lng: number }[];
}

export function JourneyPlanner({
  origin,
  destination,
  totalDistanceKm,
  totalDurationHours,
  transportMode,
  travelProfile = 'balanced',
  plannerMinHours = 4,
  plannerMaxHours = 12,
  userLocationsNearRoute = [],
}: JourneyPlannerProps) {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<JourneyPlan | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shouldShow = totalDurationHours >= plannerMinHours && origin && destination && (transportMode === 'driving' || transportMode === 'walking');
  if (!shouldShow) return null;

  const askAI = async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    setPlan(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-journey-planner', {
        body: {
          waypoints: [
            { name: origin.name, lat: origin.latitude, lng: origin.longitude },
            { name: destination.name, lat: destination.latitude, lng: destination.longitude },
          ],
          totalDistanceKm,
          totalDurationHours,
          transportMode,
          travelProfile,
          maxDrivingHoursPerDay: plannerMaxHours,
          userLocationsNearRoute: userLocationsNearRoute.length > 0 ? userLocationsNearRoute : undefined,
        },
      });

      if (fnError) throw fnError;
      if (data?.journeyPlan) {
        setPlan(data.journeyPlan);
        setExpanded(true);
        if (data.journeyPlan.days?.length > 0) {
          setExpandedDay(1);
          // Show overnight stops on map
          window.dispatchEvent(new CustomEvent('map-show-journey-preview', {
            detail: { days: data.journeyPlan.days },
          }));
        }
      } else {
        setError('No se obtuvo plan de viaje');
      }
    } catch (e: any) {
      console.error('Journey planner error:', e);
      if (e?.status === 429) {
        setError('Límite de peticiones alcanzado. Inténtalo en unos segundos.');
      } else if (e?.status === 402) {
        setError('Créditos insuficientes.');
      } else {
        setError('Error al planificar el viaje');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1.5 min-w-0 overflow-hidden">
      {/* Trigger button */}
      {!plan && !loading && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs gap-1.5 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50"
          onClick={askAI}
        >
          <Calendar className="w-3.5 h-3.5" />
          Planificar por jornadas ({Math.ceil(totalDurationHours / 6)} días aprox.)
        </Button>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30">
          <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
          <span className="text-xs text-amber-700 dark:text-amber-300">Planificando jornadas con IA…</span>
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

      {/* Journey plan */}
      <AnimatePresence>
        {plan && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/80 to-orange-50/50 dark:from-amber-950/40 dark:to-orange-950/30 overflow-hidden"
          >
            {/* Header */}
            <button
              className="w-full flex items-center gap-2 p-2.5 text-left"
              onClick={() => setExpanded(!expanded)}
            >
              <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                  Plan de viaje: {plan.totalDays} {plan.totalDays === 1 ? 'día' : 'días'}
                </p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 line-clamp-1">
                  {plan.summary}
                </p>
              </div>
              {expanded ? <ChevronUp className="w-3.5 h-3.5 text-amber-500" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-500" />}
            </button>

            {/* Expanded details */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-2.5 pb-2.5 space-y-2">
                    {/* Summary */}
                    <p className="text-[11px] text-foreground/80 leading-relaxed">
                      {plan.summary}
                    </p>

                    {/* Days */}
                    <div className="space-y-1.5">
                      {plan.days.map((day) => (
                        <div key={day.dayNumber} className="rounded-lg border border-amber-100 dark:border-amber-800/50 bg-white/60 dark:bg-white/5 overflow-hidden">
                          <button
                            className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
                            onClick={() => {
                              setExpandedDay(expandedDay === day.dayNumber ? null : day.dayNumber);
                              if (day.overnightLat && day.overnightLng) {
                                window.dispatchEvent(new CustomEvent('map-fit-bounds', {
                                  detail: {
                                    bounds: [[day.overnightLat - 0.5, day.overnightLng - 0.5], [day.overnightLat + 0.5, day.overnightLng + 0.5]],
                                    maxZoom: 10,
                                    padding: [60, 60],
                                  },
                                }));
                              }
                            }}
                          >
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700">
                              Día {day.dayNumber}
                            </Badge>
                            <span className="text-[11px] font-medium truncate flex-1">{day.title}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {day.distanceKm}km · {day.drivingHours.toFixed(1)}h
                            </span>
                            {expandedDay === day.dayNumber
                              ? <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" />
                              : <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />}
                          </button>

                          <AnimatePresence>
                            {expandedDay === day.dayNumber && (
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: 'auto' }}
                                exit={{ height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="px-2.5 pb-2 space-y-1.5 min-w-0 overflow-hidden">
                                  {/* Schedule */}
                                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                    {day.departureTime && (
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> Salida: {day.departureTime}
                                      </span>
                                    )}
                                    {day.arrivalTime && (
                                      <span className="flex items-center gap-1">
                                        <Navigation className="w-3 h-3" /> Llegada: {day.arrivalTime}
                                      </span>
                                    )}
                                  </div>

                                  {/* Lunch stop */}
                                  {day.lunchStop && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-orange-700 dark:text-orange-400">
                                      <Utensils className="w-3 h-3 shrink-0" />
                                      <span className="break-words min-w-0">Comida en {day.lunchStop}</span>
                                    </div>
                                  )}

                                  {/* Overnight */}
                                   <div className="flex items-start gap-1.5 text-[10px] text-indigo-700 dark:text-indigo-400 min-w-0">
                                    <Moon className="w-3 h-3 shrink-0 mt-0.5" />
                                    <span className="break-words min-w-0">
                                      Noche en {day.overnightStop}
                                      {day.accommodationType && ` (${day.accommodationType})`}
                                    </span>
                                  </div>

                                  {/* Highlights */}
                                  {day.highlights && day.highlights.length > 0 && (
                                    <div className="space-y-0.5">
                                      {day.highlights.map((h, i) => (
                                        <div key={i} className="flex items-start gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-400 min-w-0">
                                          <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                                          <span className="break-words min-w-0">{h}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Tips */}
                                  {day.tips && day.tips.length > 0 && (
                                    <div className="space-y-0.5">
                                      {day.tips.map((tip, i) => (
                                        <div key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground min-w-0">
                                          <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" />
                                          <span className="break-words min-w-0">{tip}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>

                    {/* General tips */}
                    {plan.generalTips && plan.generalTips.length > 0 && (
                      <div className="space-y-1 pt-1 min-w-0 overflow-hidden">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Consejos generales</p>
                        {plan.generalTips.map((tip, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground min-w-0">
                            <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" />
                            <span className="break-words min-w-0">{tip}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1.5 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => { setPlan(null); setExpanded(false); window.dispatchEvent(new CustomEvent('map-clear-journey-preview')); }}
                      >
                        Descartar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={askAI}
                      >
                        <Sparkles className="w-3 h-3" /> Replanificar
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
