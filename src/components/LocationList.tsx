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
    selectAllLocations,
    clearSelection,
    getFilteredLocations,
    focusedLocationId,
    setFocusedLocation,
    viewMode,
    setViewMode,
  } = useLocationsStore();
  
  const locations = getFilteredLocations();
  const allSelected = locations.length > 0 && locations.every(loc => selectedLocations.has(loc.id));
  const someSelected = selectedLocations.size > 0;

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

  const handleSelectAll = () => {
    if (allSelected) {
      clearSelection();
    } else {
      selectAllLocations();
    }
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
      {/* Selection controls */}
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={handleSelectAll}
            className="data-[state=checked]:bg-primary"
          />
          <span className="text-sm text-muted-foreground">
            {someSelected 
              ? `${selectedLocations.size} seleccionadas` 
              : 'Seleccionar todo'
            }
          </span>
        </div>
        {someSelected && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearSelection}
            className="h-7 text-xs"
          >
            Limpiar
          </Button>
        )}
      </div>
      
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
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
                  group flex items-start gap-2 p-3 rounded-lg cursor-pointer
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
                <div onClick={(e) => handleCheckboxChange(e, location.id)} className="shrink-0 mt-0.5">
                  <Checkbox
                    checked={isSelected}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </div>
                
                <div className={`
                  p-1.5 rounded-full transition-colors shrink-0
                  ${isEnriched
                    ? isFocused 
                      ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md' 
                      : isSelected
                        ? 'bg-gradient-to-br from-amber-300 to-orange-400 text-white'
                        : 'bg-gradient-to-br from-amber-200 to-amber-400 text-amber-800'
                    : isFocused 
                      ? 'bg-primary text-primary-foreground' 
                      : isSelected 
                        ? 'bg-secondary text-secondary-foreground' 
                        : 'bg-muted text-muted-foreground'
                  }
                `}>
                  {isEnriched ? (
                    <Sparkles className="w-3.5 h-3.5" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0 overflow-hidden">
                  {/* Title row */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-medium text-foreground text-sm leading-tight break-words">
                      {location.name}
                    </h4>
                    
                    {isEnriched && (
                      <Badge className="bg-gradient-to-r from-primary to-secondary text-white text-[10px] py-0 px-1.5 h-4 gap-0.5 shrink-0">
                        <Sparkles className="w-2.5 h-2.5" />
                        IA
                      </Badge>
                    )}
                  </div>
                  
                  {/* Description */}
                  {hasDescription && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                      {location.enrichedData?.descripcion || location.description}
                    </p>
                  )}
                  
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
                  
                  {/* Coordinates */}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {location.coordinates.lat.toFixed(4)}, {location.coordinates.lng.toFixed(4)}
                  </div>
                  
                  {/* Custom data indicator */}
                  {customDataCount > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                          <FileText className="w-2.5 h-2.5" />
                          <span>{customDataCount} campos</span>
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
                
                {/* Action button */}
                <div className="shrink-0 flex flex-col items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isEnriched ? "ghost" : "secondary"}
                        size="icon"
                        className={`h-7 w-7 ${isEnriched ? 'text-primary' : ''}`}
                        onClick={(e) => handleEnrichClick(e, location)}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isEnriched ? 'Ver ficha' : 'Enriquecer con IA'}
                    </TooltipContent>
                  </Tooltip>
                  {isFocused ? (
                    <Eye className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
