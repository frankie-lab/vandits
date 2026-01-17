import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  MapPin, 
  AlertTriangle,
  Trash2,
  Eye,
  CheckCircle,
  Copy,
  ArrowRight,
  Loader2,
  Merge,
  Plus,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { calculateDistance, formatDistance, getDistanceThreshold } from '@/lib/duplicate-detection';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DuplicatePair {
  id: string;
  location1: GeoLocation;
  location2: GeoLocation;
  distance: number;
  similarity: number;
}

interface ConflictAction {
  pairId: string;
  action: 'delete-first' | 'delete-second' | 'merge-into-first' | 'merge-into-second' | 'create-new';
}

interface DuplicatesListProps {
  onClose: () => void;
  onLocationClick: (location: GeoLocation) => void;
}

// Fuzzy string matching - Levenshtein distance normalized
function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  
  const distance = costs[s2.length];
  return 1 - distance / Math.max(s1.length, s2.length);
}

// Merge enriched data from two locations
function mergeEnrichedData(primary: GeoLocation, secondary: GeoLocation): Record<string, unknown> | null {
  const primaryData = primary.enrichedData;
  const secondaryData = secondary.enrichedData;
  
  if (!primaryData && !secondaryData) return null;
  if (!primaryData) return secondaryData ? { ...secondaryData } : null;
  if (!secondaryData) return { ...primaryData };
  
  // Combine data, preferring non-empty values from primary
  const merged = { ...secondaryData, ...primaryData };
  
  // Special handling for arrays (tags)
  const tags1 = primaryData.etiquetas || [];
  const tags2 = secondaryData.etiquetas || [];
  merged.etiquetas = [...new Set([...tags1, ...tags2])];
  
  return merged as Record<string, unknown>;
}

export function DuplicatesList({ onClose, onLocationClick }: DuplicatesListProps) {
  const documents = useLocationsStore(state => state.documents);
  const getAllLocations = useLocationsStore(state => state.getAllLocations);
  const setFocusedLocation = useLocationsStore(state => state.setFocusedLocation);
  
  const [pendingActions, setPendingActions] = useState<Map<string, ConflictAction>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [processingPair, setProcessingPair] = useState<string | null>(null);

  // Find all potential duplicates
  const duplicatePairs = useMemo(() => {
    const allLocations = getAllLocations();
    const pairs: DuplicatePair[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < allLocations.length; i++) {
      for (let j = i + 1; j < allLocations.length; j++) {
        const loc1 = allLocations[i];
        const loc2 = allLocations[j];
        
        const pairKey = [loc1.id, loc2.id].sort().join('-');
        if (processed.has(pairKey)) continue;
        
        const distance = calculateDistance(
          loc1.coordinates.lat,
          loc1.coordinates.lng,
          loc2.coordinates.lat,
          loc2.coordinates.lng
        );
        
        const threshold = Math.max(getDistanceThreshold(loc1), getDistanceThreshold(loc2));
        
        const name1 = loc1.enrichedData?.nombre_lugar || loc1.name;
        const name2 = loc2.enrichedData?.nombre_lugar || loc2.name;
        const nameSimilarity = stringSimilarity(name1, name2);
        
        const isCloseEnough = distance <= threshold;
        const isNearAndSimilar = distance <= 500 && nameSimilarity > 0.6;
        
        if (isCloseEnough || isNearAndSimilar) {
          processed.add(pairKey);
          pairs.push({
            id: pairKey,
            location1: loc1,
            location2: loc2,
            distance,
            similarity: nameSimilarity,
          });
        }
      }
    }

    return pairs.sort((a, b) => a.distance - b.distance);
  }, [getAllLocations]);

  const handleViewOnMap = (location: GeoLocation) => {
    setFocusedLocation(location.id);
    onLocationClick(location);
    onClose();
  };

  const setAction = (pairId: string, action: ConflictAction['action']) => {
    setPendingActions(prev => {
      const next = new Map(prev);
      next.set(pairId, { pairId, action });
      return next;
    });
  };

  const clearAction = (pairId: string) => {
    setPendingActions(prev => {
      const next = new Map(prev);
      next.delete(pairId);
      return next;
    });
  };

  const executeAction = async (pairId: string) => {
    const action = pendingActions.get(pairId);
    const pair = duplicatePairs.find(p => p.id === pairId);
    if (!action || !pair) return;

    setProcessingPair(pairId);
    setIsProcessing(true);

    try {
      switch (action.action) {
        case 'delete-first':
          await supabase.from('locations').delete().eq('id', pair.location1.id);
          toast.success(`"${pair.location1.name}" eliminado`);
          break;

        case 'delete-second':
          await supabase.from('locations').delete().eq('id', pair.location2.id);
          toast.success(`"${pair.location2.name}" eliminado`);
          break;

        case 'merge-into-first':
          // Merge data into location1, delete location2
          const merged1 = mergeEnrichedData(pair.location1, pair.location2);
          await supabase
            .from('locations')
            .update({
              enriched_data: merged1 as any,
              description: pair.location1.description || pair.location2.description,
            })
            .eq('id', pair.location1.id);
          await supabase.from('locations').delete().eq('id', pair.location2.id);
          toast.success(`Fusionado en "${pair.location1.name}"`);
          break;

        case 'merge-into-second':
          // Merge data into location2, delete location1
          const merged2 = mergeEnrichedData(pair.location2, pair.location1);
          await supabase
            .from('locations')
            .update({
              enriched_data: merged2 as any,
              description: pair.location2.description || pair.location1.description,
            })
            .eq('id', pair.location2.id);
          await supabase.from('locations').delete().eq('id', pair.location1.id);
          toast.success(`Fusionado en "${pair.location2.name}"`);
          break;

        case 'create-new':
          // Create new at midpoint, delete both
          const midLat = (pair.location1.coordinates.lat + pair.location2.coordinates.lat) / 2;
          const midLng = (pair.location1.coordinates.lng + pair.location2.coordinates.lng) / 2;
          const mergedData = mergeEnrichedData(pair.location1, pair.location2);
          
          // Use the best name available
          const bestName = pair.location1.enrichedData?.nombre_lugar || 
                          pair.location2.enrichedData?.nombre_lugar || 
                          pair.location1.name || 
                          pair.location2.name;
          
          const insertData = {
            name: bestName,
            latitude: midLat,
            longitude: midLng,
            document_id: null as string | null,
            description: pair.location1.description || pair.location2.description || null,
            place_type: pair.location1.placeType || pair.location2.placeType || null,
            continent: pair.location1.continent || pair.location2.continent || null,
            country: pair.location1.country || pair.location2.country || null,
            region: pair.location1.region || pair.location2.region || null,
            zone: pair.location1.zone || pair.location2.zone || null,
            enriched_data: mergedData as any,
          };
          
          await supabase.from('locations').insert(insertData);
          
          await supabase.from('locations').delete().eq('id', pair.location1.id);
          await supabase.from('locations').delete().eq('id', pair.location2.id);
          toast.success(`Nuevo punto creado en coordenadas intermedias`);
          break;
      }

      // Clear action and refresh
      clearAction(pairId);
      window.location.reload();
      
    } catch (error) {
      console.error('Action error:', error);
      toast.error('Error al procesar la acción');
    } finally {
      setIsProcessing(false);
      setProcessingPair(null);
    }
  };

  const getEnrichmentBadge = (location: GeoLocation) => {
    if (location.enrichedData?.descripcion) {
      return <Badge className="bg-green-500/10 text-green-600 text-[10px]">Enriquecido</Badge>;
    }
    if (location.description) {
      return <Badge className="bg-orange-500/10 text-orange-600 text-[10px]">Original</Badge>;
    }
    return <Badge className="bg-red-500/10 text-red-600 text-[10px]">Sin datos</Badge>;
  };

  const getActionLabel = (action: ConflictAction['action'], pair: DuplicatePair): string => {
    switch (action) {
      case 'delete-first': return `Eliminar "${pair.location1.name}"`;
      case 'delete-second': return `Eliminar "${pair.location2.name}"`;
      case 'merge-into-first': return `Fusionar en "${pair.location1.name}"`;
      case 'merge-into-second': return `Fusionar en "${pair.location2.name}"`;
      case 'create-new': return 'Crear nuevo en punto medio';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[2000] bg-background/98 backdrop-blur-sm flex flex-col"
    >
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-md p-4">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Conflictos de Duplicados
              {duplicatePairs.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {duplicatePairs.length} conflictos
                </Badge>
              )}
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Puntos próximos detectados. Elige una acción para cada conflicto: eliminar, fusionar o crear nuevo.
          </p>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="container mx-auto max-w-4xl p-4">
          {duplicatePairs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CheckCircle className="w-16 h-16 text-green-500/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">No hay conflictos</h3>
              <p className="text-muted-foreground max-w-md">
                No se han encontrado ubicaciones duplicadas o cercanas en tu colección.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {duplicatePairs.map((pair, index) => {
                const pendingAction = pendingActions.get(pair.id);
                const isThisProcessing = processingPair === pair.id;
                
                return (
                  <motion.div
                    key={pair.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className={cn(
                      "border rounded-xl overflow-hidden transition-all",
                      pendingAction && "ring-2 ring-primary"
                    )}
                  >
                    {/* Pair header */}
                    <div className="flex items-center gap-3 p-3 bg-muted/50 border-b">
                      <AlertTriangle className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium">
                        {formatDistance(pair.distance)} de distancia
                      </span>
                      {pair.similarity > 0.5 && (
                        <Badge variant="outline" className="text-xs">
                          {Math.round(pair.similarity * 100)}% similares
                        </Badge>
                      )}
                      <div className="flex-1" />
                      
                      {/* Action selector */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant={pendingAction ? "default" : "outline"} 
                            size="sm"
                            className="min-w-[180px] justify-between"
                          >
                            {pendingAction ? (
                              <span className="truncate text-xs">
                                {getActionLabel(pendingAction.action, pair)}
                              </span>
                            ) : (
                              <span>Resolver conflicto</span>
                            )}
                            <ChevronDown className="w-4 h-4 ml-2 flex-shrink-0" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          <DropdownMenuItem 
                            onClick={() => setAction(pair.id, 'delete-first')}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar "{pair.location1.name.substring(0, 20)}..."
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setAction(pair.id, 'delete-second')}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar "{pair.location2.name.substring(0, 20)}..."
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setAction(pair.id, 'merge-into-first')}>
                            <Merge className="w-4 h-4 mr-2" />
                            Fusionar en "{pair.location1.name.substring(0, 18)}..."
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setAction(pair.id, 'merge-into-second')}>
                            <Merge className="w-4 h-4 mr-2" />
                            Fusionar en "{pair.location2.name.substring(0, 18)}..."
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setAction(pair.id, 'create-new')}>
                            <Plus className="w-4 h-4 mr-2" />
                            Crear nuevo en punto medio
                          </DropdownMenuItem>
                          {pendingAction && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => clearAction(pair.id)}>
                                <X className="w-4 h-4 mr-2" />
                                Cancelar acción
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {pendingAction && (
                        <Button
                          size="sm"
                          onClick={() => executeAction(pair.id)}
                          disabled={isProcessing}
                        >
                          {isThisProcessing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>

                    {/* Locations comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x relative">
                      {/* Location 1 */}
                      <div 
                        className={cn(
                          "p-4 hover:bg-muted/30 cursor-pointer transition-colors",
                          pendingAction?.action === 'delete-first' && "bg-red-500/5 opacity-60",
                          pendingAction?.action === 'merge-into-first' && "bg-green-500/5 ring-1 ring-green-500/30"
                        )}
                        onClick={() => handleViewOnMap(pair.location1)}
                      >
                        <div className="flex items-start gap-3">
                          {pair.location1.enrichedData?.imagen && (
                            <img
                              src={pair.location1.enrichedData.imagen}
                              alt=""
                              className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getEnrichmentBadge(pair.location1)}
                              {pendingAction?.action === 'delete-first' && (
                                <Badge className="bg-red-500/10 text-red-600 text-[10px]">
                                  <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                                </Badge>
                              )}
                              {pendingAction?.action === 'merge-into-first' && (
                                <Badge className="bg-green-500/10 text-green-600 text-[10px]">
                                  <Merge className="w-3 h-3 mr-1" /> Conservar
                                </Badge>
                              )}
                            </div>
                            <h4 className="font-medium text-sm line-clamp-1">
                              {pair.location1.enrichedData?.nombre_lugar || pair.location1.name}
                            </h4>
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {[pair.location1.zone, pair.location1.region, pair.location1.country]
                                .filter(Boolean)
                                .join(', ')}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                              {pair.location1.coordinates.lat.toFixed(5)}, {pair.location1.coordinates.lng.toFixed(5)}
                            </p>
                          </div>
                          <Eye className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        </div>
                      </div>

                      {/* Arrow indicator */}
                      <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                        <div className="w-8 h-8 bg-background border rounded-full flex items-center justify-center shadow-sm">
                          {pendingAction?.action === 'create-new' ? (
                            <Plus className="w-4 h-4 text-primary" />
                          ) : (
                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Location 2 */}
                      <div 
                        className={cn(
                          "p-4 hover:bg-muted/30 cursor-pointer transition-colors",
                          pendingAction?.action === 'delete-second' && "bg-red-500/5 opacity-60",
                          pendingAction?.action === 'merge-into-second' && "bg-green-500/5 ring-1 ring-green-500/30"
                        )}
                        onClick={() => handleViewOnMap(pair.location2)}
                      >
                        <div className="flex items-start gap-3">
                          {pair.location2.enrichedData?.imagen && (
                            <img
                              src={pair.location2.enrichedData.imagen}
                              alt=""
                              className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getEnrichmentBadge(pair.location2)}
                              {pendingAction?.action === 'delete-second' && (
                                <Badge className="bg-red-500/10 text-red-600 text-[10px]">
                                  <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                                </Badge>
                              )}
                              {pendingAction?.action === 'merge-into-second' && (
                                <Badge className="bg-green-500/10 text-green-600 text-[10px]">
                                  <Merge className="w-3 h-3 mr-1" /> Conservar
                                </Badge>
                              )}
                            </div>
                            <h4 className="font-medium text-sm line-clamp-1">
                              {pair.location2.enrichedData?.nombre_lugar || pair.location2.name}
                            </h4>
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {[pair.location2.zone, pair.location2.region, pair.location2.country]
                                .filter(Boolean)
                                .join(', ')}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                              {pair.location2.coordinates.lat.toFixed(5)}, {pair.location2.coordinates.lng.toFixed(5)}
                            </p>
                          </div>
                          <Eye className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        </div>
                      </div>
                    </div>

                    {/* Create new preview */}
                    {pendingAction?.action === 'create-new' && (
                      <div className="p-3 bg-primary/5 border-t flex items-center gap-3">
                        <Plus className="w-4 h-4 text-primary" />
                        <span className="text-sm">
                          Nueva ubicación en: {' '}
                          <code className="text-xs bg-background px-1 py-0.5 rounded">
                            {((pair.location1.coordinates.lat + pair.location2.coordinates.lat) / 2).toFixed(5)}, 
                            {((pair.location1.coordinates.lng + pair.location2.coordinates.lng) / 2).toFixed(5)}
                          </code>
                        </span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
}