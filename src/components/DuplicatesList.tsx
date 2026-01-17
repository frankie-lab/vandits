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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { calculateDistance, formatDistance, getDistanceThreshold } from '@/lib/duplicate-detection';
import { deleteDocumentFromDatabase } from '@/hooks/use-database-sync';
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
  
  // Check if one contains the other
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  // Levenshtein distance
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

export function DuplicatesList({ onClose, onLocationClick }: DuplicatesListProps) {
  const documents = useLocationsStore(state => state.documents);
  const getAllLocations = useLocationsStore(state => state.getAllLocations);
  const setFocusedLocation = useLocationsStore(state => state.setFocusedLocation);
  
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'first' | 'second' | null>(null);

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
        
        // Calculate geographic distance
        const distance = calculateDistance(
          loc1.coordinates.lat,
          loc1.coordinates.lng,
          loc2.coordinates.lat,
          loc2.coordinates.lng
        );
        
        // Get threshold based on place type
        const threshold = Math.max(getDistanceThreshold(loc1), getDistanceThreshold(loc2));
        
        // Calculate name similarity
        const name1 = loc1.enrichedData?.nombre_lugar || loc1.name;
        const name2 = loc2.enrichedData?.nombre_lugar || loc2.name;
        const nameSimilarity = stringSimilarity(name1, name2);
        
        // Consider as potential duplicate if:
        // 1. Very close geographically (within threshold), OR
        // 2. Close geographically (within 500m) AND similar names (>60%)
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

    // Sort by distance (closest first)
    return pairs.sort((a, b) => a.distance - b.distance);
  }, [getAllLocations]);

  const togglePairSelection = (pairId: string) => {
    setSelectedPairs(prev => {
      const next = new Set(prev);
      if (next.has(pairId)) {
        next.delete(pairId);
      } else {
        next.add(pairId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPairs(new Set(duplicatePairs.map(p => p.id)));
  };

  const clearSelection = () => {
    setSelectedPairs(new Set());
  };

  const handleViewOnMap = (location: GeoLocation) => {
    setFocusedLocation(location.id);
    onLocationClick(location);
    onClose();
  };

  const handleDeleteSelected = async (target: 'first' | 'second') => {
    if (selectedPairs.size === 0) return;
    
    setIsDeleting(true);
    
    try {
      const locationsToDelete = Array.from(selectedPairs).map(pairId => {
        const pair = duplicatePairs.find(p => p.id === pairId);
        if (!pair) return null;
        
        // Delete the one without enrichment, or the specified one
        if (target === 'first') {
          // Delete location1 unless it's enriched and location2 is not
          if (pair.location1.enrichedData && !pair.location2.enrichedData) {
            return pair.location2;
          }
          return pair.location1;
        } else {
          // Delete location2 unless it's enriched and location1 is not
          if (pair.location2.enrichedData && !pair.location1.enrichedData) {
            return pair.location1;
          }
          return pair.location2;
        }
      }).filter(Boolean) as GeoLocation[];

      // Delete from database
      for (const location of locationsToDelete) {
        const { error } = await supabase
          .from('locations')
          .delete()
          .eq('id', location.id);
        
        if (error) {
          console.error('Error deleting location:', error);
        }
      }

      toast.success(`${locationsToDelete.length} ubicaciones eliminadas`);
      
      // Force refresh
      window.location.reload();
      
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Error al eliminar ubicaciones');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <Copy className="w-5 h-5 text-orange-500" />
              Duplicados Detectados
              {duplicatePairs.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {duplicatePairs.length} pares
                </Badge>
              )}
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {duplicatePairs.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Seleccionar todos
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Limpiar
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedPairs.size} seleccionados
                </span>
              </div>
              
              {selectedPairs.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Eliminar {selectedPairs.size} duplicados
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="container mx-auto max-w-4xl p-4">
          {duplicatePairs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CheckCircle className="w-16 h-16 text-green-500/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">No hay duplicados</h3>
              <p className="text-muted-foreground max-w-md">
                No se han encontrado ubicaciones duplicadas en tu colección.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {duplicatePairs.map((pair, index) => (
                <motion.div
                  key={pair.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={cn(
                    "border rounded-xl overflow-hidden transition-all",
                    selectedPairs.has(pair.id) && "ring-2 ring-primary"
                  )}
                >
                  {/* Pair header */}
                  <div className="flex items-center gap-3 p-3 bg-muted/50 border-b">
                    <Checkbox
                      checked={selectedPairs.has(pair.id)}
                      onCheckedChange={() => togglePairSelection(pair.id)}
                    />
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-medium">
                      {formatDistance(pair.distance)} de distancia
                    </span>
                    {pair.similarity > 0.5 && (
                      <Badge variant="outline" className="text-xs">
                        {Math.round(pair.similarity * 100)}% similar
                      </Badge>
                    )}
                  </div>

                  {/* Locations comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                    {/* Location 1 */}
                    <div 
                      className="p-4 hover:bg-muted/30 cursor-pointer transition-colors"
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

                    {/* Arrow */}
                    <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                      <div className="w-8 h-8 bg-background border rounded-full flex items-center justify-center">
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>

                    {/* Location 2 */}
                    <div 
                      className="p-4 hover:bg-muted/30 cursor-pointer transition-colors"
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
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="z-[2001]">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar duplicados?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán {selectedPairs.size} ubicaciones duplicadas. 
              Por defecto se conservan las que tienen ficha enriquecida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteSelected('first')}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Eliminar duplicados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
