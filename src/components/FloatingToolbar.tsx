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
  Users,
  UserCheck,
  Globe2,
  SlidersHorizontal,
  MapPin,
  Sparkles,
  Settings2,
  User,
  Clock,
  Copy,
  MapPinCheck,
} from 'lucide-react';
import SunCalc from 'suncalc';
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
import { APP_VERSION, APP_NAME } from '@/lib/version';

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
  onOpenAdmin?: () => void;
  onOpenUsers?: () => void;
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
  onOpenAdmin,
  onOpenUsers,
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
  const [mapTheme, setMapTheme] = useState<'light' | 'dark'>('light');
  const [autoTheme, setAutoTheme] = useState<boolean>(() => {
    return localStorage.getItem('vandits-auto-theme') === 'true';
  });
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  
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

  const handleSetTheme = (theme: 'light' | 'dark') => {
    setMapTheme(theme);
    window.dispatchEvent(new CustomEvent('map-set-theme', { detail: { theme } }));
    
    // Apply dark mode to the entire app when map is dark
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Listen for theme changes from map
  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: 'light' | 'dark' }>;
      if (customEvent.detail?.theme) {
        setMapTheme(customEvent.detail.theme);
        
        // Sync dark mode class with map theme
        if (customEvent.detail.theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };
    window.addEventListener('map-theme-changed', handleThemeChange);
    return () => window.removeEventListener('map-theme-changed', handleThemeChange);
  }, []);

  // Auto theme based on solar time
  useEffect(() => {
    if (!autoTheme) return;

    // Get user location
    if (!userCoords && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          // Fallback to Madrid if geolocation fails
          setUserCoords({ lat: 40.4168, lng: -3.7038 });
        }
      );
    }

    if (!userCoords) return;

    const checkSolarTime = () => {
      const now = new Date();
      const times = SunCalc.getTimes(now, userCoords.lat, userCoords.lng);
      const isDaylight = now >= times.sunrise && now <= times.sunset;
      
      const newTheme = isDaylight ? 'light' : 'dark';
      if (mapTheme !== newTheme) {
        handleSetTheme(newTheme);
      }
    };

    checkSolarTime();
    
    // Check every minute
    const interval = setInterval(checkSolarTime, 60000);
    return () => clearInterval(interval);
  }, [autoTheme, userCoords, mapTheme]);

  // Toggle auto theme
  const handleToggleAutoTheme = () => {
    const newValue = !autoTheme;
    setAutoTheme(newValue);
    localStorage.setItem('vandits-auto-theme', String(newValue));
    
    if (newValue && userCoords) {
      // Immediately apply based on current solar time
      const now = new Date();
      const times = SunCalc.getTimes(now, userCoords.lat, userCoords.lng);
      const isDaylight = now >= times.sunrise && now <= times.sunset;
      handleSetTheme(isDaylight ? 'light' : 'dark');
    }
  };

  // Get the appropriate icon for current theme
  const getThemeIcon = () => {
    if (autoTheme) return Clock;
    switch (mapTheme) {
      case 'dark': return Moon;
      default: return Sun;
    }
  };

  const getThemeLabel = () => {
    if (autoTheme) return 'Auto';
    switch (mapTheme) {
      case 'dark': return 'Oscuro';
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

  // Duplicates count - pending from imports + database duplicates
  const pendingDuplicates = useLocationsStore(state => state.pendingDuplicates);
  const resolvedDuplicatePairIds = useLocationsStore(state => state.resolvedDuplicatePairIds);
  const [dbDuplicatesCount, setDbDuplicatesCount] = useState(0);
  
  // Fetch database duplicates count (locations within 5m of each other)
  const fetchDbDuplicates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('id, latitude, longitude');
      
      if (error || !data) return;
      
      // Count pairs within 5m, excluding resolved pairs
      let count = 0;
      for (let i = 0; i < data.length; i++) {
        for (let j = i + 1; j < data.length; j++) {
          // Check if this pair is resolved
          const pairId = [data[i].id, data[j].id].sort().join('-');
          if (resolvedDuplicatePairIds.includes(pairId)) continue;
          
          const R = 6371000;
          const dLat = (data[j].latitude - data[i].latitude) * Math.PI / 180;
          const dLng = (data[j].longitude - data[i].longitude) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(data[i].latitude * Math.PI / 180) * Math.cos(data[j].latitude * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
          const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          if (distance < 5) count++;
        }
      }
      setDbDuplicatesCount(count);
    } catch (err) {
      console.error('Error fetching duplicates:', err);
    }
  }, [resolvedDuplicatePairIds]);
  
  useEffect(() => {
    fetchDbDuplicates();
    const handleUpdate = () => fetchDbDuplicates();
    window.addEventListener('location-realtime-update', handleUpdate);
    return () => window.removeEventListener('location-realtime-update', handleUpdate);
  }, [fetchDbDuplicates]);
  
  const totalDuplicatesCount = pendingDuplicates.length + dbDuplicatesCount;

  // Calculate visited locations count and ownership breakdown
  const visitedStats = React.useMemo(() => {
    const allLocs = getAllLocations();
    // Handle both string 'true' and boolean true for visited status
    const visited = allLocs.filter(loc => {
      const visitedValue = loc.customData?.visited;
      return visitedValue === 'true' || String(visitedValue) === 'true';
    });
    
    // Calculate ownership breakdown from documents
    let myPointsCount = 0;
    let followedPointsCount = 0;
    
    documents.forEach(doc => {
      if (doc.userId === user?.id) {
        myPointsCount += doc.locations.length;
      } else {
        followedPointsCount += doc.locations.length;
      }
    });
    
    return {
      visitedCount: visited.length,
      totalCount: allLocs.length,
      myPointsCount,
      followedPointsCount,
      percentage: allLocs.length > 0 ? Math.round((visited.length / allLocs.length) * 100) : 0,
    };
  }, [getAllLocations, documents, user?.id]);

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
      description: 'Pendiente - criterios han cambiado (actualizable)'
    },
    { 
      key: 'unknown' as const, 
      count: stats.byCriteria.unknown, 
      label: 'Importado', 
      color: 'bg-gray-400', 
      progressColor: 'bg-gray-300',
      textColor: 'text-gray-600',
      bgColor: 'bg-gray-50 hover:bg-gray-100 border-gray-200',
      icon: FileText,
      description: 'Tiene descripción original pero sin ficha IA'
    },
    { 
      key: 'new' as const, 
      count: stats.byCriteria.new, 
      label: 'Vacío', 
      color: 'bg-orange-500', 
      progressColor: 'bg-orange-400',
      textColor: 'text-orange-600',
      bgColor: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      icon: CircleOff,
      description: 'Sin ficha IA ni descripción (vacío)'
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
        <div className="flex flex-col">
          <span className="font-display font-bold text-xl text-foreground drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)] leading-tight">{APP_NAME}</span>
          <span className="text-[9px] text-muted-foreground font-medium tracking-wide">v{APP_VERSION}</span>
        </div>
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
          
          {/* SECTION 0: Unified location counter block - Mine / Accessible / Visited */}
          {totalCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-0 px-3 py-1.5 rounded-lg bg-slate-800/80 dark:bg-slate-900/80 border border-slate-700/50">
                  {/* 1. My points (first) */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilters({ ...filters, ownershipFilter: filters.ownershipFilter === 'mine' ? 'all' : 'mine' });
                    }}
                    className={`flex items-center gap-1 transition-all cursor-pointer ${
                      filters.ownershipFilter === 'mine' ? 'text-emerald-400' : 'text-emerald-500 hover:text-emerald-400'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xl font-bold">{visitedStats.myPointsCount}</span>
                  </button>
                  
                  <span className="text-slate-500 mx-1.5 text-lg">/</span>
                  
                  {/* 2. Total accessible (mine + followed + shared) */}
                  <button 
                    onClick={() => setFilters({})}
                    className="flex items-center gap-1.5 text-primary hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <MapPin className="w-4 h-4" />
                    <span className="text-xl font-bold">{totalCount}</span>
                  </button>
                  
                  <span className="text-slate-500 mx-1.5 text-lg">/</span>
                  
                  {/* 3. Visited */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilters({ ...filters, visitedFilter: filters.visitedFilter === 'visited' ? 'all' : 'visited' });
                    }}
                    className={`flex items-center gap-1 transition-all cursor-pointer ${
                      filters.visitedFilter === 'visited' ? 'text-sky-400' : 'text-sky-500 hover:text-sky-400'
                    }`}
                  >
                    <MapPinCheck className="w-4 h-4" />
                    <span className="text-xl font-bold">{visitedStats.visitedCount}</span>
                  </button>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[240px] p-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      Mis puntos:
                    </span>
                    <span className="font-bold text-emerald-500">{visitedStats.myPointsCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="w-3 h-3 text-primary" />
                      Alcance total:
                    </span>
                    <span className="font-bold text-primary">{totalCount}</span>
                  </div>
                  {visitedStats.followedPointsCount > 0 && (
                    <div className="flex justify-between items-center text-[11px] pl-4 text-muted-foreground">
                      <span>↳ De seguidos/compartidos:</span>
                      <span className="font-medium">{visitedStats.followedPointsCount}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPinCheck className="w-3 h-3 text-sky-500" />
                      Visitados:
                    </span>
                    <span className="font-bold text-sky-500">{visitedStats.visitedCount}</span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border/50">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-muted-foreground">Explorado:</span>
                    <span className="font-medium text-sky-500">{visitedStats.percentage}%</span>
                  </div>
                  <div className="mt-1 w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded-full transition-all"
                      style={{ width: `${visitedStats.percentage}%` }}
                    />
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          
          {/* Separator */}
          
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
              const isFinal = stat.key === 'current';
              const needsAction = stat.key !== 'current'; // All non-final need options
              
              // For statuses that need action (not final/green), show dropdown with options
              if (needsAction && stat.count > 0) {
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
                    <DropdownMenuContent align="center" className="z-[1100] bg-background min-w-[220px]">
                      <DropdownMenuLabel className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${stat.color}`} />
                        {stat.count} puntos - {stat.label}
                      </DropdownMenuLabel>
                      <div className="px-2 pb-2 text-[10px] text-muted-foreground">
                        {stat.description}
                      </div>
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
                        {isFiltered ? 'Mostrar todos' : `Filtrar solo ${stat.label.toLowerCase()}`}
                      </DropdownMenuItem>
                      
                      {/* Actions based on status type */}
                      {stat.key === 'previous' && (
                        <DropdownMenuItem onClick={onToggleBatchEnrich}>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Actualizar con nuevos criterios
                        </DropdownMenuItem>
                      )}
                      
                      {stat.key === 'unknown' && (
                        <>
                          <DropdownMenuItem onClick={onToggleBatchEnrich}>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Enriquecer con IA
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={onToggleLocations}>
                            <List className="w-4 h-4 mr-2" />
                            Ver listado completo
                          </DropdownMenuItem>
                        </>
                      )}
                      
                      {stat.key === 'new' && (
                        <>
                          <DropdownMenuItem onClick={onToggleIncomplete}>
                            <CircleOff className="w-4 h-4 mr-2" />
                            Gestionar vacíos
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={onToggleBatchEnrich}>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Enriquecer con IA
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={onToggleDuplicates}>
                            <Copy className="w-4 h-4 mr-2" />
                            Revisar duplicados
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }
              
              // Final (green) status - just tooltip, no dropdown
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
                      {isFiltered 
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
            
            {/* Duplicates counter - show when there are any duplicates */}
            {totalDuplicatesCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={onToggleDuplicates}
                    className="relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium border transition-all bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-600 hover:scale-105"
                  >
                    <div className="flex items-center gap-1">
                      <Copy className="w-3 h-3" />
                      <span>{totalDuplicatesCount}</span>
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[220px] p-2">
                  <div className="font-medium">Duplicados detectados</div>
                  <div className="mt-1 text-muted-foreground">
                    {pendingDuplicates.length > 0 && (
                      <div>{pendingDuplicates.length} pendiente{pendingDuplicates.length !== 1 ? 's' : ''} de importación</div>
                    )}
                    {dbDuplicatesCount > 0 && (
                      <div>{dbDuplicatesCount} par{dbDuplicatesCount !== 1 ? 'es' : ''} en base de datos</div>
                    )}
                  </div>
                  <div className="mt-1.5 text-[10px] text-muted-foreground">
                    📋 Click para gestionar
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            
            
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
                onClick={handleToggleAutoTheme}
                className={autoTheme ? 'bg-accent' : ''}
              >
                <Clock className="w-4 h-4 mr-2" />
                Auto (hora solar)
                {autoTheme && <span className="ml-auto text-primary">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => { setAutoTheme(false); localStorage.setItem('vandits-auto-theme', 'false'); handleSetTheme('light'); }}
                className={!autoTheme && mapTheme === 'light' ? 'bg-accent' : ''}
              >
                <Sun className="w-4 h-4 mr-2" />
                Claro
                {!autoTheme && mapTheme === 'light' && <span className="ml-auto text-primary">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => { setAutoTheme(false); localStorage.setItem('vandits-auto-theme', 'false'); handleSetTheme('dark'); }}
                className={!autoTheme && mapTheme === 'dark' ? 'bg-accent' : ''}
              >
                <Moon className="w-4 h-4 mr-2" />
                Oscuro
                {!autoTheme && mapTheme === 'dark' && <span className="ml-auto text-primary">✓</span>}
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
            onOpenAdmin={onOpenAdmin}
            onOpenUsers={onOpenUsers}
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
