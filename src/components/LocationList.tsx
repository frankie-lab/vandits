import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, FileText, Eye, CheckCircle, RefreshCw, CircleOff, ImageOff } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface LocationListProps {
  onEnrichClick?: (location: GeoLocation) => void;
}

// Get enrichment status for a location
function getEnrichmentStatus(location: GeoLocation): 'current' | 'previous' | 'unknown' | 'new' {
  if (!location.enrichedData) {
    if (location.description) {
      return 'unknown'; // Has KML description but no AI data
    }
    return 'new'; // No data at all
  }
  
  // Check if enriched after criteria timestamp
  const criteriaTimestamp = localStorage.getItem('enrichment_criteria_timestamp');
  if (criteriaTimestamp && location.updatedAt) {
    const criteriaDate = new Date(criteriaTimestamp);
    const updatedDate = new Date(location.updatedAt);
    if (updatedDate >= criteriaDate) {
      return 'current'; // Green - up to date
    }
  }
  
  return 'previous'; // Blue - has AI data but outdated
}

const statusConfig = {
  current: { color: 'bg-green-500', label: 'Final', Icon: CheckCircle },
  previous: { color: 'bg-blue-500', label: 'Pendiente', Icon: RefreshCw },
  unknown: { color: 'bg-orange-500', label: 'Desconocido', Icon: FileText },
  new: { color: 'bg-red-500', label: 'Importado', Icon: CircleOff },
};

export function LocationList({ onEnrichClick }: LocationListProps) {
  const { 
    getFilteredLocations,
    focusedLocationId,
    setFocusedLocation,
    viewMode,
    setViewMode,
  } = useLocationsStore();
  
  const locations = getFilteredLocations();

  const handleLocationClick = (location: GeoLocation) => {
    if (viewMode === 'list') {
      setViewMode('split');
    }
    setFocusedLocation(location.id);
  };

  if (locations.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">No hay ubicaciones que mostrar</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
        <AnimatePresence mode="popLayout">
          {locations.map((location, index) => {
            const isFocused = focusedLocationId === location.id;
            const status = getEnrichmentStatus(location);
            const { color: statusColor, label: statusLabel } = statusConfig[status];
            const imageUrl = location.enrichedData?.imagen;
            
            return (
              <motion.div
                key={location.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: Math.min(index * 0.01, 0.3), duration: 0.2 }}
                className={`
                  group flex gap-3 p-2 rounded-lg cursor-pointer
                  transition-all duration-200 ease-out
                  ${isFocused 
                    ? 'bg-primary/10 border-2 border-primary ring-2 ring-primary/20' 
                    : 'bg-card hover:bg-muted/50 border border-transparent hover:border-muted'
                  }
                `}
                onClick={() => handleLocationClick(location)}
              >
                {/* Image thumbnail */}
                <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-muted">
                  {imageUrl ? (
                    <img 
                      src={imageUrl} 
                      alt={location.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <ImageOff className="w-5 h-5" />
                    </div>
                  )}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  {/* Title row with status indicator */}
                  <div className="flex items-center gap-2">
                    {/* Status dot */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor}`} />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {statusLabel}
                      </TooltipContent>
                    </Tooltip>
                    
                    <h4 className="font-medium text-foreground text-sm leading-tight truncate">
                      {location.name}
                    </h4>
                  </div>
                  
                  {/* Description */}
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                    {location.enrichedData?.descripcion || location.description || 'Sin descripción'}
                  </p>
                  
                  {/* Location badges */}
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {location.continent && (
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 bg-blue-100 text-blue-700 shrink-0">
                        {location.continent}
                      </Badge>
                    )}
                    
                    {location.country && (
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 bg-green-100 text-green-700 shrink-0">
                        {location.country}
                      </Badge>
                    )}
                    
                    {location.region && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 shrink-0">
                        {location.region}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {/* Focus indicator */}
                <div className="shrink-0 flex items-center">
                  {isFocused ? (
                    <Eye className="w-4 h-4 text-primary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ScrollArea>
    </div>
  );
}
