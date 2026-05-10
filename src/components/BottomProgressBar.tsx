import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, CheckCircle2, Pause, Play, Square, X, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/domains/content';
import { loadLocationsFromDatabase } from '@/domains/content';
import { toast } from 'sonner';
import { countErrorBuckets } from '@/domains/content/lib/enrichment-error-kind';

interface EnrichmentJob {
 id: string;
 document_id: string;
 status: 'pending' | 'running' | 'paused' | 'completed' | 'error';
 total_count: number;
 processed_count: number;
 error_count: number;
 current_location_name: string | null;
 error_messages?: Record<string, unknown> | null;
}

/**
 * Una "sesión" agrega TODOS los jobs de enriquecimiento activos del usuario
 * (un mismo handleEnrich crea 1 job por documentId, así que 18 puntos
 * repartidos entre 3 docs = 3 jobs). El usuario espera ver "X de 18", no
 * "X de N" del job que esté corriendo en ese instante. Aquí los unificamos.
 */
interface EnrichmentSession {
  jobIds: string[];
  status: 'pending' | 'running' | 'paused' | 'completed' | 'error';
  total_count: number;
  processed_count: number;
  error_count: number;
  current_location_name: string | null;
  error_messages: Record<string, unknown>;
}

function aggregateJobs(jobs: EnrichmentJob[]): EnrichmentSession | null {
  if (jobs.length === 0) return null;
  const merged: Record<string, unknown> = {};
  let total = 0;
  let processed = 0;
  let errors = 0;
  let runningJob: EnrichmentJob | null = null;
  let anyRunning = false;
  let anyPending = false;
  let allPaused = true;
  for (const j of jobs) {
    total += j.total_count || 0;
    processed += j.processed_count || 0;
    errors += j.error_count || 0;
    if (j.error_messages && typeof j.error_messages === 'object') {
      Object.assign(merged, j.error_messages);
    }
    if (j.status === 'running') {
      anyRunning = true;
      allPaused = false;
      if (!runningJob) runningJob = j;
    } else if (j.status === 'pending') {
      anyPending = true;
      allPaused = false;
    } else if (j.status !== 'paused') {
      allPaused = false;
    }
  }
  const status: EnrichmentSession['status'] = anyRunning
    ? 'running'
    : allPaused
      ? 'paused'
      : anyPending
        ? 'pending'
        : 'running';
  return {
    jobIds: jobs.map((j) => j.id),
    status,
    total_count: total,
    processed_count: processed,
    error_count: errors,
    current_location_name: runningJob?.current_location_name ?? null,
    error_messages: merged,
  };
}

function formatEta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, '0')}m`;
}

export function BottomProgressBar() {
 const { selectedDocument, updateDocumentLocations, documents, filters } = useLocationsStore();
 const [activeJob, setActiveJob] = useState<EnrichmentSession | null>(null);
 const [showCompleted, setShowCompleted] = useState(false);
 const [actionLoading, setActionLoading] = useState<string | null>(null);
 const lastProcessedCountRef = useRef(0);
 const etaAnchorRef = useRef<{ startedAt: number; startedCompleted: number } | null>(null);

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
      // Trae TODOS los jobs activos en los documentos cargados (un handleEnrich
      // multi-doc crea 1 job por documento — los unificamos en una sola
      // sesión para que el contador refleje "X de TOTAL" correctamente).
  let activeQuery = supabase
  .from('enrichment_jobs')
  .select('*')
  .in('status', ['pending', 'running', 'paused'])
  .in('document_id', documentIds)
  .order('updated_at', { ascending: false });

  const { data: activeJobs, error } = await activeQuery;

 if (error) throw error;

 if (activeJobs && activeJobs.length > 0) {
 const session = aggregateJobs(activeJobs as EnrichmentJob[])!;
 const prevCount = lastProcessedCountRef.current;

 setActiveJob(session);

        // Refresca el mapa cuando avanza el procesado total.
 if (session.status === 'running' && session.processed_count > prevCount) {
 lastProcessedCountRef.current = session.processed_count;
 await refreshLocations();
 }
 } else {
        // No hay activos: comprueba si una sesión recién terminada (último job
        // del usuario en estos documentos) merece el flash de "completado".
 if (activeJob && activeJob.status !== 'completed') {
   const { data: recentDone } = await supabase
     .from('enrichment_jobs')
     .select('*')
     .eq('status', 'completed')
     .in('document_id', documentIds)
     .order('updated_at', { ascending: false })
     .limit(activeJob.jobIds.length);
   if (recentDone && recentDone.length > 0) {
     const finished = aggregateJobs(recentDone as EnrichmentJob[])!;
     finished.status = 'completed';
     setActiveJob(finished);
     setShowCompleted(true);
     await refreshLocations();
     setTimeout(() => setShowCompleted(false), 5000);
     lastProcessedCountRef.current = 0;
     return;
   }
 }
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

 // Aplica una acción (pause/resume/cancel) a TODOS los jobs de la sesión en
 // paralelo. Sin esto, pulsar Pausar/Detener sólo afectaría al primer job y
 // los demás seguirían corriendo silenciosamente.
 const broadcastAction = async (action: 'pause' | 'resume' | 'cancel') => {
   if (!activeJob) return;
   await Promise.all(
     activeJob.jobIds.map((jobId) =>
       supabase.functions.invoke('batch-enrich', { body: { action, jobId } }),
     ),
   );
 };

 const handlePause = async () => {
 if (!activeJob) return;
 setActionLoading('pause');
 try {
 await broadcastAction('pause');
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
 await broadcastAction('resume');
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
 await broadcastAction('cancel');
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
 await broadcastAction('cancel');
 setActiveJob(null);
 setShowCompleted(false);
 } catch (error) {
 console.error('Error dismissing job:', error);
 }
 };

 const isActive = activeJob && ['pending', 'running', 'paused'].includes(activeJob.status);
 const isCompleted = activeJob?.status === 'completed' && showCompleted;
 const isPaused = activeJob?.status === 'paused';

 const total = activeJob?.total_count ?? 0;
 const enriched = activeJob ? Math.max(0, activeJob.processed_count) : 0;
 const buckets = countErrorBuckets(activeJob?.error_messages ?? {});
 const hardErr = buckets.hard;
 const softErr = buckets.soft;
 const errorTotal = activeJob ? activeJob.error_count : 0;
 const completed = enriched + errorTotal;
 const queue = Math.max(0, total - completed);
 const progress = total > 0 ? (completed / total) * 100 : 0;
 const enrichedPct = total > 0 ? (enriched / total) * 100 : 0;
 const hardPct = total > 0 ? (hardErr / total) * 100 : 0;
 const softPct = total > 0 ? (softErr / total) * 100 : 0;

 // ETA: anchor on first running observation; recompute from rolling rate.
 useEffect(() => {
   if (!isActive || activeJob?.status !== 'running') {
     if (!isActive) etaAnchorRef.current = null;
     return;
   }
   if (!etaAnchorRef.current) {
     etaAnchorRef.current = { startedAt: Date.now(), startedCompleted: completed };
   }
 }, [isActive, activeJob?.status, completed]);

 let etaMs = 0;
 if (isActive && activeJob?.status === 'running' && etaAnchorRef.current && queue > 0) {
   const elapsed = Date.now() - etaAnchorRef.current.startedAt;
   const delta = completed - etaAnchorRef.current.startedCompleted;
   if (delta > 0 && elapsed > 1500) {
     const rate = delta / elapsed; // items per ms
     etaMs = queue / rate;
   }
 }

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
         <div className="px-4 py-2.5">
           <div className="max-w-screen-2xl mx-auto flex items-center gap-4">
             {/* Left: Icon + title block (compact) */}
             <div className="flex items-center gap-2.5 flex-shrink-0 min-w-0 max-w-[28%]">
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
               {isPaused && <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />}
               {activeJob?.status === 'pending' && (
                 <Loader2 className="w-5 h-5 text-muted-foreground animate-spin flex-shrink-0" />
               )}
               {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />}

               <div className="flex flex-col min-w-0 leading-tight">
                 {isActive && (
                   <>
                     <span className="font-medium text-sm truncate">
                       {isPaused ? 'Enriquecimiento pausado' : 'Enriqueciendo ubicaciones'}
                     </span>
                     {activeJob?.current_location_name && activeJob.status === 'running' && (
                       <span className="text-[11px] text-muted-foreground truncate">
                         {activeJob.current_location_name}
                       </span>
                     )}
                     {isPaused && (
                       <span className="text-[11px] text-amber-600 dark:text-amber-400">
                         {queue} pendientes
                       </span>
                     )}
                   </>
                 )}
                 {isCompleted && (
                   <span className="font-medium text-sm text-green-700 dark:text-green-400 truncate">
                     ¡{activeJob!.processed_count} ubicaciones enriquecidas!
                   </span>
                 )}
               </div>
             </div>

             {/* Center: Wide segmented progress bar with legend */}
             {isActive && (
               <div className="flex-1 min-w-0 flex flex-col gap-1">
                 <div className="relative h-3 rounded-full bg-muted/50 overflow-hidden">
                   {/* Enriched segment (green, or amber when paused) */}
                   <motion.div
                     className={`absolute inset-y-0 left-0 ${isPaused ? 'bg-amber-500' : 'bg-green-500'}`}
                     initial={{ width: 0 }}
                     animate={{ width: `${enrichedPct}%` }}
                     transition={{ duration: 0.3 }}
                   />
                   {/* Hard errors (red) */}
                   <motion.div
                     className="absolute inset-y-0 bg-red-500"
                     initial={{ width: 0 }}
                     animate={{ left: `${enrichedPct}%`, width: `${hardPct}%` }}
                     transition={{ duration: 0.3 }}
                   />
                   {/* Soft errors (amber) */}
                   <motion.div
                     className="absolute inset-y-0 bg-amber-500"
                     initial={{ width: 0 }}
                     animate={{ left: `${enrichedPct + hardPct}%`, width: `${softPct}%` }}
                     transition={{ duration: 0.3 }}
                   />
                 </div>
                 <div className="flex items-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums flex-wrap">
                   <span className="font-medium text-foreground">
                     {completed}/{total}
                   </span>
                   <span className="text-muted-foreground">{Math.round(progress)}%</span>
                   {activeJob?.status === 'running' && (
                     <span className="text-muted-foreground hidden sm:inline">
                       ETA {formatEta(etaMs)}
                     </span>
                   )}
                   <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400" title="Enriquecidos">
                     <span className="w-1.5 h-1.5 rounded-full bg-green-500" />{enriched}
                   </span>
                   {hardErr > 0 && (
                     <span className="inline-flex items-center gap-1 text-red-500" title="Errores duros">
                       <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{hardErr}
                     </span>
                   )}
                   {softErr > 0 && (
                     <span className="inline-flex items-center gap-1 text-amber-500" title="Sin coincidencia">
                       <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{softErr}
                     </span>
                   )}
                   <span className="inline-flex items-center gap-1 text-muted-foreground" title="En cola">
                     <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />{queue}
                   </span>
                 </div>
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
                 <Button size="sm" variant="ghost" onClick={handleDismiss} className="gap-1.5">
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
