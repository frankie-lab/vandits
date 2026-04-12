import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, MapPin, AlertTriangle, Trash2, Eye, CheckCircle, Copy,
  ArrowRight, Loader2, Merge, Plus, ChevronDown, ChevronUp,
  ExternalLink, RotateCcw, Image, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { formatDistance } from '@/lib/duplicate-detection';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useDuplicateCount } from '@/hooks/use-duplicate-count';
import { useDuplicateStore, DuplicatePair } from '@/stores/duplicate-store';

interface ConflictAction {
  pairId: string;
  action: 'delete-first' | 'delete-second' | 'merge-into-first' | 'merge-into-second' | 'create-new' | 'keep-both' | 'keep-first' | 'keep-second' | 'delete-both';
}

interface DuplicatesListProps {
  onClose: () => void;
  onLocationClick: (location: GeoLocation) => void;
}

// Merge enriched data from two locations
function mergeEnrichedData(primary: GeoLocation, secondary: GeoLocation): Record<string, unknown> | null {
  const primaryData = primary.enrichedData;
  const secondaryData = secondary.enrichedData;
  if (!primaryData && !secondaryData) return null;
  if (!primaryData) return secondaryData ? { ...secondaryData } : null;
  if (!secondaryData) return { ...primaryData };
  const merged = { ...secondaryData, ...primaryData };
  const tags1 = primaryData.etiquetas || [];
  const tags2 = secondaryData.etiquetas || [];
  merged.etiquetas = [...new Set([...tags1, ...tags2])];
  return merged as Record<string, unknown>;
}

// Component for detailed location comparison column
function LocationDetailColumn({ 
  location, isMarkedForDelete, isMarkedForKeep, onViewOnMap 
}: { 
  location: GeoLocation; isMarkedForDelete: boolean; isMarkedForKeep: boolean; onViewOnMap: () => void;
}) {
  const enriched = location.enrichedData;
  const isVisited = location.customData?.visited === 'true';
  const userRating = parseInt(location.customData?.user_rating || '0');
  
  return (
    <div className={cn(
      "p-4 space-y-3 bg-white dark:bg-slate-900 rounded-lg",
      isMarkedForDelete && "bg-red-50 dark:bg-red-950/30 opacity-60",
      isMarkedForKeep && "bg-green-50 dark:bg-green-950/30"
    )}>
      <div className="flex gap-3">
        {enriched?.imagen ? (
          <img src={enriched.imagen} alt="" className="w-24 h-24 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <Image className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-base leading-tight">{enriched?.nombre_lugar || location.name}</h4>
          <p className="text-xs text-muted-foreground mt-1 leading-snug">
            {enriched?.localizacion || [location.zone, location.region, location.country, location.continent].filter(Boolean).join(', ')}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono mt-1">
            {location.coordinates.lat.toFixed(5)}, {location.coordinates.lng.toFixed(5)}
          </p>
          <Button variant="outline" size="sm" className="mt-2 h-7"
            onClick={(e) => { e.stopPropagation(); onViewOnMap(); }}>
            <Eye className="w-3 h-3 mr-1" /> Ver en mapa
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 p-2 bg-muted/50 rounded-lg">
        {enriched?.indice_interes && (
          <div className="flex items-center gap-0.5 px-2 py-1 bg-amber-100 rounded-full" title={enriched.indice_interes_notas || 'Índice de interés IA'}>
            {[1,2,3,4,5].map(star => (
              <span key={star} className={cn("text-sm", star <= enriched.indice_interes ? "text-amber-600" : "text-gray-300")}>
                {star <= enriched.indice_interes ? '★' : '☆'}
              </span>
            ))}
          </div>
        )}
        <Badge variant={isVisited ? "default" : "outline"} className={cn("text-[10px]", isVisited && "bg-green-100 text-green-700 border-green-300")}>
          {isVisited ? '✓ Visitado' : 'No visitado'}
        </Badge>
        {userRating > 0 && (
          <div className="flex items-center gap-0.5" title="Tu valoración">
            {[1,2,3,4,5].map(star => (
              <span key={star} className={cn("text-sm", star <= userRating ? "text-amber-500" : "text-gray-300")}>
                {star <= userRating ? '★' : '☆'}
              </span>
            ))}
          </div>
        )}
      </div>

      {enriched?.punto_destacado && (
        <h3 className="text-sm font-semibold text-foreground leading-snug">{enriched.punto_destacado}</h3>
      )}

      <div className="max-h-36 overflow-y-auto">
        {enriched?.descripcion ? (
          <p className="text-xs text-muted-foreground leading-relaxed">{enriched.descripcion}</p>
        ) : location.description ? (
          <p className="text-xs text-muted-foreground leading-relaxed">{location.description}</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">Sin descripción</p>
        )}
      </div>

      {enriched?.observacion && (
        <p className="text-xs text-muted-foreground italic leading-relaxed">{enriched.observacion}</p>
      )}

      <Separator />

      {enriched?.datos_clave?.web_referencia && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
          <Globe className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-xs text-muted-foreground">Web:</span>
          <a href={enriched.datos_clave.web_referencia.startsWith('http') ? enriched.datos_clave.web_referencia : `https://${enriched.datos_clave.web_referencia}`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1 truncate flex-1"
            onClick={(e) => e.stopPropagation()}>
            {enriched.datos_clave.web_referencia}
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        </div>
      )}

      {enriched?.etiquetas_geograficas && enriched.etiquetas_geograficas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {enriched.etiquetas_geograficas.map((tag: string, i: number) => (
            <Badge key={i} variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800">
              #{tag.replace('#', '').replace(/\s+/g, '')}
            </Badge>
          ))}
        </div>
      )}

      {enriched?.clasificacion?.codigo && (
        <div className="flex flex-wrap gap-1">
          {enriched.clasificacion.categoria_principal && (
            <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800">
              #{enriched.clasificacion.categoria_principal.replace(/^\d+\.\s*/, '').replace(/\s+/g, '')}
            </Badge>
          )}
          {enriched.clasificacion.subcategoria && (
            <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800">
              #{enriched.clasificacion.subcategoria.replace(/^\d+\.\d+\s*/, '').replace(/\s+/g, '')}
            </Badge>
          )}
          {enriched.clasificacion.tipo_especifico && (
            <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800">
              #{enriched.clasificacion.tipo_especifico.replace(/^\d+\.\d+\.\d+\s*/, '').replace(/\s+/g, '')}
            </Badge>
          )}
        </div>
      )}

      {enriched?.etiquetas && enriched.etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {enriched.etiquetas
            .filter((tag: string) => !enriched.etiquetas_geograficas?.some((gt: string) => gt.toLowerCase() === tag.toLowerCase()))
            .map((tag: string, i: number) => (
              <Badge key={i} variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800">
                #{tag.replace('#', '').replace(/\s+/g, '')}
              </Badge>
            ))}
        </div>
      )}

      {enriched?.fuentes && enriched.fuentes.length > 0 && (
        <div className="space-y-1 pt-2 border-t">
          <span className="text-[10px] font-medium text-muted-foreground">Fuentes:</span>
          <ul className="text-[10px] text-muted-foreground space-y-0.5">
            {enriched.fuentes.slice(0, 3).map((source: string, i: number) => (
              <li key={i} className="truncate">• {source}</li>
            ))}
            {enriched.fuentes.length > 3 && <li className="italic">+{enriched.fuentes.length - 3} más</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DuplicatesList({ onClose, onLocationClick }: DuplicatesListProps) {
  const { profile, user } = useAuth();
  const setFocusedLocation = useLocationsStore(state => state.setFocusedLocation);
  const setFilters = useLocationsStore(state => state.setFilters);
  const resolvedDuplicatePairIds = useLocationsStore(state => state.resolvedDuplicatePairIds);
  const addResolvedDuplicatePair = useLocationsStore(state => state.addResolvedDuplicatePair);
  const clearResolvedDuplicates = useLocationsStore(state => state.clearResolvedDuplicates);

  // Use the shared hook — no duplicate calculation here
  const { pairs: duplicatePairs, threshold: currentThreshold } = useDuplicateCount();

  // Deletion queue from store
  const enqueueDeletion = useDuplicateStore(s => s.enqueueDeletion);
  const enqueueBatch = useDuplicateStore(s => s.enqueueBatch);
  const deletionQueue = useDuplicateStore(s => s.deletionQueue);
  const isProcessingQueue = useDuplicateStore(s => s.isProcessingQueue);
  const setThreshold = useDuplicateStore(s => s.setThreshold);

  const [pendingActions, setPendingActions] = useState<Map<string, ConflictAction>>(new Map());
  const [expandedPairs, setExpandedPairs] = useState<Set<string>>(new Set());
  const [processingPair, setProcessingPair] = useState<string | null>(null);
  const [selectedPairIds, setSelectedPairIds] = useState<string[] | null>(null);
  const [distanceThreshold, setDistanceThreshold] = useState<number>(currentThreshold);

  // Distance options — capped at 1km
  const distanceOptions = [2.5, 5, 10, 25, 50, 100, 250, 500, 1000];

  // Sync local threshold with store
  React.useEffect(() => {
    setDistanceThreshold(currentThreshold);
  }, [currentThreshold]);

  const toggleExpanded = (pairId: string) => {
    setExpandedPairs(prev => {
      const next = new Set(prev);
      if (next.has(pairId)) next.delete(pairId);
      else next.add(pairId);
      return next;
    });
  };

  // Exact duplicate pairs
  const exactDuplicatePairs = useMemo(() => {
    return duplicatePairs.filter(p => p.distance < 0.5 && p.similarity >= 0.6);
  }, [duplicatePairs]);

  const handleViewOnMap = (location: GeoLocation) => {
    setFocusedLocation(location.id);
    onLocationClick(location);
    onClose();
  };

  const handleViewPairOnMap = (location1: GeoLocation, location2: GeoLocation) => {
    setFilters({ semanticResultIds: [location1.id, location2.id] });
    setSelectedPairIds([location1.id, location2.id]);
    window.dispatchEvent(new CustomEvent('map-fit-bounds', {
      detail: {
        bounds: [
          [location1.coordinates.lat, location1.coordinates.lng],
          [location2.coordinates.lat, location2.coordinates.lng],
        ],
        padding: [100, 100],
        maxZoom: 20,
      },
    }));
    onClose();
    toast.info('Mostrando los 2 puntos duplicados. Limpia filtros para ver todos.');
  };

  // Execute action via deletion queue (non-blocking)
  const executeDirectAction = (pair: DuplicatePair, actionType: ConflictAction['action']) => {
    switch (actionType) {
      case 'keep-both':
        toast.success('Ambos puntos marcados como válidos');
        break;
      case 'keep-first':
        enqueueDeletion({
          pairId: pair.id,
          action: 'soft-delete',
          locationId: pair.location2.id,
          label: `Eliminar "${pair.location2.name}"`,
        });
        toast.success(`"${pair.location1.name}" conservado — eliminación en cola`);
        break;
      case 'keep-second':
        enqueueDeletion({
          pairId: pair.id,
          action: 'soft-delete',
          locationId: pair.location1.id,
          label: `Eliminar "${pair.location1.name}"`,
        });
        toast.success(`"${pair.location2.name}" conservado — eliminación en cola`);
        break;
      case 'delete-both':
        enqueueBatch([
          { pairId: pair.id, action: 'soft-delete', locationId: pair.location1.id, label: `Eliminar "${pair.location1.name}"` },
          { pairId: pair.id, action: 'soft-delete', locationId: pair.location2.id, label: `Eliminar "${pair.location2.name}"` },
        ]);
        toast.success('Ambos puntos añadidos a la cola de eliminación');
        break;
    }

    addResolvedDuplicatePair(pair.id);
    setExpandedPairs(prev => {
      const next = new Set(prev);
      next.delete(pair.id);
      return next;
    });
  };

  // Batch delete all exact duplicates via queue
  const handleDeleteAllExact = () => {
    if (exactDuplicatePairs.length === 0) return;

    const items = exactDuplicatePairs.map(pair => {
      const loc1Date = pair.location1.createdAt ? new Date(pair.location1.createdAt).getTime() : 0;
      const loc2Date = pair.location2.createdAt ? new Date(pair.location2.createdAt).getTime() : 0;
      const toDeleteId = loc1Date <= loc2Date ? pair.location2.id : pair.location1.id;
      const toDeleteName = loc1Date <= loc2Date ? pair.location2.name : pair.location1.name;
      return {
        pairId: pair.id,
        action: 'soft-delete' as const,
        locationId: toDeleteId,
        label: `Eliminar "${toDeleteName}"`,
      };
    });

    enqueueBatch(items);
    exactDuplicatePairs.forEach(pair => addResolvedDuplicatePair(pair.id));
    toast.success(`${items.length} duplicados exactos añadidos a la cola de eliminación`);
  };

  const getEnrichmentBadge = (location: GeoLocation) => {
    if (location.enrichedData?.descripcion) return <Badge className="bg-green-500/10 text-green-600 text-[10px]">Enriquecido</Badge>;
    if (location.description) return <Badge className="bg-gray-400/10 text-gray-600 text-[10px]">Importado</Badge>;
    return <Badge className="bg-orange-500/10 text-orange-600 text-[10px]">Vacío</Badge>;
  };

  // Queue status indicator
  const pendingInQueue = deletionQueue.filter(i => i.status === 'pending' || i.status === 'processing').length;

  const totalDatabase = duplicatePairs.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed top-16 left-[200px] right-[340px] flex justify-center max-h-[calc(100vh-5rem)] z-[2000]"
    >
      <div className="w-full max-w-[900px] bg-background/98 backdrop-blur-md flex flex-col shadow-2xl rounded-xl border max-h-full">
        {/* Header */}
        <div className="border-b bg-background/80 backdrop-blur-sm p-4 shadow-sm rounded-t-xl">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Gestión de Duplicados
              {totalDatabase > 0 && (
                <Badge variant="secondary" className="ml-2">{totalDatabase}</Badge>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {/* Queue status */}
              {pendingInQueue > 0 && (
                <Badge variant="outline" className="gap-1 text-xs animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {pendingInQueue} en cola
                </Badge>
              )}
              {exactDuplicatePairs.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleDeleteAllExact}
                  disabled={isProcessingQueue && pendingInQueue > 10}
                  className="text-destructive hover:text-destructive gap-1">
                  <Trash2 className="w-4 h-4" />
                  Eliminar {exactDuplicatePairs.length} exactos
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Revisa y resuelve ubicaciones duplicadas detectadas según tu umbral de distancia.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4">
            {/* Distance threshold selector */}
            <div className="flex items-center justify-between gap-3 mb-4 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Margen de distancia:</span>
                <Select 
                  value={distanceThreshold.toString()} 
                  onValueChange={async (v) => {
                    const newThreshold = parseFloat(v);
                    setDistanceThreshold(newThreshold);
                    setThreshold(newThreshold);
                    
                    window.dispatchEvent(new CustomEvent('duplicate-threshold-changed', { 
                      detail: { threshold: newThreshold } 
                    }));

                    if (user?.id) {
                      try {
                        await supabase
                          .from('profiles')
                          .update({ duplicate_threshold_meters: newThreshold })
                          .eq('id', user.id);
                        toast.success(`Umbral guardado: ${newThreshold < 1000 ? `${newThreshold} m` : `${newThreshold / 1000} km`}`);
                      } catch (e) {
                        console.error('Error saving threshold:', e);
                      }
                    }
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[2001]">
                    {distanceOptions.map(d => (
                      <SelectItem key={d} value={d.toString()}>
                        {d < 1 ? `${d * 100} cm` : d < 1000 ? `${d.toString().replace('.', ',')} m` : `${d / 1000} km`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  {duplicatePairs.length} posibles duplicados
                </span>
              </div>
              
              {resolvedDuplicatePairIds.length > 0 && (
                <Button variant="outline" size="sm"
                  onClick={() => { clearResolvedDuplicates(); toast.success('Pares resueltos limpiados'); }}
                  className="gap-1 text-muted-foreground hover:text-foreground">
                  <RotateCcw className="w-4 h-4" />
                  Mostrar {resolvedDuplicatePairIds.length} resueltos
                </Button>
              )}
            </div>

            {duplicatePairs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <CheckCircle className="w-16 h-16 text-green-500/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">No hay conflictos</h3>
                <p className="text-muted-foreground max-w-md">
                  No se han encontrado ubicaciones propias a menos de {distanceThreshold < 1 ? `${distanceThreshold * 100} cm` : distanceThreshold < 1000 ? `${distanceThreshold.toString().replace('.', ',')} m` : `${distanceThreshold / 1000} km`} entre sí.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {duplicatePairs.map((pair, index) => {
                  const pendingAction = pendingActions.get(pair.id);
                  const isInQueue = deletionQueue.some(q => q.pairId === pair.id && (q.status === 'pending' || q.status === 'processing'));
                  
                  return (
                    <motion.div
                      key={pair.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={cn(
                        "border rounded-xl overflow-hidden transition-all bg-white/75 dark:bg-slate-900/75 shadow-sm backdrop-blur-sm",
                        pendingAction && "ring-2 ring-primary",
                        isInQueue && "opacity-50 pointer-events-none"
                      )}
                    >
                      {/* Pair header */}
                      <div className="flex items-center gap-3 p-3 bg-muted/50 border-b">
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                        <span className="text-sm font-medium">{formatDistance(pair.distance)} de distancia</span>
                        {pair.similarity > 0.5 && (
                          <Badge variant="outline" className="text-xs">{Math.round(pair.similarity * 100)}% similares</Badge>
                        )}
                        {isInQueue && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> En cola
                          </Badge>
                        )}
                      </div>

                      {/* Compact preview */}
                      <div className="p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => toggleExpanded(pair.id)}>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            {pair.location1.enrichedData?.imagen && (
                              <img src={pair.location1.enrichedData.imagen} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">{getEnrichmentBadge(pair.location1)}</div>
                              <p className="text-sm font-medium truncate">{pair.location1.enrichedData?.nombre_lugar || pair.location1.name}</p>
                            </div>
                          </div>

                          <Button variant="outline" size="sm"
                            onClick={(e) => { e.stopPropagation(); handleViewPairOnMap(pair.location1, pair.location2); }}
                            className="flex-shrink-0 gap-1">
                            <MapPin className="w-4 h-4" /> Ver
                          </Button>

                          <div className="flex-1 flex items-center gap-2 min-w-0 justify-end text-right">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1 justify-end">{getEnrichmentBadge(pair.location2)}</div>
                              <p className="text-sm font-medium truncate">{pair.location2.enrichedData?.nombre_lugar || pair.location2.name}</p>
                            </div>
                            {pair.location2.enrichedData?.imagen && (
                              <img src={pair.location2.enrichedData.imagen} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-center mt-2">
                          <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                            {expandedPairs.has(pair.id) ? (
                              <><ChevronUp className="w-3 h-3" /> Ocultar detalles</>
                            ) : (
                              <><ChevronDown className="w-3 h-3" /> Ver comparativa detallada</>
                            )}
                          </Button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedPairs.has(pair.id) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t"
                          >
                            <div className="grid grid-cols-2 gap-4 p-4">
                              <LocationDetailColumn 
                                location={pair.location1}
                                isMarkedForDelete={pendingAction?.action === 'delete-first' || pendingAction?.action === 'delete-both'}
                                isMarkedForKeep={pendingAction?.action === 'keep-first' || pendingAction?.action === 'keep-both'}
                                onViewOnMap={() => handleViewOnMap(pair.location1)}
                              />
                              <LocationDetailColumn 
                                location={pair.location2}
                                isMarkedForDelete={pendingAction?.action === 'delete-second' || pendingAction?.action === 'delete-both'}
                                isMarkedForKeep={pendingAction?.action === 'keep-second' || pendingAction?.action === 'keep-both'}
                                onViewOnMap={() => handleViewOnMap(pair.location2)}
                              />
                            </div>

                            <div className="p-4 border-t bg-muted/30">
                              <p className="text-sm text-muted-foreground mb-3 text-center">¿Qué deseas hacer con estos puntos?</p>
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => executeDirectAction(pair, 'keep-both')} className="gap-1">
                                  <CheckCircle className="w-4 h-4" /> Mantener ambos
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => executeDirectAction(pair, 'keep-first')} className="gap-1">
                                  <CheckCircle className="w-4 h-4" /> Solo "{(pair.location1.enrichedData?.nombre_lugar || pair.location1.name).substring(0, 15)}..."
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => executeDirectAction(pair, 'keep-second')} className="gap-1">
                                  <CheckCircle className="w-4 h-4" /> Solo "{(pair.location2.enrichedData?.nombre_lugar || pair.location2.name).substring(0, 15)}..."
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => executeDirectAction(pair, 'delete-both')}
                                  className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10">
                                  <Trash2 className="w-4 h-4" /> Eliminar ambos
                                </Button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
