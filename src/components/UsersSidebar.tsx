import React, { useState, useEffect } from 'react';
import { 
 Users, X, Search, MapPin, Shield, Crown, Edit3, Eye, EyeOff, UserCheck, 
 ChevronRight, UserPlus, UserMinus, Loader2, Clock, Filter, Heart, Link2, 
 ChevronDown, Plus, Target, Compass, Star, Flag, Mountain, TreePine, Waves, Sun, 
 Leaf, Flower2, Shell, Bird, Building, Landmark, Church, Castle, Home, Anchor, 
 Camera, Palette, Music, BookOpen, Gem, UtensilsCrossed, Wine, Coffee, Fish, 
 Car, Fuel, Plane, Ship, Train, Footprints, Tent, Sparkles, Play, type LucideIcon
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import { useLocationsStore } from '@/store/locations-store';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';

// Map of curator icon names to Lucide components
const CURATOR_ICON_MAP: Record<string, LucideIcon> = {
 'map-pin': MapPin,
 'target': Target,
 'compass': Compass,
 'star': Star,
 'flag': Flag,
 'heart': Heart,
 'mountain': Mountain,
 'trees': TreePine,
 'waves': Waves,
 'sun': Sun,
 'leaf': Leaf,
 'flower': Flower2,
 'shell': Shell,
 'bird': Bird,
 'building': Building,
 'landmark': Landmark,
 'church': Church,
 'castle': Castle,
 'home': Home,
 'anchor': Anchor,
 'camera': Camera,
 'palette': Palette,
 'music': Music,
 'book': BookOpen,
 'gem': Gem,
 'crown': Crown,
 'utensils': UtensilsCrossed,
 'wine': Wine,
 'coffee': Coffee,
 'fish': Fish,
 'car': Car,
 'fuel': Fuel,
 'plane': Plane,
 'ship': Ship,
 'train': Train,
 'footprints': Footprints,
 'tent': Tent,
 'sparkles': Sparkles,
};

// Helper to render curator icon
const renderCuratorIcon = (iconName: string, color: string, size: string = 'w-4 h-4') => {
 const IconComponent = CURATOR_ICON_MAP[iconName] || MapPin;
 return <IconComponent className={size} style={{ color }} />;
};

interface UserWithStats {
 id: string;
 username: string;
 display_name: string | null;
 avatar_url: string | null;
 roles: string[];
 locationCount: number;
 followersCount: number;
 followingCount: number;
 commonPointsCount: number; // New: points in common with current user
 is_private: boolean;
 followStatus: 'none' | 'pending' | 'accepted' | 'rejected';
 followId?: string;
}

interface VirtualCurator {
 id: string;
 name: string;
 description: string | null;
 category: string | null;
 color: string;
 icon: string;
 avatar_url: string | null;
 is_active: boolean;
 locationCount: number;
}

interface Druid {
 id: string;
 name: string;
 description: string | null;
 category: string | null;
 color: string;
 icon: string;
 is_active: boolean;
 locationCount: number;
}

// Haversine formula to calculate distance between two points in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
 const R = 6371000; // Earth radius in meters
 const dLat = (lat2 - lat1) * Math.PI / 180;
 const dLon = (lon2 - lon1) * Math.PI / 180;
 const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
 Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
 Math.sin(dLon / 2) * Math.sin(dLon / 2);
 const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
 return R * c;
}

const COMMON_POINT_THRESHOLD_METERS = 500; // Points within 500m are considered "common"

interface UsersSidebarProps {
 isOpen: boolean;
 onClose: () => void;
 onOpen?: () => void;
}

const roleIcons: Record<string, React.ReactNode> = {
 master: <Crown className="w-3 h-3 text-amber-500" />,
 admin: <Shield className="w-3 h-3 text-blue-500" />,
 editor: <Edit3 className="w-3 h-3 text-green-500" />,
 moderator: <UserCheck className="w-3 h-3 text-purple-500" />,
 supervisor: <Eye className="w-3 h-3 text-orange-500" />,
 curator: <MapPin className="w-3 h-3 text-teal-500" />,
};

const roleColors: Record<string, string> = {
 master: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
 admin: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
 editor: 'bg-green-500/20 text-green-400 border-green-500/30',
 moderator: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
 supervisor: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
 user: 'bg-muted text-muted-foreground border-border',
 curator: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
};

export function UsersSidebar({ isOpen, onClose, onOpen }: UsersSidebarProps) {
 const { user: currentUser } = useAuth();
 const { isMaster, isAdmin } = usePermissions();
 const { filters, setFilters } = useLocationsStore();
 const [users, setUsers] = useState<UserWithStats[]>([]);
 const [curators, setCurators] = useState<VirtualCurator[]>([]);
 const [druids, setDruids] = useState<Druid[]>([]);
 const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [processingFollow, setProcessingFollow] = useState<string | null>(null);
  const [curatorsExpanded, setCuratorsExpanded] = useState(true);
  const [druidsExpanded, setDruidsExpanded] = useState(true);
   const [showNewCuratorForm, setShowNewCuratorForm] = useState(false);
   const [newCuratorName, setNewCuratorName] = useState('');
   const [creatingCurator, setCreatingCurator] = useState(false);
   const [showNewDruidForm, setShowNewDruidForm] = useState(false);
   const [newDruidName, setNewDruidName] = useState('');
   const [creatingDruid, setCreatingDruid] = useState(false);
   const [runningDruidSearch, setRunningDruidSearch] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'druids' | 'curators'>('users');

  // Load hidden followed user ids from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('vandits_hidden_followed_users');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const currentFilters = useLocationsStore.getState().filters;
          setFilters({ ...currentFilters, hiddenFollowedUserIds: parsed });
        }
      } catch {}
    }
  }, []);
 
  // Active curator mode - when a curator is selected, it acts like switching users
 const activeCurator = React.useMemo(() => {
 if (!filters.filterByCuratorId) return null;
 return curators.find(c => c.id === filters.filterByCuratorId) || null;
 }, [filters.filterByCuratorId, curators]);

  // Active druid mode - when a druid is selected
 const activeDruid = React.useMemo(() => {
 if (!filters.filterByDruidId) return null;
 return druids.find(d => d.id === filters.filterByDruidId) || null;
 }, [filters.filterByDruidId, druids]);

 useEffect(() => {
 if (isOpen) {
 fetchUsers();
 if (isMaster()) {
 fetchCurators();
 fetchDruids();
 }
 }
 }, [isOpen, currentUser?.id, isMaster]);

 const fetchUsers = async () => {
 try {
 setLoading(true);
 console.log('[UsersSidebar] Fetching users, currentUser:', currentUser?.id);

      // Fetch profiles
 const { data: profiles, error: profilesError } = await supabase
 .from('profiles')
 .select('id, username, display_name, avatar_url, is_private')
 .order('created_at', { ascending: false });

 console.log('[UsersSidebar] Profiles fetched:', profiles?.length, 'Error:', profilesError);
 
 if (profilesError) throw profilesError;

      // Fetch user roles
 const { data: rolesData, error: rolesError } = await supabase
 .from('user_roles')
 .select('user_id, role');

 if (rolesError) throw rolesError;

      // Fetch current user's follows
 let followsMap: Record<string, { status: string; id: string }> = {};
 if (currentUser?.id) {
 const { data: followsData } = await supabase
 .from('follows')
 .select('id, following_id, status')
 .eq('follower_id', currentUser.id);

 followsData?.forEach(f => {
 followsMap[f.following_id] = { status: f.status, id: f.id };
 });
 }

      // Fetch public stats using the database function (bypasses RLS for accurate counts)
 const { data: publicStats } = await supabase.rpc('get_public_profile_stats');

 const statsMap: Record<string, { locations: number; followers: number; following: number }> = {};
 publicStats?.forEach((stat: { user_id: string; public_locations_count: number; followers_count: number; following_count: number }) => {
 statsMap[stat.user_id] = {
 locations: stat.public_locations_count,
 followers: stat.followers_count,
 following: stat.following_count,
 };
 });

      // Build roles map
 const rolesMap: Record<string, string[]> = {};
 rolesData?.forEach(r => {
 if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
 rolesMap[r.user_id].push(r.role);
 });

      // Fetch locations to calculate common points
 let commonPointsMap: Record<string, number> = {};
 if (currentUser?.id) {
        // Get all visible locations with their document owner
 const { data: allLocations } = await supabase
 .from('locations')
 .select('id, latitude, longitude, document_id, visibility')
 .neq('visibility', 'private');

        // Get documents to map locations to users
 const { data: allDocs } = await supabase
 .from('documents')
 .select('id, user_id');

 if (allLocations && allDocs) {
 const docToUser: Record<string, string> = {};
 allDocs.forEach(d => {
 if (d.user_id) docToUser[d.id] = d.user_id;
 });

          // Group locations by user
 const locationsByUser: Record<string, Array<{ lat: number; lon: number }>> = {};
 allLocations.forEach(loc => {
 if (loc.document_id) {
 const userId = docToUser[loc.document_id];
 if (userId) {
 if (!locationsByUser[userId]) locationsByUser[userId] = [];
 locationsByUser[userId].push({ lat: loc.latitude, lon: loc.longitude });
 }
 }
 });

 const myLocations = locationsByUser[currentUser.id] || [];
 
          // Calculate common points for each user
 Object.entries(locationsByUser).forEach(([userId, userLocs]) => {
 if (userId === currentUser.id) return;
 
 let commonCount = 0;
 const matchedMyPoints = new Set<number>();
 
 userLocs.forEach(userLoc => {
 myLocations.forEach((myLoc, myIdx) => {
 if (matchedMyPoints.has(myIdx)) return;
 const dist = getDistanceMeters(myLoc.lat, myLoc.lon, userLoc.lat, userLoc.lon);
 if (dist <= COMMON_POINT_THRESHOLD_METERS) {
 commonCount++;
 matchedMyPoints.add(myIdx);
 }
 });
 });
 
 commonPointsMap[userId] = commonCount;
 });
 }
 }

      // Combine data
 const usersWithStats: UserWithStats[] = (profiles || []).map(profile => ({
 id: profile.id,
 username: profile.username,
 display_name: profile.display_name,
 avatar_url: profile.avatar_url,
 is_private: profile.is_private,
 roles: rolesMap[profile.id] || ['user'],
 locationCount: statsMap[profile.id]?.locations || 0,
 followersCount: statsMap[profile.id]?.followers || 0,
 followingCount: statsMap[profile.id]?.following || 0,
 commonPointsCount: commonPointsMap[profile.id] || 0,
 followStatus: (followsMap[profile.id]?.status as 'pending' | 'accepted' | 'rejected') || 'none',
 followId: followsMap[profile.id]?.id,
 }));

      // Sort by location count descending
 usersWithStats.sort((a, b) => b.locationCount - a.locationCount);

 setUsers(usersWithStats);
 } catch (error) {
 console.error('Error fetching users:', error);
 } finally {
 setLoading(false);
 }
 };

 const fetchCurators = async () => {
 try {
 const { data: curatorsData, error } = await supabase
 .from('curators')
 .select('*')
 .eq('is_active', true)
 .order('name');

 if (error) throw error;

      // Get location counts for each curator
 const curatorIds = (curatorsData || []).map(c => c.id);
 let locationCounts: Record<string, number> = {};

 if (curatorIds.length > 0) {
 const { data: curatorDocs } = await supabase
 .from('curator_documents')
 .select('curator_id, document_id')
 .in('curator_id', curatorIds);

 if (curatorDocs && curatorDocs.length > 0) {
 const docIds = curatorDocs.map(cd => cd.document_id);
 const docToCurator: Record<string, string> = {};
 curatorDocs.forEach(cd => {
 docToCurator[cd.document_id] = cd.curator_id;
 });

 const { data: locs } = await supabase
 .from('locations')
 .select('id, document_id')
 .in('document_id', docIds)
 .is('deleted_at', null);

 (locs || []).forEach(loc => {
 if (loc.document_id) {
 const curatorId = docToCurator[loc.document_id];
 if (curatorId) {
 locationCounts[curatorId] = (locationCounts[curatorId] || 0) + 1;
 }
 }
 });
 }
 }

 const curatorsWithCounts: VirtualCurator[] = (curatorsData || []).map(c => ({
 id: c.id,
 name: c.name,
 description: c.description,
 category: c.category,
 color: c.color || '#14b8a6',
 icon: c.icon || '',
 avatar_url: c.avatar_url,
 is_active: c.is_active,
 locationCount: locationCounts[c.id] || 0,
 }));

 setCurators(curatorsWithCounts);
 } catch (error) {
 console.error('Error fetching curators:', error);
 }
 };

 const fetchDruids = async () => {
 try {
 const { data: druidsData, error } = await supabase
 .from('druids')
 .select('*')
 .eq('is_active', true)
 .order('name');

 if (error) throw error;

      // Get location counts for each druid
 const druidIds = (druidsData || []).map(d => d.id);
 let locationCounts: Record<string, number> = {};

 if (druidIds.length > 0) {
 const { data: druidLocs } = await supabase
 .from('druid_locations')
 .select('druid_id')
 .in('druid_id', druidIds);

 (druidLocs || []).forEach(loc => {
 locationCounts[loc.druid_id] = (locationCounts[loc.druid_id] || 0) + 1;
 });
 }

 const druidsWithCounts: Druid[] = (druidsData || []).map(d => ({
 id: d.id,
 name: d.name,
 description: d.description,
 category: d.category,
 color: d.color || '#22c55e',
 icon: d.icon || '',
 is_active: d.is_active,
 locationCount: locationCounts[d.id] || 0,
 }));

 setDruids(druidsWithCounts);
 } catch (error) {
 console.error('Error fetching druids:', error);
 }
 };

 const handleCreateCurator = async () => {
 if (!newCuratorName.trim()) return;
 
 setCreatingCurator(true);
 try {
 const { error } = await supabase
 .from('curators')
 .insert({ name: newCuratorName.trim() });

 if (error) throw error;

 toast.success('Curador creado');
 setNewCuratorName('');
 setShowNewCuratorForm(false);
 fetchCurators();
 } catch (error: any) {
 console.error('Error creating curator:', error);
 toast.error('Error al crear curador');
 } finally {
 setCreatingCurator(false);
 }
 };


  const handleCreateDruid = async () => {
    if (!newDruidName.trim()) return;
    
    setCreatingDruid(true);
    try {
      const { error } = await supabase
        .from('druids')
        .insert({ name: newDruidName.trim() });

      if (error) throw error;

      toast.success('Druida creado');
      setNewDruidName('');
      setShowNewDruidForm(false);
      fetchDruids();
    } catch (error: any) {
      console.error('Error creating druid:', error);
      toast.error('Error al crear druida');
    } finally {
      setCreatingDruid(false);
    }
  };

    // Set filter directly in the store
 setFilters({
      // Clear all other filters
 filterByCuratorId: curator.id,
 filterByCuratorName: curator.name,
 });
 
    // Dispatch event for Index to load curator documents
 window.dispatchEvent(new CustomEvent('lovable:filter-by-curator', {
 detail: { curatorId: curator.id, curatorName: curator.name }
 }));
 
 toast.success(`Modo curador: ${curator.name}`, {
 description: 'Mostrando solo los puntos de este curador',
 icon: <MapPin className="w-4 h-4" style={{ color: curator.color }} />,
 action: {
 label: 'Salir',
 onClick: () => {
 setFilters({});
 window.dispatchEvent(new CustomEvent('lovable:exit-curator-mode'));
 }
 },
 duration: 5000,
 });
 onClose();
 };

 const handleFilterByDruid = async (druid: Druid) => {
    // Set filter directly in the store
 setFilters({
      // Clear all other filters
 filterByDruidId: druid.id,
 filterByDruidName: druid.name,
 });
 
 onClose();
 
 toast.info(`Activando modo druida: ${druid.name}`, {
 description: 'Ejecutando búsqueda y enriquecimiento...',
 icon: <Leaf className="w-4 h-4" style={{ color: druid.color }} />,
 duration: 3000,
 });
 
    // Automatically run search with enrichment when entering druid mode
 setRunningDruidSearch(true);
 
 try {
      // Get current position
 const position = await new Promise<GeolocationPosition>((resolve, reject) => {
 if (!navigator.geolocation) {
 reject(new Error('Geolocalización no soportada'));
 return;
 }
 navigator.geolocation.getCurrentPosition(resolve, reject, { 
 enableHighAccuracy: true, 
 timeout: 10000 
 });
 });
 
 const currentLat = position.coords.latitude;
 const currentLng = position.coords.longitude;
 
      // Execute search with auto-enrich
 const { data, error } = await supabase.functions.invoke('druid-search', {
 body: { 
 druid_id: druid.id, 
 force_refresh: true,
 override_center_lat: currentLat,
 override_center_lng: currentLng,
 auto_enrich_now: true, // Trigger background enrichment
 }
 });
 
 if (error) throw error;
 
 const count = data.totalLocationsInserted || 0;
 toast.success(`Búsqueda completada: ${count} puntos encontrados`, {
 description: 'Enriqueciendo puntos en segundo plano...',
 icon: <Sparkles className="w-4 h-4 text-amber-500" />,
 duration: 5000,
 });
 
      // Dispatch event for Index to load druid locations
 window.dispatchEvent(new CustomEvent('lovable:filter-by-druid', {
 detail: { druidId: druid.id, druidName: druid.name }
 }));
 
      // Refresh druids list to update count
 fetchDruids();
 
 } catch (err) {
 console.error('Druid search error:', err);
 toast.error('Error al ejecutar búsqueda. Inténtalo manualmente.');
 
      // Still dispatch to show existing locations
 window.dispatchEvent(new CustomEvent('lovable:filter-by-druid', {
 detail: { druidId: druid.id, druidName: druid.name }
 }));
 } finally {
 setRunningDruidSearch(false);
 }
 };

 const handleRunDruidSearch = async () => {
 if (!activeDruid) return;
 
 setRunningDruidSearch(true);
 
    // Siempre usar la ubicación actual del usuario
 if (!navigator.geolocation) {
 toast.error('Geolocalización no soportada en este navegador');
 setRunningDruidSearch(false);
 return;
 }

 navigator.geolocation.getCurrentPosition(
 async (position) => {
 const currentLat = position.coords.latitude;
 const currentLng = position.coords.longitude;

 try {
 const { data, error } = await supabase.functions.invoke('druid-search', {
 body: { 
 druid_id: activeDruid.id, 
 force_refresh: true,
 override_center_lat: currentLat,
 override_center_lng: currentLng,
 auto_enrich_now: true, // Trigger background enrichment
 }
 });

 if (error) throw error;

 const count = data.totalLocationsInserted || 0;
 toast.success(`Búsqueda completada: ${count} puntos encontrados`, {
 description: 'Enriqueciendo puntos en segundo plano...',
 icon: <Sparkles className="w-4 h-4 text-amber-500" />,
 });
 
          // Refresh druid locations on the map
 window.dispatchEvent(new CustomEvent('lovable:filter-by-druid', {
 detail: { druidId: activeDruid.id, druidName: activeDruid.name }
 }));
 
          // Refresh druids list to update count
 fetchDruids();
 } catch (err) {
 console.error('Druid search error:', err);
 toast.error('Error en la búsqueda');
 } finally {
 setRunningDruidSearch(false);
 }
 },
 (error) => {
 console.error('Geolocation error:', error);
 toast.error('No se pudo obtener tu ubicación. Activa la geolocalización.');
 setRunningDruidSearch(false);
 },
 { enableHighAccuracy: true, timeout: 10000 }
 );
 };

 const handleFollow = async (userId: string, e: React.MouseEvent) => {
 e.stopPropagation();
 if (!currentUser?.id || processingFollow) return;

 setProcessingFollow(userId);
 
 try {
 const { data, error } = await supabase
 .from('follows')
 .insert({
 follower_id: currentUser.id,
 following_id: userId,
 })
 .select('id, status')
 .single();

 if (error) throw error;

      // Update local state
 setUsers(prev => prev.map(u => 
 u.id === userId 
 ? { ...u, followStatus: data.status as 'pending' | 'accepted', followId: data.id }
 : u
 ));

 const targetUser = users.find(u => u.id === userId);
 if (data.status === 'accepted') {
 toast.success(`Ahora sigues a ${targetUser?.display_name || targetUser?.username}. Cargando sus puntos...`, {
 duration: 2000,
 });
        // Dispatch event to trigger map refresh
 window.dispatchEvent(new CustomEvent('lovable:follow-changed'));
 } else {
 toast.success(`Solicitud enviada a ${targetUser?.display_name || targetUser?.username}`);
 }
 } catch (error: any) {
 console.error('Follow error:', error);
 if (error.code === '23505') {
 toast.error('Ya sigues a este usuario');
 } else {
 toast.error('Error al seguir usuario');
 }
 } finally {
 setProcessingFollow(null);
 }
 };

 const handleUnfollow = async (userId: string, followId: string, e: React.MouseEvent) => {
 e.stopPropagation();
 if (!currentUser?.id || processingFollow) return;

 setProcessingFollow(userId);
 
 try {
 const { error } = await supabase
 .from('follows')
 .delete()
 .eq('id', followId);

 if (error) throw error;

      // Update local state
 setUsers(prev => prev.map(u => 
 u.id === userId 
 ? { ...u, followStatus: 'none', followId: undefined }
 : u
 ));

 const targetUser = users.find(u => u.id === userId);
 toast.success(`Dejaste de seguir a ${targetUser?.display_name || targetUser?.username}`);
 
      // Dispatch event to trigger map refresh
 window.dispatchEvent(new CustomEvent('lovable:follow-changed'));
 } catch (error) {
 console.error('Unfollow error:', error);
 toast.error('Error al dejar de seguir');
 } finally {
 setProcessingFollow(null);
 }
 };

  // Handle filtering map by user's points
 const handleFilterByUser = (user: UserWithStats) => {
    // Only allow filtering for followed users or self
 if (user.id === currentUser?.id || user.followStatus === 'accepted') {
 setFilters({
 ...filters,
 filterByUserId: user.id,
 filterByUserName: user.display_name || user.username,
        // Clear other filters that might conflict
 ownershipFilter: undefined,
 });
 onClose();
 toast.success(`Mostrando puntos de ${user.display_name || user.username}`, {
 icon: <Filter className="w-4 h-4" />,
 action: {
 label: 'Quitar filtro',
 onClick: () => {
 setFilters({
 ...filters,
 filterByUserId: undefined,
 filterByUserName: undefined,
 });
 }
 }
 });
 } else {
 toast.error('Solo puedes ver puntos de usuarios que sigues');
 }
 };

  // Get current user data from users list
 const currentUserData = React.useMemo(() => 
 users.find(u => u.id === currentUser?.id), 
 [users, currentUser?.id]
 );

  // Filter and sort users (excluding current user - shown separately in header)
 const sortedAndFilteredUsers = React.useMemo(() => {
 const term = searchTerm.toLowerCase();
 const filtered = users.filter(user => 
 user.id !== currentUser?.id && // Exclude current user from list
 (user.username.toLowerCase().includes(term) ||
 (user.display_name?.toLowerCase().includes(term) ?? false))
 );
 
    // Sort by location count
 return filtered.sort((a, b) => b.locationCount - a.locationCount);
 }, [users, searchTerm, currentUser?.id]);

 const getPrimaryRole = (roles: string[]): string => {
 const priority = ['master', 'admin', 'moderator', 'supervisor', 'editor', 'user'];
 for (const role of priority) {
 if (roles.includes(role)) return role;
 }
 return 'user';
 };

 const getFollowButton = (user: UserWithStats) => {
    // Don't show button for current user
 if (user.id === currentUser?.id) return null;

 const isProcessing = processingFollow === user.id;

 if (user.followStatus === 'accepted') {
 return (
 <Button
 variant="ghost"
 size="icon"
 onClick={(e) => handleUnfollow(user.id, user.followId!, e)}
 disabled={isProcessing}
 className="h-7 w-7 bg-primary/10 hover:bg-destructive/20 hover:text-destructive text-primary"
 title="Dejar de seguir"
 >
 {isProcessing ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <UserMinus className="w-4 h-4" />
 )}
 </Button>
 );
 }

 if (user.followStatus === 'pending') {
 return (
 <Button
 variant="ghost"
 size="icon"
 onClick={(e) => handleUnfollow(user.id, user.followId!, e)}
 disabled={isProcessing}
 className="h-7 w-7 bg-amber-500/10 text-amber-500 hover:bg-destructive/20 hover:text-destructive"
 title="Cancelar solicitud"
 >
 {isProcessing ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <Clock className="w-4 h-4" />
 )}
 </Button>
 );
 }

 return (
 <Button
 variant="ghost"
 size="icon"
 onClick={(e) => handleFollow(user.id, e)}
 disabled={isProcessing}
 className="h-7 w-7 hover:bg-primary/20 hover:text-primary"
 title="Seguir"
 >
 {isProcessing ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <UserPlus className="w-4 h-4" />
 )}
 </Button>
 );
 };

 return (
 <>
 {/* Lateral tab - always visible, full height matching sidebar panel */}
 <motion.button
 initial={{ x: -60 }}
 animate={{ x: isOpen ? 348 : 0 }}
 transition={{ type: 'spring', damping: 25, stiffness: 300 }}
 onClick={isOpen ? onClose : onOpen}
 className={cn(
 'fixed left-0 top-20 bottom-20 z-[2002]',
 'bg-card/95 backdrop-blur-xl',
 'border border-l-0 border-border/50 shadow-lg',
 'rounded-r-2xl px-1.5',
 'hover:bg-accent/50 transition-colors cursor-pointer',
 'flex flex-col items-center justify-center gap-2'
 )}
 title={isOpen ? "Cerrar panel de Usuarios" : "Abrir panel de Usuarios"}
 >
 <Users className="w-4 h-4 text-primary" />
 <span 
 className="text-[10px] font-medium text-muted-foreground"
 style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
 >
 Usuarios
 </span>
 <span className="text-[9px] font-semibold text-primary">
 {users.length}
 </span>
 </motion.button>

 <AnimatePresence>
 {isOpen && (
 <>
 {/* Sin backdrop: panel flotante para poder usar mapa y lista a la vez */}

 {/* Panel */}
 <motion.div
 initial={{ x: -320, opacity: 0 }}
 animate={{ x: 0, opacity: 1 }}
 exit={{ x: -320, opacity: 0 }}
 transition={{ type: 'spring', damping: 25, stiffness: 300 }}
 className={cn(
 'fixed left-4 top-20 bottom-20 w-[340px] z-[2001]',
 'bg-card backdrop-blur-xl rounded-2xl',
 'border border-border/50 shadow-2xl',
 'flex flex-col overflow-hidden'
 )}
 >
  {/* Header */}
  <div className="p-4 pb-2 border-b border-border/50">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {activeDruid ? (
          <>
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${activeDruid.color}20` }}>
              <Leaf className="w-5 h-5" style={{ color: activeDruid.color }} />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Modo Druida</h2>
              <p className="text-xs text-muted-foreground">Búsqueda automática</p>
            </div>
          </>
        ) : activeCurator ? (
          <>
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${activeCurator.color}20` }}>
              {renderCuratorIcon(activeCurator.icon, activeCurator.color, 'w-5 h-5')}
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Modo Curador</h2>
              <p className="text-xs text-muted-foreground">Gestionando puntos</p>
            </div>
          </>
        ) : (
          <>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Social</h2>
              <p className="text-xs text-muted-foreground">{users.length} registrados</p>
            </div>
          </>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
        <X className="w-4 h-4" />
      </Button>
    </div>

  </div>

  {/* Content area based on active mode or tab */}
  <div className="px-4 pt-3 pb-2">
  {/* Active Druid Card - shown when in druid mode */}
 {activeDruid ? (
 <div 
 className="flex items-center gap-3 p-3 rounded-xl mb-3 ring-2"
 style={{ 
 backgroundColor: `${activeDruid.color}10`,
 borderColor: activeDruid.color,
 boxShadow: `0 0 20px ${activeDruid.color}20`
 }}
 >
 {/* Druid Icon */}
 <div className="relative shrink-0">
 <div 
 className="w-12 h-12 rounded-full flex items-center justify-center ring-2"
 style={{ 
 backgroundColor: `${activeDruid.color}30`,
 borderColor: activeDruid.color
 }}
 >
 <span className="text-2xl">{activeDruid.icon}</span>
 </div>
 <div 
 className="absolute -bottom-0.5 -right-0.5 rounded-full p-1 shadow-sm"
 style={{ backgroundColor: activeDruid.color }}
 >
 <Leaf className="w-3 h-3 text-white" />
 </div>
 </div>

 {/* Druid Info */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-1.5 max-w-full">
 <span className="font-semibold text-base text-foreground truncate">
 {activeDruid.name}
 </span>
 <Badge 
 className="text-[9px] px-1.5 py-0 h-4 shrink-0 border-0"
 style={{ 
 backgroundColor: `${activeDruid.color}30`,
 color: activeDruid.color
 }}
 >
 Druida
 </Badge>
 </div>
 {activeDruid.category && (
 <p className="text-xs text-muted-foreground truncate">
 {activeDruid.category}
 </p>
 )}
 <div className="flex items-center gap-3 text-xs mt-1">
 <span 
 className="flex items-center gap-1 font-bold"
 style={{ color: activeDruid.color }}
 >
 <MapPin className="w-3.5 h-3.5" />
 {activeDruid.locationCount} puntos
 </span>
 </div>
 {activeDruid.description && (
 <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
 {activeDruid.description}
 </p>
 )}
 </div>
 </div>
 ) : activeCurator ? (
 <div 
 className="flex items-center gap-3 p-3 rounded-xl mb-3 ring-2"
 style={{ 
 backgroundColor: `${activeCurator.color}10`,
 borderColor: activeCurator.color,
 boxShadow: `0 0 20px ${activeCurator.color}20`
 }}
 >
 {/* Curator Avatar */}
 <div className="relative shrink-0">
 {activeCurator.avatar_url ? (
 <img
 src={activeCurator.avatar_url}
 alt={activeCurator.name}
 className="w-12 h-12 rounded-full object-cover ring-2"
 style={{ borderColor: activeCurator.color }}
 />
 ) : (
 <div 
 className="w-12 h-12 rounded-full flex items-center justify-center ring-2"
 style={{ 
 backgroundColor: `${activeCurator.color}30`,
 borderColor: activeCurator.color
 }}
 >
 {renderCuratorIcon(activeCurator.icon, activeCurator.color, 'w-6 h-6')}
 </div>
 )}
 <div 
 className="absolute -bottom-0.5 -right-0.5 rounded-full p-1 shadow-sm"
 style={{ backgroundColor: activeCurator.color }}
 >
 <MapPin className="w-3 h-3 text-white" />
 </div>
 </div>

 {/* Curator Info */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-1.5 max-w-full">
 <span className="font-semibold text-base text-foreground truncate">
 {activeCurator.name}
 </span>
 <Badge 
 className="text-[9px] px-1.5 py-0 h-4 shrink-0 border-0"
 style={{ 
 backgroundColor: `${activeCurator.color}30`,
 color: activeCurator.color
 }}
 >
 Curador
 </Badge>
 </div>
 {activeCurator.category && (
 <p className="text-xs text-muted-foreground truncate">
 {activeCurator.category}
 </p>
 )}
 <div className="flex items-center gap-3 text-xs mt-1">
 <span 
 className="flex items-center gap-1 font-bold"
 style={{ color: activeCurator.color }}
 >
 <MapPin className="w-3.5 h-3.5" />
 {activeCurator.locationCount} puntos
 </span>
 </div>
 {activeCurator.description && (
 <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
 {activeCurator.description}
 </p>
 )}
 </div>
 </div>
 ) : (
 /* Current user card - above search (normal mode) */
 currentUserData && (
 <div 
 className={cn(
 'flex items-center gap-3 p-3 rounded-xl mb-3',
 'bg-primary/5 ring-1 ring-primary/20'
 )}
 >
 <button
 onClick={() => handleFilterByUser(currentUserData)}
 className="relative shrink-0 group"
 >
 {currentUserData.avatar_url ? (
 <img
 src={currentUserData.avatar_url}
 alt={currentUserData.username}
 className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/30 group-hover:ring-primary/50 transition-all"
 />
 ) : (
 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-2 ring-primary/30 group-hover:ring-primary/50 transition-all">
 <span className="text-sm font-semibold text-primary">
 {(currentUserData.display_name || currentUserData.username).charAt(0).toUpperCase()}
 </span>
 </div>
 )}
 <div className="absolute -bottom-0.5 -right-0.5 bg-card rounded-full p-0.5 shadow-sm">
 {roleIcons[getPrimaryRole(currentUserData.roles)] || <Users className="w-3 h-3 text-muted-foreground" />}
 </div>
 </button>

 <button
 onClick={() => handleFilterByUser(currentUserData)}
 className="flex-1 min-w-0 text-left overflow-hidden"
 >
 <div className="flex items-center gap-1.5 max-w-full">
 <span className="font-medium text-sm text-foreground truncate max-w-[120px]">
 {currentUserData.display_name || currentUserData.username}
 </span>
 <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">
 Tú
 </Badge>
 </div>
 <div className="flex items-center gap-2 text-[10px] text-muted-foreground max-w-full flex-wrap">
 <span className="flex items-center gap-0.5 shrink-0" title="Puntos">
 <MapPin className="w-3 h-3" />
 {currentUserData.locationCount}
 </span>
 <span className="flex items-center gap-0.5 shrink-0" title="Seguidores">
 <Users className="w-3 h-3" />
 {currentUserData.followersCount}
 </span>
 <span className="flex items-center gap-0.5 shrink-0" title="Siguiendo">
 <Heart className="w-3 h-3" />
 {currentUserData.followingCount}
 </span>
 </div>
 </button>
 </div>
 )
 )}

 {/* Druid Actions */}
 {activeDruid && (
 <div className="flex gap-2 mb-3">
 <Button
 size="sm"
 onClick={handleRunDruidSearch}
 disabled={runningDruidSearch}
 className="flex-1 gap-2"
 style={{ 
 backgroundColor: activeDruid.color, 
 color: 'white',
 }}
 >
 {runningDruidSearch ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <Play className="w-4 h-4" />
 )}
 {runningDruidSearch ? 'Buscando...' : 'Ejecutar búsqueda'}
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={() => {
 setFilters({});
 window.dispatchEvent(new CustomEvent('lovable:exit-druid-mode'));
 toast.success('Saliste del modo druida');
 }}
 className="gap-2"
 style={{ borderColor: activeDruid.color, color: activeDruid.color }}
 >
 <X className="w-4 h-4" />
 Salir
 </Button>
 </div>
 )}

 {/* Exit Curator Mode Button */}
 {activeCurator && !activeDruid && (
 <Button
 variant="outline"
 size="sm"
 onClick={() => {
 setFilters({});
 window.dispatchEvent(new CustomEvent('lovable:exit-curator-mode'));
 toast.success('Saliste del modo curador');
 }}
 className="w-full mb-3 gap-2"
 style={{ borderColor: activeCurator.color, color: activeCurator.color }}
 >
 <X className="w-4 h-4" />
 Salir del modo curador
 </Button>
 )}

 {/* Search */}
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
 <Input
 placeholder={activeCurator ? "Buscar en puntos del curador..." : "Buscar usuario..."}
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="pl-9 h-9 bg-muted/50 border-0 rounded-xl"
 />
 </div>
 </div>

  {/* User List - shown on users tab or in special modes */}
  {(activeTab === 'users' || activeDruid || activeCurator || !isMaster()) && (
  <ScrollArea className="flex-1">
 <div className="p-3 space-y-1">
 {loading ? (
 Array.from({ length: 5 }).map((_, i) => (
 <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
 <Skeleton className="w-10 h-10 rounded-full" />
 <div className="flex-1">
 <Skeleton className="h-4 w-28 mb-1.5" />
 <Skeleton className="h-3 w-20" />
 </div>
 <Skeleton className="h-7 w-16 rounded-md" />
 </div>
 ))
 ) : sortedAndFilteredUsers.length === 0 ? (
 <div className="text-center text-muted-foreground text-sm py-12">
 <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
 <p>No se encontraron usuarios</p>
 </div>
 ) : (
 sortedAndFilteredUsers.map((user, index) => {
  const primaryRole = getPrimaryRole(user.roles);
  const isCurrentUser = user.id === currentUser?.id;
  const isLast = index === sortedAndFilteredUsers.length - 1;
  const isUserHidden = filters.hiddenFollowedUserIds?.includes(user.id) ?? false;
 
 return (
 <motion.div
 key={user.id}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: index * 0.03 }}
 className={cn(
  'flex items-center gap-3 p-3 rounded-xl',
  'hover:bg-accent/50 transition-all',
  isCurrentUser && 'bg-primary/5 ring-1 ring-primary/20',
  !isLast && 'border-b border-border/30',
  isUserHidden && 'opacity-50'
  )}
 >
 {/* Avatar - clickable */}
 <button
 onClick={() => handleFilterByUser(user)}
 className="relative shrink-0 group"
 >
 {user.avatar_url ? (
 <img
 src={user.avatar_url}
 alt={user.username}
 className="w-10 h-10 rounded-full object-cover ring-2 ring-border/50 group-hover:ring-primary/50 transition-all"
 />
 ) : (
 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-2 ring-border/50 group-hover:ring-primary/50 transition-all">
 <span className="text-sm font-semibold text-primary">
 {(user.display_name || user.username).charAt(0).toUpperCase()}
 </span>
 </div>
 )}
 {/* Role badge */}
 <div className="absolute -bottom-0.5 -right-0.5 bg-card rounded-full p-0.5 shadow-sm">
 {roleIcons[primaryRole] || <Users className="w-3 h-3 text-muted-foreground" />}
 </div>
 </button>

 {/* Info - clickable */}
 <button
 onClick={() => handleFilterByUser(user)}
 className="flex-1 min-w-0 text-left overflow-hidden"
 >
 <div className="flex items-center gap-1.5 max-w-full">
 <span className="font-medium text-sm text-foreground truncate max-w-[120px]">
 {user.display_name || user.username}
 </span>
 {isCurrentUser && (
 <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">
 Tú
 </Badge>
 )}
 </div>
 <div className="flex items-center gap-2.5 text-xs text-muted-foreground max-w-full flex-wrap">
 <span className="flex items-center gap-0.5 shrink-0" title="Puntos">
 <MapPin className="w-3 h-3" />
 <span className="font-bold">{user.locationCount}</span>
 </span>
 <span className="flex items-center gap-0.5 shrink-0" title="Seguidores">
 <Users className="w-3 h-3" />
 <span className="font-bold">{user.followersCount}</span>
 </span>
 <span className="flex items-center gap-0.5 shrink-0" title="Siguiendo">
 <Heart className="w-3 h-3" />
 <span className="font-bold">{user.followingCount}</span>
 </span>
 <span className="flex items-center gap-0.5 shrink-0 text-amber-500" title="Puntos en común">
 <Link2 className="w-3 h-3" />
 <span className="font-bold">{user.commonPointsCount}</span>
 </span>
 </div>
 </button>

                {/* Visibility toggle for followed users */}
                {user.followStatus === 'accepted' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const currentHidden = filters.hiddenFollowedUserIds || [];
                      const isCurrentlyHidden = currentHidden.includes(user.id);
                      const newHidden = isCurrentlyHidden
                        ? currentHidden.filter(id => id !== user.id)
                        : [...currentHidden, user.id];
                      const finalHidden = newHidden.length > 0 ? newHidden : undefined;
                      setFilters({ ...filters, hiddenFollowedUserIds: finalHidden });
                      localStorage.setItem('vandits_hidden_followed_users', JSON.stringify(finalHidden || []));
                    }}
                    className={`p-1.5 rounded-full transition-colors shrink-0 ${
                      filters.hiddenFollowedUserIds?.includes(user.id)
                        ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        : 'text-primary hover:bg-primary/10'
                    }`}
                    title={filters.hiddenFollowedUserIds?.includes(user.id) ? 'Mostrar puntos' : 'Ocultar puntos'}
                  >
                    {filters.hiddenFollowedUserIds?.includes(user.id) ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                )}

                {/* Follow button (icon only) */}
                <div className="shrink-0">
                  {getFollowButton(user)}
                </div>
 </motion.div>
 );
 })
 )}
 </div>
  </ScrollArea>
  )}

  {/* Druids Tab Content */}
  {activeTab === 'druids' && isMaster() && (
  <ScrollArea className="flex-1">
    <div className="p-3 space-y-1">
      {druids.map(druid => {
        const isHidden = filters.hiddenDruidIds?.includes(druid.id);
        return (
          <div
            key={druid.id}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <button
              onClick={() => handleFilterByDruid(druid)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
            >
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isHidden ? 'opacity-40' : ''}`}
                style={{ backgroundColor: `${druid.color}20` }}
              >
                <span className="text-sm">{druid.icon}</span>
              </div>
              <div className={`flex-1 min-w-0 ${isHidden ? 'opacity-50' : ''}`}>
                <div className="font-medium text-sm truncate">{druid.name}</div>
                {druid.category && (
                  <div className="text-xs text-muted-foreground truncate">{druid.category}</div>
                )}
              </div>
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`flex items-center gap-1 text-xs text-muted-foreground ${isHidden ? 'opacity-50' : ''}`}>
                <MapPin className="w-3 h-3" />
                <span className="font-bold">{druid.locationCount}</span>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const currentHidden = filters.hiddenDruidIds || [];
                  const newHidden = isHidden
                    ? currentHidden.filter(id => id !== druid.id)
                    : [...currentHidden, druid.id];
                  setFilters({
                    ...filters,
                    hiddenDruidIds: newHidden.length > 0 ? newHidden : undefined,
                  });
                  window.dispatchEvent(new CustomEvent('lovable:druid-visibility-changed'));
                }}
                className={`p-1.5 rounded-full transition-colors ${
                  isHidden 
                    ? 'text-muted-foreground hover:text-foreground hover:bg-muted' 
                    : 'text-green-500 hover:bg-green-500/10'
                }`}
                title={isHidden ? 'Mostrar puntos' : 'Ocultar puntos'}
              >
                {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        );
      })}
      {druids.length === 0 && (
        <div className="text-center text-xs text-muted-foreground py-8">
          No hay druidas configurados
        </div>
      )}

      {/* New Druid - admin only, at the bottom */}
      {isAdmin() && (
        showNewDruidForm ? (
          <div className="p-2 bg-muted/50 rounded-lg space-y-2 mt-2">
            <Input
              placeholder="Nombre del druida..."
              value={newDruidName}
              onChange={e => setNewDruidName(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={e => e.key === 'Enter' && handleCreateDruid()}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleCreateDruid} disabled={!newDruidName.trim() || creatingDruid}>
                {creatingDruid ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Crear'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowNewDruidForm(false); setNewDruidName(''); }}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNewDruidForm(true)}
            className="w-full justify-start gap-2 h-8 text-muted-foreground hover:text-foreground mt-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo druida
          </Button>
        )
      )}
    </div>
  </ScrollArea>
  )}

  {/* Curators Tab Content */}
  {activeTab === 'curators' && isMaster() && (
  <ScrollArea className="flex-1">
   <div className="p-3 space-y-1">
      {/* Curators List */}
      {curators.map(curator => {
        const isHidden = filters.hiddenCuratorIds?.includes(curator.id);
        return (
          <div
            key={curator.id}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <button
              onClick={() => handleFilterByCurator(curator)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
            >
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isHidden ? 'opacity-40' : ''}`}
                style={{ backgroundColor: `${curator.color}20` }}
              >
                {renderCuratorIcon(curator.icon, curator.color, 'w-4 h-4')}
              </div>
              <div className={`flex-1 min-w-0 ${isHidden ? 'opacity-50' : ''}`}>
                <div className="font-medium text-sm truncate">{curator.name}</div>
                {curator.category && (
                  <div className="text-xs text-muted-foreground truncate">{curator.category}</div>
                )}
              </div>
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`flex items-center gap-1 text-xs text-muted-foreground ${isHidden ? 'opacity-50' : ''}`}>
                <MapPin className="w-3 h-3" />
                <span className="font-bold">{curator.locationCount}</span>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const currentHidden = filters.hiddenCuratorIds || [];
                  const newHidden = isHidden
                    ? currentHidden.filter(id => id !== curator.id)
                    : [...currentHidden, curator.id];
                  setFilters({
                    ...filters,
                    hiddenCuratorIds: newHidden.length > 0 ? newHidden : undefined,
                  });
                  window.dispatchEvent(new CustomEvent('lovable:curator-visibility-changed'));
                }}
                className={`p-1.5 rounded-full transition-colors ${
                  isHidden 
                    ? 'text-muted-foreground hover:text-foreground hover:bg-muted' 
                    : 'text-primary hover:bg-primary/10'
                }`}
                title={isHidden ? 'Mostrar puntos' : 'Ocultar puntos'}
              >
                {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        );
      })}

      {curators.length === 0 && !showNewCuratorForm && (
        <div className="text-center text-xs text-muted-foreground py-8">
          No hay curadores creados
        </div>
      )}

      {/* New Curator - admin only, at the bottom */}
      {isAdmin() && (
        showNewCuratorForm ? (
          <div className="p-2 bg-muted/50 rounded-lg space-y-2 mt-2">
            <Input
              placeholder="Nombre del curador..."
              value={newCuratorName}
              onChange={e => setNewCuratorName(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={e => e.key === 'Enter' && handleCreateCurator()}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleCreateCurator} disabled={!newCuratorName.trim() || creatingCurator}>
                {creatingCurator ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Crear'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowNewCuratorForm(false); setNewCuratorName(''); }}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNewCuratorForm(true)}
            className="w-full justify-start gap-2 h-8 text-muted-foreground hover:text-foreground mt-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo curador
          </Button>
        )
      )}
    </div>
  </ScrollArea>
  )}

  {/* Footer Stats */}
  <div className="p-3 border-t border-border/50 bg-muted/20">
    <div className="flex justify-between items-center">
      <div className="text-xs text-muted-foreground">Siguiendo</div>
      <div className="flex items-center gap-1.5">
        <UserCheck className="w-3.5 h-3.5 text-primary" />
        <span className="font-semibold text-foreground">
          {users.filter(u => u.followStatus === 'accepted').length}
        </span>
      </div>
    </div>
  </div>
 </motion.div>
 </>
 )}
 </AnimatePresence>
 </>
 );
}
