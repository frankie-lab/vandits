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
import { useLocationsStore } from '@/domains/content';
import { supabase } from '@/integrations/supabase/client';
import { GeoLocation } from '@/types/location';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FilterBar } from './FilterBar';
import { RIGHT_PANEL_WIDTH } from './FloatingPanel';

interface SemanticSearchProps {
 onClose: () => void;
 onLocationClick: (location: GeoLocation) => void;
 splitWithLocations?: boolean;
}

const EXAMPLE_QUERIES = [
 "playas tranquilas",
 "pueblos medievales",
 "miradores panorámicos",
 "cascadas naturales",
 "ruinas romanas",
 "senderismo",
];

export function SemanticSearch({ onClose, onLocationClick, splitWithLocations = false }: SemanticSearchProps) {
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
 data-right-overlay="true"
 initial={{ opacity: 0, x: 20 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: 20 }}
 className={cn(
 'fixed right-4 z-[1000] bg-background/95 backdrop-blur-md border border-border/50 rounded-l-xl rounded-r-lg shadow-2xl flex flex-col overflow-hidden',
 RIGHT_PANEL_WIDTH,
 splitWithLocations ? 'top-16 bottom-[calc(50vh+0.5rem)]' : 'top-16 bottom-14'
 )}
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
  </div>

  {/* Content — Filtros (la búsqueda IA basada en tags vive ya en los popups) */}
  <div className="flex-1 min-h-0 flex flex-col p-2">
   <FilterBar />
  </div>
 </motion.div>
 );
}

