import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ChevronRight, FileText, Eye, Sparkles } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface LocationListProps {
  onEnrichClick?: (location: GeoLocation) => void;
}

export function LocationList({ onEnrichClick }: LocationListProps) {
  const { 
    selectedLocations, 
    toggleLocationSelection, 
    getFilteredLocations,
    focusedLocationId,
    setFocusedLocation,
    viewMode,
    setViewMode,
  } = useLocationsStore();
  
  const locations = getFilteredLocations();

  const handleLocationClick = (location: GeoLocation) => {
    // If in list-only mode, switch to split view to show map
    if (viewMode === 'list') {
      setViewMode('split');
    }
    // Focus the location on the map
    setFocusedLocation(location.id);
  };

  const handleCheckboxChange = (e: React.MouseEvent, locationId: string) => {
    e.stopPropagation();
    toggleLocationSelection(locationId);
  };

  const handleEnrichClick = (e: React.MouseEvent, location: GeoLocation) => {
    e.stopPropagation();
    onEnrichClick?.(location);
  };

  if (locations.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">No hay ubicaciones que mostrar</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-4">
        <AnimatePresence mode="popLayout">
          {locations.map((location, index) => {
            const isSelected = selectedLocations.has(location.id);
            const isFocused = focusedLocationId === location.id;
            const hasDescription = !!location.description;
            const customDataCount = Object.keys(location.customData || {}).length;
            const isEnriched = !!location.enrichedData;
            
            return (
              <motion.div
                key={location.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: Math.min(index * 0.01, 0.3), duration: 0.2 }}
                className={`
                  group flex items-start gap-3 p-3 rounded-lg cursor-pointer
                  transition-all duration-200 ease-out
                  ${isFocused 
                    ? 'bg-primary/10 border-2 border-primary ring-2 ring-primary/20' 
                    : isSelected 
                      ? 'bg-accent border border-primary/30' 
                      : 'bg-card hover:bg-muted/50 border border-transparent hover:border-muted'
                  }
                `}
                onClick={() => handleLocationClick(location)}
              >
                <div onClick={(e) => handleCheckboxChange(e, location.id)}>
                  <Checkbox
                    checked={isSelected}
                    className="mt-1 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </div>
                
                <div className={`
                  p-2 rounded-full transition-colors shrink-0
                  ${isFocused 
                    ? 'bg-primary text-primary-foreground' 
                    : isSelected 
                      ? 'bg-secondary text-secondary-foreground' 
                      : 'bg-muted text-muted-foreground'
                  }
                `}>
                  <MapPin className="w-4 h-4" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-foreground truncate">
                      {location.name}
                    </h4>
                    {isEnriched && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge className="bg-gradient-to-r from-primary to-secondary text-white text-xs py-0 h-5 gap-1">
                            <Sparkles className="w-3 h-3" />
                            Enriquecido
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          Esta ubicación tiene información enriquecida
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  
                  {hasDescription && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {location.enrichedData?.enriched_description || location.description}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {location.continent && (
                      <Badge variant="secondary" className="text-xs py-0 h-5 bg-blue-100 text-blue-700">
                        {location.continent}
                      </Badge>
                    )}
                    
                    {location.country && (
                      <Badge variant="secondary" className="text-xs py-0 h-5 bg-green-100 text-green-700">
                        {location.country}
                      </Badge>
                    )}
                    
                    {location.region && (
                      <Badge variant="outline" className="text-xs py-0 h-5">
                        {location.region}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-muted-foreground">
                      {location.coordinates.lat.toFixed(4)}, {location.coordinates.lng.toFixed(4)}
                    </span>
                  </div>
                  
                  {customDataCount > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                          <FileText className="w-3 h-3" />
                          <span>{customDataCount} campos adicionales</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start" className="max-w-xs">
                        <div className="space-y-1 text-xs">
                          {Object.entries(location.customData || {}).slice(0, 5).map(([key, value]) => (
                            <div key={key}>
                              <span className="font-medium">{key}:</span> {value}
                            </div>
                          ))}
                          {customDataCount > 5 && (
                            <div className="text-muted-foreground">
                              +{customDataCount - 5} más...
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleEnrichClick(e, location)}
                  >
                    <Sparkles className="w-4 h-4 text-primary" />
                  </Button>
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
  );
}
