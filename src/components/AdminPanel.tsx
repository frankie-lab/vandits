import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Users, Settings, ChevronDown, ChevronRight, Check, Loader2, Search, UserPlus, Trash2, Trophy, MapPin, ExternalLink, Leaf, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AchievementsManager } from './AchievementsManager';
import { DruidSettings } from './DruidSettings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePermissions, AppRole, AppPermission } from '@/hooks/use-permissions';
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

interface AdminPanelProps {
  onClose: () => void;
}

interface UserWithRoles {
  id: string;
  email: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
  roles: AppRole[];
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
  created_by: string | null;
  created_at: string;
  locationCount: number;
}

interface Druid {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  color: string;
  icon: string;
  avatar_url: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  search_center_lat: number | null;
  search_center_lng: number | null;
  search_radius_km: number;
  overpass_query: string | null;
  last_refresh_at: string | null;
  auto_enrich: boolean;
  locationCount: number;
}

interface RolePermission {
  role: AppRole;
  permission: AppPermission;
}

const ROLE_LABELS: Record<AppRole, string> = {
  master: 'Master',
  admin: 'Administrador',
  moderator: 'Moderador',
  editor: 'Editor',
  supervisor: 'Supervisor',
  user: 'Usuario',
  curator: 'Curador',
};

const ROLE_COLORS: Record<AppRole, string> = {
  master: 'bg-purple-500',
  admin: 'bg-red-500',
  moderator: 'bg-orange-500',
  editor: 'bg-blue-500',
  supervisor: 'bg-cyan-500',
  user: 'bg-gray-500',
  curator: 'bg-teal-500',
};

const PERMISSION_LABELS: Record<AppPermission, string> = {
  manage_users: 'Gestionar usuarios',
  manage_criteria: 'Gestionar criterios',
  run_global_enrichment: 'Enriquecimiento global',
  view_all_locations: 'Ver todas las ubicaciones',
  edit_all_locations: 'Editar ubicaciones',
  delete_any_location: 'Eliminar ubicaciones',
  manage_documents: 'Gestionar documentos',
  view_analytics: 'Ver estadísticas',
  moderate_content: 'Moderar contenido',
  upload_files: 'Subir archivos masivos',
  add_locations: 'Añadir ubicaciones',
};

const ALL_ROLES: AppRole[] = ['master', 'admin', 'moderator', 'editor', 'supervisor', 'user', 'curator'];
const ALL_PERMISSIONS: AppPermission[] = [
  'manage_users',
  'manage_criteria',
  'run_global_enrichment',
  'view_all_locations',
  'edit_all_locations',
  'delete_any_location',
  'manage_documents',
  'view_analytics',
  'moderate_content',
  'upload_files',
  'add_locations',
];

export function AdminPanel({ onClose }: AdminPanelProps) {
  const { isMaster, hasPermission, loading: permissionsLoading } = usePermissions();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [curators, setCurators] = useState<VirtualCurator[]>([]);
  const [druids, setDruids] = useState<Druid[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRoles, setExpandedRoles] = useState<Set<AppRole>>(new Set());
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserWithRoles | null>(null);
  const [userToPurge, setUserToPurge] = useState<UserWithRoles | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeStep, setPurgeStep] = useState<'idle' | 'loading-preview' | 'preview' | 'executing' | 'done'>('idle');
  const [purgePreview, setPurgePreview] = useState<{ targetUser: string; locations: number; documents: number; notes: number; photos: number; achievements: number } | null>(null);
  const [purgeProgress, setPurgeProgress] = useState(0);
  const [addingUser, setAddingUser] = useState(false);
  const [addingDruid, setAddingDruid] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('user');
  const [newDruidName, setNewDruidName] = useState('');
  const [newDruidCategory, setNewDruidCategory] = useState('');
  const [newDruidQuery, setNewDruidQuery] = useState('');
  const [selectedCuratorId, setSelectedCuratorId] = useState<string | null>(null);
  const [selectedDruidId, setSelectedDruidId] = useState<string | null>(null);
  const [druidSettingsOpen, setDruidSettingsOpen] = useState(false);
  const [runningDruidSearch, setRunningDruidSearch] = useState<string | null>(null);

  const canManageUsers = hasPermission('manage_users');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Obtener perfiles con sus roles (incluir campos de curador)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, curator_category, curator_color, curator_icon, curator_description');

      if (profilesError) throw profilesError;

      // Obtener roles de usuarios
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Combinar datos
      const usersWithRoles: UserWithRoles[] = (profiles || []).map(profile => ({
        id: profile.id,
        email: '', // No tenemos acceso al email desde profiles
        display_name: profile.display_name,
        username: profile.username,
        avatar_url: profile.avatar_url,
        roles: (userRoles || [])
          .filter(ur => ur.user_id === profile.id)
          .map(ur => ur.role as AppRole),
      }));

      setUsers(usersWithRoles);

      // Obtener permisos por rol
      const { data: permissions, error: permError } = await supabase
        .from('role_permissions')
        .select('role, permission');

      if (permError) throw permError;

      setRolePermissions((permissions || []).map(p => ({
        role: p.role as AppRole,
        permission: p.permission as AppPermission,
      })));

      // Obtener curadores virtuales de la nueva tabla
      const { data: curatorsData, error: curatorsError } = await supabase
        .from('curators')
        .select('*')
        .order('created_at', { ascending: false });

      if (curatorsError) throw curatorsError;

      // Obtener conteo de ubicaciones por curador
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
        icon: c.icon || '📍',
        avatar_url: c.avatar_url,
        is_active: c.is_active,
        created_by: c.created_by,
        created_at: c.created_at,
        locationCount: locationCounts[c.id] || 0,
      }));

      setCurators(curatorsWithCounts);

      // Obtener druidas
      const { data: druidsData, error: druidsError } = await supabase
        .from('druids')
        .select('*')
        .order('created_at', { ascending: false });

      if (druidsError) throw druidsError;

      // Obtener conteo de ubicaciones por druida
      const druidIds = (druidsData || []).map(d => d.id);
      let druidLocationCounts: Record<string, number> = {};

      if (druidIds.length > 0) {
        const { data: druidLocs } = await supabase
          .from('druid_locations')
          .select('id, druid_id');

        (druidLocs || []).forEach(loc => {
          if (loc.druid_id) {
            druidLocationCounts[loc.druid_id] = (druidLocationCounts[loc.druid_id] || 0) + 1;
          }
        });
      }

      const druidsWithCounts: Druid[] = (druidsData || []).map(d => ({
        id: d.id,
        name: d.name,
        description: d.description,
        category: d.category,
        color: d.color || '#22c55e',
        icon: d.icon || '🌿',
        avatar_url: d.avatar_url,
        is_active: d.is_active,
        created_by: d.created_by,
        created_at: d.created_at,
        search_center_lat: d.search_center_lat,
        search_center_lng: d.search_center_lng,
        search_radius_km: d.search_radius_km || 50,
        overpass_query: d.overpass_query,
        last_refresh_at: d.last_refresh_at,
        auto_enrich: d.auto_enrich ?? true,
        locationCount: druidLocationCounts[d.id] || 0,
      }));

      setDruids(druidsWithCounts);
    } catch (error: any) {
      console.error('Error fetching admin data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, [fetchData]);

  const handlePurgePreview = async (user: UserWithRoles) => {
    setUserToPurge(user);
    setPurgeStep('loading-preview');
    setPurgePreview(null);
    try {
      const response = await supabase.functions.invoke('purge-user', {
        body: { targetUserId: user.id, mode: 'preview' },
      });
      if (response.error) {
        const errBody = response.data;
        throw new Error(errBody?.error || response.error.message || 'Error desconocido');
      }
      setPurgePreview(response.data.preview);
      setPurgeStep('preview');
    } catch (e: any) {
      console.error('Purge preview error:', e);
      toast.error(e.message || 'Error al obtener datos del usuario');
      setUserToPurge(null);
      setPurgeStep('idle');
    }
  };

  const handlePurgeExecute = async () => {
    if (!userToPurge) return;
    setPurgeStep('executing');
    setPurgeProgress(0);

    // Simulate progress while the edge function works
    const totalItems = purgePreview ? (purgePreview.locations + purgePreview.documents + purgePreview.notes + purgePreview.photos + purgePreview.achievements) : 100;
    const progressInterval = setInterval(() => {
      setPurgeProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 300);

    try {
      const response = await supabase.functions.invoke('purge-user', {
        body: { targetUserId: userToPurge.id, mode: 'execute' },
      });

      clearInterval(progressInterval);

      if (response.error) {
        const errBody = response.data;
        throw new Error(errBody?.error || response.error.message || 'Error desconocido');
      }
      const data = response.data;

      setPurgeProgress(100);
      setPurgeStep('done');

      const p = data.purged;
      toast.success(
        `Usuario ${data.targetUser} limpiado: ${p.locations} puntos, ${p.documents} documentos, ${p.notes} notas, ${p.photos} fotos, ${p.achievements} logros eliminados`
      );

      // Close panel and return to map after a short delay
      setTimeout(() => {
        setUserToPurge(null);
        setPurgeStep('idle');
        setPurgeProgress(0);
        setPurgePreview(null);
        onClose();
      }, 1500);
    } catch (e: any) {
      clearInterval(progressInterval);
      console.error('Purge error:', e);
      toast.error(e.message || 'Error al limpiar usuario');
      setPurgeStep('preview');
      setPurgeProgress(0);
    }
  };

  const toggleUserRole = async (userId: string, role: AppRole, hasRole: boolean) => {
    if (!canManageUsers && !isMaster()) {
      toast.error('No tienes permisos para gestionar usuarios');
      return;
    }

    // No permitir quitar el rol master si es el último master
    if (role === 'master' && hasRole) {
      const masterCount = users.filter(u => u.roles.includes('master')).length;
      if (masterCount <= 1) {
        toast.error('Debe haber al menos un usuario Master');
        return;
      }
    }

    setSavingRole(`${userId}-${role}`);
    try {
      if (hasRole) {
        // Quitar rol
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', role);

        if (error) throw error;
        toast.success(`Rol ${ROLE_LABELS[role]} eliminado`);
      } else {
        // Añadir rol
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role });

        if (error) throw error;
        toast.success(`Rol ${ROLE_LABELS[role]} asignado`);
      }

      // Actualizar estado local
      setUsers(prev => prev.map(u => {
        if (u.id !== userId) return u;
        return {
          ...u,
          roles: hasRole
            ? u.roles.filter(r => r !== role)
            : [...u.roles, role],
        };
      }));
    } catch (error: any) {
      console.error('Error toggling role:', error);
      toast.error('Error al modificar rol');
    } finally {
      setSavingRole(null);
    }
  };

  const togglePermission = async (role: AppRole, permission: AppPermission, hasPermission: boolean) => {
    if (!isMaster()) {
      toast.error('Solo los Masters pueden modificar permisos');
      return;
    }

    setSavingRole(`${role}-${permission}`);
    try {
      if (hasPermission) {
        // Quitar permiso
        const { error } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role', role)
          .eq('permission', permission);

        if (error) throw error;
        toast.success('Permiso eliminado');
      } else {
        // Añadir permiso
        const { error } = await supabase
          .from('role_permissions')
          .insert({ role, permission });

        if (error) throw error;
        toast.success('Permiso añadido');
      }

      // Actualizar estado local
      setRolePermissions(prev => {
        if (hasPermission) {
          return prev.filter(rp => !(rp.role === role && rp.permission === permission));
        } else {
          return [...prev, { role, permission }];
        }
      });
    } catch (error: any) {
      console.error('Error toggling permission:', error);
      toast.error('Error al modificar permiso');
    } finally {
      setSavingRole(null);
    }
  };

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const roleHasPermission = (role: AppRole, permission: AppPermission): boolean => {
    return rolePermissions.some(rp => rp.role === role && rp.permission === permission);
  };

  // Show loading while permissions are being fetched
  if (permissionsLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-card rounded-xl shadow-2xl p-8 max-w-md mx-4 flex flex-col items-center"
          onClick={e => e.stopPropagation()}
        >
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Verificando permisos...</p>
        </motion.div>
      </motion.div>
    );
  }

  if (!canManageUsers && !isMaster()) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-card rounded-xl shadow-2xl p-8 max-w-md mx-4"
          onClick={e => e.stopPropagation()}
        >
          <Shield className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold text-center mb-2">Acceso denegado</h2>
          <p className="text-muted-foreground text-center mb-6">
            No tienes permisos para acceder al panel de administración.
          </p>
          <Button onClick={onClose} className="w-full">Cerrar</Button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-card rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Panel de Administración</h2>
              <p className="text-sm text-muted-foreground">Gestiona usuarios, roles y permisos</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <Tabs defaultValue="users" className="flex-1 flex flex-col overflow-hidden min-h-0">
          <TabsList className="mx-4 mt-4 w-fit">
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" />
              Usuarios
            </TabsTrigger>
            {isMaster() && (
              <>
                <TabsTrigger value="druids" className="gap-2">
                  <Leaf className="w-4 h-4" />
                  Druidas
                </TabsTrigger>
                <TabsTrigger value="curators" className="gap-2">
                  <MapPin className="w-4 h-4" />
                  Curadores
                </TabsTrigger>
                <TabsTrigger value="permissions" className="gap-2">
                  <Settings className="w-4 h-4" />
                  Permisos por Rol
                </TabsTrigger>
                <TabsTrigger value="achievements" className="gap-2">
                  <Trophy className="w-4 h-4" />
                  Logros
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="flex-1 overflow-hidden min-h-0 flex flex-col m-0 p-4">
            {/* Search */}
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuarios..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Users List */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No se encontraron usuarios
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map(user => (
                    <div
                      key={user.id}
                      className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-medium text-primary">
                            {(user.display_name || user.username).charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {user.display_name || user.username}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          @{user.username}
                        </div>
                      </div>

                      {/* Roles */}
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {ALL_ROLES.filter(r => r !== 'user').map(role => {
                          const hasRole = user.roles.includes(role);
                          const isSaving = savingRole === `${user.id}-${role}`;
                          
                          return (
                            <button
                              key={role}
                              onClick={() => toggleUserRole(user.id, role, hasRole)}
                              disabled={isSaving}
                              className={`
                                px-3 py-1 rounded-full text-xs font-medium transition-all
                                ${hasRole 
                                  ? `${ROLE_COLORS[role]} text-white` 
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }
                                ${isSaving ? 'opacity-50' : ''}
                              `}
                            >
                              {isSaving ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                ROLE_LABELS[role]
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Purge button */}
                      {isMaster() && user.id !== currentUserId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handlePurgePreview(user); }}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                          title="Limpiar usuario (eliminar todos sus puntos)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Druids Tab */}
          {isMaster() && (
            <TabsContent value="druids" className="flex-1 overflow-hidden min-h-0 flex flex-col m-0 p-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground flex-1">
                  Los druidas generan puntos automáticamente desde fuentes externas (OpenStreetMap).
                </p>
                <Button
                  size="sm"
                  onClick={() => setAddingDruid(true)}
                  className="gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Nuevo Druida
                </Button>
              </div>

              {/* Create Druid Form */}
              <AnimatePresence>
                {addingDruid && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 p-4 bg-muted/50 rounded-lg border overflow-hidden"
                  >
                    <h4 className="font-medium mb-3">Crear nuevo druida</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-sm text-muted-foreground mb-1 block">Nombre *</label>
                        <Input
                          placeholder="Ej: Monasterios de España"
                          value={newDruidName}
                          onChange={e => setNewDruidName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground mb-1 block">Categoría</label>
                        <Input
                          placeholder="Ej: Religioso, Histórico..."
                          value={newDruidCategory}
                          onChange={e => setNewDruidCategory(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground mb-1 block">Query Overpass</label>
                        <Input
                          placeholder="Ej: amenity=monastery"
                          value={newDruidQuery}
                          onChange={e => setNewDruidQuery(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAddingDruid(false);
                          setNewDruidName('');
                          setNewDruidCategory('');
                          setNewDruidQuery('');
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!newDruidName.trim()) {
                            toast.error('El nombre es requerido');
                            return;
                          }
                          try {
                            const { error } = await supabase
                              .from('druids')
                              .insert({
                                name: newDruidName.trim(),
                                category: newDruidCategory.trim() || null,
                                overpass_query: newDruidQuery.trim() || null,
                              });
                            if (error) throw error;
                            toast.success('Druida creado');
                            setAddingDruid(false);
                            setNewDruidName('');
                            setNewDruidCategory('');
                            setNewDruidQuery('');
                            fetchData();
                          } catch (error: any) {
                            console.error('Error creating druid:', error);
                            toast.error('Error al crear druida');
                          }
                        }}
                        disabled={!newDruidName.trim()}
                      >
                        Crear Druida
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : druids.length === 0 ? (
                  <div className="text-center py-12">
                    <Leaf className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground mb-4">No hay druidas creados</p>
                    <Button
                      variant="outline"
                      onClick={() => setAddingDruid(true)}
                      className="gap-2"
                    >
                      <UserPlus className="w-4 h-4" />
                      Crear primer druida
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {druids.map(druid => (
                      <div
                        key={druid.id}
                        className="p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          {/* Avatar */}
                          <div 
                            className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden"
                            style={{ 
                              backgroundColor: `${druid.color}20`
                            }}
                          >
                            {druid.avatar_url ? (
                              <img src={druid.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : druid.icon ? (
                              <span className="text-xl">{druid.icon}</span>
                            ) : (
                              <Leaf 
                                className="w-6 h-6" 
                                style={{ color: druid.color }}
                              />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {druid.name}
                              </span>
                              <Badge 
                                style={{ backgroundColor: druid.color }}
                                className="text-white text-xs"
                              >
                                Druida
                              </Badge>
                              {!druid.is_active && (
                                <Badge variant="secondary" className="text-xs">
                                  Inactivo
                                </Badge>
                              )}
                            </div>
                            {druid.category && (
                              <div className="text-sm text-muted-foreground truncate">
                                {druid.category}
                              </div>
                            )}
                            {druid.overpass_query && (
                              <div className="text-xs text-muted-foreground/70 mt-1 font-mono">
                                {druid.overpass_query}
                              </div>
                            )}
                            {druid.last_refresh_at && (
                              <div className="text-xs text-muted-foreground/50 mt-1">
                                Última actualización: {new Date(druid.last_refresh_at).toLocaleString()}
                              </div>
                            )}
                          </div>

                          {/* Stats */}
                          <div className="text-right">
                            <div className="text-2xl font-bold" style={{ color: druid.color }}>
                              {druid.locationCount}
                            </div>
                            <div className="text-xs text-muted-foreground">ubicaciones</div>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={runningDruidSearch === druid.id || !druid.search_center_lat}
                              onClick={async () => {
                                if (!druid.search_center_lat || !druid.search_center_lng) {
                                  toast.error('Configura el centro de búsqueda primero');
                                  return;
                                }
                                setRunningDruidSearch(druid.id);
                                try {
                                  const { data, error } = await supabase.functions.invoke('druid-search', {
                                    body: { druid_id: druid.id, force_refresh: true }
                                  });
                                  if (error) throw error;
                                  toast.success(`Búsqueda completada: ${data.totalLocationsInserted || 0} puntos`);
                                  fetchData();
                                } catch (err: any) {
                                  console.error('Druid search error:', err);
                                  toast.error('Error en la búsqueda');
                                } finally {
                                  setRunningDruidSearch(null);
                                }
                              }}
                              className="gap-1"
                              title={!druid.search_center_lat ? 'Configura el centro de búsqueda' : 'Ejecutar búsqueda'}
                            >
                              {runningDruidSearch === druid.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedDruidId(druid.id);
                                setDruidSettingsOpen(true);
                              }}
                              className="gap-2"
                            >
                              <ExternalLink className="w-4 h-4" />
                              Configurar
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          )}

          {/* Curators Tab */}
          {isMaster() && (
            <TabsContent value="curators" className="flex-1 overflow-hidden min-h-0 flex flex-col m-0 p-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground flex-1">
                  Los curadores son capas temáticas cuyos puntos son visibles para todos los usuarios.
                </p>
                <Button
                  size="sm"
                  onClick={() => setAddingUser(true)}
                  className="gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Nuevo Curador
                </Button>
              </div>

              {/* Create Curator Form */}
              <AnimatePresence>
                {addingUser && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 p-4 bg-muted/50 rounded-lg border overflow-hidden"
                  >
                    <h4 className="font-medium mb-3">Crear nuevo curador</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-sm text-muted-foreground mb-1 block">Nombre *</label>
                        <Input
                          placeholder="Ej: Áreas de autocaravanas"
                          value={newUserEmail}
                          onChange={e => setNewUserEmail(e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-sm text-muted-foreground mb-1 block">Categoría</label>
                        <Input
                          placeholder="Ej: Aparcamientos, Rutas, etc."
                          value={newUserRole as string}
                          onChange={e => setNewUserRole(e.target.value as any)}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAddingUser(false);
                          setNewUserEmail('');
                          setNewUserRole('user');
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!newUserEmail.trim()) {
                            toast.error('El nombre es requerido');
                            return;
                          }
                          try {
                            const { error } = await supabase
                              .from('curators')
                              .insert({
                                name: newUserEmail.trim(),
                                category: (newUserRole as string) !== 'user' ? (newUserRole as string) : null,
                              });
                            if (error) throw error;
                            toast.success('Curador creado');
                            setAddingUser(false);
                            setNewUserEmail('');
                            setNewUserRole('user');
                            fetchData();
                          } catch (error: any) {
                            console.error('Error creating curator:', error);
                            toast.error('Error al crear curador');
                          }
                        }}
                        disabled={!newUserEmail.trim()}
                      >
                        Crear Curador
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : curators.length === 0 ? (
                  <div className="text-center py-12">
                    <MapPin className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground mb-4">No hay curadores creados</p>
                    <Button
                      variant="outline"
                      onClick={() => setAddingUser(true)}
                      className="gap-2"
                    >
                      <UserPlus className="w-4 h-4" />
                      Crear primer curador
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {curators.map(curator => (
                      <div
                        key={curator.id}
                        className="p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          {/* Avatar */}
                          <div 
                            className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden"
                            style={{ 
                              backgroundColor: `${curator.color}20`
                            }}
                          >
                            {curator.avatar_url ? (
                              <img src={curator.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : curator.icon ? (
                              <span className="text-xl">{curator.icon}</span>
                            ) : (
                              <MapPin 
                                className="w-6 h-6" 
                                style={{ color: curator.color }}
                              />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {curator.name}
                              </span>
                              <Badge 
                                style={{ backgroundColor: curator.color }}
                                className="text-white text-xs"
                              >
                                Curador
                              </Badge>
                              {!curator.is_active && (
                                <Badge variant="secondary" className="text-xs">
                                  Inactivo
                                </Badge>
                              )}
                            </div>
                            {curator.category && (
                              <div className="text-sm text-muted-foreground truncate">
                                {curator.category}
                              </div>
                            )}
                            {curator.description && (
                              <div className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
                                {curator.description}
                              </div>
                            )}
                          </div>

                          {/* Stats */}
                          <div className="text-right">
                            <div className="text-2xl font-bold text-primary">
                              {curator.locationCount}
                            </div>
                            <div className="text-xs text-muted-foreground">ubicaciones</div>
                          </div>

                          {/* Actions */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedCuratorId(curator.id);
                              onClose();
                              // Emit event to filter map by curator
                              window.dispatchEvent(new CustomEvent('lovable:filter-by-curator', {
                                detail: { curatorId: curator.id, curatorName: curator.name }
                              }));
                              toast.success(`Mostrando puntos de ${curator.name}`);
                            }}
                            className="gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Gestionar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          )}

          {/* Permissions Tab */}
          {isMaster() && (
            <TabsContent value="permissions" className="flex-1 overflow-hidden min-h-0 m-0 p-4 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                <div className="space-y-4 pr-4">
                  {ALL_ROLES.filter(r => r !== 'user').map(role => {
                    const isExpanded = expandedRoles.has(role);
                    
                    return (
                      <div key={role} className="border rounded-lg overflow-hidden">
                        <button
                          onClick={() => {
                            setExpandedRoles(prev => {
                              const next = new Set(prev);
                              if (next.has(role)) {
                                next.delete(role);
                              } else {
                                next.add(role);
                              }
                              return next;
                            });
                          }}
                          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Badge className={`${ROLE_COLORS[role]} text-white`}>
                              {ROLE_LABELS[role]}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {rolePermissions.filter(rp => rp.role === role).length} permisos
                            </span>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          )}
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t overflow-hidden"
                            >
                              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {ALL_PERMISSIONS.map(permission => {
                                  const hasPerm = roleHasPermission(role, permission);
                                  const isSaving = savingRole === `${role}-${permission}`;
                                  
                                  return (
                                    <label
                                      key={permission}
                                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 cursor-pointer"
                                    >
                                      {isSaving ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Checkbox
                                          checked={hasPerm}
                                          onCheckedChange={() => togglePermission(role, permission, hasPerm)}
                                        />
                                      )}
                                      <span className="text-sm">
                                        {PERMISSION_LABELS[permission]}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          )}

          {/* Achievements Tab */}
          {isMaster() && (
            <TabsContent value="achievements" className="flex-1 overflow-hidden min-h-0 m-0 p-4 flex flex-col">
              <AchievementsManager />
            </TabsContent>
          )}
        </Tabs>
      </motion.div>

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar todos los roles?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto eliminará todos los roles de {userToDelete?.display_name || userToDelete?.username}.
              El usuario quedará como usuario básico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar roles
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación de limpieza de usuario */}
      <AlertDialog open={!!userToPurge} onOpenChange={() => {
        if (purgeStep !== 'executing') {
          setUserToPurge(null);
          setPurgeStep('idle');
          setPurgePreview(null);
          setPurgeProgress(0);
        }
      }}>
        <AlertDialogContent className="max-w-md z-[2100]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {purgeStep === 'executing' || purgeStep === 'done' ? '🗑️ Limpiando usuario...' : '⚠️ ¿Limpiar usuario?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {purgeStep === 'loading-preview' && (
                  <div className="flex items-center gap-2 py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    <span>Obteniendo datos del usuario...</span>
                  </div>
                )}

                {purgeStep === 'preview' && purgePreview && (
                  <>
                    <p>
                      Se eliminarán <strong>permanentemente</strong> todos los datos de{' '}
                      <strong>{purgePreview.targetUser}</strong>:
                    </p>
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1.5 text-sm">
                      {purgePreview.locations > 0 && (
                        <div className="flex justify-between">
                          <span>📍 Puntos/Ubicaciones</span>
                          <span className="font-bold text-destructive">{purgePreview.locations}</span>
                        </div>
                      )}
                      {purgePreview.documents > 0 && (
                        <div className="flex justify-between">
                          <span>📄 Documentos</span>
                          <span className="font-bold text-destructive">{purgePreview.documents}</span>
                        </div>
                      )}
                      {purgePreview.notes > 0 && (
                        <div className="flex justify-between">
                          <span>📝 Notas</span>
                          <span className="font-bold text-destructive">{purgePreview.notes}</span>
                        </div>
                      )}
                      {purgePreview.photos > 0 && (
                        <div className="flex justify-between">
                          <span>📷 Fotos</span>
                          <span className="font-bold text-destructive">{purgePreview.photos}</span>
                        </div>
                      )}
                      {purgePreview.achievements > 0 && (
                        <div className="flex justify-between">
                          <span>🏆 Logros</span>
                          <span className="font-bold text-destructive">{purgePreview.achievements}</span>
                        </div>
                      )}
                      {purgePreview.locations === 0 && purgePreview.documents === 0 && purgePreview.notes === 0 && purgePreview.photos === 0 && purgePreview.achievements === 0 && (
                        <p className="text-muted-foreground italic">Este usuario no tiene datos para eliminar.</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Esta acción no se puede deshacer.</p>
                  </>
                )}

                {(purgeStep === 'executing' || purgeStep === 'done') && (
                  <div className="space-y-3 py-2">
                    <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${purgeStep === 'done' ? 'bg-green-500' : 'bg-destructive'}`}
                        style={{ width: `${Math.min(purgeProgress, 100)}%` }}
                      />
                    </div>
                    <p className="text-center text-sm text-muted-foreground">
                      {purgeStep === 'done' ? '✅ Limpieza completada' : `Eliminando datos... ${Math.round(purgeProgress)}%`}
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {purgeStep === 'preview' && (
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handlePurgeExecute}
                disabled={!purgePreview || (purgePreview.locations === 0 && purgePreview.documents === 0 && purgePreview.notes === 0 && purgePreview.photos === 0 && purgePreview.achievements === 0)}
              >
                Sí, limpiar usuario
              </Button>
            </AlertDialogFooter>
          )}
          {purgeStep === 'loading-preview' && (
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {selectedDruidId && (
        <DruidSettings
          druidId={selectedDruidId}
          open={druidSettingsOpen}
          onOpenChange={(open) => {
            setDruidSettingsOpen(open);
            if (!open) setSelectedDruidId(null);
          }}
          onSave={fetchData}
        />
      )}
    </motion.div>
  );
}
