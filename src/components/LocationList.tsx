import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, MapPin, ChevronRight } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

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
            
            return (
              <motion.div
                key={location.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.02, duration: 0.2 }}
                className={`
                  group flex items-center gap-3 p-3 rounded-lg cursor-pointer
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
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                
                <div className={`
                  p-2 rounded-full transition-colors
                  ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
                `}>
                  <MapPin className="w-4 h-4" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground truncate">
                    {location.name}
                  </h4>
                  <p className="text-xs text-muted-foreground truncate">
                    {location.coordinates.lat.toFixed(4)}, {location.coordinates.lng.toFixed(4)}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  {location.continent && (
                    <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
                      {location.continent}
                    </Badge>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}
