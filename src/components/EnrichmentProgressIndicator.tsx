import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/store/locations-store';
import { loadLocationsFromDatabase } from '@/hooks/use-database-sync';

interface EnrichmentJob {
 id: string;
 document_id: string;
 status: 'pending' | 'running' | 'paused' | 'completed' | 'error';
 total_count: number;
 processed_count: number;
 error_count: number;
 current_location_name: string | null;
}

export function EnrichmentProgressIndicator() {
 const { selectedDocument, updateDocumentLocations } = useLocationsStore();
 const [activeJob, setActiveJob] = useState<EnrichmentJob | null>(null);
 const [showCompleted, setShowCompleted] = useState(false);
 const lastProcessedCountRef = useRef(0);

 const refreshLocations = useCallback(async () => {
 if (!selectedDocument) return;
 const locations = await loadLocationsFromDatabase(selectedDocument.id);
 if (locations.length > 0) {
 updateDocumentLocations(selectedDocument.id, locations);
 }
 }, [selectedDocument, updateDocumentLocations]);

 const fetchJobStatus = useCallback(async () => {
 if (!selectedDocument) {
 setActiveJob(null);
 return;
 }

 try {
 const { data, error } = await supabase.functions.invoke('batch-enrich', {
 body: { action: 'getActive', documentId: selectedDocument.id },
 });

 if (error) throw error;

 if (data?.job) {
 const prevStatus = activeJob?.status;
 const prevCount = lastProcessedCountRef.current;
 
 setActiveJob(data.job);
 
        // If new locations were processed, refresh the map
 if (data.job.status === 'running' && data.job.processed_count > prevCount) {
 lastProcessedCountRef.current = data.job.processed_count;
 await refreshLocations();
 }
 
        // If just completed, refresh locations and show completion briefly
 if (data.job.status === 'completed' && prevStatus === 'running') {
 setShowCompleted(true);
 await refreshLocations();
 lastProcessedCountRef.current = 0;
 setTimeout(() => setShowCompleted(false), 3000);
 }
 } else {
 setActiveJob(null);
 lastProcessedCountRef.current = 0;
 }
 } catch (error) {
 console.error('Error fetching job status:', error);
 }
 }, [selectedDocument, activeJob?.status, refreshLocations]);

  // Poll for job status
 useEffect(() => {
 if (!selectedDocument) return;

    // Initial fetch
 fetchJobStatus();

    // Poll every 2 seconds
 const interval = setInterval(() => {
 fetchJobStatus();
 }, 2000);

 return () => clearInterval(interval);
 }, [selectedDocument?.id]);

  // Dismiss completed notification
 const dismissCompleted = async () => {
 if (activeJob?.status === 'completed') {
 try {
 await supabase.functions.invoke('batch-enrich', {
 body: { action: 'cancel', jobId: activeJob.id },
 });
 setActiveJob(null);
 setShowCompleted(false);
 } catch (error) {
 console.error('Error dismissing job:', error);
 }
 }
 };

 const isActive = activeJob && ['pending', 'running', 'paused'].includes(activeJob.status);
 const isCompleted = activeJob?.status === 'completed' && showCompleted;
 const progress = activeJob ? (activeJob.processed_count / activeJob.total_count) * 100 : 0;

 if (!isActive && !isCompleted) return null;

 return (
 <AnimatePresence>
 <motion.div
 initial={{ opacity: 0, y: -10, scale: 0.95 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: -10, scale: 0.95 }}
 className="fixed top-16 left-1/2 -translate-x-1/2 z-50"
 >
 <div className={`
 flex items-center gap-3 px-4 py-2 rounded-full shadow-lg border backdrop-blur-sm
 ${isCompleted 
 ? 'bg-green-50/95 dark:bg-green-900/50 border-green-200 dark:border-green-800' 
 : 'bg-background/95 border-border'
 }
 `}>
 {/* Icon */}
 {isActive && activeJob?.status === 'running' && (
 <div className="relative">
 <Sparkles className="w-4 h-4 text-primary" />
 <motion.div
 className="absolute inset-0"
 animate={{ rotate: 360 }}
 transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
 >
 <Loader2 className="w-4 h-4 text-primary opacity-50" />
 </motion.div>
 </div>
 )}
 {isActive && activeJob?.status === 'paused' && (
 <AlertCircle className="w-4 h-4 text-amber-500" />
 )}
 {isActive && activeJob?.status === 'pending' && (
 <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
 )}
 {isCompleted && (
 <CheckCircle2 className="w-4 h-4 text-green-600" />
 )}

 {/* Content */}
 <div className="flex items-center gap-3">
 {isActive && (
 <>
 <div className="text-xs">
 <span className="font-medium">Enriqueciendo</span>
 <span className="text-muted-foreground ml-1">
 {activeJob!.processed_count}/{activeJob!.total_count}
 </span>
 </div>
 <div className="w-24">
 <Progress value={progress} className="h-1.5" />
 </div>
 {activeJob?.current_location_name && activeJob.status === 'running' && (
 <span className="text-xs text-muted-foreground max-w-[150px] truncate hidden sm:block">
 {activeJob.current_location_name}
 </span>
 )}
 </>
 )}

 {isCompleted && (
 <>
 <span className="text-xs font-medium text-green-700 dark:text-green-400">
 ¡{activeJob!.processed_count} ubicaciones enriquecidas!
 </span>
 <button 
 onClick={dismissCompleted}
 className="p-0.5 hover:bg-green-200/50 dark:hover:bg-green-800/50 rounded"
 >
 <X className="w-3 h-3 text-green-600" />
 </button>
 </>
 )}
 </div>
 </div>
 </motion.div>
 </AnimatePresence>
 );
}
