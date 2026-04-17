import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, CheckCircle2, Pause, Play, Square, X, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/domains/content';
import { loadLocationsFromDatabase } from '@/domains/content';
import { toast } from 'sonner';

interface EnrichmentJob {
 id: string;
 document_id: string;
 status: 'pending' | 'running' | 'paused' | 'completed' | 'error';
 total_count: number;
 processed_count: number;
 error_count: number;
 current_location_name: string | null;
}

export function BottomProgressBar() {
 const { selectedDocument, updateDocumentLocations, documents, filters } = useLocationsStore();
 const [activeJob, setActiveJob] = useState<EnrichmentJob | null>(null);
 const [showCompleted, setShowCompleted] = useState(false);
 const [actionLoading, setActionLoading] = useState<string | null>(null);
 const lastProcessedCountRef = useRef(0);

 const refreshLocations = useCallback(async () => {
 if (!selectedDocument) return;
 const locations = await loadLocationsFromDatabase(selectedDocument.id);
 if (locations.length > 0) {
 updateDocumentLocations(selectedDocument.id, locations);
 }
 }, [selectedDocument, updateDocumentLocations]);

 const fetchJobStatus = useCallback(async () => {
 const documentIds = documents.map(d => d.id);
 if (documentIds.length === 0) {
 setActiveJob(null);
 return;
 }

  try {
      // Build query to find active jobs for loaded documents
  let query = supabase
  .from('enrichment_jobs')
  .select('*')
  .in('status', ['pending', 'running', 'paused'])
  .order('updated_at', { ascending: false })
  .limit(1);

  if (documentIds.length > 0) {
  query = query.in('document_id', documentIds);
  }

  const { data: activeJobs, error } = await query;

 if (error) throw error;

 if (activeJobs && activeJobs.length > 0) {
 const job = activeJobs[0] as EnrichmentJob;
 const prevStatus = activeJob?.status;
 const prevCount = lastProcessedCountRef.current;

 setActiveJob(job);

        // If new locations were processed, refresh the map
 if (job.status === 'running' && job.processed_count > prevCount) {
 lastProcessedCountRef.current = job.processed_count;
 await refreshLocations();
 }

        // If just completed, refresh locations and show completion briefly
 if (job.status === 'completed' && prevStatus === 'running') {
 setShowCompleted(true);
 await refreshLocations();
 lastProcessedCountRef.current = 0;
 setTimeout(() => setShowCompleted(false), 5000);
 }
 } else {
 setActiveJob(null);
 lastProcessedCountRef.current = 0;
 }
 } catch (error) {
 console.error('Error fetching job status:', error);
 }
 }, [documents, activeJob?.status, refreshLocations]);

  // Poll for job status
 useEffect(() => {
 const hasDocuments = documents.length > 0;
 if (!hasDocuments) return;

    // Initial fetch
 fetchJobStatus();

    // Poll every 2 seconds
 const interval = setInterval(fetchJobStatus, 2000);

 return () => clearInterval(interval);
 }, [documents.length, fetchJobStatus]);

 const handlePause = async () => {
 if (!activeJob) return;
 setActionLoading('pause');
 try {
 await supabase.functions.invoke('batch-enrich', {
 body: { action: 'pause', jobId: activeJob.id },
 });
 toast.success('Proceso pausado');
 await fetchJobStatus();
 } catch (error) {
 console.error('Error pausing job:', error);
 toast.error('Error al pausar');
 } finally {
 setActionLoading(null);
 }
 };

 const handleResume = async () => {
 if (!activeJob) return;
 setActionLoading('resume');
 try {
 await supabase.functions.invoke('batch-enrich', {
 body: { action: 'resume', jobId: activeJob.id },
 });
 toast.success('Proceso reanudado');
 await fetchJobStatus();
 } catch (error) {
 console.error('Error resuming job:', error);
 toast.error('Error al reanudar');
 } finally {
 setActionLoading(null);
 }
 };

 const handleStop = async () => {
 if (!activeJob) return;
 setActionLoading('stop');
 try {
 await supabase.functions.invoke('batch-enrich', {
 body: { action: 'cancel', jobId: activeJob.id },
 });
 setActiveJob(null);
 toast.success('Proceso detenido');
 } catch (error) {
 console.error('Error stopping job:', error);
 toast.error('Error al detener');
 } finally {
 setActionLoading(null);
 }
 };

 const handleDismiss = async () => {
 if (!activeJob) return;
 try {
 await supabase.functions.invoke('batch-enrich', {
 body: { action: 'cancel', jobId: activeJob.id },
 });
 setActiveJob(null);
 setShowCompleted(false);
 } catch (error) {
 console.error('Error dismissing job:', error);
 }
 };

 const isActive = activeJob && ['pending', 'running', 'paused'].includes(activeJob.status);
 const isCompleted = activeJob?.status === 'completed' && showCompleted;
 const isPaused = activeJob?.status === 'paused';
 const progress = activeJob ? (activeJob.processed_count / activeJob.total_count) * 100 : 0;
 const remaining = activeJob ? activeJob.total_count - activeJob.processed_count : 0;

 if (!isActive && !isCompleted) return null;

 return (
 <AnimatePresence>
 <motion.div
 initial={{ y: 100, opacity: 0 }}
 animate={{ y: 0, opacity: 1 }}
 exit={{ y: 100, opacity: 0 }}
 transition={{ type: 'spring', damping: 25, stiffness: 300 }}
 className="fixed bottom-0 left-0 right-0 z-[1000]"
 >
 <div className={`
 border-t shadow-lg backdrop-blur-md
 ${isCompleted 
 ? 'bg-green-50/95 dark:bg-green-950/95 border-green-200 dark:border-green-800' 
 : isPaused
 ? 'bg-amber-50/95 dark:bg-amber-950/95 border-amber-200 dark:border-amber-800'
 : 'bg-background/95 border-border'
 }
 `}>
 {/* Progress bar at the very top of the bar */}
 {isActive && (
 <div className="h-1 bg-muted/50 overflow-hidden">
 <motion.div
 className={`h-full ${isPaused ? 'bg-amber-500' : 'bg-primary'}`}
 initial={{ width: 0 }}
 animate={{ width: `${progress}%` }}
 transition={{ duration: 0.3 }}
 />
 </div>
 )}

 <div className="px-4 py-3">
 <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4">
 {/* Left: Status and info */}
 <div className="flex items-center gap-3 flex-1 min-w-0">
 {/* Icon */}
 {isActive && activeJob?.status === 'running' && (
 <div className="relative flex-shrink-0">
 <Sparkles className="w-5 h-5 text-primary" />
 <motion.div
 className="absolute inset-0"
 animate={{ rotate: 360 }}
 transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
 >
 <Loader2 className="w-5 h-5 text-primary opacity-40" />
 </motion.div>
 </div>
 )}
 {isPaused && (
 <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
 )}
 {activeJob?.status === 'pending' && (
 <Loader2 className="w-5 h-5 text-muted-foreground animate-spin flex-shrink-0" />
 )}
 {isCompleted && (
 <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
 )}

 {/* Text content */}
 <div className="flex flex-col min-w-0">
 {isActive && (
 <>
 <div className="flex items-center gap-2">
 <span className="font-medium text-sm">
 {isPaused ? 'Enriquecimiento pausado' : 'Enriqueciendo ubicaciones...'}
 </span>
 <span className="text-xs text-muted-foreground">
 {activeJob!.processed_count} de {activeJob!.total_count}
 </span>
 {activeJob!.error_count > 0 && (
 <span className="text-xs text-red-500">
 ({activeJob!.error_count} errores)
 </span>
 )}
 </div>
 {activeJob?.current_location_name && activeJob.status === 'running' && (
 <span className="text-xs text-muted-foreground truncate">
 Procesando: {activeJob.current_location_name}
 </span>
 )}
 {isPaused && (
 <span className="text-xs text-amber-600 dark:text-amber-400">
 {remaining} ubicaciones pendientes
 </span>
 )}
 </>
 )}

 {isCompleted && (
 <span className="font-medium text-sm text-green-700 dark:text-green-400">
 ¡{activeJob!.processed_count} ubicaciones enriquecidas con éxito!
 </span>
 )}
 </div>
 </div>

 {/* Center: Progress indicator for larger screens */}
 {isActive && (
 <div className="hidden md:flex items-center gap-2 flex-shrink-0">
 <div className="w-48">
 <Progress 
 value={progress} 
 className={`h-2 ${isPaused ? '[&>div]:bg-amber-500' : ''}`}
 />
 </div>
 <span className="text-xs font-medium tabular-nums w-12 text-right">
 {Math.round(progress)}%
 </span>
 </div>
 )}

 {/* Right: Action buttons */}
 <div className="flex items-center gap-2 flex-shrink-0">
 {isActive && (
 <>
 {isPaused ? (
 <Button
 size="sm"
 variant="default"
 onClick={handleResume}
 disabled={actionLoading === 'resume'}
 className="gap-1.5"
 >
 {actionLoading === 'resume' ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <Play className="w-4 h-4" />
 )}
 <span className="hidden sm:inline">Reanudar</span>
 </Button>
 ) : (
 <Button
 size="sm"
 variant="secondary"
 onClick={handlePause}
 disabled={actionLoading === 'pause' || activeJob?.status === 'pending'}
 className="gap-1.5"
 >
 {actionLoading === 'pause' ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <Pause className="w-4 h-4" />
 )}
 <span className="hidden sm:inline">Pausar</span>
 </Button>
 )}
 <Button
 size="sm"
 variant="ghost"
 onClick={handleStop}
 disabled={!!actionLoading}
 className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
 >
 {actionLoading === 'stop' ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <Square className="w-4 h-4" />
 )}
 <span className="hidden sm:inline">Detener</span>
 </Button>
 </>
 )}

 {isCompleted && (
 <Button
 size="sm"
 variant="ghost"
 onClick={handleDismiss}
 className="gap-1.5"
 >
 <X className="w-4 h-4" />
 <span className="hidden sm:inline">Cerrar</span>
 </Button>
 )}
 </div>
 </div>
 </div>
 </div>
 </motion.div>
 </AnimatePresence>
 );
}
