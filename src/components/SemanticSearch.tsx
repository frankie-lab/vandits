import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocationsStore } from '@/domains/content';
import { GeoLocation } from '@/types/location';
import { cn } from '@/lib/utils';
import { FilterBar } from './FilterBar';
import { RIGHT_PANEL_WIDTH } from './FloatingPanel';

interface SemanticSearchProps {
 onClose: () => void;
 onLocationClick: (location: GeoLocation) => void;
 splitWithLocations?: boolean;
}

export function SemanticSearch({ onClose, splitWithLocations = false }: SemanticSearchProps) {
 const setFilters = useLocationsStore(state => state.setFilters);
 const filters = useLocationsStore(state => state.filters);

  // Clear semantic filter on close
 const handleClose = useCallback(() => {
 setFilters({ ...filters, semanticResultIds: undefined });
 onClose();
 }, [filters, setFilters, onClose]);



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

