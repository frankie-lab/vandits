import React, { useState, useCallback } from 'react';
import { renderTransportModeIcon } from '@/lib/icon-utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
 Compass,
 Loader2,
 Sparkles,
 ChevronDown,
 ChevronUp,
 MapPin,
 Search,
 Plus,
 Trash2,
 DollarSign,
 Clock,
 Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
 useTravelAdvisor,
 RouteAlternative,
 TravelAdvisorWaypoint,
} from '@/hooks/use-travel-advisor';
import { forwardGeocode, ForwardGeocodeResult } from '@/lib/geocoding';

const WEIGHT_LABELS: Record<string, { label: string; icon: string }> = {
 cost: { label: 'Coste', icon: '' },
 time: { label: 'Tiempo', icon: '' },
 flexibility: { label: 'Flexibilidad', icon: '' },
 autonomy: { label: 'Autonomía', icon: '' },
 comfort: { label: 'Comodidad', icon: '' },
 risk: { label: 'Seguridad', icon: '' },
 scenic: { label: 'Paisaje', icon: '' },
};

function ScoreBar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
 const pct = (value / max) * 100;
 const color = value >= 7 ? 'bg-green-500' : value >= 4 ? 'bg-yellow-500' : 'bg-red-500';
 return (
 <div className="flex items-center gap-2 text-xs">
 <span className="w-20 text-muted-foreground truncate">{label}</span>
 <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
 <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
 </div>
 <span className="w-6 text-right font-mono">{value}</span>
 </div>
 );
}

function AlternativeCard({
 alt,
 rank,
 expanded,
 onToggle,
}: {
 alt: RouteAlternative;
 rank: number;
 expanded: boolean;
 onToggle: () => void;
}) {
 const isTop = rank === 0;
 return (
 <motion.div
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: rank * 0.05 }}
 className={`rounded-lg border p-3 transition-colors ${
 isTop ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-card'
 }`}
 >
 <div className="flex items-start justify-between cursor-pointer" onClick={onToggle}>
 <div className="flex items-center gap-2 min-w-0">
 <Badge variant={isTop ? 'default' : 'outline'} className="text-xs shrink-0">
 #{rank + 1}
 </Badge>
 <div className="min-w-0">
 <p className="font-medium text-sm truncate">{alt.name}</p>
 <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
 <span className="flex items-center gap-0.5">
 <DollarSign className="w-3 h-3" />~{alt.total_cost}€
 </span>
 <span className="flex items-center gap-0.5">
 <Clock className="w-3 h-3" />~{alt.total_time_hours}h
 </span>
 <span>{alt.total_distance_km} km</span>
 </div>
 </div>
 </div>
 <div className="flex items-center gap-1 shrink-0">
 <Badge className="bg-primary/20 text-primary border-0 font-bold">
 {alt.scores.overall}/10
 </Badge>
 {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
 </div>
 </div>

 <AnimatePresence>
 {expanded && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: 'auto', opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 className="overflow-hidden"
 >
 <Separator className="my-2" />
 <div className="space-y-1.5">
 <ScoreBar label="Coste" value={alt.scores.cost} />
 <ScoreBar label="Tiempo" value={alt.scores.time} />
 <ScoreBar label="Flex." value={alt.scores.flexibility} />
 <ScoreBar label="Autonomía" value={alt.scores.autonomy} />
 <ScoreBar label="Confort" value={alt.scores.comfort} />
 <ScoreBar label="Seguridad" value={alt.scores.risk} />
 <ScoreBar label="Paisaje" value={alt.scores.scenic} />
 </div>

 <Separator className="my-2" />
 <p className="text-xs font-medium mb-1">Tramos:</p>
 {alt.segments.map((seg, i) => (
 <div key={i} className="text-xs text-muted-foreground flex items-center gap-1 py-0.5">
 {renderTransportModeIcon(seg.mode.code, seg.mode.icon, 'w-3 h-3')}
 <span className="truncate">{seg.from} {seg.to}</span>
 <span className="text-[10px] shrink-0 ml-auto">{seg.distance_km}km · ~{seg.estimated_cost}€ · ~{seg.estimated_time_hours}h</span>
 </div>
 ))}
 </motion.div>
 )}
 </AnimatePresence>
 </motion.div>
 );
}

interface TravelAdvisorPanelProps {
 initialWaypoints?: TravelAdvisorWaypoint[];
 onClose?: () => void;
}

export function TravelAdvisorPanel({ initialWaypoints, onClose }: TravelAdvisorPanelProps) {
 const {
 profiles,
 alternatives,
 explanation,
 loading,
 explaining,
 selectedProfile,
 customWeights,
 setCustomWeights,
 applyProfile,
 analyzeRoutes,
 getExplanation,
 } = useTravelAdvisor();

 const [waypoints, setWaypoints] = useState<TravelAdvisorWaypoint[]>(
 initialWaypoints || [
 { name: '', lat: 0, lng: 0 },
 { name: '', lat: 0, lng: 0 },
 ]
 );
 const [budgetMax, setBudgetMax] = useState<string>('');
 const [timeMax, setTimeMax] = useState<string>('');
 const [expandedCard, setExpandedCard] = useState<number>(0);
 const [showWeights, setShowWeights] = useState(false);
 const [showExplanation, setShowExplanation] = useState(false);
 const [searchResults, setSearchResults] = useState<Record<number, ForwardGeocodeResult[]>>({});
 const [searchingIdx, setSearchingIdx] = useState<number | null>(null);

 const searchPlace = useCallback(async (query: string, idx: number) => {
 if (query.length < 3) { setSearchResults(prev => ({ ...prev, [idx]: [] })); return; }
 setSearchingIdx(idx);
 try {
 const results = await forwardGeocode(query);
 setSearchResults(prev => ({ ...prev, [idx]: results }));
 } catch {
 setSearchResults(prev => ({ ...prev, [idx]: [] }));
 } finally {
 setSearchingIdx(null);
 }
 }, []);

 const selectPlace = useCallback((idx: number, result: ForwardGeocodeResult) => {
 setWaypoints(prev => prev.map((wp, i) =>
 i === idx ? { name: result.displayName.split(',')[0], lat: result.lat, lng: result.lng } : wp
 ));
 setSearchResults(prev => ({ ...prev, [idx]: [] }));
 }, []);

 const addWaypoint = () => {
 setWaypoints(prev => [...prev.slice(0, -1), { name: '', lat: 0, lng: 0 }, prev[prev.length - 1]]);
 };

 const removeWaypoint = (idx: number) => {
 if (waypoints.length <= 2) return;
 setWaypoints(prev => prev.filter((_, i) => i !== idx));
 };

 const canAnalyze = waypoints.every(wp => wp.lat !== 0 && wp.lng !== 0) && waypoints.length >= 2;

 const handleAnalyze = () => {
 analyzeRoutes(
 waypoints,
 budgetMax ? parseFloat(budgetMax) : undefined,
 timeMax ? parseFloat(timeMax) : undefined,
 );
 };

 return (
 <div className="space-y-3 p-3">
 {/* Header */}
 <div className="flex items-center gap-2 mb-1">
 <Compass className="w-5 h-5 text-primary" />
 <h3 className="font-semibold text-sm">Asesor de Viaje</h3>
 </div>

 {/* Waypoints */}
 <div className="space-y-2">
 {waypoints.map((wp, idx) => (
 <div key={idx} className="relative">
 <div className="flex items-center gap-1">
 <Badge variant="outline" className="text-[10px] w-5 h-5 flex items-center justify-center p-0 shrink-0">
 {idx === 0 ? 'A' : idx === waypoints.length - 1 ? 'B' : idx}
 </Badge>
 <div className="flex-1 relative">
 <Input
 placeholder={idx === 0 ? 'Origen' : idx === waypoints.length - 1 ? 'Destino' : `Parada ${idx}`}
 value={wp.name}
 onChange={e => {
 const val = e.target.value;
 setWaypoints(prev => prev.map((w, i) => i === idx ? { ...w, name: val } : w));
 searchPlace(val, idx);
 }}
 className="h-8 text-xs pr-8"
 />
 {searchingIdx === idx && (
 <Loader2 className="w-3 h-3 animate-spin absolute right-2 top-2.5 text-muted-foreground" />
 )}
 </div>
 {waypoints.length > 2 && idx !== 0 && idx !== waypoints.length - 1 && (
 <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeWaypoint(idx)}>
 <Trash2 className="w-3 h-3 text-destructive" />
 </Button>
 )}
 </div>
 {/* Search results dropdown */}
 {searchResults[idx]?.length > 0 && (
 <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-32 overflow-y-auto">
 {searchResults[idx].map((r, ri) => (
 <button
 key={ri}
 className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent truncate"
 onClick={() => selectPlace(idx, r)}
 >
 <MapPin className="w-3 h-3 inline mr-1" />
 {r.displayName}
 </button>
 ))}
 </div>
 )}
 </div>
 ))}
 <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={addWaypoint}>
 <Plus className="w-3 h-3 mr-1" /> Añadir parada
 </Button>
 </div>

 <Separator />

 {/* Travel profiles */}
 <div>
 <Label className="text-xs mb-1.5 block">Perfil de viaje</Label>
 <div className="flex flex-wrap gap-1">
 {profiles.map(p => (
 <Button
 key={p.code}
 variant={selectedProfile === p.code ? 'default' : 'outline'}
 size="sm"
 className="h-7 text-xs"
 onClick={() => applyProfile(p.code)}
 >
 {p.icon} {p.name}
 </Button>
 ))}
 </div>
 </div>

 {/* Custom weights toggle */}
 <Button
 variant="ghost"
 size="sm"
 className="w-full h-7 text-xs"
 onClick={() => setShowWeights(!showWeights)}
 >
 {showWeights ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
 Ajustar pesos manualmente
 </Button>

 <AnimatePresence>
 {showWeights && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: 'auto', opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 className="overflow-hidden space-y-2"
 >
 {Object.entries(WEIGHT_LABELS).map(([key, { label, icon }]) => (
 <div key={key} className="flex items-center gap-2">
 <span className="text-xs w-24">{icon} {label}</span>
 <Slider
 value={[customWeights[key as keyof typeof customWeights]]}
 onValueChange={([v]) => setCustomWeights(prev => ({ ...prev, [key]: v }))}
 min={0}
 max={3}
 step={0.1}
 className="flex-1"
 />
 <span className="text-xs w-6 text-right font-mono">
 {customWeights[key as keyof typeof customWeights].toFixed(1)}
 </span>
 </div>
 ))}
 </motion.div>
 )}
 </AnimatePresence>

 {/* Constraints */}
 <div className="flex gap-2">
 <div className="flex-1">
 <Label className="text-[10px]">Presupuesto máx (€)</Label>
 <Input
 type="number"
 placeholder="Sin límite"
 value={budgetMax}
 onChange={e => setBudgetMax(e.target.value)}
 className="h-7 text-xs"
 />
 </div>
 <div className="flex-1">
 <Label className="text-[10px]">Tiempo máx (horas)</Label>
 <Input
 type="number"
 placeholder="Sin límite"
 value={timeMax}
 onChange={e => setTimeMax(e.target.value)}
 className="h-7 text-xs"
 />
 </div>
 </div>

 {/* Analyze button */}
 <Button
 className="w-full"
 onClick={handleAnalyze}
 disabled={!canAnalyze || loading}
 >
 {loading ? (
 <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analizando...</>
 ) : (
 <><Compass className="w-4 h-4 mr-2" />Analizar alternativas</>
 )}
 </Button>

 {/* Results */}
 {alternatives.length > 0 && (
 <>
 <Separator />
 <div className="flex items-center justify-between">
 <p className="text-xs font-medium">{alternatives.length} alternativas</p>
 <Button
 variant="outline"
 size="sm"
 className="h-7 text-xs"
 disabled={explaining}
 onClick={() => {
 setShowExplanation(true);
 getExplanation(
 profiles.find(p => p.code === selectedProfile)?.name,
 waypoints.map(w => w.name)
 );
 }}
 >
 {explaining ? (
 <Loader2 className="w-3 h-3 mr-1 animate-spin" />
 ) : (
 <Sparkles className="w-3 h-3 mr-1" />
 )}
 Análisis IA
 </Button>
 </div>

 <ScrollArea className="max-h-[50vh]">
 <div className="space-y-2">
 {alternatives.map((alt, i) => (
 <AlternativeCard
 key={alt.id}
 alt={alt}
 rank={i}
 expanded={expandedCard === i}
 onToggle={() => setExpandedCard(expandedCard === i ? -1 : i)}
 />
 ))}
 </div>
 </ScrollArea>

 {/* AI Explanation */}
 <AnimatePresence>
 {showExplanation && explanation && (
 <motion.div
 initial={{ opacity: 0, height: 0 }}
 animate={{ opacity: 1, height: 'auto' }}
 exit={{ opacity: 0, height: 0 }}
 className="overflow-hidden"
 >
 <div className="bg-muted/50 rounded-lg p-3 text-xs whitespace-pre-wrap border">
 <div className="flex items-center gap-1 mb-2 text-primary font-medium">
 <Sparkles className="w-3.5 h-3.5" /> Análisis IA
 </div>
 {explanation}
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </>
 )}
 </div>
 );
}
