import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
 X, 
 MapPin, 
 ExternalLink, 
 ChevronLeft, 
 ChevronRight,
 ImageOff,
 Sparkles,
 Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useLocationsStore } from '@/domains/content';
import { useFilteredLocations } from '@/domains/content/hooks/use-filtered-locations';
import { GeoLocation } from '@/types/location';
import { cn } from '@/lib/utils';

interface GalleryViewProps {
  onClose: () => void;
  onLocationClick: (location: GeoLocation) => void;
}

export function GalleryView({ onClose, onLocationClick }: GalleryViewProps) {
  const setFocusedLocation = useLocationsStore(state => state.setFocusedLocation);
  
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'withImage'>('withImage');
  
  const allLocations = useFilteredLocations();
 
  // Filter locations based on current filter
 const locations = filter === 'withImage' 
 ? allLocations.filter(loc => loc.enrichedData?.imagen)
 : allLocations.filter(loc => loc.enrichedData);
 
 const locationsWithImages = allLocations.filter(loc => loc.enrichedData?.imagen).length;
 
 const selectedLocation = selectedIndex !== null ? locations[selectedIndex] : null;

 const handlePrevious = () => {
 if (selectedIndex === null) return;
 setSelectedIndex(selectedIndex > 0 ? selectedIndex - 1 : locations.length - 1);
 };

 const handleNext = () => {
 if (selectedIndex === null) return;
 setSelectedIndex(selectedIndex < locations.length - 1 ? selectedIndex + 1 : 0);
 };

 const handleKeyDown = (e: React.KeyboardEvent) => {
 if (selectedIndex === null) return;
 if (e.key === 'ArrowLeft') handlePrevious();
 if (e.key === 'ArrowRight') handleNext();
 if (e.key === 'Escape') setSelectedIndex(null);
 };

 const handleViewOnMap = (location: GeoLocation) => {
 setFocusedLocation(location.id);
 onLocationClick(location);
 onClose();
 };

 return (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 z-[2000] bg-background/98 backdrop-blur-sm"
 onKeyDown={handleKeyDown}
 tabIndex={0}
 >
 {/* Header */}
 <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-background/80 backdrop-blur-md border-b">
 <div className="flex items-center gap-4">
 <h2 className="font-display font-bold text-xl flex items-center gap-2">
 <Sparkles className="w-5 h-5 text-amber-500" />
 Galería
 </h2>
 <div className="flex items-center gap-2">
 <Button
 variant={filter === 'withImage' ? 'default' : 'outline'}
 size="sm"
 onClick={() => setFilter('withImage')}
 className="text-xs"
 >
 Con imagen ({locationsWithImages})
 </Button>
 <Button
 variant={filter === 'all' ? 'default' : 'outline'}
 size="sm"
 onClick={() => setFilter('all')}
 className="text-xs"
 >
 Todas las fichas
 </Button>
 </div>
 </div>
 <Button variant="ghost" size="icon" onClick={onClose}>
 <X className="w-5 h-5" />
 </Button>
 </div>

 {/* Gallery Grid */}
 <ScrollArea className="h-full pt-20 pb-4">
 <div className="container mx-auto px-4">
 {locations.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
 <ImageOff className="w-16 h-16 mb-4 opacity-30" />
 <p className="text-lg font-medium">No hay ubicaciones con imágenes</p>
 <p className="text-sm">Enriquece más ubicaciones para ver sus imágenes aquí</p>
 </div>
 ) : (
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
 {locations.map((location, index) => (
 <motion.div
 key={location.id}
 initial={{ opacity: 0, scale: 0.9 }}
 animate={{ opacity: 1, scale: 1 }}
 transition={{ delay: index * 0.02 }}
 className={cn(
 "group relative aspect-square rounded-xl overflow-hidden cursor-pointer",
 "border-2 border-transparent hover:border-primary transition-all duration-200",
 "shadow-md hover:shadow-xl"
 )}
 onClick={() => setSelectedIndex(index)}
 >
 {location.enrichedData?.imagen ? (
 <img
 src={location.enrichedData.imagen}
 alt={location.enrichedData.nombre_lugar || location.name}
 className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
 loading="lazy"
 />
 ) : (
 <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
 <MapPin className="w-8 h-8 text-muted-foreground/30" />
 </div>
 )}
 
 {/* Overlay */}
 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
 <div className="absolute bottom-0 left-0 right-0 p-3">
 <h3 className="text-white text-sm font-medium line-clamp-2">
 {location.enrichedData?.nombre_lugar || location.name}
 </h3>
 {location.country && (
 <p className="text-white/70 text-xs mt-0.5">
 {location.country}
 </p>
 )}
 </div>
 </div>

 {/* Status indicator */}
 <div className="absolute top-2 right-2">
 <div className={cn(
 "w-2.5 h-2.5 rounded-full border border-white shadow-md",
 location.enrichedData?.descripcion ? "bg-green-500" : "bg-orange-500"
 )} />
 </div>
 </motion.div>
 ))}
 </div>
 )}
 </div>
 </ScrollArea>

 {/* Lightbox */}
 <AnimatePresence>
 {selectedLocation && (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 z-[2001] bg-black/95 flex items-center justify-center"
 onClick={() => setSelectedIndex(null)}
 >
 {/* Navigation */}
 <button
 className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
 onClick={(e) => { e.stopPropagation(); handlePrevious(); }}
 >
 <ChevronLeft className="w-6 h-6" />
 </button>
 <button
 className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
 onClick={(e) => { e.stopPropagation(); handleNext(); }}
 >
 <ChevronRight className="w-6 h-6" />
 </button>

 {/* Close button */}
 <button
 className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
 onClick={() => setSelectedIndex(null)}
 >
 <X className="w-5 h-5" />
 </button>

 {/* Content */}
 <motion.div
 key={selectedLocation.id}
 initial={{ opacity: 0, scale: 0.9 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, scale: 0.9 }}
 className="relative max-w-5xl max-h-[85vh] mx-4 flex flex-col md:flex-row gap-4 bg-card rounded-2xl overflow-hidden shadow-2xl"
 onClick={(e) => e.stopPropagation()}
 >
 {/* Image */}
 <div className="md:w-2/3 aspect-video md:aspect-auto md:min-h-[400px] relative bg-muted">
 {selectedLocation.enrichedData?.imagen ? (
 <img
 src={selectedLocation.enrichedData.imagen}
 alt={selectedLocation.enrichedData.nombre_lugar || selectedLocation.name}
 className="w-full h-full object-contain"
 />
 ) : (
 <div className="w-full h-full flex items-center justify-center">
 <ImageOff className="w-16 h-16 text-muted-foreground/30" />
 </div>
 )}
 </div>

 {/* Info Panel */}
 <div className="md:w-1/3 p-6 overflow-y-auto max-h-[50vh] md:max-h-[85vh]">
 <h2 className="font-display font-bold text-xl mb-2">
 {selectedLocation.enrichedData?.nombre_lugar || selectedLocation.name}
 </h2>
 
 <p className="text-sm text-muted-foreground mb-4">
 {selectedLocation.enrichedData?.localizacion || 
 [selectedLocation.zone, selectedLocation.region, selectedLocation.country, selectedLocation.continent]
 .filter(Boolean)
 .join(', ')
 }
 </p>

 {selectedLocation.enrichedData?.punto_destacado && (
 <div className="bg-primary/10 border-l-2 border-primary p-3 rounded-r-lg mb-4">
 <p className="text-sm text-primary font-medium">
 {selectedLocation.enrichedData.punto_destacado}
 </p>
 </div>
 )}

 {selectedLocation.enrichedData?.descripcion && (
 <p className="text-sm text-muted-foreground mb-4 line-clamp-6">
 {selectedLocation.enrichedData.descripcion}
 </p>
 )}

 {/* Tags */}
 {selectedLocation.enrichedData?.etiquetas && selectedLocation.enrichedData.etiquetas.length > 0 && (
 <div className="flex flex-wrap gap-1 mb-4">
 {selectedLocation.enrichedData.etiquetas.slice(0, 6).map((tag, i) => (
 <Badge key={i} variant="secondary" className="text-xs">
 {tag}
 </Badge>
 ))}
 {selectedLocation.enrichedData.etiquetas.length > 6 && (
 <Badge variant="outline" className="text-xs">
 +{selectedLocation.enrichedData.etiquetas.length - 6}
 </Badge>
 )}
 </div>
 )}

 {/* Actions */}
 <div className="flex gap-2 mt-auto pt-4 border-t">
 <Button
 variant="default"
 size="sm"
 onClick={() => handleViewOnMap(selectedLocation)}
 className="flex-1"
 >
 <MapPin className="w-4 h-4 mr-1" />
 Ver en mapa
 </Button>
 {selectedLocation.enrichedData?.datos_clave?.web_referencia && (
 <Button
 variant="outline"
 size="sm"
 asChild
 >
 <a
 href={selectedLocation.enrichedData.datos_clave.web_referencia.startsWith('http') 
 ? selectedLocation.enrichedData.datos_clave.web_referencia 
 : `https://${selectedLocation.enrichedData.datos_clave.web_referencia}`}
 target="_blank"
 rel="noopener noreferrer"
 >
 <ExternalLink className="w-4 h-4" />
 </a>
 </Button>
 )}
 </div>

 {/* Counter */}
 <p className="text-xs text-muted-foreground text-center mt-4">
 {selectedIndex !== null ? selectedIndex + 1 : 0} / {locations.length}
 </p>
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 </motion.div>
 );
}
