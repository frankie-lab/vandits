import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Sparkles, 
  X, 
  Loader2,
  Lightbulb,
  ArrowRight,
  MapPin,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocationsStore } from '@/store/locations-store';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation } from '@/types/location';
import { toast } from 'sonner';
import { FilterBar } from './FilterBar';

interface SemanticSearchProps {
  onClose: () => void;
  onLocationClick: (location: GeoLocation) => void;
}

const EXAMPLE_QUERIES = [
  "playas tranquilas",
  "pueblos medievales",
  "miradores panorámicos",
  "cascadas naturales",
  "ruinas romanas",
  "senderismo",
];

export function SemanticSearch({ onClose, onLocationClick }: SemanticSearchProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [reasoning, setReasoning] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<'filters' | 'ai'>('filters');
  
  const documents = useLocationsStore(state => state.documents);
  const setFocusedLocation = useLocationsStore(state => state.setFocusedLocation);
  const setFilters = useLocationsStore(state => state.setFilters);
  const filters = useLocationsStore(state => state.filters);

  // Apply search results as location filter
  useEffect(() => {
    if (results.length > 0) {
      const resultIds = results.map(r => r.id);
      setFilters({ ...filters, semanticResultIds: resultIds });
    }
  }, [results]);

  // Clear semantic filter on close
  const handleClose = useCallback(() => {
    setFilters({ ...filters, semanticResultIds: undefined });
    onClose();
  }, [filters, setFilters, onClose]);

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

      // Get full location data from store
      const allLocations = documents.flatMap(d => d.locations);
      const resultIds = (data.results || []).map((loc: any) => loc.id);
      const fullResults = resultIds
        .map((id: string) => allLocations.find(loc => loc.id === id))
        .filter(Boolean) as GeoLocation[];

      setResults(fullResults);
      setReasoning(data.reasoning || '');
      
      if (fullResults.length === 0) {
        toast.info('No se encontraron lugares que coincidan');
      } else {
        toast.success(`${fullResults.length} resultados encontrados`);
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
      handleClose();
    }
  };

  const handleViewOnMap = (location: GeoLocation) => {
    setFocusedLocation(location.id);
    onLocationClick(location);
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
  };

  const handleClearResults = () => {
    setResults([]);
    setHasSearched(false);
    setReasoning('');
    setFilters({ ...filters, semanticResultIds: undefined });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute top-20 right-4 z-[1000] w-full max-w-sm max-h-[calc(100vh-120px)] bg-background/95 backdrop-blur-md border rounded-xl shadow-xl flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="p-3 border-b bg-background/80 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <Search className="w-4 h-4 text-primary" />
            Buscar y Filtrar
          </h3>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'filters' | 'ai')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-8">
            <TabsTrigger value="filters" className="text-xs gap-1 flex-1">
              <Filter className="w-3 h-3" />
              Filtros
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs gap-1 flex-1">
              <Sparkles className="w-3 h-3" />
              Búsqueda IA
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0">
        {activeTab === 'filters' ? (
          <div className="p-2">
            <FilterBar />
          </div>
        ) : (
          <div className="p-2">
            {/* AI Search input */}
            <div className="flex gap-1.5 mb-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ej: playas tranquilas..."
                className="text-sm h-8"
                autoFocus
              />
              <Button
                onClick={handleSearch}
                disabled={isSearching || !query.trim()}
                size="sm"
                className="h-8 px-2"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>
            
            {/* Example queries - compact */}
            {!hasSearched && (
              <div className="mb-2">
                <div className="flex items-center gap-1 text-muted-foreground mb-1.5">
                  <Lightbulb className="w-3 h-3" />
                  <span className="text-xs">Ejemplos</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {EXAMPLE_QUERIES.map((example, i) => (
                    <button
                      key={i}
                      onClick={() => handleExampleClick(example)}
                      className="px-2 py-0.5 bg-muted hover:bg-muted/80 rounded-full text-xs transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading state */}
            {isSearching && (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                <p className="text-xs text-muted-foreground">Analizando ubicaciones...</p>
              </div>
            )}

            {/* Results */}
            {!isSearching && hasSearched && (
              <>
                {reasoning && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-2 mb-2">
                    <p className="text-xs text-muted-foreground leading-relaxed">{reasoning}</p>
                  </div>
                )}

                {results.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {results.length} resultados
                      </p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-5 text-xs px-1.5"
                        onClick={handleClearResults}
                      >
                        Limpiar
                      </Button>
                    </div>
                    
                    {results.map((location) => (
                      <div
                        key={location.id}
                        className="group bg-card border rounded-lg p-2 hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => handleViewOnMap(location)}
                      >
                        <div className="flex gap-2">
                          {/* Thumbnail */}
                          {location.enrichedData?.imagen ? (
                            <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0">
                              <img
                                src={location.enrichedData.imagen}
                                alt={location.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                              <MapPin className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h4 className="font-medium text-xs line-clamp-1">
                                {location.enrichedData?.nombre_lugar || location.name}
                              </h4>
                              <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </div>
                            
                            <p className="text-[10px] text-muted-foreground line-clamp-1">
                              {[location.zone, location.region].filter(Boolean).join(', ')}
                            </p>
                            
                            {location.enrichedData?.etiquetas && (
                              <div className="flex flex-wrap gap-0.5 mt-1">
                                {location.enrichedData.etiquetas.slice(0, 2).map((tag, i) => (
                                  <Badge key={i} variant="secondary" className="text-[9px] px-1 py-0 h-4">
                                    {tag}
                                  </Badge>
                                ))}
                                {location.enrichedData.etiquetas.length > 2 && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                                    +{location.enrichedData.etiquetas.length - 2}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <Search className="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground">
                      Sin resultados para "{query}"
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
}
