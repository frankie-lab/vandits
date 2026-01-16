import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Play, Pause, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
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
import { GeoLocation } from '@/types/location';
import { supabase } from '@/integrations/supabase/client';
import { updateLocationInDatabase } from '@/hooks/use-database-sync';
import { toast } from 'sonner';

interface BatchEnrichmentPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ProcessStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

interface ProcessedLocation {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

export function BatchEnrichmentPanel({ open, onOpenChange }: BatchEnrichmentPanelProps) {
  const { selectedDocument, getFilteredLocations, updateLocation } = useLocationsStore();
  
  const [processStatus, setProcessStatus] = useState<ProcessStatus>('idle');
  const [processedLocations, setProcessedLocations] = useState<ProcessedLocation[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [onlyPending, setOnlyPending] = useState(true);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRunningRef = useRef(false);

  const allLocations = getFilteredLocations();
  
  // Calculate stats from all locations
  const enrichedCount = allLocations.filter(loc => loc.enrichedData && loc.enrichedData.verified).length;
  const pendingCount = allLocations.filter(loc => !loc.enrichedData).length;
  const conflictiveCount = allLocations.filter(loc => loc.enrichedData && !loc.enrichedData.verified).length;
  
  const locationsToProcess = onlyPending 
    ? allLocations.filter(loc => !loc.enrichedData)
    : allLocations;

  const totalCount = locationsToProcess.length;
  const processedCount = processedLocations.filter(p => p.status === 'success').length;
  const errorCount = processedLocations.filter(p => p.status === 'error').length;
  const progress = totalCount > 0 ? (processedCount / totalCount) * 100 : 0;

  // Reset state when panel opens
  useEffect(() => {
    if (open) {
      setProcessStatus('idle');
      setProcessedLocations([]);
      setCurrentIndex(0);
    }
  }, [open]);

  const enrichLocation = async (location: GeoLocation): Promise<boolean> => {
    if (!selectedDocument) return false;

    try {
      const { data, error } = await supabase.functions.invoke('enrich-location', {
        body: {
          location: {
            name: location.name,
            description: location.description,
            coordinates: location.coordinates,
            continent: location.continent,
            country: location.country,
            region: location.region,
            zone: location.zone,
            placeType: location.placeType,
          },
          generateImage: true,
        },
      });

      if (error) throw error;

      if (data?.enrichedData) {
        const updatedLocation: GeoLocation = {
          ...location,
          enrichedData: data.enrichedData,
        };
        
        updateLocation(selectedDocument.id, location.id, {
          enrichedData: data.enrichedData,
        });
        
        // Save to database
        await updateLocationInDatabase(updatedLocation);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error enriching location:', error);
      throw error;
    }
  };

  const startProcess = async () => {
    if (locationsToProcess.length === 0) {
      toast.info('No hay ubicaciones pendientes de enriquecer');
      return;
    }

    setProcessStatus('running');
    isRunningRef.current = true;
    abortControllerRef.current = new AbortController();

    // Initialize processed locations list
    const initialList: ProcessedLocation[] = locationsToProcess.map(loc => ({
      id: loc.id,
      name: loc.name,
      status: 'pending',
    }));
    setProcessedLocations(initialList);

    for (let i = currentIndex; i < locationsToProcess.length; i++) {
      if (!isRunningRef.current) {
        setProcessStatus('paused');
        return;
      }

      const location = locationsToProcess[i];
      setCurrentIndex(i);

      // Update status to processing
      setProcessedLocations(prev => 
        prev.map(p => p.id === location.id ? { ...p, status: 'processing' } : p)
      );

      try {
        await enrichLocation(location);
        
        // Update status to success
        setProcessedLocations(prev => 
          prev.map(p => p.id === location.id ? { ...p, status: 'success' } : p)
        );
      } catch (error) {
        // Update status to error
        setProcessedLocations(prev => 
          prev.map(p => p.id === location.id ? { 
            ...p, 
            status: 'error',
            error: error instanceof Error ? error.message : 'Error desconocido'
          } : p)
        );
      }

      // Small delay between requests to avoid rate limiting
      if (i < locationsToProcess.length - 1 && isRunningRef.current) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (isRunningRef.current) {
      setProcessStatus('completed');
      toast.success(`Proceso completado: ${processedCount + 1} ubicaciones enriquecidas`);
    }
  };

  const pauseProcess = () => {
    isRunningRef.current = false;
    setProcessStatus('paused');
  };

  const resumeProcess = () => {
    setCurrentIndex(prev => prev + 1);
    startProcess();
  };

  const stopProcess = () => {
    isRunningRef.current = false;
    abortControllerRef.current?.abort();
    setProcessStatus('idle');
    setProcessedLocations([]);
    setCurrentIndex(0);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-display flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Enriquecimiento por Lotes
          </SheetTitle>
          <SheetDescription>
            Procesa múltiples ubicaciones automáticamente con IA
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 mt-4 overflow-hidden">
          {/* Overview Stats - Status of all locations */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Estado general ({allLocations.length} ubicaciones)
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 rounded-lg p-3 text-center border border-amber-200 dark:border-amber-800">
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{enrichedCount}</div>
                <div className="text-xs text-amber-600 dark:text-amber-500 flex items-center justify-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Enriquecidas
                </div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center border">
                <div className="text-2xl font-bold text-foreground">{pendingCount}</div>
                <div className="text-xs text-muted-foreground">Pendientes</div>
              </div>
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/20 rounded-lg p-3 text-center border border-orange-200 dark:border-orange-800">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{conflictiveCount}</div>
                <div className="text-xs text-orange-600 dark:text-orange-500">Revisión</div>
              </div>
            </div>
          </div>

          {/* Process Stats - Only show when processing */}
          {processStatus !== 'idle' && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Proceso actual
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-100 dark:bg-blue-900/30 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{totalCount}</div>
                  <div className="text-[10px] text-blue-600 dark:text-blue-500">En cola</div>
                </div>
                <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-green-700 dark:text-green-400">{processedCount}</div>
                  <div className="text-[10px] text-green-600 dark:text-green-500">Completadas</div>
                </div>
                <div className="bg-red-100 dark:bg-red-900/30 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-red-700 dark:text-red-400">{errorCount}</div>
                  <div className="text-[10px] text-red-600 dark:text-red-500">Errores</div>
                </div>
              </div>
            </div>
          )}

          {/* Progress - only show when processing */}
          {processStatus !== 'idle' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progreso</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Filter toggle */}
          {processStatus === 'idle' && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyPending}
                onChange={(e) => setOnlyPending(e.target.checked)}
                className="rounded border-input"
              />
              <span className="text-muted-foreground">Solo ubicaciones sin enriquecer ({allLocations.filter(l => !l.enrichedData).length})</span>
            </label>
          )}

          {/* Controls */}
          <div className="flex gap-2">
            {processStatus === 'idle' && (
              <Button onClick={startProcess} className="flex-1 gap-2">
                <Play className="w-4 h-4" />
                Iniciar Proceso
              </Button>
            )}

            {processStatus === 'running' && (
              <Button onClick={pauseProcess} variant="secondary" className="flex-1 gap-2">
                <Pause className="w-4 h-4" />
                Pausar
              </Button>
            )}

            {processStatus === 'paused' && (
              <>
                <Button onClick={resumeProcess} className="flex-1 gap-2">
                  <Play className="w-4 h-4" />
                  Continuar
                </Button>
                <Button onClick={stopProcess} variant="outline" className="gap-2">
                  <X className="w-4 h-4" />
                  Cancelar
                </Button>
              </>
            )}

            {processStatus === 'completed' && (
              <Button onClick={stopProcess} variant="outline" className="flex-1 gap-2">
                <X className="w-4 h-4" />
                Cerrar
              </Button>
            )}
          </div>

          {/* Location list */}
          <ScrollArea className="flex-1 -mx-6 px-6">
            <AnimatePresence mode="popLayout">
              {processedLocations.map((loc, index) => (
                <motion.div
                  key={loc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className={`
                    flex items-center gap-3 p-2 rounded-lg mb-1
                    ${loc.status === 'processing' ? 'bg-primary/10' : 'bg-muted/50'}
                  `}
                >
                  {loc.status === 'pending' && (
                    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  {loc.status === 'processing' && (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  )}
                  {loc.status === 'success' && (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  )}
                  {loc.status === 'error' && (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{loc.name}</p>
                    {loc.error && (
                      <p className="text-xs text-red-600 truncate">{loc.error}</p>
                    )}
                  </div>

                  {loc.status === 'success' && (
                    <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700">
                      ✓
                    </Badge>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
