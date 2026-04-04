import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, RotateCcw, AlertTriangle, X, Clock, MapPin, Sparkles, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useDatabaseSync } from '@/hooks/use-database-sync';
import { formatDistanceToNow, differenceInDays, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface DeletedLocation {
 id: string;
 name: string;
 latitude: number;
 longitude: number;
 deleted_at: string;
 enriched_data: any;
 country?: string;
 region?: string;
}

interface TrashPanelProps {
 isOpen: boolean;
 onClose: () => void;
}

export function TrashPanel({ isOpen, onClose }: TrashPanelProps) {
 const { user } = useAuth();
 const { loadFromDatabase } = useDatabaseSync();
 const [deletedLocations, setDeletedLocations] = useState<DeletedLocation[]>([]);
 const [isLoading, setIsLoading] = useState(true);
 const [confirmDialog, setConfirmDialog] = useState<{ type: 'restore' | 'permanent-delete' | 'empty-trash'; locationId?: string; locationName?: string } | null>(null);
 const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch deleted locations
 const fetchDeletedLocations = useCallback(async () => {
 if (!user) return;
 
 setIsLoading(true);
 try {
      // Query locations with deleted_at set (within 30 days)
 const thirtyDaysAgo = new Date();
 thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
 
 const { data, error } = await supabase
 .from('locations')
 .select('id, name, latitude, longitude, deleted_at, enriched_data, country, region')
 .not('deleted_at', 'is', null)
 .gte('deleted_at', thirtyDaysAgo.toISOString())
 .order('deleted_at', { ascending: false });

 if (error) throw error;
 setDeletedLocations(data || []);
 } catch (error) {
 console.error('Error fetching deleted locations:', error);
 toast.error('Error al cargar la papelera');
 } finally {
 setIsLoading(false);
 }
 }, [user]);

 useEffect(() => {
 if (isOpen && user) {
 fetchDeletedLocations();
 }
 }, [isOpen, user, fetchDeletedLocations]);

  // Restore a location
 const handleRestore = async (locationId: string) => {
 setProcessingId(locationId);
 try {
 const { error } = await supabase
 .from('locations')
 .update({ deleted_at: null })
 .eq('id', locationId);

 if (error) throw error;

 toast.success('Ubicación restaurada');
 setDeletedLocations(prev => prev.filter(l => l.id !== locationId));
 
      // Refresh main data
 await loadFromDatabase();
 } catch (error) {
 console.error('Error restoring location:', error);
 toast.error('Error al restaurar la ubicación');
 } finally {
 setProcessingId(null);
 setConfirmDialog(null);
 }
 };

  // Permanently delete a location
 const handlePermanentDelete = async (locationId: string) => {
 setProcessingId(locationId);
 try {
 const { error } = await supabase
 .from('locations')
 .delete()
 .eq('id', locationId);

 if (error) throw error;

 toast.success('Ubicación eliminada permanentemente');
 setDeletedLocations(prev => prev.filter(l => l.id !== locationId));
 } catch (error) {
 console.error('Error permanently deleting location:', error);
 toast.error('Error al eliminar la ubicación');
 } finally {
 setProcessingId(null);
 setConfirmDialog(null);
 }
 };

  // Empty entire trash
 const handleEmptyTrash = async () => {
 setProcessingId('all');
 try {
 const ids = deletedLocations.map(l => l.id);
 const { error } = await supabase
 .from('locations')
 .delete()
 .in('id', ids);

 if (error) throw error;

 toast.success(`${deletedLocations.length} ubicaciones eliminadas permanentemente`);
 setDeletedLocations([]);
 } catch (error) {
 console.error('Error emptying trash:', error);
 toast.error('Error al vaciar la papelera');
 } finally {
 setProcessingId(null);
 setConfirmDialog(null);
 }
 };

  // Calculate days remaining before auto-delete
 const getDaysRemaining = (deletedAt: string) => {
 const deleteDate = new Date(deletedAt);
 const expiryDate = addDays(deleteDate, 30);
 return Math.max(0, differenceInDays(expiryDate, new Date()));
 };

 if (!isOpen) return null;

 return (
 <>
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 20 }}
 transition={{ type: 'spring', damping: 25, stiffness: 300 }}
 className="fixed top-16 left-[200px] right-[340px] flex justify-center max-h-[calc(100vh-5rem)] z-[2000]"
 >
 <div className="w-full max-w-[700px] bg-background/98 backdrop-blur-md flex flex-col shadow-2xl rounded-xl border max-h-full">
 {/* Header */}
 <div className="border-b bg-background/80 backdrop-blur-sm p-4 shadow-sm rounded-t-xl">
 <div className="flex items-center justify-between mb-2">
 <h2 className="font-display font-bold text-xl flex items-center gap-2">
 <Trash2 className="w-5 h-5 text-muted-foreground" />
 Papelera
 {deletedLocations.length > 0 && (
 <Badge variant="secondary" className="ml-2">
 {deletedLocations.length}
 </Badge>
 )}
 </h2>
 <div className="flex items-center gap-2">
 {deletedLocations.length > 0 && (
 <Button
 variant="outline"
 size="sm"
 onClick={() => setConfirmDialog({ type: 'empty-trash' })}
 className="text-destructive hover:text-destructive"
 >
 <Trash2 className="w-4 h-4 mr-1" />
 Vaciar papelera
 </Button>
 )}
 <Button variant="ghost" size="icon" onClick={onClose}>
 <X className="w-5 h-5" />
 </Button>
 </div>
 </div>
 <p className="text-sm text-muted-foreground flex items-center gap-1">
 <Clock className="w-4 h-4" />
 Las ubicaciones se eliminan automáticamente después de 30 días
 </p>
 </div>

 {/* Content */}
 <div className="flex-1 overflow-y-auto min-h-0">
 {isLoading ? (
 <div className="flex items-center justify-center py-12">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
 </div>
 ) : deletedLocations.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 text-center px-4">
 <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
 <Trash2 className="w-8 h-8 text-muted-foreground" />
 </div>
 <h3 className="text-lg font-semibold mb-2">Papelera vacía</h3>
 <p className="text-muted-foreground max-w-sm">
 Las ubicaciones eliminadas aparecerán aquí durante 30 días antes de ser eliminadas permanentemente.
 </p>
 </div>
 ) : (
 <div className="p-4 space-y-2">
 {deletedLocations.map((location) => {
 const daysRemaining = getDaysRemaining(location.deleted_at);
 const isProcessing = processingId === location.id;
 const isEnriched = !!location.enriched_data?.descripcion;
 
 return (
 <motion.div
 key={location.id}
 initial={{ opacity: 0, x: -10 }}
 animate={{ opacity: 1, x: 0 }}
 className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border hover:bg-muted/50 transition-colors"
 >
 {/* Location info */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 {isEnriched && (
 <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
 )}
 <span className="font-medium truncate">
 {location.enriched_data?.nombre_lugar || location.name}
 </span>
 </div>
 <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
 <MapPin className="w-3 h-3" />
 <span className="truncate">
 {[location.region, location.country].filter(Boolean).join(', ') || 
 `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
 </span>
 </div>
 </div>

 {/* Time remaining */}
 <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
 <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
 <span className={daysRemaining <= 7 ? 'text-orange-500 font-medium' : 'text-muted-foreground'}>
 {daysRemaining} días restantes
 </span>
 </div>

 {/* Actions */}
 <div className="flex items-center gap-1 flex-shrink-0">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setConfirmDialog({ 
 type: 'restore', 
 locationId: location.id,
 locationName: location.enriched_data?.nombre_lugar || location.name
 })}
 disabled={isProcessing}
 className="text-primary hover:text-primary"
 >
 <RotateCcw className="w-4 h-4 mr-1" />
 Restaurar
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setConfirmDialog({ 
 type: 'permanent-delete', 
 locationId: location.id,
 locationName: location.enriched_data?.nombre_lugar || location.name
 })}
 disabled={isProcessing}
 className="text-destructive hover:text-destructive"
 >
 <Trash2 className="w-4 h-4" />
 </Button>
 </div>
 </motion.div>
 );
 })}
 </div>
 )}
 </div>
 </div>
 </motion.div>

 {/* Confirmation dialogs */}
 <AlertDialog open={confirmDialog !== null} onOpenChange={(open) => !open && setConfirmDialog(null)}>
 <AlertDialogContent className="z-[2100]">
 <AlertDialogHeader>
 <AlertDialogTitle className="flex items-center gap-2">
 {confirmDialog?.type === 'restore' ? (
 <>
 <RotateCcw className="w-5 h-5 text-primary" />
 Restaurar ubicación
 </>
 ) : (
 <>
 <AlertTriangle className="w-5 h-5 text-destructive" />
 {confirmDialog?.type === 'empty-trash' ? 'Vaciar papelera' : 'Eliminar permanentemente'}
 </>
 )}
 </AlertDialogTitle>
 <AlertDialogDescription>
 {confirmDialog?.type === 'restore' ? (
 <>
 ¿Restaurar <strong>"{confirmDialog.locationName}"</strong> a tu colección?
 </>
 ) : confirmDialog?.type === 'empty-trash' ? (
 <>
 Esto eliminará permanentemente <strong>{deletedLocations.length} ubicaciones</strong>. 
 Esta acción no se puede deshacer.
 </>
 ) : (
 <>
 Esto eliminará permanentemente <strong>"{confirmDialog?.locationName}"</strong>. 
 Esta acción no se puede deshacer.
 </>
 )}
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel disabled={processingId !== null}>Cancelar</AlertDialogCancel>
 <AlertDialogAction
 onClick={() => {
 if (confirmDialog?.type === 'restore' && confirmDialog.locationId) {
 handleRestore(confirmDialog.locationId);
 } else if (confirmDialog?.type === 'permanent-delete' && confirmDialog.locationId) {
 handlePermanentDelete(confirmDialog.locationId);
 } else if (confirmDialog?.type === 'empty-trash') {
 handleEmptyTrash();
 }
 }}
 disabled={processingId !== null}
 className={confirmDialog?.type === 'restore' ? '' : 'bg-destructive hover:bg-destructive/90'}
 >
 {processingId !== null ? (
 <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
 ) : confirmDialog?.type === 'restore' ? (
 'Restaurar'
 ) : (
 'Eliminar permanentemente'
 )}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </>
 );
}
