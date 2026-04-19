import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Eye, ImageOff, Trash2, Loader2, Sparkles } from 'lucide-react';
import { useLocationsStore, getLocationEnrichmentStatus } from '@/domains/content';
import { useFilteredLocations } from '@/domains/content/hooks/use-filtered-locations';
import { GeoLocation } from '@/types/location';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { triggerEnrichLocation } from '@/domains/content/lib/enrich-location';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const statusConfig = {
  current: { color: 'bg-green-500', label: 'Final' },
  previous: { color: 'bg-blue-500', label: 'Pendiente' },
  unknown: { color: 'bg-gray-400', label: 'Importado' },
  new: { color: 'bg-orange-500', label: 'Vacío' },
};

export function LocationList() {
  const { 
  focusedLocationId,
  setFocusedLocation,
  viewMode,
  setViewMode,
  } = useLocationsStore();
  
  const locations = useFilteredLocations();
 const [deletingId, setDeletingId] = useState<string | null>(null);
 const [enrichingId, setEnrichingId] = useState<string | null>(null);

 const handleEnrich = async (e: React.MouseEvent, location: GeoLocation) => {
  e.stopPropagation();
  const isEnriched = !!location.enrichedData?.descripcion;
  setEnrichingId(location.id);
  try {
   await triggerEnrichLocation(location.id, { regenerate: isEnriched });
  } finally {
   setEnrichingId(null);
  }
 };

 const handleLocationClick = (location: GeoLocation) => {
 if (viewMode === 'list') {
 setViewMode('split');
 }
 setFocusedLocation(location.id);
 };

 const handleDeleteLocation = async (e: React.MouseEvent, location: GeoLocation) => {
 e.stopPropagation();
 setDeletingId(location.id);
 
 try {
 const { error } = await supabase
 .from('locations')
 .update({ deleted_at: new Date().toISOString() })
 .eq('id', location.id);
 
 if (error) throw error;
 
  toast.success(`"${location.name}" movido a la papelera`);
 
      // Dispatch events to update UI
 window.dispatchEvent(new CustomEvent('trash-updated'));
 window.dispatchEvent(new CustomEvent('store-updated'));
 } catch (error) {
 console.error('Delete location error:', error);
 toast.error('Error al eliminar');
 } finally {
 setDeletingId(null);
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
 <ScrollArea className="flex-1">
 <div className="space-y-2 p-3">
 <AnimatePresence mode="popLayout">
 {locations.map((location, index) => {
 const isFocused = focusedLocationId === location.id;
 const status = getLocationEnrichmentStatus(location);
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
 group flex gap-3 p-2 rounded-lg cursor-pointer overflow-hidden
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
 
 {/* Actions - vertical layout */}
 <div className="shrink-0 flex flex-col items-end justify-between self-stretch">
 {/* Eye icon - top right */}
 <div className="h-4">
 {isFocused ? (
 <Eye className="w-4 h-4 text-primary" />
 ) : (
 <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
 )}
 </div>
 
 {/* Trash icon - bottom right */}
 <Tooltip>
 <TooltipTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
 onClick={(e) => handleDeleteLocation(e, location)}
 disabled={deletingId === location.id}
 >
 {deletingId === location.id ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : (
 <Trash2 className="h-3.5 w-3.5" />
 )}
 </Button>
 </TooltipTrigger>
 <TooltipContent side="left" className="text-xs">
 Mover a papelera
 </TooltipContent>
 </Tooltip>
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
