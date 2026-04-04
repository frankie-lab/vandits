import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Play, Pause, X, CheckCircle2, AlertCircle, Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
 Sheet,
 SheetContent,
 SheetHeader,
 SheetTitle,
 SheetDescription,
} from '@/components/ui/sheet';
import { useLocationsStore } from '@/store/locations-store';
import { supabase } from '@/integrations/supabase/client';
import { loadLocationsFromDatabase } from '@/hooks/use-database-sync';
import { toast } from 'sonner';
import { EnrichmentCriteriaEditor } from './EnrichmentCriteriaEditor';

interface BatchEnrichmentPanelProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 curatorId?: string;
}

type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'error';

interface EnrichmentJob {
 id: string;
 document_id: string;
 status: JobStatus;
 total_count: number;
 processed_count: number;
 error_count: number;
 current_location_id: string | null;
 current_location_name: string | null;
 location_ids: string[];
 processed_ids: string[];
 error_ids: string[];
 error_messages: Record<string, string>;
 created_at: string;
 updated_at: string;
}

export function BatchEnrichmentPanel({ open, onOpenChange, curatorId }: BatchEnrichmentPanelProps) {
 const { documents, getAllLocations, getFilteredLocations, updateDocumentLocations, getEnrichedStats, getLocationsByCriteria } = useLocationsStore();
 
 const [activeJob, setActiveJob] = useState<EnrichmentJob | null>(null);
 const [isLoading, setIsLoading] = useState(false);
 const [selectedLayers, setSelectedLayers] = useState<Set<'current' | 'previous' | 'unknown' | 'new'>>(new Set(['previous', 'unknown', 'new']));
 const [showCriteriaEditor, setShowCriteriaEditor] = useState(false);

 const allLocations = getFilteredLocations();
 const stats = getEnrichedStats();
 
  // Get locations by criteria layer
 const currentLocations = getLocationsByCriteria('current');
 const previousLocations = getLocationsByCriteria('previous');
 const unknownLocations = getLocationsByCriteria('unknown');
 const newLocations = getLocationsByCriteria('new');
 
  // Calculate which locations to process based on selected layers
 const locationsToProcess = allLocations.filter(loc => {
 if (selectedLayers.has('current') && currentLocations.some(l => l.id === loc.id)) return true;
 if (selectedLayers.has('previous') && previousLocations.some(l => l.id === loc.id)) return true;
 if (selectedLayers.has('unknown') && unknownLocations.some(l => l.id === loc.id)) return true;
 if (selectedLayers.has('new') && newLocations.some(l => l.id === loc.id)) return true;
 return false;
 });

 const toggleLayer = (layer: 'current' | 'previous' | 'unknown' | 'new') => {
 setSelectedLayers(prev => {
 const next = new Set(prev);
 if (next.has(layer)) {
 next.delete(layer);
 } else {
 next.add(layer);
 }
 return next;
 });
 };

  // Get first document for job management (batch jobs work per document)
 const firstDocument = documents.length > 0 ? documents[0] : null;
 const hasLocations = getAllLocations().length > 0;

  // Refresh locations from database for all documents
 const refreshLocations = useCallback(async () => {
 for (const doc of documents) {
 const locations = await loadLocationsFromDatabase(doc.id);
 if (locations.length > 0) {
 updateDocumentLocations(doc.id, locations);
 }
 }
 }, [documents, updateDocumentLocations]);

  // Fetch active job status
 const fetchJobStatus = useCallback(async () => {
 if (!firstDocument) return;

 try {
 const { data, error } = await supabase.functions.invoke('batch-enrich', {
 body: { action: 'getActive', documentId: firstDocument.id },
 });

 if (error) throw error;

 if (data?.job) {
 setActiveJob(data.job);
 
        // If job is completed, refresh locations from database
 if (data.job.status === 'completed') {
 await refreshLocations();
 toast.success(`Proceso completado: ${data.job.processed_count} ubicaciones enriquecidas`);
 }
 } else {
 setActiveJob(null);
 }
 } catch (error) {
 console.error('Error fetching job status:', error);
 }
 }, [firstDocument, refreshLocations]);

  // Track previous processed count to detect changes
 const [previousProcessedCount, setPreviousProcessedCount] = useState(0);

  // Poll for job status when running
 useEffect(() => {
 if (!open || !hasLocations) return;

    // Initial fetch
 fetchJobStatus();

    // Poll every 2 seconds if job is running
 const interval = setInterval(async () => {
 if (activeJob?.status === 'running' || activeJob?.status === 'pending') {
 await fetchJobStatus();
 }
 }, 2000);

 return () => clearInterval(interval);
 }, [open, hasLocations, activeJob?.status, fetchJobStatus]);

  // Refresh locations when processed_count increases to update criteria stats in real-time
 useEffect(() => {
 if (activeJob && activeJob.processed_count > previousProcessedCount) {
 setPreviousProcessedCount(activeJob.processed_count);
      // Refresh locations to update the criteria layer counts
 refreshLocations();
 }
 }, [activeJob?.processed_count, previousProcessedCount, refreshLocations]);

  // Also refresh when job transitions to completed
 useEffect(() => {
 if (activeJob?.status === 'completed' && hasLocations) {
 refreshLocations();
 }
 }, [activeJob?.status, hasLocations, refreshLocations]);

 const startProcess = async () => {
 if (locationsToProcess.length === 0) {
 toast.info('No hay ubicaciones pendientes de enriquecer');
 return;
 }

 setIsLoading(true);

 try {
 const locationIds = locationsToProcess.map(loc => loc.id);

      // Use first document ID for the job, or a default ID
 const documentId = firstDocument?.id || 'consolidated';

 const { data, error } = await supabase.functions.invoke('batch-enrich', {
 body: { 
 action: 'start', 
 documentId,
 locationIds,
 curatorId, // Pass curator ID for curator-specific enrichment preferences
 },
 });

 if (error) throw error;

 if (data?.error) {
 toast.error(data.error);
 if (data.existingJobId) {
          // Fetch the existing job
 await fetchJobStatus();
 }
 return;
 }

 toast.success('Proceso de enriquecimiento iniciado en segundo plano');
 await fetchJobStatus();
 } catch (error) {
 console.error('Error starting process:', error);
 toast.error('Error al iniciar el proceso');
 } finally {
 setIsLoading(false);
 }
 };

 const pauseProcess = async () => {
 if (!activeJob) return;

 setIsLoading(true);
 try {
 const { error } = await supabase.functions.invoke('batch-enrich', {
 body: { action: 'pause', jobId: activeJob.id },
 });

 if (error) throw error;

 toast.info('Proceso pausado');
 await fetchJobStatus();
 } catch (error) {
 console.error('Error pausing process:', error);
 toast.error('Error al pausar el proceso');
 } finally {
 setIsLoading(false);
 }
 };

 const resumeProcess = async () => {
 if (!activeJob) return;

 setIsLoading(true);
 try {
 const { error } = await supabase.functions.invoke('batch-enrich', {
 body: { action: 'resume', jobId: activeJob.id },
 });

 if (error) throw error;

 toast.success('Proceso reanudado');
 await fetchJobStatus();
 } catch (error) {
 console.error('Error resuming process:', error);
 toast.error('Error al reanudar el proceso');
 } finally {
 setIsLoading(false);
 }
 };

 const cancelProcess = async () => {
 if (!activeJob) return;

 setIsLoading(true);
 try {
 const { error } = await supabase.functions.invoke('batch-enrich', {
 body: { action: 'cancel', jobId: activeJob.id },
 });

 if (error) throw error;

 setActiveJob(null);
 toast.info('Proceso cancelado');
 } catch (error) {
 console.error('Error cancelling process:', error);
 toast.error('Error al cancelar el proceso');
 } finally {
 setIsLoading(false);
 }
 };

 const progress = activeJob 
 ? (activeJob.processed_count / activeJob.total_count) * 100 
 : 0;

 const isProcessActive = activeJob && ['pending', 'running', 'paused'].includes(activeJob.status);

 return (
 <Sheet open={open} onOpenChange={onOpenChange}>
 <SheetContent className="w-full sm:max-w-md flex flex-col">
 <SheetHeader>
 <div className="flex items-center justify-between">
 <SheetTitle className="font-display flex items-center gap-2">
 <Sparkles className="w-5 h-5 text-primary" />
 Enriquecimiento por Lotes
 </SheetTitle>
 <Button
 variant="ghost"
 size="icon"
 onClick={() => setShowCriteriaEditor(true)}
 className="h-8 w-8"
 title="Configurar criterios"
 >
 <Settings2 className="w-4 h-4" />
 </Button>
 </div>
 <SheetDescription>
 Procesa múltiples ubicaciones en segundo plano
 </SheetDescription>
 </SheetHeader>

 <div className="flex-1 flex flex-col gap-4 mt-4 overflow-hidden">
 {/* Overview Stats by Criteria Layer */}
 <div className="space-y-2">
 <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
 Capas por criterio ({allLocations.length} ubicaciones)
 </div>
 <div className="grid grid-cols-2 gap-2">
 {/* Current - Green */}
 <label 
 className={`rounded-lg p-3 border cursor-pointer transition-all ${
 selectedLayers.has('current') 
 ? 'bg-green-100 border-green-400 ring-2 ring-green-400/50' 
 : 'bg-green-50 border-green-200 opacity-60'
 }`}
 onClick={() => toggleLayer('current')}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded bg-green-500" />
 <span className="text-xs font-medium text-green-700">Final</span>
 </div>
 <input 
 type="checkbox" 
 checked={selectedLayers.has('current')} 
 onChange={() => {}}
 className="rounded border-green-400"
 />
 </div>
 <div className="text-2xl font-bold text-green-700 mt-1">{stats.byCriteria.current}</div>
 </label>

 {/* Previous - Blue */}
 <label 
 className={`rounded-lg p-3 border cursor-pointer transition-all ${
 selectedLayers.has('previous') 
 ? 'bg-blue-100 border-blue-400 ring-2 ring-blue-400/50' 
 : 'bg-blue-50 border-blue-200 opacity-60'
 }`}
 onClick={() => toggleLayer('previous')}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded bg-blue-500" />
 <span className="text-xs font-medium text-blue-700">Pendiente</span>
 </div>
 <input 
 type="checkbox" 
 checked={selectedLayers.has('previous')} 
 onChange={() => {}}
 className="rounded border-blue-400"
 />
 </div>
 <div className="text-2xl font-bold text-blue-700 mt-1">{stats.byCriteria.previous}</div>
 </label>

 {/* Unknown - Gray (Importado con descripción) */}
 <label 
 className={`rounded-lg p-3 border cursor-pointer transition-all ${
 selectedLayers.has('unknown') 
 ? 'bg-gray-100 border-gray-400 ring-2 ring-gray-400/50' 
 : 'bg-gray-50 border-gray-200 opacity-60'
 }`}
 onClick={() => toggleLayer('unknown')}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded-full bg-gray-400" />
 <span className="text-xs font-medium text-gray-700">Importado</span>
 </div>
 <input 
 type="checkbox" 
 checked={selectedLayers.has('unknown')} 
 onChange={() => {}}
 className="rounded border-gray-400"
 />
 </div>
 <div className="text-2xl font-bold text-gray-700 mt-1">{stats.byCriteria.unknown}</div>
 </label>

 {/* New - Orange (Vacío) */}
 <label 
 className={`rounded-lg p-3 border cursor-pointer transition-all ${
 selectedLayers.has('new') 
 ? 'bg-orange-100 border-orange-400 ring-2 ring-orange-400/50' 
 : 'bg-orange-50 border-orange-200 opacity-60'
 }`}
 onClick={() => toggleLayer('new')}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded-full bg-orange-500" />
 <span className="text-xs font-medium text-orange-700">Vacío</span>
 </div>
 <input 
 type="checkbox" 
 checked={selectedLayers.has('new')} 
 onChange={() => {}}
 className="rounded border-orange-400"
 />
 </div>
 <div className="text-2xl font-bold text-orange-700 mt-1">{stats.byCriteria.new}</div>
 </label>
 </div>
 
 {/* Summary of selected */}
 <div className="text-xs text-muted-foreground text-center py-1 bg-muted/50 rounded">
 {locationsToProcess.length} ubicaciones seleccionadas para procesar
 </div>
 </div>

 {/* Active Job Info */}
 {isProcessActive && activeJob && (
 <div className="space-y-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 {activeJob.status === 'running' && (
 <Loader2 className="w-4 h-4 text-primary animate-spin" />
 )}
 {activeJob.status === 'paused' && (
 <Pause className="w-4 h-4 text-amber-500" />
 )}
 {activeJob.status === 'pending' && (
 <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
 )}
 <span className="text-sm font-medium">
 {activeJob.status === 'running' && 'Procesando...'}
 {activeJob.status === 'paused' && 'Pausado'}
 {activeJob.status === 'pending' && 'Iniciando...'}
 </span>
 </div>
 <Badge variant="secondary" className="text-xs">
 {activeJob.processed_count} / {activeJob.total_count}
 </Badge>
 </div>
 
 {activeJob.current_location_name && activeJob.status === 'running' && (
 <div className="text-xs text-muted-foreground truncate">
 Procesando: {activeJob.current_location_name}
 </div>
 )}

 <Progress value={progress} className="h-2" />

 <div className="grid grid-cols-3 gap-2 text-xs">
 <div className="text-center">
 <div className="font-bold text-primary">{activeJob.total_count - activeJob.processed_count - activeJob.error_count}</div>
 <div className="text-muted-foreground">En cola</div>
 </div>
 <div className="text-center">
 <div className="font-bold text-green-600">{activeJob.processed_count}</div>
 <div className="text-muted-foreground">Completadas</div>
 </div>
 <div className="text-center">
 <div className="font-bold text-red-600">{activeJob.error_count}</div>
 <div className="text-muted-foreground">Errores</div>
 </div>
 </div>
 </div>
 )}

 {/* Completed Job Info */}
 {activeJob?.status === 'completed' && (
 <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
 <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
 <CheckCircle2 className="w-5 h-5" />
 <span className="font-medium">Proceso completado</span>
 </div>
 <div className="text-sm text-green-600 dark:text-green-500 mt-1">
 {activeJob.processed_count} ubicaciones enriquecidas
 {activeJob.error_count > 0 && `, ${activeJob.error_count} errores`}
 </div>
 </div>
 )}

 {/* Error Job Info */}
 {activeJob?.status === 'error' && (
 <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
 <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
 <AlertCircle className="w-5 h-5" />
 <span className="font-medium">Error en el proceso</span>
 </div>
 <div className="text-sm text-red-600 dark:text-red-500 mt-1">
 {activeJob.error_messages?._job_error || 'Error desconocido'}
 </div>
 </div>
 )}

 {/* Controls */}
 <div className="flex gap-2">
 {!isProcessActive && (
 <Button 
 onClick={startProcess} 
 className="flex-1 gap-2"
 disabled={isLoading || locationsToProcess.length === 0}
 >
 {isLoading ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <Play className="w-4 h-4" />
 )}
 Iniciar Proceso
 </Button>
 )}

 {activeJob?.status === 'running' && (
 <Button 
 onClick={pauseProcess} 
 variant="secondary" 
 className="flex-1 gap-2"
 disabled={isLoading}
 >
 <Pause className="w-4 h-4" />
 Pausar
 </Button>
 )}

 {activeJob?.status === 'paused' && (
 <>
 <Button 
 onClick={resumeProcess} 
 className="flex-1 gap-2"
 disabled={isLoading}
 >
 <Play className="w-4 h-4" />
 Continuar
 </Button>
 <Button 
 onClick={cancelProcess} 
 variant="outline" 
 className="gap-2"
 disabled={isLoading}
 >
 <X className="w-4 h-4" />
 Cancelar
 </Button>
 </>
 )}

 {(activeJob?.status === 'completed' || activeJob?.status === 'error') && (
 <Button 
 onClick={cancelProcess} 
 variant="outline" 
 className="flex-1 gap-2"
 disabled={isLoading}
 >
 <X className="w-4 h-4" />
 Limpiar
 </Button>
 )}
 </div>

 {/* Errors list if any */}
 {activeJob && activeJob.error_count > 0 && Object.keys(activeJob.error_messages).length > 0 && (
 <ScrollArea className="flex-1 -mx-6 px-6">
 <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
 Errores ({activeJob.error_count})
 </div>
 <AnimatePresence mode="popLayout">
 {Object.entries(activeJob.error_messages)
 .filter(([key]) => key !== '_job_error')
 .map(([locId, error], index) => (
 <motion.div
 key={locId}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: index * 0.02 }}
 className="flex items-center gap-3 p-2 rounded-lg mb-1 bg-red-50 dark:bg-red-900/20"
 >
 <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
 <div className="flex-1 min-w-0">
 <p className="text-xs text-red-600 truncate">{error}</p>
 </div>
 </motion.div>
 ))}
 </AnimatePresence>
 </ScrollArea>
 )}

 {/* Background processing note */}
 {isProcessActive && (
 <div className="text-xs text-muted-foreground text-center p-2 bg-muted/50 rounded-lg">
 Puedes cerrar este panel y seguir navegando. El proceso continúa en segundo plano.
 </div>
 )}
 </div>

 {/* Criteria Editor */}
 <EnrichmentCriteriaEditor
 open={showCriteriaEditor}
 onOpenChange={setShowCriteriaEditor}
 />
 </SheetContent>
 </Sheet>
 );
}
