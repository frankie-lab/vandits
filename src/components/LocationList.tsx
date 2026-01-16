import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ChevronRight, FileText } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface LocationListProps {
  onLocationSelect?: (location: GeoLocation) => void;
}

export function LocationList({ onLocationSelect }: LocationListProps) {
  const { 
    selectedLocations, 
    toggleLocationSelection, 
    getFilteredLocations 
  } = useLocationsStore();
  
  const locations = getFilteredLocations();

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
            const hasDescription = !!location.description;
            const customDataCount = Object.keys(location.customData || {}).length;
            
            return (
              <motion.div
                key={location.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: Math.min(index * 0.01, 0.5), duration: 0.2 }}
                className={`
                  group flex items-start gap-3 p-3 rounded-lg cursor-pointer
                  transition-all duration-200 ease-out
                  ${isSelected 
                    ? 'bg-accent border border-primary/30' 
                    : 'bg-card hover:bg-muted/50 border border-transparent'
                  }
                `}
                onClick={() => toggleLocationSelection(location.id)}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleLocationSelection(location.id)}
                  className="mt-1 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                
                <div className={`
                  p-2 rounded-full transition-colors shrink-0
                  ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
                `}>
                  <MapPin className="w-4 h-4" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground truncate">
                    {location.name}
                  </h4>
                  
                  {hasDescription && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {location.description}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {location.coordinates.lat.toFixed(4)}, {location.coordinates.lng.toFixed(4)}
                    </span>
                    
                    {location.continent && (
                      <Badge variant="secondary" className="text-xs py-0 h-5">
                        {location.continent}
                      </Badge>
                    )}
                    
                    {location.country && (
                      <Badge variant="outline" className="text-xs py-0 h-5">
                        {location.country}
                      </Badge>
                    )}
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
                
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}
