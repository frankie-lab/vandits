import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Filter, 
  List, 
  Download, 
  Sparkles, 
  Globe2, 
  FileUp,
  RotateCcw,
  Trash2,
  Menu,
  MapPin,
  CheckCircle,
  RefreshCw,
  FileText,
  CircleOff,
  Loader2,
  Settings2,
  Image,
  Search,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { UserMenu } from '@/components/UserMenu';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLocationsStore } from '@/store/locations-store';
import { supabase } from '@/integrations/supabase/client';

interface FloatingToolbarProps {
  onToggleFilters: () => void;
  onToggleLocations: () => void;
  onToggleExport: () => void;
  onToggleBatchEnrich: () => void;
  onToggleCriteriaConfig: () => void;
  onToggleGallery: () => void;
  onToggleSemanticSearch: () => void;
  onToggleDuplicates: () => void;
  onUploadClick: () => void;
  filtersOpen: boolean;
  locationsOpen: boolean;
  activeFilterCount: number;
}

interface EnrichmentJob {
  id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'error';
  total_count: number;
  processed_count: number;
  error_count: number;
  current_location_name: string | null;
}

export function FloatingToolbar({
  onToggleFilters,
  onToggleLocations,
  onToggleExport,
  onToggleBatchEnrich,
  onToggleCriteriaConfig,
  onToggleGallery,
  onToggleSemanticSearch,
  onToggleDuplicates,
  onUploadClick,
  filtersOpen,
  locationsOpen,
  activeFilterCount,
}: FloatingToolbarProps) {
  // Use direct state access to trigger re-renders on realtime updates
  const documents = useLocationsStore(state => state.documents);
  const selectedDocument = useLocationsStore(state => state.selectedDocument);
  const filters = useLocationsStore(state => state.filters);
  const setFilters = useLocationsStore(state => state.setFilters);
  // selectDocument removed - now we use consolidated view
  const removeDocument = useLocationsStore(state => state.removeDocument);
  const clearAllDocuments = useLocationsStore(state => state.clearAllDocuments);
  const getFilteredLocations = useLocationsStore(state => state.getFilteredLocations);
  const getAllLocations = useLocationsStore(state => state.getAllLocations);
  const getEnrichedStats = useLocationsStore(state => state.getEnrichedStats);

  const [activeJob, setActiveJob] = useState<EnrichmentJob | null>(null);
  const [, forceUpdate] = useState(0);

  // Listen for realtime updates to force stats refresh
  useEffect(() => {
    const handleRealtimeUpdate = () => {
      forceUpdate(v => v + 1);
    };
    window.addEventListener('location-realtime-update', handleRealtimeUpdate);
    return () => window.removeEventListener('location-realtime-update', handleRealtimeUpdate);
  }, []);

  // Fetch active job status (search across all imported documents)
  const fetchJobStatus = useCallback(async () => {
    if (documents.length === 0) {
      setActiveJob(null);
      return;
    }

    try {
      const settled = await Promise.allSettled(
        documents.map(async (doc) => {
          const res = await supabase.functions.invoke('batch-enrich', {
            body: { action: 'getActive', documentId: doc.id },
          });
          return { docId: doc.id, ...res };
        })
      );

      const jobs = settled
        .filter((s): s is PromiseFulfilledResult<any> => s.status === 'fulfilled')
        .map((s) => s.value)
        .filter((r) => !r.error && r.data?.job)
        .map((r) => ({ ...r.data.job, document_id: r.docId }) as EnrichmentJob & { created_at?: string });

      // Pick most recent active job across documents
      const best = jobs
        .slice()
        .sort((a, b) => {
          const at = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bt - at;
        })[0];

      setActiveJob(best || null);
    } catch (error) {
      console.error('Error fetching job status:', error);
      // Keep previous activeJob so UI doesn't flicker on transient errors
    }
  }, [documents]);

  // Poll for job status
  useEffect(() => {
    if (documents.length === 0) return;

    fetchJobStatus();
    const interval = setInterval(fetchJobStatus, 2000);
    return () => clearInterval(interval);
  }, [documents.length, fetchJobStatus]);

  const allLocations = getAllLocations();
  const locationCount = getFilteredLocations().length;
  const totalCount = allLocations.length;
  const stats = getEnrichedStats();

  const isProcessActive = activeJob && ['pending', 'running', 'paused'].includes(activeJob.status);
  const progress = activeJob ? (activeJob.processed_count / activeJob.total_count) * 100 : 0;

  // Criteria stats with colors
  const criteriaStats = [
    { 
      key: 'current' as const, 
      count: stats.byCriteria.current, 
      label: 'Final', 
      color: 'bg-green-500', 
      progressColor: 'bg-green-400',
      textColor: 'text-green-600',
      bgColor: 'bg-green-50 hover:bg-green-100 border-green-200',
      icon: CheckCircle,
      description: 'Estado final - cumple todos los criterios actuales'
    },
    { 
      key: 'previous' as const, 
      count: stats.byCriteria.previous, 
      label: 'Pendiente', 
      color: 'bg-blue-500', 
      progressColor: 'bg-blue-400',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      icon: RefreshCw,
      description: 'Pendiente de nuevo criterio (actualizable)'
    },
    { 
      key: 'unknown' as const, 
      count: stats.byCriteria.unknown, 
      label: 'Desconocido', 
      color: 'bg-orange-500', 
      progressColor: 'bg-orange-400',
      textColor: 'text-orange-600',
      bgColor: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      icon: FileText,
      description: 'Tiene descripción original pero sin ficha IA'
    },
    { 
      key: 'new' as const, 
      count: stats.byCriteria.new, 
      label: 'Importado', 
      color: 'bg-red-500', 
      progressColor: 'bg-red-400',
      textColor: 'text-red-600',
      bgColor: 'bg-red-50 hover:bg-red-100 border-red-200',
      icon: CircleOff,
      description: 'Importado sin actualizar (sin ficha ni descripción)'
    },
  ];

  return (
    <>
      {/* Logo - Fixed Right Position */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed top-4 right-4 z-[1000]"
      >
        <div className="flex items-center gap-2 bg-background/95 backdrop-blur-md rounded-full shadow-lg border border-border/50 px-3 py-2">
          <div className="p-1.5 ocean-gradient rounded-lg">
            <Globe2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-sm">VANDITS</span>
        </div>
      </motion.div>

      {/* Main Toolbar - Centered */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000]"
      >
        <div className="flex items-center gap-1 bg-background/95 backdrop-blur-md rounded-full shadow-2xl border border-border/50 px-2 py-1.5">
          
          {/* SECTION 1: Information Base - Location Status Counts */}
          {totalCount > 0 && (
            <div className="flex items-center gap-1 px-1">
              {/* Progress indicator when active */}
              {isProcessActive && (
                <div className="flex items-center gap-1 mr-1 px-1.5 py-0.5 bg-primary/10 rounded">
                  <Loader2 className="w-3 h-3 text-primary animate-spin" />
                  <span className="text-[10px] text-primary font-medium">
                    {activeJob?.processed_count}/{activeJob?.total_count}
                  </span>
                </div>
              )}
            
            {criteriaStats.map((stat) => {
              // Check if this status is currently being filtered
              const isFiltered = filters.enrichmentStatus === stat.key;
              
              return (
                <Tooltip key={stat.key}>
                  <TooltipTrigger asChild>
                    <button 
                      onClick={() => {
                        // Toggle filter: if already filtering by this status, clear it
                        if (isFiltered) {
                          setFilters({ ...filters, enrichmentStatus: undefined });
                        } else {
                          setFilters({ ...filters, enrichmentStatus: stat.key });
                        }
                      }}
                      className={`relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${stat.bgColor} ${stat.textColor} min-w-[36px] ${isFiltered ? 'ring-2 ring-offset-1 ring-primary scale-105' : 'hover:scale-105'}`}
                    >
                      <div className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${stat.color}`} />
                        <span>{stat.count}</span>
                      </div>
                      {/* Mini progress bar when processing */}
                      {isProcessActive && (
                        <div className="w-full h-0.5 bg-gray-200 rounded-full overflow-hidden">
                          <motion.div 
                            className={`h-full ${stat.progressColor}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[220px] p-2">
                    <div className="font-medium">{stat.label}</div>
                    <div className="flex items-center justify-between gap-3 mt-1">
                      <span>{stat.count} de {totalCount} fichas</span>
                      <span className="font-bold">{totalCount > 0 ? Math.round((stat.count / totalCount) * 100) : 0}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                      <motion.div 
                        className={`h-full ${stat.color} rounded-full`}
                        initial={{ width: 0 }}
                        animate={{ width: `${totalCount > 0 ? (stat.count / totalCount) * 100 : 0}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                      />
                    </div>
                    <div className="mt-1.5 text-[10px] text-muted-foreground">
                      {isFiltered ? '↩ Click para mostrar todos' : '🔍 Click para filtrar'}
                    </div>
                    {isProcessActive && activeJob && (
                      <div className="mt-2 pt-2 border-t border-border/50 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin text-primary" />
                          <span>Procesando: {activeJob.processed_count}/{activeJob.total_count}</span>
                        </div>
                        {activeJob.processed_count > 0 && (
                          <div className="mt-1 text-[10px]">
                            ⏱ Tiempo restante: ~{Math.ceil((activeJob.total_count - activeJob.processed_count) * 3 / 60)} min
                          </div>
                        )}
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
            
            {/* Settings button for criteria */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button 
                  onClick={onToggleCriteriaConfig}
                  className="flex items-center justify-center w-7 h-7 rounded-lg border border-border/50 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Configurar criterios de actualización
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Separator before options */}
        {totalCount > 0 && <div className="w-px h-6 bg-border/50" />}
        
        {/* SECTION 3: User Preferences - View Options (RRDD: User Controls) */}
        <div className="flex items-center gap-0.5 px-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={filtersOpen ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 relative"
                onClick={onToggleFilters}
              >
                <Filter className="w-4 h-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filtros</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={locationsOpen ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={onToggleLocations}
              >
                <List className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Lista de ubicaciones</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onToggleGallery}
              >
                <Image className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Galería de imágenes</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onToggleSemanticSearch}
              >
                <Search className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Búsqueda inteligente</TooltipContent>
          </Tooltip>

          {/* Main Menu Burger */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 z-[1001]">
              <DropdownMenuLabel className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Gestión de Puntos
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              {/* Enrichment Section */}
              <DropdownMenuItem onClick={onToggleBatchEnrich} className="cursor-pointer">
                <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
                <div className="flex flex-col flex-1">
                  <span>Enriquecimiento IA</span>
                  <span className="text-xs text-muted-foreground">
                    {stats.byCriteria.current} actualizadas / {stats.total} total
                  </span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={onToggleDuplicates} className="cursor-pointer">
                <Copy className="w-4 h-4 mr-2 text-orange-500" />
                Buscar duplicados
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Datos</DropdownMenuLabel>
              
              <DropdownMenuItem onClick={onUploadClick} className="cursor-pointer">
                <FileUp className="w-4 h-4 mr-2 text-blue-500" />
                Subir archivo KML
              </DropdownMenuItem>
              
              <DropdownMenuItem onClick={onToggleExport} className="cursor-pointer">
                <Download className="w-4 h-4 mr-2 text-green-500" />
                Exportar datos
              </DropdownMenuItem>

              {documents.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Documento actual</DropdownMenuLabel>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem 
                        onSelect={(e) => e.preventDefault()}
                        className="cursor-pointer text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Eliminar "{selectedDocument?.name}"
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="z-[2001]">
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminará "{selectedDocument?.name}" con todas sus ubicaciones.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => selectedDocument && removeDocument(selectedDocument.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem 
                        onSelect={(e) => e.preventDefault()}
                        className="cursor-pointer text-destructive focus:text-destructive"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reiniciar todo
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="z-[2001]">
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Volver al inicio?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminarán todos los documentos y ubicaciones.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={clearAllDocuments}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Reiniciar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* User Menu */}
          <UserMenu />
        </div>
        </div>
      </motion.div>
    </>
  );
}
