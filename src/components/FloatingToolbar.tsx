import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Filter, 
  List, 
  CheckCircle,
  RefreshCw,
  FileText,
  CircleOff,
  Loader2,
  Search,
  Flame,
  CircleDot,
  Layers,
  Sun,
  Moon,
  Satellite,
  Users,
  UserCheck,
  Globe2,
  SlidersHorizontal,
  MapPin,
  Sparkles,
  Settings2,
  User,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
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
import { useSocialStats } from '@/hooks/use-social-stats';
import { useAuth } from '@/hooks/use-auth';

interface FloatingToolbarProps {
  onToggleFilters: () => void;
  onToggleLocations: () => void;
  onToggleExport: () => void;
  onToggleBatchEnrich: () => void;
  onToggleCriteriaConfig: () => void;
  onToggleGallery: () => void;
  onToggleSemanticSearch: () => void;
  onToggleDuplicates: () => void;
  onToggleIncomplete: () => void;
  onUploadClick: () => void;
  onOpenProfile?: () => void;
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
  onToggleIncomplete,
  onUploadClick,
  onOpenProfile,
  filtersOpen,
  locationsOpen,
  activeFilterCount,
}: FloatingToolbarProps) {
  // Use direct state access to trigger re-renders on realtime updates
  const documents = useLocationsStore(state => state.documents);
  const selectedDocument = useLocationsStore(state => state.selectedDocument);
  const filters = useLocationsStore(state => state.filters);
  const setFilters = useLocationsStore(state => state.setFilters);
  const setCurrentUserId = useLocationsStore(state => state.setCurrentUserId);
  const getFilteredLocations = useLocationsStore(state => state.getFilteredLocations);
  const getAllLocations = useLocationsStore(state => state.getAllLocations);
  const getEnrichedStats = useLocationsStore(state => state.getEnrichedStats);

  const [activeJob, setActiveJob] = useState<EnrichmentJob | null>(null);
  const [, forceUpdate] = useState(0);
  const [mapViewMode, setMapViewMode] = useState<'markers' | 'heatmap'>('markers');
  const [mapTheme, setMapTheme] = useState<'light' | 'dark' | 'satellite'>('light');
  
  // Social stats
  const { stats: socialStats } = useSocialStats();
  const { user } = useAuth();

  // Dispatch map control events
  const handleMapViewModeChange = (mode: 'markers' | 'heatmap') => {
    setMapViewMode(mode);
    window.dispatchEvent(new CustomEvent('map-view-mode', { detail: { mode } }));
  };

  const handleGoHome = () => {
    window.dispatchEvent(new CustomEvent('map-go-home'));
  };

  const handleSetTheme = (theme: 'light' | 'dark' | 'satellite') => {
    setMapTheme(theme);
    window.dispatchEvent(new CustomEvent('map-set-theme', { detail: { theme } }));
  };

  // Listen for theme changes from map
  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: 'light' | 'dark' | 'satellite' }>;
      if (customEvent.detail?.theme) {
        setMapTheme(customEvent.detail.theme);
      }
    };
    window.addEventListener('map-theme-changed', handleThemeChange);
    return () => window.removeEventListener('map-theme-changed', handleThemeChange);
  }, []);

  // Get the appropriate icon for current theme
  const getThemeIcon = () => {
    switch (mapTheme) {
      case 'dark': return Moon;
      case 'satellite': return Satellite;
      default: return Sun;
    }
  };

  const getThemeLabel = () => {
    switch (mapTheme) {
      case 'dark': return 'Oscuro';
      case 'satellite': return 'Satélite';
      default: return 'Claro';
    }
  };

  const ThemeIcon = getThemeIcon();

  // Sync current user id to store for ownership filter
  useEffect(() => {
    setCurrentUserId(user?.id || null);
  }, [user?.id, setCurrentUserId]);

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
      color: 'bg-gray-400', 
      progressColor: 'bg-gray-300',
      textColor: 'text-gray-600',
      bgColor: 'bg-gray-100 hover:bg-gray-200 border-gray-300',
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
      {/* Logo - Clean floating over map */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed top-4 left-14 z-[1000] flex items-center gap-2.5 h-10"
      >
        <div className="p-2 ocean-gradient rounded-xl shadow-lg">
          <Globe2 className="w-6 h-6 text-primary-foreground" />
        </div>
        <span className="font-display font-bold text-xl text-foreground drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">VANDITS</span>
      </motion.div>

      {/* Search Bar - Functional input with advanced option */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="fixed top-4 right-4 z-[1000] h-10 flex items-center"
      >
        <div className="flex items-center gap-1 bg-background/95 backdrop-blur-md shadow-lg border border-border/50 rounded-full px-3 py-1.5 w-full max-w-sm h-10">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input
            type="text"
            placeholder="Buscar ubicaciones..."
            value={filters.searchTerm || ''}
            onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value || undefined })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onToggleSemanticSearch();
              }
            }}
            className="h-8 flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 text-sm placeholder:text-muted-foreground"
          />
          {activeFilterCount > 0 && (
            <span className="w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center font-medium flex-shrink-0">
              {activeFilterCount}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0 hover:bg-muted"
            onClick={onToggleSemanticSearch}
            title="Búsqueda avanzada y filtros"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-4 left-[200px] right-[340px] z-[1000] flex justify-center items-center h-10"
      >
        <div className="flex items-center gap-1 bg-background/95 backdrop-blur-md rounded-full shadow-2xl border border-border/50 px-2 py-1.5 h-10">
          
          {/* SECTION 0: Location Count - Shows filtered/total, click to show all */}
          {totalCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button 
                  onClick={() => {
                    // Clear all filters to show all locations
                    setFilters({});
                  }}
                  className="flex items-center gap-2 px-3 text-primary hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
                >
                  <MapPin className="w-5 h-5" />
                  {locationCount === totalCount ? (
                    <span className="text-2xl font-extrabold">{totalCount}</span>
                  ) : (
                    <span className="text-2xl font-extrabold">
                      {locationCount} <span className="text-base font-medium text-muted-foreground">de {totalCount}</span>
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <div className="font-medium">
                  {locationCount === totalCount 
                    ? `${totalCount} ubicaciones` 
                    : `Mostrando ${locationCount} de ${totalCount}`
                  }
                </div>
                <div className="text-muted-foreground">
                  {locationCount < totalCount 
                    ? 'Click para mostrar todas' 
                    : 'Todas las ubicaciones visibles'
                  }
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          
          {/* Separator after location count - removed user dependency */}
          
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
            
            {criteriaStats.filter(stat => stat.count > 0).map((stat) => {
              // Check if this status is currently being filtered
              const isFiltered = filters.enrichmentStatus === stat.key;
              const isIncomplete = stat.key === 'new';
              const isPending = stat.key === 'previous';
              
              // For 'previous' (pending/blue) status, show dropdown with options
              if (isPending && stat.count > 0) {
                return (
                  <DropdownMenu key={stat.key}>
                    <DropdownMenuTrigger asChild>
                      <button 
                        className={`relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${stat.bgColor} ${stat.textColor} min-w-[36px] ${isFiltered ? 'ring-2 ring-offset-1 ring-primary scale-105' : 'hover:scale-105'}`}
                      >
                        <div className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${stat.color}`} />
                          <span>{stat.count}</span>
                        </div>
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
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="z-[1100] bg-background min-w-[200px]">
                      <DropdownMenuLabel className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${stat.color}`} />
                        {stat.count} puntos pendientes
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => {
                          if (isFiltered) {
                            setFilters({ ...filters, enrichmentStatus: undefined });
                          } else {
                            setFilters({ ...filters, enrichmentStatus: stat.key });
                          }
                        }}
                      >
                        <Filter className="w-4 h-4 mr-2" />
                        {isFiltered ? 'Mostrar todos' : 'Filtrar solo pendientes'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onToggleBatchEnrich}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Actualizar en lote
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onToggleCriteriaConfig}>
                        <Settings2 className="w-4 h-4 mr-2" />
                        Configurar criterios
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }
              
              return (
                <Tooltip key={stat.key}>
                  <TooltipTrigger asChild>
                    <button 
                      onClick={() => {
                        // For 'new' (incomplete/red) status, open the incomplete panel
                        if (isIncomplete && stat.count > 0) {
                          onToggleIncomplete();
                          return;
                        }
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
                      {isIncomplete && stat.count > 0 
                        ? '📋 Click para gestionar incompletos' 
                        : isFiltered 
                          ? '↩ Click para mostrar todos' 
                          : '🔍 Click para filtrar'
                      }
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

        {/* Separator before map controls */}
        {totalCount > 0 && <div className="w-px h-6 bg-border/50" />}

        {/* SECTION 3: Map Controls */}
        <div className="flex items-center gap-0.5 px-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                <ThemeIcon className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="z-[1100] bg-background">
              <DropdownMenuLabel>Tema del mapa</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => handleSetTheme('light')}
                className={mapTheme === 'light' ? 'bg-accent' : ''}
              >
                <Sun className="w-4 h-4 mr-2" />
                Claro
                {mapTheme === 'light' && <span className="ml-auto text-primary">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleSetTheme('dark')}
                className={mapTheme === 'dark' ? 'bg-accent' : ''}
              >
                <Moon className="w-4 h-4 mr-2" />
                Oscuro
                {mapTheme === 'dark' && <span className="ml-auto text-primary">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleSetTheme('satellite')}
                className={mapTheme === 'satellite' ? 'bg-accent' : ''}
              >
                <Satellite className="w-4 h-4 mr-2" />
                Satélite
                {mapTheme === 'satellite' && <span className="ml-auto text-primary">✓</span>}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View mode dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                {mapViewMode === 'markers' ? <CircleDot className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="z-[1100] bg-background">
              <DropdownMenuLabel>Vista del mapa</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => handleMapViewModeChange('markers')}
                className={mapViewMode === 'markers' ? 'bg-accent' : ''}
              >
                <CircleDot className="w-4 h-4 mr-2" />
                Marcadores
                {mapViewMode === 'markers' && <span className="ml-auto text-primary">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleMapViewModeChange('heatmap')}
                className={mapViewMode === 'heatmap' ? 'bg-accent' : ''}
              >
                <Flame className="w-4 h-4 mr-2" />
                Mapa de calor
                {mapViewMode === 'heatmap' && <span className="ml-auto text-primary">✓</span>}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Separator before ownership filter */}
        <div className="w-px h-6 bg-border/50" />
        
        {/* SECTION: Ownership Filter */}
        {user && totalCount > 0 && (
          <div className="flex items-center px-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={filters.ownershipFilter && filters.ownershipFilter !== 'all' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 gap-2 px-3"
                >
                  {filters.ownershipFilter === 'mine' ? (
                    <>
                      <User className="w-4 h-4" />
                      <span className="text-sm">Mis puntos</span>
                    </>
                  ) : filters.ownershipFilter === 'followed' ? (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span className="text-sm">De seguidos</span>
                    </>
                  ) : (
                    <>
                      <Users className="w-4 h-4" />
                      <span className="text-sm">Todos</span>
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="z-[1100] bg-background">
                <DropdownMenuLabel>Filtrar por propietario</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => setFilters({ ...filters, ownershipFilter: 'all' })}
                  className={(!filters.ownershipFilter || filters.ownershipFilter === 'all') ? 'bg-accent' : ''}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Todos los puntos
                  {(!filters.ownershipFilter || filters.ownershipFilter === 'all') && <span className="ml-auto text-primary">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setFilters({ ...filters, ownershipFilter: 'mine' })}
                  className={filters.ownershipFilter === 'mine' ? 'bg-accent' : ''}
                >
                  <User className="w-4 h-4 mr-2" />
                  Mis puntos
                  {filters.ownershipFilter === 'mine' && <span className="ml-auto text-primary">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setFilters({ ...filters, ownershipFilter: 'followed' })}
                  className={filters.ownershipFilter === 'followed' ? 'bg-accent' : ''}
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  De seguidos
                  {filters.ownershipFilter === 'followed' && <span className="ml-auto text-primary">✓</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        
        {/* Separator before social stats */}
        <div className="w-px h-6 bg-border/50" />
        
        {/* SECTION: Social Stats (following/followers only) */}
        {user && (
          <div className="flex items-center gap-4 px-3">
            {socialStats.followedLocationsCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={() => setFilters({ ...filters, ownershipFilter: filters.ownershipFilter === 'followed' ? 'all' : 'followed' })}
                    className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${filters.ownershipFilter === 'followed' ? 'bg-green-100 text-green-700' : 'text-green-600 hover:bg-green-50'}`}
                  >
                    <Users className="w-5 h-5" />
                    <span className="text-xl font-bold">{socialStats.followedLocationsCount}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <div className="font-medium">De usuarios seguidos</div>
                  <div className="text-muted-foreground">
                    {filters.ownershipFilter === 'followed' 
                      ? 'Click para mostrar todos' 
                      : 'Click para filtrar solo estos'
                    }
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 px-2 py-1 text-foreground">
                    <span className="text-xl font-bold">{socialStats.followingCount}</span>
                    <span className="text-sm text-muted-foreground">siguiendo</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Sigues a {socialStats.followingCount} usuarios
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 px-2 py-1 text-foreground">
                    <span className="text-xl font-bold">{socialStats.followersCount}</span>
                    <span className="text-sm text-muted-foreground">seguidores</span>
                    {socialStats.pendingFollowersCount > 0 && (
                      <Badge variant="destructive" className="h-5 w-5 p-0 text-[10px] flex items-center justify-center rounded-full ml-1">
                        {socialStats.pendingFollowersCount}
                      </Badge>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <div>{socialStats.followersCount} seguidores</div>
                  {socialStats.pendingFollowersCount > 0 && (
                    <div className="text-amber-500">{socialStats.pendingFollowersCount} solicitudes pendientes</div>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
        
        {/* Separator before panel options */}
        <div className="w-px h-6 bg-border/50" />
        
        {/* SECTION 4: Panel Options */}
        <div className="flex items-center gap-0.5 px-1">
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

        </div>
        
        {/* Separator before user menu */}
        <div className="w-px h-8 bg-border/50 mx-1" />
          
        {/* User Menu - contains all settings */}
        <div className="flex items-center pl-1">
          <UserMenu 
            onOpenProfile={onOpenProfile}
            onToggleBatchEnrich={onToggleBatchEnrich}
            onToggleDuplicates={onToggleDuplicates}
            onUploadClick={onUploadClick}
            onToggleExport={onToggleExport}
            onToggleCriteriaConfig={onToggleCriteriaConfig}
          />
        </div>
        </div>
      </motion.div>
    </>
  );
}
