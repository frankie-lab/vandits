import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Sparkles, 
  X, 
  MapPin, 
  Loader2,
  Lightbulb,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useLocationsStore } from '@/store/locations-store';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation } from '@/types/location';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SemanticSearchProps {
  onClose: () => void;
  onLocationClick: (location: GeoLocation) => void;
}

const EXAMPLE_QUERIES = [
  "playas tranquilas y poco turísticas",
  "pueblos medievales con encanto",
  "miradores con vistas panorámicas",
  "lugares para ver atardeceres",
  "cascadas y piscinas naturales",
  "ruinas históricas romanas",
  "parques naturales para senderismo",
  "gastronomía tradicional local",
];

export function SemanticSearch({ onClose, onLocationClick }: SemanticSearchProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [reasoning, setReasoning] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  
  const documents = useLocationsStore(state => state.documents);
  const setFocusedLocation = useLocationsStore(state => state.setFocusedLocation);
  const updateLocation = useLocationsStore(state => state.updateLocation);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setHasSearched(true);
    
    try {
      const documentIds = documents.map(d => d.id);
      
      const { data, error } = await supabase.functions.invoke('semantic-search', {
        body: { 
          query: query.trim(),
          documentIds,
          limit: 20,
        },
      });

      if (error) {
        console.error('Search error:', error);
        toast.error('Error en la búsqueda semántica');
        return;
      }

      if (data.error) {
        if (data.error.includes('429') || data.error.includes('límite')) {
          toast.error('Demasiadas peticiones, espera unos segundos');
        } else if (data.error.includes('402') || data.error.includes('créditos')) {
          toast.error('Créditos de IA agotados');
        } else {
          toast.error(data.error);
        }
        return;
      }

      // Map results to GeoLocation format
      const mappedResults: GeoLocation[] = (data.results || []).map((loc: any) => ({
        id: loc.id,
        name: loc.enriched_data?.nombre_lugar || loc.name,
        coordinates: { lat: 0, lng: 0 }, // Will be filled from store
        continent: loc.continent,
        country: loc.country,
        region: loc.region,
        zone: loc.zone,
        enrichedData: loc.enriched_data,
        description: loc.description,
      }));

      // Get full location data from store
      const allLocations = documents.flatMap(d => d.locations);
      const fullResults = mappedResults
        .map(result => allLocations.find(loc => loc.id === result.id))
        .filter(Boolean) as GeoLocation[];

      setResults(fullResults);
      setReasoning(data.reasoning || '');
      
      if (fullResults.length === 0) {
        toast.info('No se encontraron lugares que coincidan con tu búsqueda');
      }
      
    } catch (err) {
      console.error('Search error:', err);
      toast.error('Error al realizar la búsqueda');
    } finally {
      setIsSearching(false);
    }
  }, [query, documents]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSearching) {
      handleSearch();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleViewOnMap = (location: GeoLocation) => {
    setFocusedLocation(location.id);
    onLocationClick(location);
    onClose();
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
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
        <div className="container mx-auto max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Búsqueda Inteligente
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          {/* Search input */}
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe qué tipo de lugares buscas... (ej: playas tranquilas, pueblos medievales)"
              className="pr-24 text-lg py-6"
              autoFocus
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
              className="absolute right-1 top-1 bottom-1"
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Buscar
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="container mx-auto max-w-3xl p-4">
          {/* Example queries */}
          {!hasSearched && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <div className="flex items-center gap-2 text-muted-foreground mb-3">
                <Lightbulb className="w-4 h-4" />
                <span className="text-sm font-medium">Ejemplos de búsqueda</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUERIES.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => handleExampleClick(example)}
                    className="px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-full text-sm transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Loading state */}
          {isSearching && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Analizando {documents.flatMap(d => d.locations).filter(l => l.enrichedData).length} ubicaciones...</p>
            </div>
          )}

          {/* Results */}
          {!isSearching && hasSearched && (
            <>
              {reasoning && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6"
                >
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-muted-foreground">{reasoning}</p>
                  </div>
                </motion.div>
              )}

              {results.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground mb-4">
                    {results.length} resultados para "{query}"
                  </p>
                  
                  {results.map((location, index) => (
                    <motion.div
                      key={location.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group bg-card border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => handleViewOnMap(location)}
                    >
                      <div className="flex gap-4">
                        {/* Image */}
                        {location.enrichedData?.imagen && (
                          <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0">
                            <img
                              src={location.enrichedData.imagen}
                              alt={location.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-lg line-clamp-1">
                              {location.enrichedData?.nombre_lugar || location.name}
                            </h3>
                            <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </div>
                          
                          <p className="text-sm text-muted-foreground mb-2">
                            {[location.zone, location.region, location.country].filter(Boolean).join(', ')}
                          </p>
                          
                          {location.enrichedData?.punto_destacado && (
                            <p className="text-sm text-primary font-medium line-clamp-1 mb-2">
                              ★ {location.enrichedData.punto_destacado}
                            </p>
                          )}
                          
                          {/* Tags */}
                          {location.enrichedData?.etiquetas && (
                            <div className="flex flex-wrap gap-1">
                              {location.enrichedData.etiquetas.slice(0, 4).map((tag, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                              {location.enrichedData.etiquetas.length > 4 && (
                                <Badge variant="outline" className="text-xs">
                                  +{location.enrichedData.etiquetas.length - 4}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Search className="w-16 h-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No se encontraron resultados</h3>
                  <p className="text-muted-foreground max-w-md">
                    Intenta con otros términos o conceptos más generales. 
                    La búsqueda analiza las fichas enriquecidas con IA.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
}
