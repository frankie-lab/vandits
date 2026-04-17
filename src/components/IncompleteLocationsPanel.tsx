import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
 MapPin, 
 Trash2, 
 Check, 
 Loader2, 
 AlertCircle,
 RefreshCw,
 Navigation,
 X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
 AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useLocationsStore, getLocationEnrichmentStatus } from '@/domains/content';
import { reverseGeocodeAddress, AddressSuggestion } from '@/lib/geocoding';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FloatingPanel } from './FloatingPanel';

interface LocationSuggestions {
 locationId: string;
 suggestions: AddressSuggestion[];
 loading: boolean;
 error?: string;
}

interface IncompleteLocationsPanelProps {
 isOpen: boolean;
 onClose: () => void;
 onLocationClick?: (locationId: string) => void;
}

export function IncompleteLocationsPanel({ 
 isOpen, 
 onClose,
 onLocationClick 
}: IncompleteLocationsPanelProps) {
 const getLocationsByCriteria = useLocationsStore(state => state.getLocationsByCriteria);
 const updateLocation = useLocationsStore(state => state.updateLocation);
 const setFocusedLocation = useLocationsStore(state => state.setFocusedLocation);
 const documents = useLocationsStore(state => state.documents);
 
 const [suggestionsMap, setSuggestionsMap] = useState<Map<string, LocationSuggestions>>(new Map());
 const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
 const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
 
  // Get incomplete locations (status = 'new')
 const incompleteLocations = getLocationsByCriteria('new');
 
  // Fetch suggestions for a location
 const fetchSuggestions = useCallback(async (locationId: string, lat: number, lng: number) => {
 setSuggestionsMap(prev => {
 const newMap = new Map(prev);
 newMap.set(locationId, { locationId, suggestions: [], loading: true });
 return newMap;
 });
 
 try {
 const suggestions = await reverseGeocodeAddress(lat, lng);
 setSuggestionsMap(prev => {
 const newMap = new Map(prev);
 newMap.set(locationId, { locationId, suggestions, loading: false });
 return newMap;
 });
 } catch (error) {
 setSuggestionsMap(prev => {
 const newMap = new Map(prev);
 newMap.set(locationId, { 
 locationId, 
 suggestions: [], 
 loading: false, 
 error: 'Error al obtener sugerencias' 
 });
 return newMap;
 });
 }
 }, []);
 
  // Select a suggestion for a location
 const handleSelectSuggestion = async (locationId: string, suggestion: AddressSuggestion) => {
 setUpdatingIds(prev => new Set(prev).add(locationId));
 
 try {
      // Update in database
 const { error } = await supabase
 .from('locations')
 .update({
 name: suggestion.shortName,
 description: suggestion.displayName,
 updated_at: new Date().toISOString(),
 })
 .eq('id', locationId);
 
 if (error) throw error;
 
      // Update in store
 updateLocation(locationId, {
 name: suggestion.shortName,
 description: suggestion.displayName,
 updatedAt: new Date(),
 });
 
 toast.success('Ubicación actualizada');
 
      // Clear suggestions for this location
 setSuggestionsMap(prev => {
 const newMap = new Map(prev);
 newMap.delete(locationId);
 return newMap;
 });
 } catch (error) {
 console.error('Error updating location:', error);
 toast.error('Error al actualizar ubicación');
 } finally {
 setUpdatingIds(prev => {
 const newSet = new Set(prev);
 newSet.delete(locationId);
 return newSet;
 });
 }
 };
 
  // Delete a location
 const handleDelete = async (locationId: string) => {
 setDeletingIds(prev => new Set(prev).add(locationId));
 
 try {
 const { error } = await supabase
 .from('locations')
 .delete()
 .eq('id', locationId);
 
 if (error) throw error;
 
      // Find and update the document in store
 for (const doc of documents) {
 const locIndex = doc.locations.findIndex(l => l.id === locationId);
 if (locIndex !== -1) {
 const newLocations = doc.locations.filter(l => l.id !== locationId);
 useLocationsStore.getState().updateDocumentLocations(doc.id, newLocations);
 break;
 }
 }
 
 toast.success('Ubicación eliminada');
 
      // Clear suggestions
 setSuggestionsMap(prev => {
 const newMap = new Map(prev);
 newMap.delete(locationId);
 return newMap;
 });
 } catch (error) {
 console.error('Error deleting location:', error);
 toast.error('Error al eliminar ubicación');
 } finally {
 setDeletingIds(prev => {
 const newSet = new Set(prev);
 newSet.delete(locationId);
 return newSet;
 });
 }
 };
 
  // View on map
 const handleViewOnMap = (locationId: string) => {
 setFocusedLocation(locationId);
 onLocationClick?.(locationId);
 };
 
 return (
 <FloatingPanel
 title={`Incompletos (${incompleteLocations.length})`}
 icon={<AlertCircle className="w-4 h-4 text-red-500" />}
 isOpen={isOpen}
 onClose={onClose}
 position="right"
 >
 <div className="p-3">
 {incompleteLocations.length === 0 ? (
 <div className="text-center py-8 text-muted-foreground">
 <Check className="w-12 h-12 mx-auto mb-3 text-green-500" />
 <p className="font-medium">¡Todo completo!</p>
 <p className="text-sm mt-1">No hay ubicaciones incompletas</p>
 </div>
 ) : (
 <div className="space-y-1 mb-3">
 <p className="text-xs text-muted-foreground">
 Estas ubicaciones no tienen nombre ni descripción. 
 Selecciona una sugerencia basada en las coordenadas o elimínalas.
 </p>
 </div>
 )}
 </div>
 
 <ScrollArea className="flex-1">
 <div className="px-3 pb-3 space-y-2">
 {incompleteLocations.map((location) => {
 const suggestionData = suggestionsMap.get(location.id);
 const isDeleting = deletingIds.has(location.id);
 const isUpdating = updatingIds.has(location.id);
 
 return (
 <motion.div
 key={location.id}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, x: -20 }}
 className="bg-red-50 border border-red-200 rounded-lg p-3"
 >
 {/* Header */}
 <div className="flex items-start justify-between gap-2 mb-2">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
 <span className="font-medium text-sm truncate">
 {location.name || 'Sin nombre'}
 </span>
 </div>
 <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
 <Navigation className="w-3 h-3" />
 {location.coordinates.lat.toFixed(5)}, {location.coordinates.lng.toFixed(5)}
 </div>
 </div>
 
 <div className="flex items-center gap-1 flex-shrink-0">
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7"
 onClick={() => handleViewOnMap(location.id)}
 title="Ver en mapa"
 >
 <MapPin className="w-3.5 h-3.5" />
 </Button>
 
 <AlertDialog>
 <AlertDialogTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-100"
 disabled={isDeleting}
 >
 {isDeleting ? (
 <Loader2 className="w-3.5 h-3.5 animate-spin" />
 ) : (
 <Trash2 className="w-3.5 h-3.5" />
 )}
 </Button>
 </AlertDialogTrigger>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>¿Eliminar ubicación?</AlertDialogTitle>
 <AlertDialogDescription>
 Esta acción no se puede deshacer. La ubicación será eliminada permanentemente.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction
 onClick={() => handleDelete(location.id)}
 className="bg-red-600 hover:bg-red-700"
 >
 Eliminar
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 </div>
 
 {/* Suggestions section */}
 {!suggestionData ? (
 <Button
 variant="outline"
 size="sm"
 className="w-full text-xs h-8"
 onClick={() => fetchSuggestions(
 location.id, 
 location.coordinates.lat, 
 location.coordinates.lng
 )}
 >
 <RefreshCw className="w-3 h-3 mr-1.5" />
 Obtener sugerencias de nombre
 </Button>
 ) : suggestionData.loading ? (
 <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
 <Loader2 className="w-3.5 h-3.5 animate-spin" />
 Buscando ubicación...
 </div>
 ) : suggestionData.error ? (
 <div className="text-xs text-red-600 text-center py-2">
 {suggestionData.error}
 </div>
 ) : suggestionData.suggestions.length === 0 ? (
 <div className="text-xs text-muted-foreground text-center py-2">
 No se encontraron sugerencias para esta ubicación
 </div>
 ) : (
 <div className="space-y-1.5">
 <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
 Selecciona un nombre:
 </p>
 {suggestionData.suggestions.map((suggestion, idx) => (
 <button
 key={idx}
 onClick={() => handleSelectSuggestion(location.id, suggestion)}
 disabled={isUpdating}
 className="w-full text-left px-2.5 py-2 text-xs bg-white border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
 >
 <div className="font-medium text-gray-900 truncate">
 {suggestion.shortName}
 </div>
 <div className="text-[10px] text-gray-500 truncate mt-0.5">
 {suggestion.displayName}
 </div>
 </button>
 ))}
 {isUpdating && (
 <div className="flex items-center justify-center gap-2 py-1 text-xs text-primary">
 <Loader2 className="w-3 h-3 animate-spin" />
 Actualizando...
 </div>
 )}
 </div>
 )}
 </motion.div>
 );
 })}
 </div>
 </ScrollArea>
 </FloatingPanel>
 );
}
