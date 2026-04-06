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
 Trash2,
 AlertTriangle,
 Route,
 Compass,
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
import { useLocationsStore, getLocationEnrichmentStatus } from '@/store/locations-store';
import { useFilteredLocations, useEnrichedStats } from '@/domains/content/hooks/use-filtered-locations';
import { supabase } from '@/integrations/supabase/client';
import { useSocialStats } from '@/hooks/use-social-stats';
import { useAuth } from '@/hooks/use-auth';
import { APP_VERSION, APP_NAME } from '@/lib/version';
import { toast } from 'sonner';
import { EnrichmentStatusFilter } from '@/types/location';

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
 onOpenProfile?: () => void;
 onOpenAdmin?: () => void;
 onOpenUsers?: () => void;
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
 const [mapViewMode, setMapViewMode] = useState<'markers' | 'heatmap'>('markers');
 const [mapTheme, setMapTheme] = useState<'light' | 'dark'>('light');
 const [autoTheme, setAutoTheme] = useState<boolean>(() => {
 return localStorage.getItem('vandits-auto-theme') === 'true';
 });
 const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
 const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
 open: boolean;
 status: EnrichmentStatusFilter | null;
 count: number;
 }>({ open: false, status: null, count: 0 });
 const [isDeleting, setIsDeleting] = useState(false);
 
  // Curator data for curator mode
 const [activeCurator, setActiveCurator] = useState<{
 id: string;
 name: string;
 icon: string;
 color: string;
 avatar_url: string | null;
 category: string | null;
 description: string | null;
 locationCount: number;
 enrichedCount: number;
 pendingCount: number;
 } | null>(null);
 
  // Fetch curator data when in curator mode
 useEffect(() => {
 const fetchCuratorData = async () => {
 if (!filters.filterByCuratorId) {
 setActiveCurator(null);
 return;
 }
 
 try {
 const { data: curator } = await supabase
 .from('curators')
 .select('*')
 .eq('id', filters.filterByCuratorId)
 .single();
 
 if (curator) {
          // Get location counts with enrichment status
 const { data: curatorDocs } = await supabase
 .from('curator_documents')
 .select('document_id')
 .eq('curator_id', curator.id);
 
 let locationCount = 0;
 let enrichedCount = 0;
 let errorCount = 0;
 
 if (curatorDocs && curatorDocs.length > 0) {
 const docIds = curatorDocs.map(cd => cd.document_id);
 
            // Get all locations for this curator
 const { data: locations } = await supabase
 .from('locations')
 .select('id, enriched_data')
 .in('document_id', docIds)
 .is('deleted_at', null);
 
 if (locations) {
 locationCount = locations.length;
 
              // Count enriched (has enriched_data with description)
 locations.forEach(loc => {
 const enriched = loc.enriched_data as any;
 if (enriched && (enriched.descripcion || enriched.description)) {
 enrichedCount++;
 }
 });
 
              // Pending = total - enriched (points without enrichment that need manual decision)
 const pendingCount = locationCount - enrichedCount;
 
 setActiveCurator({
 id: curator.id,
 name: curator.name,
 icon: curator.icon || '',
 color: curator.color || '#14b8a6',
 avatar_url: curator.avatar_url,
 category: curator.category,
 description: curator.description,
 locationCount,
 enrichedCount,
 pendingCount,
 });
 }
 }
 
 } else {
          // No locations found
 setActiveCurator({
 id: curator.id,
 name: curator.name,
 icon: curator.icon || '',
 color: curator.color || '#14b8a6',
 avatar_url: curator.avatar_url,
 category: curator.category,
 description: curator.description,
 locationCount: 0,
 enrichedCount: 0,
 pendingCount: 0,
 });
 }
 } catch (error) {
 console.error('Error fetching curator data:', error);
 }
 };
 
 fetchCuratorData();
 }, [filters.filterByCuratorId]);
 
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
  // getLocationOwnership already declared above
 
  // Fetch user profile for duplicate threshold
 const [userDuplicateThreshold, setUserDuplicateThreshold] = useState<number>(250);
 
 useEffect(() => {
 const fetchUserProfile = async () => {
 if (!user?.id) return;
 
 try {
 const { data: profile } = await supabase
 .from('profiles')
 .select('duplicate_threshold_meters')
 .eq('id', user.id)
 .single();
 
 if (profile?.duplicate_threshold_meters) {
 setUserDuplicateThreshold(profile.duplicate_threshold_meters);
 }
 } catch (error) {
 console.error('Error fetching user profile for threshold:', error);
 }
 };
 
 fetchUserProfile();
 }, [user?.id]);

  // Listen for threshold changes from DuplicatesList panel
 useEffect(() => {
 const handleThresholdChange = (e: Event) => {
 const customEvent = e as CustomEvent<{ threshold: number }>;
 if (customEvent.detail?.threshold) {
 setUserDuplicateThreshold(customEvent.detail.threshold);
 }
 };
 window.addEventListener('duplicate-threshold-changed', handleThresholdChange);
 return () => window.removeEventListener('duplicate-threshold-changed', handleThresholdChange);
 }, []);
 
 const dbDuplicatesCount = React.useMemo(() => {
 if (!user) return 0;
 
 const allLocations = getAllLocations();
 
    // Filter to only user's own locations
 const myLocations = allLocations.filter(loc => getLocationOwnership(loc.id, user.id).isOwn);
 
    // Count pairs within user's threshold, excluding resolved pairs
 let count = 0;
 for (let i = 0; i < myLocations.length; i++) {
 for (let j = i + 1; j < myLocations.length; j++) {
 const loc1 = myLocations[i];
 const loc2 = myLocations[j];
 
        // Check if this pair is resolved
 const pairId = [loc1.id, loc2.id].sort().join('-');
 if (resolvedDuplicatePairIds.includes(pairId)) continue;
 
 const R = 6371000;
 const dLat = (loc2.coordinates.lat - loc1.coordinates.lat) * Math.PI / 180;
 const dLng = (loc2.coordinates.lng - loc1.coordinates.lng) * Math.PI / 180;
 const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
 Math.cos(loc1.coordinates.lat * Math.PI / 180) * Math.cos(loc2.coordinates.lat * Math.PI / 180) *
 Math.sin(dLng/2) * Math.sin(dLng/2);
 const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
 if (distance <= userDuplicateThreshold) count++;
 }
 }
 return count;
 }, [getAllLocations, user, getLocationOwnership, resolvedDuplicatePairIds, userDuplicateThreshold]);
 
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
 <div className="p-2 ocean-gradient rounded-xl shadow-lg hover:scale-105 transition-transform">
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
 
 {/* Active curator filter indicator */}
 {filters.filterByCuratorId && filters.filterByCuratorName && (
 <div className="flex items-center gap-1.5 px-2 py-1 bg-teal-500/10 rounded-full border border-teal-500/30">
 <MapPin className="w-3.5 h-3.5 text-teal-500" />
 <span className="text-xs font-medium text-teal-600 max-w-[120px] truncate">
 Curador: {filters.filterByCuratorName}
 </span>
 <button
 onClick={() => {
 setFilters({});
 window.dispatchEvent(new CustomEvent('lovable:exit-curator-mode'));
 }}
 className="ml-0.5 p-0.5 hover:bg-teal-500/20 rounded-full transition-colors"
 title="Salir del modo curador"
 >
 <svg className="w-3 h-3 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
 <path d="M18 6L6 18M6 6l12 12" />
 </svg>
 </button>
 </div>
 )}
 
 {/* Active user filter indicator */}
 {!filters.filterByCuratorId && filters.filterByUserId && filters.filterByUserName && (
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

 {/* SECTION 0: Unified location counter block - Accessible / Mine / Visited - ONLY in normal mode */}
 {totalCount > 0 && !activeCurator && (
 <Tooltip>
 <TooltipTrigger asChild>
 <div className="flex items-center gap-0 px-2 py-1">
 {/* 1. Accessible (mine + followed) */}
 <button 
 onClick={() => setFilters({})}
 className="flex items-center gap-1 text-emerald-500 hover:text-emerald-400 transition-all cursor-pointer"
 >
 <div className="w-2 h-2 rounded-full bg-emerald-500" />
 <span className="text-xl font-bold">{visitedStats.myPointsCount + visitedStats.followedPointsCount}</span>
 </button>
 
 <span className="text-muted-foreground mx-1.5 text-lg">/</span>
 
 {/* 2. My points only */}
 <button 
 onClick={(e) => {
 e.stopPropagation();
 setFilters({ ...filters, ownershipFilter: filters.ownershipFilter === 'mine' ? 'all' : 'mine' });
 }}
 className={`flex items-center gap-1.5 transition-all cursor-pointer ${
 filters.ownershipFilter === 'mine' ? 'text-primary' : 'text-primary/80 hover:text-primary'
 }`}
 >
 <MapPin className="w-4 h-4" />
 <span className="text-xl font-bold">{visitedStats.myPointsCount}</span>
 </button>
 
 <span className="text-muted-foreground mx-1.5 text-lg">/</span>
 
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
 Alcance total:
 </span>
 <span className="font-bold text-emerald-500">{visitedStats.myPointsCount + visitedStats.followedPointsCount}</span>
 </div>
 {visitedStats.followedPointsCount > 0 && (
 <div className="flex justify-between items-center text-[11px] pl-4 text-muted-foreground">
 <span> De seguidos/compartidos:</span>
 <span className="font-medium">{visitedStats.followedPointsCount}</span>
 </div>
 )}
 <div className="flex justify-between items-center">
 <span className="flex items-center gap-1.5 text-muted-foreground">
 <MapPin className="w-3 h-3 text-primary" />
 Mis puntos:
 </span>
 <span className="font-bold text-primary">{visitedStats.myPointsCount}</span>
 </div>
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
 
 {/* SECTION 1: Information Base - Location Status Counts - ONLY in normal mode */}
 {totalCount > 0 && !activeCurator && (
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
 const counts = getCountsByStatus(stat.key);
 
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
 <div className="px-2 pb-2 text-[10px] text-muted-foreground space-y-1">
 <div>{stat.description}</div>
 {(counts.own > 0 || counts.followed > 0) && (
 <div className="flex items-center gap-2 pt-1 border-t border-border/50">
 <span className="font-medium text-foreground">{counts.own} propios</span>
 {counts.followed > 0 && (
 <span className="text-muted-foreground">/ {counts.followed} de seguidos</span>
 )}
 </div>
 )}
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
 
 {/* Delete option for all statuses */}
 {counts.own > 0 && (
 <>
 <DropdownMenuSeparator />
 <DropdownMenuItem 
 onClick={() => setDeleteConfirmDialog({ open: true, status: stat.key, count: counts.own })}
 className="text-destructive focus:text-destructive"
 >
 <Trash2 className="w-4 h-4 mr-2" />
 Eliminar todos ({counts.own} propios)
 </DropdownMenuItem>
 </>
 )}
 </DropdownMenuContent>
 </DropdownMenu>
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
 Click para gestionar
 </div>
 </TooltipContent>
 </Tooltip>
 )}
 
 {/* Validations counter - show when there are pending validations */}
 {pendingValidationsCount > 0 && onToggleValidations && (
 <Tooltip>
 <TooltipTrigger asChild>
 <button 
 onClick={onToggleValidations}
 className="relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium border transition-all bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-600 hover:scale-105 animate-pulse"
 >
 <div className="flex items-center gap-1">
 <RefreshCw className="w-3 h-3" />
 <span>{pendingValidationsCount}</span>
 </div>
 </button>
 </TooltipTrigger>
 <TooltipContent side="bottom" className="text-xs max-w-[280px] p-2">
 <div className="font-medium">Validaciones pendientes</div>
 <div className="mt-1 text-muted-foreground">
 {pendingValidationsCount} punto(s) requieren validación manual
 </div>
 {pendingValidationNames.length > 0 && (
 <div className="mt-2 space-y-0.5 max-h-[120px] overflow-y-auto">
 {pendingValidationNames.slice(0, 5).map((name, idx) => (
 <div key={idx} className="text-[10px] truncate text-muted-foreground flex items-center gap-1">
 <span className="text-amber-500">•</span>
 <span className="truncate">{name}</span>
 </div>
 ))}
 {pendingValidationNames.length > 5 && (
 <div className="text-[10px] text-muted-foreground italic">
 ... y {pendingValidationNames.length - 5} más
 </div>
 )}
 </div>
 )}
 <div className="mt-1.5 text-[10px] text-muted-foreground">
 Click para revisar
 </div>
 </TooltipContent>
 </Tooltip>
 )}
 
 </div>
 )}

 {/* Separator before map controls */}
 {totalCount > 0 && !activeCurator && <div className="w-px h-6 bg-border/50" />}

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
 {autoTheme && <span className="ml-auto text-primary"></span>}
 </DropdownMenuItem>
 <DropdownMenuSeparator />
 <DropdownMenuItem 
 onClick={() => { setAutoTheme(false); localStorage.setItem('vandits-auto-theme', 'false'); handleSetTheme('light'); }}
 className={!autoTheme && mapTheme === 'light' ? 'bg-accent' : ''}
 >
 <Sun className="w-4 h-4 mr-2" />
 Claro
 {!autoTheme && mapTheme === 'light' && <span className="ml-auto text-primary"></span>}
 </DropdownMenuItem>
 <DropdownMenuItem 
 onClick={() => { setAutoTheme(false); localStorage.setItem('vandits-auto-theme', 'false'); handleSetTheme('dark'); }}
 className={!autoTheme && mapTheme === 'dark' ? 'bg-accent' : ''}
 >
 <Moon className="w-4 h-4 mr-2" />
 Oscuro
 {!autoTheme && mapTheme === 'dark' && <span className="ml-auto text-primary"></span>}
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
 {mapViewMode === 'markers' && <span className="ml-auto text-primary"></span>}
 </DropdownMenuItem>
 <DropdownMenuItem 
 onClick={() => handleMapViewModeChange('heatmap')}
 className={mapViewMode === 'heatmap' ? 'bg-accent' : ''}
 >
 <Flame className="w-4 h-4 mr-2" />
 Mapa de calor
 {mapViewMode === 'heatmap' && <span className="ml-auto text-primary"></span>}
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
 {(!filters.ownershipFilter || filters.ownershipFilter === 'all') && <span className="ml-auto text-primary"></span>}
 </DropdownMenuItem>
 <DropdownMenuItem 
 onClick={() => setFilters({ ...filters, ownershipFilter: 'mine' })}
 className={filters.ownershipFilter === 'mine' ? 'bg-accent' : ''}
 >
 <User className="w-4 h-4 mr-2" />
 Mis puntos
 {filters.ownershipFilter === 'mine' && <span className="ml-auto text-primary"></span>}
 </DropdownMenuItem>
 <DropdownMenuItem 
 onClick={() => setFilters({ ...filters, ownershipFilter: 'followed' })}
 className={filters.ownershipFilter === 'followed' ? 'bg-accent' : ''}
 >
 <UserCheck className="w-4 h-4 mr-2" />
 De seguidos
 {filters.ownershipFilter === 'followed' && <span className="ml-auto text-primary"></span>}
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 )}
 
 {/* Separator before social stats */}
 <div className="w-px h-6 bg-border/50" />
 
 {/* SECTION: Social Stats - Show curator data when in curator mode */}
 {activeCurator ? (
          // Curator mode stats
 <div className="flex items-center gap-3 px-3">
 <div className="flex items-center gap-2 px-2 py-1">
 {activeCurator.avatar_url ? (
 <img 
 src={activeCurator.avatar_url} 
 alt={activeCurator.name}
 className="w-7 h-7 rounded-full object-cover ring-2"
 style={{ borderColor: activeCurator.color }}
 />
 ) : (
 <div 
 className="w-7 h-7 rounded-full flex items-center justify-center ring-2"
 style={{ backgroundColor: `${activeCurator.color}30`, borderColor: activeCurator.color }}
 >
 <span className="text-sm">{activeCurator.icon}</span>
 </div>
 )}
 <div className="flex flex-col">
 <span 
 className="text-sm font-semibold leading-tight"
 style={{ color: activeCurator.color }}
 >
 {activeCurator.name}
 </span>
 {activeCurator.category && (
 <span className="text-[10px] text-muted-foreground leading-tight">
 {activeCurator.category}
 </span>
 )}
 </div>
 </div>
 <div 
 className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
 style={{ backgroundColor: `${activeCurator.color}10` }}
 >
 {/* Total points */}
 <Tooltip>
 <TooltipTrigger asChild>
 <div className="flex items-center gap-1 cursor-default">
 <MapPin className="w-4 h-4" style={{ color: activeCurator.color }} />
 <span 
 className="text-lg font-bold"
 style={{ color: activeCurator.color }}
 >
 {activeCurator.locationCount}
 </span>
 </div>
 </TooltipTrigger>
 <TooltipContent side="bottom" className="text-xs">
 Total de puntos del curador
 </TooltipContent>
 </Tooltip>
 
 <span className="text-muted-foreground/50">/</span>
 
 {/* Enriched points */}
 <Tooltip>
 <TooltipTrigger asChild>
 <div className="flex items-center gap-1 cursor-default">
 <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
 <span className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
 {activeCurator.enrichedCount}
 </span>
 </div>
 </TooltipTrigger>
 <TooltipContent side="bottom" className="text-xs">
 Puntos enriquecidos correctamente
 </TooltipContent>
 </Tooltip>
 
 <span className="text-muted-foreground/50">/</span>
 
 {/* Pending points (not enriched) */}
 <Tooltip>
 <TooltipTrigger asChild>
 <div className="flex items-center gap-1 cursor-default">
 <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
 <span className="text-base font-semibold text-amber-600 dark:text-amber-400">
 {activeCurator.pendingCount}
 </span>
 </div>
 </TooltipTrigger>
 <TooltipContent side="bottom" className="text-xs">
 Puntos pendientes de enriquecer
 </TooltipContent>
 </Tooltip>
 </div>
 </div>
 ) : user && (
          // Normal user mode stats
 <div className="flex items-center gap-4 px-3">
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
 onToggleBatchEnrich={onToggleBatchEnrich}
 onToggleDuplicates={onToggleDuplicates}
 onOpenTrash={onOpenTrash}
 onUploadClick={onUploadClick}
 onToggleExport={onToggleExport}
 onToggleCriteriaConfig={onToggleCriteriaConfig}
 onOpenRouteSettings={onOpenRouteSettings}
 curatorMode={!!activeCurator}
 curatorId={activeCurator?.id}
 curatorColor={activeCurator?.color}
 curatorIcon={activeCurator?.icon}
 curatorAvatar={activeCurator?.avatar_url}
 curatorName={activeCurator?.name}
 curatorCategory={activeCurator?.category}
 onExitCuratorMode={() => {
 setFilters({});
 window.dispatchEvent(new CustomEvent('lovable:exit-curator-mode'));
 }}
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
