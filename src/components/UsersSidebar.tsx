import React, { useState, useEffect } from 'react';
import {
  Users, X, Search, Shield, Crown, Edit3, Eye, EyeOff, UserCheck,
  UserPlus, UserMinus, Loader2, Clock, Filter, HelpCircle,
  Share2, Lock, TrendingUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/domains/identity';
import { useLocationsStore } from '@/domains/content';
import { requestSubsetFit } from '@/components/map/subset-fit';
import { getOwnerIdentityColor } from '@/components/map/owner-stroke';
import {
  loadOwnerIdentityAssignments,
  ensureAssignmentsForFolloweds,
  getOwnerIdentityOklch,
} from '@/stores/owner-identity-store';
import { usePermissions } from '@/domains/identity';
import { useLayerVisibility } from '@/hooks/use-layer-visibility';
import { toast } from 'sonner';
import { formatDistanceToNowStrict } from 'date-fns';

/** "18m" / "2h" / "3d" / "5mo" / "1y". Avoids verbose "hace 18 minutos". */
function formatActivityShort(iso: string): string {
  try {
    const raw = formatDistanceToNowStrict(new Date(iso), { addSuffix: false });
    // raw e.g. "18 minutes", "2 hours", "3 days", "5 months", "1 year"
    return raw
      .replace(/\s+seconds?$/, 's')
      .replace(/\s+minutes?$/, 'm')
      .replace(/\s+hours?$/, 'h')
      .replace(/\s+days?$/, 'd')
      .replace(/\s+months?$/, 'mo')
      .replace(/\s+years?$/, 'y');
  } catch {
    return '';
  }
}

interface UserWithStats {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  roles: string[];
  sharedPois: number;
  totalPois: number | null;
  lastContributionAt: string | null;
  contributions7d: number | null;
  followersCount: number;
  followingCount: number;
  is_private: boolean;
  followStatus: 'none' | 'pending' | 'accepted' | 'rejected';
  followId?: string;
  followsMe: boolean;
}

type RelationFilter = 'all' | 'following' | 'followers';

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
};

const roleColors: Record<string, string> = {
 master: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
 admin: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
 editor: 'bg-green-500/20 text-green-400 border-green-500/30',
 moderator: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
 supervisor: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
 user: 'bg-muted text-muted-foreground border-border',
};

export function UsersSidebar({ isOpen, onClose, onOpen }: UsersSidebarProps) {
 const { user: currentUser } = useAuth();
 const { isMaster, isAdmin } = usePermissions();
 const { filters, setFilters } = useLocationsStore();
 const { toggleUserVisibility, isUserHidden } = useLayerVisibility();
 const [users, setUsers] = useState<UserWithStats[]>([]);
 const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [processingFollow, setProcessingFollow] = useState<string | null>(null);
  const [relationFilter, setRelationFilter] = useState<RelationFilter>('all');
  // Tick para forzar re-render cuando el store de identidad cromática
  // emite cambios (las assignments se escriben en background — sin esto,
  // el badge del sidebar se queda con el color stale aunque el mapa repinte).
  const [, setIdentityTick] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setIdentityTick((t) => t + 1);
    window.addEventListener('lovable:owner-identity-updated', handler);
    return () => window.removeEventListener('lovable:owner-identity-updated', handler);
  }, []);

 useEffect(() => {
 if (isOpen) {
 fetchUsers();
 }
 }, [isOpen, currentUser?.id]);

  // Listen for external requests to open the sidebar with a specific filter
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { filter?: RelationFilter } | undefined;
      if (detail?.filter) setRelationFilter(detail.filter);
      if (!isOpen && onOpen) onOpen();
    };
    window.addEventListener('lovable:open-users-sidebar', handler);
    return () => window.removeEventListener('lovable:open-users-sidebar', handler);
  }, [isOpen, onOpen]);

 const fetchUsers = async () => {
 try {
 setLoading(true);

 const { data: profiles, error: profilesError } = await supabase
 .from('profiles')
 .select('id, username, display_name, avatar_url, is_private')
 .order('created_at', { ascending: false });

 if (profilesError) throw profilesError;

 const { data: rolesData, error: rolesError } = await supabase
 .from('user_roles')
 .select('user_id, role');

 if (rolesError) throw rolesError;

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

  let followsMeSet: Set<string> = new Set();
  if (currentUser?.id) {
    const { data: followersData } = await supabase
      .from('follows')
      .select('follower_id, status')
      .eq('following_id', currentUser.id)
      .eq('status', 'accepted');
    followersData?.forEach(f => followsMeSet.add(f.follower_id));
  }

  // Sharing-aware stats (PR-SOCIAL-1).
  // - shared_pois follows isShareablePoi server-side
  // - total_pois/last/contributions hidden unless mutual or admin
  const { data: followedStats } = await supabase.rpc('get_followed_user_stats');
  const followedMap: Record<string, {
    shared: number;
    total: number | null;
    last: string | null;
    recent: number | null;
    followers: number;
    following: number;
  }> = {};
  (followedStats as any[] | null)?.forEach((s) => {
    followedMap[s.user_id] = {
      shared: Number(s.shared_pois ?? 0),
      total: s.total_pois == null ? null : Number(s.total_pois),
      last: s.last_contribution_at ?? null,
      recent: s.contributions_7d == null ? null : Number(s.contributions_7d),
      followers: Number(s.followers_count ?? 0),
      following: Number(s.following_count ?? 0),
    };
  });

  // Fallback for non-related profiles (followers/following counts only).
  const { data: publicStats } = await supabase.rpc('get_public_profile_stats');
  const publicMap: Record<string, { followers: number; following: number }> = {};
  (publicStats as any[] | null)?.forEach((stat) => {
    publicMap[stat.user_id] = {
      followers: Number(stat.followers_count ?? 0),
      following: Number(stat.following_count ?? 0),
    };
  });

  const rolesMap: Record<string, string[]> = {};
  rolesData?.forEach(r => {
    if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
    rolesMap[r.user_id].push(r.role);
  });

  const usersWithStats: UserWithStats[] = (profiles || []).map(profile => {
    const f = followedMap[profile.id];
    const p = publicMap[profile.id];
    return {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      is_private: profile.is_private,
      roles: rolesMap[profile.id] || ['user'],
      sharedPois: f?.shared ?? 0,
      totalPois: f?.total ?? null,
      lastContributionAt: f?.last ?? null,
      contributions7d: f?.recent ?? null,
      followersCount: f?.followers ?? p?.followers ?? 0,
      followingCount: f?.following ?? p?.following ?? 0,
      followStatus: (followsMap[profile.id]?.status as 'pending' | 'accepted' | 'rejected') || 'none',
      followId: followsMap[profile.id]?.id,
      followsMe: followsMeSet.has(profile.id),
    };
  });

  usersWithStats.sort((a, b) => b.sharedPois - a.sharedPois);

 setUsers(usersWithStats);

  // Owner identity colors (PR-OWNER-IDENTITY-1): asegurar asignación
  // persistida para cada seguido visible. El renderer del mapa solo lee;
  // los writes se disparan aquí. Tras cada cambio, el store emite
  // `lovable:owner-identity-updated` y LocationMap repinta los markers
  // afectados sin rebuild.
  if (currentUser?.id) {
    // Identidad cromática SOLO se asigna a seguidos aceptados (PR-OWNER-IDENTITY-2.6).
    // Orden determinista por uid ASC para que el allocator incremental sea
    // estable entre sesiones.
    const followedUids = usersWithStats
      .filter(u => u.id !== currentUser.id && u.followStatus === 'accepted')
      .map(u => u.id)
      .sort((a, b) => a.localeCompare(b));
    try {
      await loadOwnerIdentityAssignments(currentUser.id);
      if (followedUids.length > 0) {
        // No await: la asignación se escribe en background sin bloquear UI.
        void ensureAssignmentsForFolloweds(currentUser.id, followedUids);
      }
    } catch (e) {
      console.warn('[UsersSidebar] owner-identity load/ensure failed', e);
    }
  }
 } catch (error) {
 console.error('Error fetching users:', error);
 } finally {
 setLoading(false);
 }
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

 setUsers(prev => prev.map(u => 
 u.id === userId 
 ? { ...u, followStatus: 'none', followId: undefined }
 : u
 ));

 const targetUser = users.find(u => u.id === userId);
 toast.success(`Dejaste de seguir a ${targetUser?.display_name || targetUser?.username}`);
 
 window.dispatchEvent(new CustomEvent('lovable:follow-changed'));
 } catch (error) {
 console.error('Unfollow error:', error);
 toast.error('Error al dejar de seguir');
 } finally {
 setProcessingFollow(null);
 }
 };

  const handleFilterByUser = (user: UserWithStats) => {
    if (user.id === currentUser?.id || user.followStatus === 'accepted') {
      setFilters({
        ...filters,
        filterByUserId: user.id,
        filterByUserName: user.display_name || user.username,
        ownershipFilter: undefined,
      });
      onClose();

      // Subset-fit canónico: el filtro por usuario es una acción explícita de
      // foco (no un filtro descriptivo Geo/Tipo/Tags). Ver
      // mem://logic/map/subset-fit-contract.
      // Defer: dejamos que el store reprocese con el filterByUserId recién
      // aplicado y luego pedimos fit con el resultado real (sin re-filtrar
      // por _docUserId).
      setTimeout(() => {
        const ids = useLocationsStore.getState()
          .getFilteredLocations()
          .map(l => l.id);
        if (ids.length > 0) {
          // minZoom: 7 → entra en banda `compact`, garantiza markers + rings
          // visibles incluso si el subset del usuario está muy disperso
          // (Galicia + Andalucía + Marruecos colapsaría a z3 sin piso).
          requestSubsetFit(ids, { mode: 'always', reason: 'user-filter', minZoom: 7 });
        }
      }, 50);

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

 const currentUserData = React.useMemo(() => 
 users.find(u => u.id === currentUser?.id), 
 [users, currentUser?.id]
 );

 const sortedAndFilteredUsers = React.useMemo(() => {
 const term = searchTerm.toLowerCase();
 const filtered = users.filter(user => {
   if (user.id === currentUser?.id) return false;
   const matchesSearch = user.username.toLowerCase().includes(term) ||
     (user.display_name?.toLowerCase().includes(term) ?? false);
   if (!matchesSearch) return false;
   if (relationFilter === 'following') return user.followStatus === 'accepted';
   if (relationFilter === 'followers') return user.followsMe;
   return true;
 });

 return filtered.sort((a, b) => b.sharedPois - a.sharedPois);
 }, [users, searchTerm, currentUser?.id, relationFilter]);

 const getPrimaryRole = (roles: string[]): string => {
 const priority = ['master', 'admin', 'moderator', 'supervisor', 'editor', 'user'];
 for (const role of priority) {
 if (roles.includes(role)) return role;
 }
 return 'user';
 };

 const getFollowButton = (user: UserWithStats) => {
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
 {/* Lateral tab */}
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
        <div className="p-2 bg-primary/10 rounded-lg">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Social</h2>
          <p className="text-xs text-muted-foreground">
            {users.filter(u => u.followStatus === 'accepted').length} seguidos · {users.filter(u => u.followsMe).length} te siguen
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          className="h-8 w-8 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          title={
            'Glosario:\n' +
            '• N compartidos → POIs suyos visibles para ti (curados)\n' +
            '• N totales → tamaño total de su catálogo (si es público)\n' +
            '• hace Xh → último POI añadido\n' +
            '• +N (7d) → contribuciones últimos 7 días\n' +
            '• Mute → oculta sus puntos del mapa (sigue siguiéndolo)\n' +
            '• Filtro → ver solo sus puntos en el mapa'
          }
        >
          <HelpCircle className="w-4 h-4" />
        </button>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  </div>

  {/* Content area */}
  <div className="px-4 pt-3 pb-2">
  {/* Current user card */}
  {currentUserData && (
  <div 
  className={cn(
  'flex items-center gap-2 p-2.5 rounded-xl mb-3 min-w-0',
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
  <span className="font-medium text-sm text-foreground truncate">
   {currentUserData.display_name || currentUserData.username}
  </span>
  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">Tú</Badge>
  </div>
  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
   title={[
     `${currentUserData.sharedPois} compartidos visibles para tus seguidores`,
     currentUserData.totalPois != null ? `${currentUserData.totalPois} totales en tu catálogo` : null,
   ].filter(Boolean).join(' · ')}>
   <span className="inline-flex items-center gap-1 shrink-0 tabular-nums">
    <Share2 className="w-3 h-3" />
    <span className="font-semibold text-foreground">{currentUserData.sharedPois}</span>
   </span>
   {currentUserData.totalPois != null && (
    <span className="inline-flex items-center gap-1 shrink-0 tabular-nums">
     <Lock className="w-3 h-3" />
     <span className="font-semibold text-foreground">{currentUserData.totalPois}</span>
    </span>
   )}
  </div>
  </button>
  </div>
  )}

  {/* Relation tabs */}
  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-muted/40 mb-2">
    {([
      { value: 'all' as const, label: 'Todos', count: users.filter(u => u.id !== currentUser?.id).length },
      { value: 'following' as const, label: 'Sigues', count: users.filter(u => u.followStatus === 'accepted').length },
      { value: 'followers' as const, label: 'Te siguen', count: users.filter(u => u.followsMe).length },
    ]).map(({ value, label, count }) => (
      <button
        key={value}
        onClick={() => setRelationFilter(value)}
        className={cn(
          'flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-[11px] font-medium transition-colors',
          relationFilter === value
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <span>{label}</span>
        <span className="tabular-nums opacity-70">{count}</span>
      </button>
    ))}
  </div>

  {/* Search */}
  <div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
  <Input
  placeholder="Buscar usuario..."
  value={searchTerm}
  onChange={(e) => setSearchTerm(e.target.value)}
  className="pl-9 h-9 bg-muted/50 border-0 rounded-xl"
  />
  </div>
  </div>

  {/* User List */}
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
  
  const isCurrentUser = user.id === currentUser?.id;
  const isLast = index === sortedAndFilteredUsers.length - 1;
  const isUserHiddenFlag = isUserHidden(user.id);
 
 return (
 <motion.div
 key={user.id}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: index * 0.03 }}
 className={cn(
  'flex items-center gap-2 p-2.5 rounded-xl min-w-0',
  'hover:bg-accent/50 transition-all',
  isCurrentUser && 'bg-primary/5 ring-1 ring-primary/20',
  !isLast && 'border-b border-border/30',
  isUserHiddenFlag && 'opacity-50'
  )}
 >
  {/* Avatar */}
  {(() => {
    const identityOklch = !isCurrentUser && user.followStatus === 'accepted'
      ? getOwnerIdentityOklch(user.id)
      : undefined;
    const identityColor = identityOklch
      ? getOwnerIdentityColor(user.id, identityOklch)
      : null;
    const ringStyle = identityColor
      ? { boxShadow: `0 0 0 2px ${identityColor}` }
      : undefined;
    const ringClass = identityColor
      ? 'group-hover:opacity-90 transition-all'
      : 'ring-2 ring-border/50 group-hover:ring-primary/50 transition-all';
    return (
      <button
        onClick={() => handleFilterByUser(user)}
        className="relative shrink-0 group"
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.username}
            className={cn('w-10 h-10 rounded-full object-cover', ringClass)}
            style={ringStyle}
          />
        ) : (
          <div
            className={cn(
              'w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center',
              ringClass,
            )}
            style={ringStyle}
          >
            <span className="text-sm font-semibold text-primary">
              {(user.display_name || user.username).charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </button>
    );
  })()}

 {/* Info */}
 <div className="flex-1 min-w-0 overflow-hidden">
  <div className="flex items-center gap-1.5 max-w-full">
   <span className="font-medium text-sm text-foreground truncate">
    {user.display_name || user.username}
   </span>
   {isCurrentUser && (
    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">Tú</Badge>
   )}
  </div>
  <div
   className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
   title={[
     `${user.sharedPois} compartidos visibles para ti`,
     user.totalPois != null ? `${user.totalPois} totales en su catálogo` : null,
     user.lastContributionAt ? `último POI hace ${formatActivityShort(user.lastContributionAt)}` : null,
     user.contributions7d != null && user.contributions7d > 0
       ? `+${user.contributions7d} en los últimos 7 días`
       : null,
   ].filter(Boolean).join(' · ')}
  >
   <span className="inline-flex items-center gap-1 shrink-0 tabular-nums">
    <Share2 className="w-3 h-3" />
    <span className="font-semibold text-foreground">{user.sharedPois}</span>
   </span>
   {user.totalPois != null && (
    <span className="inline-flex items-center gap-1 shrink-0 tabular-nums">
     <Lock className="w-3 h-3" />
     <span className="font-semibold text-foreground">{user.totalPois}</span>
    </span>
   )}
   {user.lastContributionAt && (
    <span className="inline-flex items-center gap-1 shrink-0 tabular-nums">
     <Clock className="w-3 h-3" />
     {formatActivityShort(user.lastContributionAt)}
    </span>
   )}
   {user.contributions7d != null && user.contributions7d > 0 && (
    <span className="inline-flex items-center gap-1 shrink-0 tabular-nums">
     <TrendingUp className="w-3 h-3" />
     +{user.contributions7d}
    </span>
   )}
  </div>
  {(user.followStatus === 'accepted' || user.followsMe) && (
   <div className="flex flex-wrap items-center gap-1 mt-0.5 text-[10px]">
    {user.followStatus === 'accepted' && (
     <span className="px-1.5 py-0 rounded bg-primary/10 text-primary">Sigues</span>
    )}
    {user.followsMe && (
     <span className="px-1.5 py-0 rounded bg-muted text-muted-foreground">Te sigue</span>
    )}
   </div>
  )}
 </div>

 {/* Mute toggle (only for followed) */}
 {user.followStatus === 'accepted' && (
  <button
   onClick={(e) => {
    e.stopPropagation();
    toggleUserVisibility(user.id);
   }}
   className={cn(
    'p-1 rounded-full transition-colors shrink-0',
    isUserHiddenFlag
     ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
     : 'text-primary hover:bg-primary/10'
   )}
   title={isUserHiddenFlag ? 'Mostrar sus puntos en el mapa' : 'Ocultar sus puntos del mapa (no afecta el follow)'}
  >
   {isUserHiddenFlag ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
  </button>
 )}

 {/* Focus owner */}
 {(user.followStatus === 'accepted' || isCurrentUser) && (
  <button
   onClick={(e) => { e.stopPropagation(); handleFilterByUser(user); }}
   className="p-1 rounded-full shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
   title="Ver solo sus puntos en el mapa"
  >
   <Filter className="w-3.5 h-3.5" />
  </button>
 )}

 {/* Follow button */}
 <div className="shrink-0">
  {getFollowButton(user)}
 </div>
 </motion.div>
 );
 })
 )}
 </div>
  </ScrollArea>

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
