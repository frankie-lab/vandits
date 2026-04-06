import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Lightbulb, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { haversineDistance } from '@/lib/route-engine';

interface AIRouteAdvisorProps {
  origin: { name: string; latitude: number; longitude: number } | null;
  destination: { name: string; latitude: number; longitude: number } | null;
  currentTransportMode: string;
  travelProfile?: string;
  availableModes: string[];
  priorityRanking?: string[];
  hasSeaCrossing?: boolean;
  /** When true, suppress the approximate straight-line preview on the map (real geometry is already displayed) */
  suppressPreview?: boolean;
  onSwitchMode?: (mode: string) => void;
}

interface AIRecommendation {
  primaryMode: string;
  reason: string;
  alternativeModes: string[];
  warnings?: string[];
  segments?: {
    description: string;
    mode: string;
    estimatedTimeHours?: number;
    reason: string;
  }[];
  tips?: string[];
}

// Map AI mode labels to internal mode codes for coloring
function modeToCode(mode: string): string {
  const lower = mode.toLowerCase();
  if (lower.includes('ferry') || lower.includes('ship') || lower.includes('barco')) return 'ferry';
  if (lower.includes('flight') || lower.includes('avión') || lower.includes('vuelo') || lower.includes('avion')) return 'flight';
  if (lower.includes('walk') || lower.includes('pie') || lower.includes('caminar')) return 'walking';
  if (lower.includes('tren') || lower.includes('train') || lower.includes('rail')) return 'train';
  if (lower.includes('bici') || lower.includes('bicycle') || lower.includes('bike')) return 'bicycle';
  if (lower.includes('camper') || lower.includes('autocaravana') || lower.includes('furgoneta')) return 'camper_van';
  return 'driving';
}

function dispatchAdvisorPreview(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  segments: AIRecommendation['segments'],
) {
  if (!segments || segments.length === 0) {
    window.dispatchEvent(new CustomEvent('map-clear-advisor-preview'));
    return;
  }

  // Distribute segments proportionally along the great-circle line
  // Use estimated time to proportion the segments
  const totalTime = segments.reduce((s, seg) => s + (seg.estimatedTimeHours || 1), 0);
  
  const previewSegments: {
    fromLat: number; fromLng: number;
    toLat: number; toLng: number;
    mode: string; modeLabel: string;
  }[] = [];

  let cumTime = 0;
  for (const seg of segments) {
    const segTime = seg.estimatedTimeHours || 1;
    const startFrac = cumTime / totalTime;
    const endFrac = (cumTime + segTime) / totalTime;

    const fromLat = origin.latitude + (destination.latitude - origin.latitude) * startFrac;
    const fromLng = origin.longitude + (destination.longitude - origin.longitude) * startFrac;
    const toLat = origin.latitude + (destination.latitude - origin.latitude) * endFrac;
    const toLng = origin.longitude + (destination.longitude - origin.longitude) * endFrac;

    previewSegments.push({
      fromLat, fromLng, toLat, toLng,
      mode: modeToCode(seg.mode),
      modeLabel: seg.mode,
    });

    cumTime += segTime;
  }

  window.dispatchEvent(new CustomEvent('map-show-advisor-preview', {
    detail: { segments: previewSegments },
  }));
}

export function AIRouteAdvisor({
  origin,
  destination,
  currentTransportMode,
  travelProfile = 'balanced',
  availableModes,
  priorityRanking,
  hasSeaCrossing = false,
  suppressPreview = false,
  onSwitchMode,
}: AIRouteAdvisorProps) {
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<AIRecommendation | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show/clear preview when recommendation changes
  // Skip drawing when suppressPreview is true (real route geometry already on map)
  useEffect(() => {
    if (suppressPreview) {
      window.dispatchEvent(new CustomEvent('map-clear-advisor-preview'));
      return;
    }
    if (recommendation?.segments && expanded && origin && destination) {
      dispatchAdvisorPreview(origin, destination, recommendation.segments);
    } else {
      window.dispatchEvent(new CustomEvent('map-clear-advisor-preview'));
    }
  }, [recommendation, expanded, origin, destination, suppressPreview]);

  // Clear preview on unmount
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('map-clear-advisor-preview'));
    };
  }, []);

  const askAI = async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    setRecommendation(null);

    const directDistanceKm = haversineDistance(
      origin.latitude, origin.longitude,
      destination.latitude, destination.longitude,
    ) / 1000;

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-route-advisor', {
        body: {
          origin: { name: origin.name, lat: origin.latitude, lng: origin.longitude },
          destination: { name: destination.name, lat: destination.latitude, lng: destination.longitude },
          directDistanceKm,
          hasSeaCrossing,
          travelProfile,
          availableModes,
          priorityRanking,
          currentTransportMode,
        },
      });

      if (fnError) throw fnError;
      if (data?.recommendation) {
        setRecommendation(data.recommendation);
        setExpanded(true);
      } else {
        setError('No se obtuvo recomendación');
      }
    } catch (e: any) {
      console.error('AI advisor error:', e);
      if (e?.status === 429) {
        setError('Límite de peticiones alcanzado. Inténtalo en unos segundos.');
      } else if (e?.status === 402) {
        setError('Créditos insuficientes.');
      } else {
        setError('Error al consultar al asistente');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDiscard = () => {
    setRecommendation(null);
    setExpanded(false);
    window.dispatchEvent(new CustomEvent('map-clear-advisor-preview'));
  };

  if (!origin || !destination) return null;

  return (
    <div className="space-y-1.5">
      {/* Trigger button */}
      {!recommendation && !loading && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs gap-1.5 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/50"
          onClick={askAI}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Consejo IA: ¿Qué transporte usar?
        </Button>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/30">
          <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
          <span className="text-xs text-violet-700 dark:text-violet-300">Analizando tu viaje con IA…</span>
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

      {/* Recommendation */}
      <AnimatePresence>
        {recommendation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50/80 to-purple-50/50 dark:from-violet-950/40 dark:to-purple-950/30 overflow-hidden"
          >
            {/* Header */}
            <button
              className="w-full flex items-center gap-2 p-2.5 text-left"
              onClick={() => setExpanded(!expanded)}
            >
              <Sparkles className="w-4 h-4 text-violet-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
                  Recomendación: {recommendation.primaryMode}
                </p>
                <p className="text-[10px] text-violet-600 dark:text-violet-400 line-clamp-1">
                  {recommendation.reason}
                </p>
              </div>
              {expanded ? <ChevronUp className="w-3.5 h-3.5 text-violet-500" /> : <ChevronDown className="w-3.5 h-3.5 text-violet-500" />}
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
                    {/* Reason */}
                    <p className="text-[11px] text-foreground/80 leading-relaxed">
                      {recommendation.reason}
                    </p>

                    {/* Segments */}
                    {recommendation.segments && recommendation.segments.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Tramos sugeridos</p>
                        {recommendation.segments.map((seg, i) => (
                          <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded bg-white/60 dark:bg-white/5 border border-violet-100 dark:border-violet-800/50">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0 mt-0.5">{seg.mode}</Badge>
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium">{seg.description}</p>
                              <p className="text-[10px] text-muted-foreground">{seg.reason}</p>
                              {seg.estimatedTimeHours && (
                                <p className="text-[10px] text-muted-foreground">≈ {seg.estimatedTimeHours.toFixed(1)}h</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Warnings */}
                    {recommendation.warnings && recommendation.warnings.length > 0 && (
                      <div className="space-y-1">
                        {recommendation.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tips */}
                    {recommendation.tips && recommendation.tips.length > 0 && (
                      <div className="space-y-1">
                        {recommendation.tips.map((tip, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-400">
                            <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{tip}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1.5 pt-1">
                      {recommendation.primaryMode !== currentTransportMode && onSwitchMode && (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 text-xs gap-1 flex-1 bg-violet-600 hover:bg-violet-700"
                          onClick={() => onSwitchMode(recommendation.primaryMode)}
                        >
                          Aplicar: {recommendation.primaryMode}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleDiscard}
                      >
                        Descartar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={askAI}
                      >
                        <Sparkles className="w-3 h-3" /> Otra opinión
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
