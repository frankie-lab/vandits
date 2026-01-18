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
  ChevronUp,
  ExternalLink,
  RotateCcw,
  Tag,
  Info,
  FileText,
  Image,
  Globe,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { calculateDistance, formatDistance } from '@/lib/duplicate-detection';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';

interface DuplicatePair {
  id: string;
  location1: GeoLocation;
  location2: GeoLocation;
  distance: number;
  similarity: number;
}

interface ConflictAction {
  pairId: string;
  action: 'delete-first' | 'delete-second' | 'merge-into-first' | 'merge-into-second' | 'create-new' | 'keep-both' | 'keep-first' | 'keep-second' | 'delete-both';
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

// Component for detailed location comparison column
function LocationDetailColumn({ 
  location, 
  isMarkedForDelete, 
  isMarkedForKeep,
  onViewOnMap 
}: { 
  location: GeoLocation; 
  isMarkedForDelete: boolean;
  isMarkedForKeep: boolean;
  onViewOnMap: () => void;
}) {
  const enriched = location.enrichedData;
  
  return (
    <div 
      className={cn(
        "p-4 space-y-4",
        isMarkedForDelete && "bg-red-500/5 opacity-60",
        isMarkedForKeep && "bg-green-500/5"
      )}
    >
      {/* Header with image */}
      <div className="flex gap-3">
        {enriched?.imagen ? (
          <img
            src={enriched.imagen}
            alt=""
            className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <Image className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-base">
            {enriched?.nombre_lugar || location.name}
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {enriched?.localizacion || [location.zone, location.region, location.country].filter(Boolean).join(', ')}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono mt-1">
            {location.coordinates.lat.toFixed(5)}, {location.coordinates.lng.toFixed(5)}
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-2"
            onClick={(e) => { e.stopPropagation(); onViewOnMap(); }}
          >
            <Eye className="w-3 h-3 mr-1" /> Ver en mapa
          </Button>
        </div>
      </div>

      <Separator />

      {/* Category & Type */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium">Categoría:</span>
          <Badge variant="secondary" className="text-xs">
            {enriched?.categoria || location.placeType || 'Sin clasificar'}
          </Badge>
        </div>
        {enriched?.datos_clave?.tipo && (
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium">Tipo:</span>
            <span className="text-xs text-muted-foreground">{enriched.datos_clave.tipo}</span>
          </div>
        )}
      </div>

      {/* Description comparison */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium">Descripción:</span>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 max-h-40 overflow-y-auto">
          {enriched?.descripcion ? (
            <p className="text-xs leading-relaxed">{enriched.descripcion}</p>
          ) : location.description ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{location.description}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">Sin descripción</p>
          )}
        </div>
      </div>

      {/* Highlight */}
      {enriched?.punto_destacado && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium">Punto destacado:</span>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <p className="text-xs leading-relaxed">{enriched.punto_destacado}</p>
          </div>
        </div>
      )}

      {/* Tags */}
      {enriched?.etiquetas && enriched.etiquetas.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium">Etiquetas:</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {enriched.etiquetas.map((tag, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Web reference */}
      {enriched?.datos_clave?.web_referencia && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium">Web:</span>
          </div>
          <a 
            href={enriched.datos_clave.web_referencia}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {enriched.datos_clave.web_referencia}
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        </div>
      )}

      {/* Sources */}
      {enriched?.fuentes && enriched.fuentes.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Fuentes:</span>
          <ul className="text-[10px] text-muted-foreground space-y-0.5">
            {enriched.fuentes.slice(0, 3).map((source, i) => (
              <li key={i} className="truncate">• {source}</li>
            ))}
            {enriched.fuentes.length > 3 && (
              <li className="italic">+{enriched.fuentes.length - 3} más</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DuplicatesList({ onClose, onLocationClick }: DuplicatesListProps) {
  const { profile, user } = useAuth();
  const getAllLocations = useLocationsStore(state => state.getAllLocations);
  const setFocusedLocation = useLocationsStore(state => state.setFocusedLocation);
  const setFilters = useLocationsStore(state => state.setFilters);
  const filters = useLocationsStore(state => state.filters);
  const resolvedDuplicatePairIds = useLocationsStore(state => state.resolvedDuplicatePairIds);
  const addResolvedDuplicatePair = useLocationsStore(state => state.addResolvedDuplicatePair);
  const clearResolvedDuplicates = useLocationsStore(state => state.clearResolvedDuplicates);
  
  // Use profile threshold as default, fallback to 250m
  const userThreshold = profile?.duplicate_threshold_meters ?? 250;
  
  const [pendingActions, setPendingActions] = useState<Map<string, ConflictAction>>(new Map());
  const [expandedPairs, setExpandedPairs] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPair, setProcessingPair] = useState<string | null>(null);
  const [selectedPairIds, setSelectedPairIds] = useState<string[] | null>(null);
  const [distanceThreshold, setDistanceThreshold] = useState<number>(userThreshold);
  
  // Distance options up to 5km
  const distanceOptions = [2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000];
  
  // Sync threshold when profile loads/changes
  React.useEffect(() => {
    if (profile?.duplicate_threshold_meters !== undefined) {
      setDistanceThreshold(profile.duplicate_threshold_meters);
    }
  }, [profile?.duplicate_threshold_meters]);

  const toggleExpanded = (pairId: string) => {
    setExpandedPairs(prev => {
      const next = new Set(prev);
      if (next.has(pairId)) {
        next.delete(pairId);
      } else {
        next.add(pairId);
      }
      return next;
    });
  };

  // Find all potential duplicates based on selected threshold - ONLY user's own locations
  const duplicatePairs = useMemo(() => {
    const allLocations = getAllLocations();
    const getLocationOwnership = useLocationsStore.getState().getLocationOwnership;
    
    // Filter to only user's own locations (exclude followed users' points)
    const myLocations = user 
      ? allLocations.filter(loc => getLocationOwnership(loc.id, user.id).isOwn)
      : allLocations;
    
    const pairs: DuplicatePair[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < myLocations.length; i++) {
      for (let j = i + 1; j < myLocations.length; j++) {
        const loc1 = myLocations[i];
        const loc2 = myLocations[j];
        
        const pairKey = [loc1.id, loc2.id].sort().join('-');
        if (processed.has(pairKey)) continue;
        
        const distance = calculateDistance(
          loc1.coordinates.lat,
          loc1.coordinates.lng,
          loc2.coordinates.lat,
          loc2.coordinates.lng
        );
        
        // Use user-selected threshold instead of category-based
        if (distance <= distanceThreshold) {
          const name1 = loc1.enrichedData?.nombre_lugar || loc1.name;
          const name2 = loc2.enrichedData?.nombre_lugar || loc2.name;
          const nameSimilarity = stringSimilarity(name1, name2);
          
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

    // Filter out resolved pairs
    return pairs
      .filter(p => !resolvedDuplicatePairIds.includes(p.id))
      .sort((a, b) => a.distance - b.distance);
  }, [getAllLocations, user, distanceThreshold, resolvedDuplicatePairIds]);

  const handleViewOnMap = (location: GeoLocation) => {
    setFocusedLocation(location.id);
    onLocationClick(location);
    onClose();
  };

  // Filter map to show only the two locations of a duplicate pair and center on them
  const handleViewPairOnMap = (location1: GeoLocation, location2: GeoLocation) => {
    setFilters({ ...filters, semanticResultIds: [location1.id, location2.id] });
    setSelectedPairIds([location1.id, location2.id]);
    
    // Dispatch event to center map on these two points with maximum zoom
    window.dispatchEvent(new CustomEvent('map-fit-bounds', { 
      detail: { 
        bounds: [
          [location1.coordinates.lat, location1.coordinates.lng],
          [location2.coordinates.lat, location2.coordinates.lng]
        ],
        padding: [100, 100],
        maxZoom: 20
      } 
    }));
    
    onClose();
    toast.info('Mostrando los 2 puntos duplicados. Limpia filtros para ver todos.');
  };

  // Clear duplicate filter
  const handleClearDuplicateFilter = () => {
    setFilters({ ...filters, semanticResultIds: undefined });
    setSelectedPairIds(null);
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

        case 'keep-both':
          // Mark both as valid - just dismiss from duplicates view
          toast.success('Ambos puntos marcados como válidos');
          break;

        case 'keep-first':
          // Keep first, delete second
          await supabase.from('locations').delete().eq('id', pair.location2.id);
          toast.success(`"${pair.location1.name}" conservado, "${pair.location2.name}" eliminado`);
          break;

        case 'keep-second':
          // Keep second, delete first
          await supabase.from('locations').delete().eq('id', pair.location1.id);
          toast.success(`"${pair.location2.name}" conservado, "${pair.location1.name}" eliminado`);
          break;

        case 'delete-both':
          // Delete both locations
          await supabase.from('locations').delete().eq('id', pair.location1.id);
          await supabase.from('locations').delete().eq('id', pair.location2.id);
          toast.success('Ambos puntos eliminados');
          break;
      }

      // Mark pair as resolved so it disappears from the list
      addResolvedDuplicatePair(pairId);
      
      // Clear action and collapse the pair
      clearAction(pairId);
      setExpandedPairs(prev => {
        const next = new Set(prev);
        next.delete(pairId);
        return next;
      });
      
      // Dispatch event to refresh locations data
      window.dispatchEvent(new CustomEvent('store-updated'));
      
    } catch (error) {
      console.error('Action error:', error);
      toast.error('Error al procesar la acción');
    } finally {
      setIsProcessing(false);
      setProcessingPair(null);
    }
  };

  // Execute action directly without confirmation step
  const executeDirectAction = async (pair: DuplicatePair, actionType: ConflictAction['action']) => {
    setProcessingPair(pair.id);
    setIsProcessing(true);

    try {
      switch (actionType) {
        case 'keep-both':
          toast.success('Ambos puntos marcados como válidos');
          break;

        case 'keep-first':
          await supabase.from('locations').delete().eq('id', pair.location2.id);
          toast.success(`"${pair.location1.name}" conservado, "${pair.location2.name}" eliminado`);
          break;

        case 'keep-second':
          await supabase.from('locations').delete().eq('id', pair.location1.id);
          toast.success(`"${pair.location2.name}" conservado, "${pair.location1.name}" eliminado`);
          break;

        case 'delete-both':
          await supabase.from('locations').delete().eq('id', pair.location1.id);
          await supabase.from('locations').delete().eq('id', pair.location2.id);
          toast.success('Ambos puntos eliminados');
          break;
      }

      // Mark pair as resolved
      addResolvedDuplicatePair(pair.id);
      setExpandedPairs(prev => {
        const next = new Set(prev);
        next.delete(pair.id);
        return next;
      });
      
      window.dispatchEvent(new CustomEvent('store-updated'));
      
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
      return <Badge className="bg-gray-400/10 text-gray-600 text-[10px]">Importado</Badge>;
    }
    return <Badge className="bg-orange-500/10 text-orange-600 text-[10px]">Vacío</Badge>;
  };

  const getActionLabel = (action: ConflictAction['action'], pair: DuplicatePair): string => {
    switch (action) {
      case 'delete-first': return `Eliminar "${pair.location1.name}"`;
      case 'delete-second': return `Eliminar "${pair.location2.name}"`;
      case 'merge-into-first': return `Fusionar en "${pair.location1.name}"`;
      case 'merge-into-second': return `Fusionar en "${pair.location2.name}"`;
      case 'create-new': return 'Crear nuevo en punto medio';
      case 'keep-both': return 'Mantener ambos';
      case 'keep-first': return `Solo "${pair.location1.name}"`;
      case 'keep-second': return `Solo "${pair.location2.name}"`;
      case 'delete-both': return 'Eliminar ambos';
    }
  };

  const totalDatabase = duplicatePairs.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[2000] bg-background flex flex-col"
    >
      {/* Header */}
      <div className="border-b bg-background p-4 shadow-sm">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Gestión de Duplicados
              {totalDatabase > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {totalDatabase}
                </Badge>
              )}
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Revisa y resuelve ubicaciones duplicadas detectadas según tu umbral de distancia.
          </p>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="container mx-auto max-w-4xl p-4">
          {/* Distance threshold selector */}
          <div className="flex items-center justify-between gap-3 mb-4 p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Margen de distancia:</span>
              <Select 
                value={distanceThreshold.toString()} 
                onValueChange={(v) => setDistanceThreshold(parseFloat(v))}
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearResolvedDuplicates();
                  toast.success('Pares resueltos limpiados');
                }}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
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
                    </div>

                    {/* Compact preview - click to expand */}
                    <div 
                      className="p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => toggleExpanded(pair.id)}
                    >
                      <div className="flex items-center gap-3">
                        {/* Location 1 mini preview */}
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          {pair.location1.enrichedData?.imagen && (
                            <img
                              src={pair.location1.enrichedData.imagen}
                              alt=""
                              className="w-10 h-10 rounded object-cover flex-shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              {getEnrichmentBadge(pair.location1)}
                              {pendingAction?.action === 'delete-first' && (
                                <Badge className="bg-red-500/10 text-red-600 text-[10px]">
                                  <Trash2 className="w-3 h-3" />
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium truncate">
                              {pair.location1.enrichedData?.nombre_lugar || pair.location1.name}
                            </p>
                          </div>
                        </div>

                        {/* Single "Ver" button for both points */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleViewPairOnMap(pair.location1, pair.location2); }}
                          className="flex-shrink-0 gap-1"
                        >
                          <MapPin className="w-4 h-4" />
                          Ver
                        </Button>

                        {/* Location 2 mini preview */}
                        <div className="flex-1 flex items-center gap-2 min-w-0 justify-end text-right">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 justify-end">
                              {getEnrichmentBadge(pair.location2)}
                              {pendingAction?.action === 'delete-second' && (
                                <Badge className="bg-red-500/10 text-red-600 text-[10px]">
                                  <Trash2 className="w-3 h-3" />
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium truncate">
                              {pair.location2.enrichedData?.nombre_lugar || pair.location2.name}
                            </p>
                          </div>
                          {pair.location2.enrichedData?.imagen && (
                            <img
                              src={pair.location2.enrichedData.imagen}
                              alt=""
                              className="w-10 h-10 rounded object-cover flex-shrink-0"
                            />
                          )}
                        </div>
                      </div>

                      {/* Expand indicator */}
                      <div className="flex items-center justify-center mt-2">
                        <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                          {expandedPairs.has(pair.id) ? (
                            <>
                              <ChevronUp className="w-3 h-3" />
                              Ocultar detalles
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              Ver comparativa detallada
                            </>
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
                          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                            {/* Location 1 full details */}
                            <LocationDetailColumn 
                              location={pair.location1}
                              isMarkedForDelete={pendingAction?.action === 'delete-first' || pendingAction?.action === 'delete-both'}
                              isMarkedForKeep={pendingAction?.action === 'keep-first' || pendingAction?.action === 'keep-both'}
                              onViewOnMap={() => handleViewOnMap(pair.location1)}
                            />

                            {/* Location 2 full details */}
                            <LocationDetailColumn 
                              location={pair.location2}
                              isMarkedForDelete={pendingAction?.action === 'delete-second' || pendingAction?.action === 'delete-both'}
                              isMarkedForKeep={pendingAction?.action === 'keep-second' || pendingAction?.action === 'keep-both'}
                              onViewOnMap={() => handleViewOnMap(pair.location2)}
                            />
                          </div>

                          {/* Action buttons */}
                          <div className="p-4 border-t bg-muted/30">
                            <p className="text-sm text-muted-foreground mb-3 text-center">¿Qué deseas hacer con estos puntos?</p>
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => executeDirectAction(pair, 'keep-both')}
                                disabled={isThisProcessing}
                                className="gap-1"
                              >
                                {isThisProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Mantener ambos
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => executeDirectAction(pair, 'keep-first')}
                                disabled={isThisProcessing}
                                className="gap-1"
                              >
                                {isThisProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Solo "{(pair.location1.enrichedData?.nombre_lugar || pair.location1.name).substring(0, 15)}..."
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => executeDirectAction(pair, 'keep-second')}
                                disabled={isThisProcessing}
                                className="gap-1"
                              >
                                {isThisProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Solo "{(pair.location2.enrichedData?.nombre_lugar || pair.location2.name).substring(0, 15)}..."
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => executeDirectAction(pair, 'delete-both')}
                                disabled={isThisProcessing}
                                className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                {isThisProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                Eliminar ambos
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

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