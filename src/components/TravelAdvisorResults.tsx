import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Clock, Loader2, Sparkles, ChevronDown, ChevronUp,
  DollarSign, AlertTriangle, Trophy, MapPin, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import type { RouteAlternative, TravelProfile, ScoringWeights } from '@/hooks/use-travel-advisor';

interface Props {
  alternatives: RouteAlternative[];
  profiles: TravelProfile[];
  selectedProfile: string;
  explanation: string;
  explaining: boolean;
  advisorLoading: boolean;
  customWeights: ScoringWeights;
  onClose: () => void;
  onGetExplanation: (profileName?: string, waypointNames?: string[]) => void;
  onRecalculate: () => void;
  onWeightsChange: (weights: ScoringWeights) => void;
  onProfileChange: (profileCode: string) => void;
  waypointNames: string[];
}

// Helper to get a human-readable name for a route
function getRouteName(alt: RouteAlternative): string {
  const uniqueModes = [...new Set(alt.segments.map(s => s.mode.name))];
  if (uniqueModes.length === 1) return uniqueModes[0];
  return uniqueModes.join(' → ');
}

// Primary warning (most important)
function getPrimaryWarning(alt: RouteAlternative): string | null {
  const vehicleWarning = alt.warnings.find(w => w.includes('queda') || w.includes('Atención'));
  if (vehicleWarning) return vehicleWarning;
  const bookingWarning = alt.warnings.find(w => w.includes('reserva'));
  if (bookingWarning) return '📋 Requiere reserva';
  return null;
}

// Score color
function scoreColor(val: number): string {
  if (val >= 7) return 'text-emerald-600 dark:text-emerald-400';
  if (val >= 4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
}

function scoreBg(val: number): string {
  if (val >= 7) return 'bg-emerald-500';
  if (val >= 4) return 'bg-amber-500';
  return 'bg-red-500';
}

export function TravelAdvisorResults({
  alternatives,
  profiles,
  selectedProfile,
  explanation,
  explaining,
  advisorLoading,
  customWeights,
  onClose,
  onGetExplanation,
  onRecalculate,
  onWeightsChange,
  waypointNames,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showWeights, setShowWeights] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const profile = profiles.find(p => p.code === selectedProfile);
  const top3 = alternatives.slice(0, 3);
  const rest = alternatives.slice(3);
  const visibleAlts = showAll ? alternatives : top3;

  return (
    <div className="border-t border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
        <div className="flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Asesor de Viaje</span>
          {profile && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {profile.icon} {profile.name}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      </div>

      <ScrollArea className="max-h-[50vh]">
        <div className="p-3 space-y-2">

          {/* Comparative Table Header */}
          {alternatives.length > 0 && (
            <div className="grid grid-cols-[1fr_60px_60px_40px] gap-1 text-[9px] text-muted-foreground font-medium px-1">
              <span>Opción</span>
              <span className="text-right">Coste</span>
              <span className="text-right">Tiempo</span>
              <span className="text-right">Score</span>
            </div>
          )}

          {/* Route cards */}
          {visibleAlts.map((alt, i) => {
            const isExpanded = expandedId === alt.id;
            const isTop = i === 0;
            const routeName = getRouteName(alt);
            const warning = getPrimaryWarning(alt);

            return (
              <motion.div
                key={alt.id}
                layout
                className={`rounded-lg border transition-colors cursor-pointer ${
                  isTop
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                }`}
                onClick={() => setExpandedId(isExpanded ? null : alt.id)}
              >
                {/* Compact row */}
                <div className="grid grid-cols-[1fr_60px_60px_40px] gap-1 items-center px-2.5 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isTop && <Trophy className="w-3 h-3 text-amber-500 shrink-0" />}
                      <span className="text-[11px] font-medium truncate">{routeName}</span>
                    </div>
                    {warning && (
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5 truncate flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{warning.replace(/^[^\s]+\s/, '')}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-right">{alt.total_cost}€</span>
                  <span className="text-[11px] font-mono text-right">{alt.total_time_hours}h</span>
                  <div className="flex items-center justify-end">
                    <span className={`text-[11px] font-bold ${scoreColor(alt.scores.overall)}`}>
                      {alt.scores.overall}
                    </span>
                  </div>
                </div>

                {/* Score bar */}
                <div className="px-2.5 pb-1.5">
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${scoreBg(alt.scores.overall)}`}
                      style={{ width: `${(alt.scores.overall / 10) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Expanded details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-2.5 pb-2.5 space-y-2">
                        <Separator />

                        {/* Scores radar-like view */}
                        <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                          {[
                            { key: 'cost', label: 'Coste', icon: '💰' },
                            { key: 'time', label: 'Tiempo', icon: '⏱️' },
                            { key: 'flexibility', label: 'Flexibilidad', icon: '🔀' },
                            { key: 'autonomy', label: 'Autonomía', icon: '🧭' },
                            { key: 'comfort', label: 'Confort', icon: '🛋️' },
                            { key: 'risk', label: 'Seguridad', icon: '🛡️' },
                            { key: 'scenic', label: 'Paisaje', icon: '🌅' },
                            { key: 'load', label: 'Carga', icon: '📦' },
                            { key: 'restrictions', label: 'Libertad', icon: '📋' },
                          ].map(({ key, label, icon }) => {
                            const val = (alt.scores as any)[key] as number;
                            return (
                              <div key={key} className="flex items-center gap-1">
                                <span className="text-[9px]">{icon}</span>
                                <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${scoreBg(val)}`}
                                    style={{ width: `${(val / 10) * 100}%` }}
                                  />
                                </div>
                                <span className={`text-[9px] font-mono w-3 text-right ${scoreColor(val)}`}>{val}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Segments timeline */}
                        <div className="space-y-0.5">
                          <span className="text-[9px] font-medium text-muted-foreground">Tramos:</span>
                          {alt.segments.map((seg, si) => (
                            <div key={si} className="flex items-center gap-1 text-[10px]">
                              <span>{seg.mode.icon}</span>
                              <span className="text-muted-foreground truncate flex-1">
                                {seg.from} → {seg.to}
                              </span>
                              <span className="font-mono shrink-0 text-muted-foreground">
                                {seg.distance_km}km · {seg.estimated_cost}€
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Cost breakdown compact */}
                        {alt.cost_breakdown?.filter(cb => cb.total > 0).length > 0 && (
                          <div className="space-y-0.5">
                            <span className="text-[9px] font-medium text-muted-foreground">Costes:</span>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                              {alt.cost_breakdown.filter(cb => cb.total > 0).map((cb, ci) => (
                                <span key={ci} className="text-[9px] text-muted-foreground">
                                  {cb.category_icon} {cb.total}€
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* All warnings */}
                        {alt.warnings.length > 0 && (
                          <div className="space-y-0.5">
                            {alt.warnings.map((w, wi) => (
                              <div key={wi} className="text-[9px] text-amber-600 dark:text-amber-400">
                                {w}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}

          {/* Show more */}
          {rest.length > 0 && !showAll && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-6 text-[10px] text-muted-foreground"
              onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
            >
              Ver {rest.length} alternativas más
              <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          )}
          {showAll && rest.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-6 text-[10px] text-muted-foreground"
              onClick={(e) => { e.stopPropagation(); setShowAll(false); }}
            >
              Mostrar solo Top 3
              <ChevronUp className="w-3 h-3 ml-1" />
            </Button>
          )}

          {/* Weight adjustment */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-6 text-[10px]"
            onClick={() => setShowWeights(!showWeights)}
          >
            {showWeights ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
            Ajustar prioridades
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
                  { key: 'flexibility', label: '🔀 Flexibilidad' },
                  { key: 'autonomy', label: '🧭 Autonomía' },
                  { key: 'comfort', label: '🛋️ Confort' },
                  { key: 'risk', label: '🛡️ Seguridad' },
                  { key: 'scenic', label: '🌅 Paisaje' },
                  { key: 'load', label: '📦 Carga' },
                  { key: 'restrictions', label: '📋 Libertad' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] w-24">{label}</span>
                    <Slider
                      value={[customWeights[key as keyof ScoringWeights]]}
                      onValueChange={([v]) => onWeightsChange({ ...customWeights, [key]: v })}
                      min={0} max={3} step={0.1}
                      className="flex-1"
                    />
                    <span className="text-[10px] w-5 text-right font-mono">
                      {customWeights[key as keyof ScoringWeights].toFixed(1)}
                    </span>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-6 text-[10px]"
                  onClick={onRecalculate}
                  disabled={advisorLoading}
                >
                  {advisorLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Recalcular
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI Analysis */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-6 text-[10px]"
            disabled={explaining || alternatives.length === 0}
            onClick={() => {
              setShowExplanation(true);
              onGetExplanation(profile?.name, waypointNames);
            }}
          >
            {explaining ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
            Análisis IA
          </Button>

          <AnimatePresence>
            {showExplanation && explanation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-muted/50 rounded-lg p-2.5 text-[10px] whitespace-pre-wrap border max-h-40 overflow-y-auto leading-relaxed">
                  <div className="flex items-center gap-1 mb-1.5 text-primary font-medium text-xs">
                    <Sparkles className="w-3 h-3" /> Análisis IA
                  </div>
                  {explanation}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}
