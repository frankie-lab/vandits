// FloatingToolbar — unified duplicates counter
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
 Trash2,
 AlertTriangle,
 Route,
  Compass,
  Camera,
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
import { useLocationsStore, getLocationEnrichmentStatus } from '@/domains/content';
import { useFilteredLocations, useEnrichedStats } from '@/domains/content/hooks/use-filtered-locations';
import { supabase } from '@/integrations/supabase/client';
import { useSocialStats } from '@/domains/social';
import { useAuth } from '@/domains/identity';
import { useDuplicateCount } from '@/hooks/use-duplicate-count';

import { useMapTheme } from '@/hooks/use-map-theme';
import { useLayerVisibility } from '@/hooks/use-layer-visibility';
import { APP_VERSION, APP_NAME } from '@/lib/version';
import { toast } from 'sonner';
import { EnrichmentStatusFilter } from '@/types/location';
// Photo layer toggle moved to LayersPanel

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
 onToggleValidations?: () => void;
 onToggleRoutes?: () => void;
 
 onUploadClick: () => void;
 onOpenProfile?: (tab?: string) => void;
 onOpenAdmin?: (tab?: string) => void;
 onOpenUsers?: () => void;
    
    onOpenPreferences?: () => void;
    onOpenLayers?: () => void;
    onOpenDocuments?: () => void;
   onOpenOneDrivePhotos?: () => void;
   onOpenCategories?: () => void;
 onOpenRouteSettings?: () => void;
 onOpenTrash?: () => void;
 filtersOpen: boolean;
 locationsOpen: boolean;
 activeFilterCount: number;
 pendingValidationsCount?: number;
 pendingValidationNames?: string[];
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
 onToggleValidations,
 onToggleRoutes,
 
 onUploadClick,
 onOpenProfile,
 onOpenAdmin,
 onOpenUsers,
    
    onOpenPreferences,
    onOpenLayers,
    onOpenDocuments,
   onOpenOneDrivePhotos,
   onOpenCategories,
 onOpenRouteSettings,
 onOpenTrash,
 filtersOpen,
 locationsOpen,
 activeFilterCount,
 pendingValidationsCount = 0,
 pendingValidationNames = [],
}: FloatingToolbarProps) {
  // Use direct state access to trigger re-renders on realtime updates
 const documents = useLocationsStore(state => state.documents);
 const selectedDocument = useLocationsStore(state => state.selectedDocument);
 const filters = useLocationsStore(state => state.filters);
 const setFilters = useLocationsStore(state => state.setFilters);
 const setCurrentUserId = useLocationsStore(state => state.setCurrentUserId);
  const getAllLocations = useLocationsStore(state => state.getAllLocations);
  const getLocationsByCriteria = useLocationsStore(state => state.getLocationsByCriteria);
  const getLocationOwnership = useLocationsStore(state => state.getLocationOwnership);
  const filteredLocations = useFilteredLocations();
  const stats = useEnrichedStats();

 const [activeJob, setActiveJob] = useState<EnrichmentJob | null>(null);
 const [, forceUpdate] = useState(0);
 
 const { mapTheme, setMapTheme, autoTheme, setAutoTheme } = useMapTheme();
 const { ownershipFilter, toggleMine } = useLayerVisibility();
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
 const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
 open: boolean;
 status: EnrichmentStatusFilter | null;
 count: number;
 }>({ open: false, status: null, count: 0 });
 const [isDeleting, setIsDeleting] = useState(false);
 
 
  // Social stats
 const { stats: socialStats } = useSocialStats();
 const { user } = useAuth();


 const handleGoHome = () => {
 window.dispatchEvent(new CustomEvent('map-go-home'));
 };

 const handleSetTheme = (theme: 'light' | 'dark') => {
 setMapTheme(theme);
 };

 // Theme syncing is now handled by useMapTheme hook

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

  // Locale-aware number formatter
  // <1k: as-is. 1k-999k: thousands separator from locale. >=1M: compact 1 decimal.
  const formatCount = React.useCallback((n: number): string => {
    if (n == null || isNaN(n)) return '0';
    const locale = typeof navigator !== 'undefined' ? navigator.language : 'es-ES';
    if (n >= 1_000_000) {
      return new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      }).format(n);
    }
    if (n >= 1000) {
      return new Intl.NumberFormat(locale).format(n);
    }
    return String(n);
  }, []);

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
  const locationCount = filteredLocations.length;
  const totalCount = allLocations.length;

  const { duplicateCount: totalDuplicatesCount } = useDuplicateCount();

  // Catálogo stats — norma transversal:
  //   VERDE = mis puntos publicados en catálogo (status='published' de docs propios)
  //   AZUL  = catálogo total accesible (míos publicados + de seguidores publicados)
  // Los puntos de documentos en draft/in_review NO cuentan: están en mesa de trabajo.
 const catalogStats = React.useMemo(() => {
 let myCatalogCount = 0;
 let followedCatalogCount = 0;

 documents.forEach(doc => {
 if (doc.status !== 'published') return;
 if (doc.userId === user?.id) {
 myCatalogCount += doc.locations.length;
 } else {
 followedCatalogCount += doc.locations.length;
 }
 });

 return {
 myCatalogCount,
 followedCatalogCount,
 totalCatalogCount: myCatalogCount + followedCatalogCount,
 };
 }, [documents, user?.id]);

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

  // Function to delete all locations by enrichment status
 const handleDeleteByStatus = async (status: EnrichmentStatusFilter) => {
 if (!user) return;

 setIsDeleting(true);
 try {
      // Get all locations with this status that belong to the current user
 const allLocations = getAllLocations();
 const locationsToDelete = allLocations.filter((loc) => {
 const locStatus = getLocationEnrichmentStatus(loc);
 if (locStatus !== status) return false;

        // Only delete user's own locations
 const ownership = getLocationOwnership(loc.id, user.id);
 return ownership.isOwn;
 });

 if (locationsToDelete.length === 0) {
 toast.info('No hay puntos propios para eliminar en este estado');
 return;
 }

      // Soft delete in database (chunked to avoid URL length / bad request errors)
 const locationIds = locationsToDelete.map((loc) => loc.id);
 const nowIso = new Date().toISOString();
 const CHUNK_SIZE = 100;

 for (let i = 0; i < locationIds.length; i += CHUNK_SIZE) {
 const chunk = locationIds.slice(i, i + CHUNK_SIZE);
 const { error } = await supabase
 .from('locations')
 .update({ deleted_at: nowIso, updated_at: nowIso })
 .in('id', chunk);

 if (error) throw error;
 }

      // Remove from local store immediately so they disappear without needing a manual refresh
 const idsSet = new Set(locationIds);
 const {
 documents: currentDocs,
 updateDocumentLocations,
 clearSelection,
 } = useLocationsStore.getState();

 currentDocs.forEach((doc) => {
 const nextLocs = doc.locations.filter((l) => !idsSet.has(l.id));
 if (nextLocs.length !== doc.locations.length) {
 updateDocumentLocations(doc.id, nextLocs);
 }
 });
 clearSelection();

 toast.success(`${locationsToDelete.length.toLocaleString()} ubicaciones movidas a la papelera`);

      // Let other UI pieces refresh counts, etc.
 window.dispatchEvent(new CustomEvent('trash-updated'));
 window.dispatchEvent(new CustomEvent('store-updated'));
 } catch (error: any) {
 console.error('Error deleting locations:', error);
 toast.error('Error al eliminar ubicaciones');
 } finally {
 setIsDeleting(false);
 setDeleteConfirmDialog({ open: false, status: null, count: 0 });
 }
 };

  // Calculate count of own and followed locations for a status
 const getCountsByStatus = (status: EnrichmentStatusFilter): { own: number; followed: number } => {
 if (!user) return { own: 0, followed: 0 };
 const allLocations = getAllLocations();
 let own = 0;
 let followed = 0;
 allLocations.forEach(loc => {
 const locStatus = getLocationEnrichmentStatus(loc);
 if (locStatus !== status) return;
 const ownership = getLocationOwnership(loc.id, user.id);
 if (ownership.isOwn) {
 own++;
 } else {
 followed++;
 }
 });
 return { own, followed };
 };

 return (
 <>
 {/* Logo - Clean floating over map */}
 <motion.div
 initial={{ opacity: 0, x: -20 }}
 animate={{ opacity: 1, x: 0 }}
 className="fixed top-4 left-14 z-[1000] flex items-center gap-2.5 h-10 cursor-pointer"
 onClick={() => window.dispatchEvent(new CustomEvent('map-reset-view'))}
 title="Volver al mapa general"
 >
        <div className="p-2 brand-gradient rounded-xl shadow-lg hover:scale-105 transition-transform">
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
 className="fixed top-4 right-4 z-[1000] h-10 flex items-center w-full max-w-sm"
 >
 <div className="flex items-center gap-1 bg-background/95 backdrop-blur-md shadow-lg border border-border/50 rounded-full px-3 py-1.5 w-full h-10">
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
 
 {/* Active user filter indicator */}
 {filters.filterByUserId && filters.filterByUserName && (
 <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-full border border-primary/30">
 <Users className="w-3.5 h-3.5 text-primary" />
 <span className="text-xs font-medium text-primary max-w-[100px] truncate">
 {filters.filterByUserName}
 </span>
 <button
 onClick={() => setFilters({ ...filters, filterByUserId: undefined, filterByUserName: undefined })}
 className="ml-0.5 p-0.5 hover:bg-primary/20 rounded-full transition-colors"
 title="Quitar filtro"
 >
 <svg className="w-3 h-3 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
 <path d="M18 6L6 18M6 6l12 12" />
 </svg>
 </button>
 </div>
 )}

  {/* SECTION 0: Catálogo counter — VERDE (mis puntos en catálogo) / AZUL (catálogo total: míos + seguidores) */}
 {totalCount > 0 && (
 <Tooltip>
 <TooltipTrigger asChild>
                <div className="flex items-center gap-0 px-2 py-1">
                  {/* 1. VERDE: Mis puntos publicados en Catálogo */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMine();
                    }}
                    className={`flex items-center gap-1.5 transition-all cursor-pointer ${
                      ownershipFilter === 'mine' ? 'text-emerald-400' : 'text-emerald-500 hover:text-emerald-400'
                    }`}
                    title="Mis puntos en Catálogo"
                  >
                    <span className="text-base font-semibold tabular-nums leading-none">{formatCount(catalogStats.myCatalogCount)}</span>
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  </button>

                  <span className="text-base text-muted-foreground mx-1.5 leading-none">/</span>

                  {/* 2. AZUL: Catálogo total accesible (míos + seguidores) */}
                  <button
                    onClick={() => setFilters({})}
                    className="flex items-center gap-1.5 text-sky-500 hover:text-sky-400 transition-all cursor-pointer"
                    title="Catálogo total: mis puntos + seguidores"
                  >
                    <span className="text-base font-semibold tabular-nums leading-none">{formatCount(catalogStats.totalCatalogCount)}</span>
                    <div className="w-2 h-2 rounded-full bg-sky-500" />
                  </button>
                </div>
 </TooltipTrigger>
 <TooltipContent side="bottom" className="text-xs max-w-[260px] p-3">
 <div className="space-y-2">
 <div className="flex justify-between items-center gap-3">
 <span className="flex items-center gap-1.5 text-muted-foreground">
 <div className="w-2 h-2 rounded-full bg-emerald-500" />
 Mis puntos en Catálogo:
 </span>
                    <span className="font-bold text-emerald-500 tabular-nums">{formatCount(catalogStats.myCatalogCount)}</span>
                  </div>
                  <div className="flex justify-between items-center gap-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <div className="w-2 h-2 rounded-full bg-sky-500" />
                      Catálogo total accesible:
                    </span>
                    <span className="font-bold text-sky-500 tabular-nums">{formatCount(catalogStats.totalCatalogCount)}</span>
                  </div>
                  {catalogStats.followedCatalogCount > 0 && (
                    <div className="flex justify-between items-center text-[11px] pl-4 text-muted-foreground">
                      <span>· De seguidores:</span>
                      <span className="font-medium tabular-nums">{formatCount(catalogStats.followedCatalogCount)}</span>
                    </div>
                  )}
 <div className="pt-2 mt-1 border-t border-border/50 text-[11px] text-muted-foreground">
 Solo cuentan documentos en estado <strong>Publicado</strong>. Los puntos de la mesa de trabajo no aparecen aquí.
 </div>
 </div>
 </TooltipContent>
 </Tooltip>
 )}
 
  {/* SECTION 1 (puntos / duplicados / validaciones) eliminada */}

 {/* Map theme moved to Preferences → Mapa */}
 {/* Ownership filter and Photo layer toggle moved to LayersPanel */}

  {/* Separator before social stats */}
  <div className="w-px h-6 bg-border/50" />
 
      {/* SECTION: Social Stats */}
      {user && (
        <div className="flex items-center gap-1 px-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 px-1.5 py-1 text-foreground">
                <span className="text-base font-semibold tabular-nums leading-none">{formatCount(socialStats.followingCount)}</span>
                <UserCheck className="w-4 h-4 text-muted-foreground" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Sigues a {formatCount(socialStats.followingCount)} usuarios
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative flex items-center gap-1.5 px-1.5 py-1 text-foreground">
                <span className="text-base font-semibold tabular-nums leading-none">{formatCount(socialStats.followersCount)}</span>
                <Users className="w-4 h-4 text-muted-foreground" />
                {socialStats.pendingFollowersCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="h-4 min-w-4 px-1 text-[10px] flex items-center justify-center rounded-full ml-0.5"
                  >
                    {formatCount(socialStats.pendingFollowersCount)}
                  </Badge>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div>{formatCount(socialStats.followersCount)} seguidores</div>
              {socialStats.pendingFollowersCount > 0 && (
                <div className="text-amber-500">{formatCount(socialStats.pendingFollowersCount)} solicitudes pendientes</div>
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
 
 {/* Separator before panel options */}
 <div className="w-px h-6 bg-border/50" />
 
      {/* SECTION 4: Panel Options */}
      <div className="flex items-center gap-0.5 px-1">
        {/* Lista de ubicaciones eliminada — su función la cubre el buscador */}

        {onToggleRoutes && (
 <Tooltip>
 <TooltipTrigger asChild>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={onToggleRoutes}
 >
 <Route className="w-4 h-4" />
 </Button>
 </TooltipTrigger>
 <TooltipContent>Itinerarios</TooltipContent>
 </Tooltip>
 )}

 </div>
 
 {/* Separator before user menu */}
 <div className="w-px h-8 bg-border/50 mx-1" />
 
 {/* User Menu - contains all settings */}
 <div className="flex items-center pl-1">
 <UserMenu 
 onOpenProfile={onOpenProfile}
 onOpenAdmin={onOpenAdmin}
 onOpenUsers={onOpenUsers}
   
   onOpenPreferences={onOpenPreferences}
   onOpenLayers={onOpenLayers}
 onToggleBatchEnrich={onToggleBatchEnrich}
 onToggleDuplicates={onToggleDuplicates}
 onOpenTrash={onOpenTrash}
 onUploadClick={onUploadClick}
 onToggleExport={onToggleExport}
 onToggleCriteriaConfig={onToggleCriteriaConfig}
  onOpenRouteSettings={onOpenRouteSettings}
    onOpenDocuments={onOpenDocuments}
    onOpenOneDrivePhotos={onOpenOneDrivePhotos}
    onOpenCategories={onOpenCategories}
 />
 </div>
 </div>
 </motion.div>

 {/* Delete confirmation dialog */}
 <AlertDialog open={deleteConfirmDialog.open} onOpenChange={(open) => !open && setDeleteConfirmDialog({ open: false, status: null, count: 0 })}>
 <AlertDialogContent className="z-[1200]">
 <AlertDialogHeader>
 <AlertDialogTitle className="flex items-center gap-2">
 <Trash2 className="w-5 h-5 text-destructive" />
 Eliminar ubicaciones
 </AlertDialogTitle>
 <AlertDialogDescription>
 ¿Estás seguro de que deseas eliminar <strong>{deleteConfirmDialog.count}</strong> ubicaciones propias con estado "{
 deleteConfirmDialog.status === 'current' ? 'Final' :
 deleteConfirmDialog.status === 'previous' ? 'Pendiente' :
 deleteConfirmDialog.status === 'unknown' ? 'Importado' : 'Vacío'
 }"?
 <br /><br />
 Las ubicaciones se moverán a la papelera y podrás recuperarlas en los próximos 30 días.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
 <AlertDialogAction 
 onClick={() => deleteConfirmDialog.status && handleDeleteByStatus(deleteConfirmDialog.status)}
 disabled={isDeleting}
 className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
 >
 {isDeleting ? (
 <>
 <Loader2 className="w-4 h-4 mr-2 animate-spin" />
 Eliminando...
 </>
 ) : (
 'Eliminar'
 )}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </>
 );
}
