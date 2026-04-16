import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Users, Settings, ChevronDown, ChevronRight, Check, Loader2, Search, UserPlus, Trash2, MapPin, ExternalLink, Route as RouteIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { MarkerSizeManager } from './MarkerSizeManager';
import { RouteSettingsPanelContent } from './RouteSettingsPanel';
import { IconLibraryManager } from './IconLibraryManager';
import { EnrichmentCardConfig } from '@/domains/content/components';
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

type AdminTab = 'users' | 'permissions' | 'markers' | 'routes' | 'icons' | 'enrichment';

interface AdminPanelProps {
 onClose: () => void;
 defaultTab?: AdminTab;
}

interface UserWithRoles {
 id: string;
 email: string;
 display_name: string | null;
 username: string;
 avatar_url: string | null;
 roles: AppRole[];
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

const ALL_ROLES: AppRole[] = ['master', 'admin', 'moderator', 'editor', 'supervisor', 'user'];
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

export function AdminPanel({ onClose, defaultTab }: AdminPanelProps) {
 const { isMaster, hasPermission, loading: permissionsLoading } = usePermissions();
 const [currentUserId, setCurrentUserId] = useState<string | null>(null);
 const [users, setUsers] = useState<UserWithRoles[]>([]);
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

 const canManageUsers = hasPermission('manage_users');

 const fetchData = useCallback(async () => {
 setLoading(true);
 try {
      const { data: profiles, error: profilesError } = await supabase
 .from('profiles')
 .select('id, username, display_name, avatar_url');

 if (profilesError) throw profilesError;

      const { data: userRoles, error: rolesError } = await supabase
 .from('user_roles')
 .select('user_id, role');

 if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRoles[] = (profiles || []).map(profile => ({
 id: profile.id,
 email: '',
 display_name: profile.display_name,
 username: profile.username,
 avatar_url: profile.avatar_url,
 roles: (userRoles || [])
 .filter(ur => ur.user_id === profile.id)
 .map(ur => ur.role as AppRole),
 }));

 setUsers(usersWithRoles);

      const { data: permissions, error: permError } = await supabase
 .from('role_permissions')
 .select('role, permission');

 if (permError) throw permError;

 setRolePermissions((permissions || []).map(p => ({
 role: p.role as AppRole,
 permission: p.permission as AppPermission,
 })));
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
 const isSelf = user.id === currentUserId;
 try {
 const response = await supabase.functions.invoke('purge-user', {
 body: { targetUserId: user.id, mode: 'preview', ...(isSelf ? { confirmSelf: true } : {}) },
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
 const isSelf = userToPurge.id === currentUserId;
 setPurgeStep('executing');
 setPurgeProgress(0);

 const progressInterval = setInterval(() => {
 setPurgeProgress(prev => {
 if (prev >= 90) return prev;
 return prev + Math.random() * 15;
 });
 }, 300);

 try {
 const response = await supabase.functions.invoke('purge-user', {
 body: { targetUserId: userToPurge.id, mode: 'execute', ...(isSelf ? { confirmSelf: true } : {}) },
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

 setTimeout(() => {
 setUserToPurge(null);
 setPurgeStep('idle');
 setPurgeProgress(0);
 setPurgePreview(null);
 onClose();
 window.dispatchEvent(new CustomEvent('reload-locations'));
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
 const { error } = await supabase
 .from('user_roles')
 .delete()
 .eq('user_id', userId)
 .eq('role', role);
 if (error) throw error;
 toast.success(`Rol ${ROLE_LABELS[role]} eliminado`);
 } else {
 const { error } = await supabase
 .from('user_roles')
 .insert({ user_id: userId, role });
 if (error) throw error;
 toast.success(`Rol ${ROLE_LABELS[role]} asignado`);
 }
 setUsers(prev => prev.map(u => {
 if (u.id !== userId) return u;
 return {
 ...u,
 roles: hasRole ? u.roles.filter(r => r !== role) : [...u.roles, role],
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
 const { error } = await supabase.from('role_permissions').delete().eq('role', role).eq('permission', permission);
 if (error) throw error;
 toast.success('Permiso eliminado');
 } else {
 const { error } = await supabase.from('role_permissions').insert({ role, permission });
 if (error) throw error;
 toast.success('Permiso añadido');
 }
 setRolePermissions(prev => {
 if (hasPermission) return prev.filter(rp => !(rp.role === role && rp.permission === permission));
 return [...prev, { role, permission }];
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

 if (permissionsLoading) {
 return (
 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50" onClick={onClose}>
 <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card rounded-xl shadow-2xl p-8 max-w-md mx-4 flex flex-col items-center" onClick={e => e.stopPropagation()}>
 <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
 <p className="text-muted-foreground">Verificando permisos...</p>
 </motion.div>
 </motion.div>
 );
 }

 if (!canManageUsers && !isMaster()) {
 return (
 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50" onClick={onClose}>
 <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-card rounded-xl shadow-2xl p-8 max-w-md mx-4" onClick={e => e.stopPropagation()}>
 <Shield className="w-16 h-16 text-destructive mx-auto mb-4" />
 <h2 className="text-xl font-bold text-center mb-2">Acceso denegado</h2>
 <p className="text-muted-foreground text-center mb-6">No tienes permisos para acceder al panel de administración.</p>
 <Button onClick={onClose} className="w-full">Cerrar</Button>
 </motion.div>
 </motion.div>
 );
 }

 return (
 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
  className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4"
  onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
  <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
  className="bg-card rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
  >
  <div className="flex items-center justify-between p-4 border-b">
  <div className="flex items-center gap-3">
  <div className="p-2 bg-primary/10 rounded-lg"><Shield className="w-5 h-5 text-primary" /></div>
  <div>
  <h2 className="text-lg font-bold">
  {{ users: 'Gestión de usuarios', permissions: 'Permisos por rol', markers: 'Tamaños de marcadores', routes: 'Motor de rutas', icons: 'Galería de iconos', enrichment: 'Configuración de fichas' }[defaultTab || 'users'] || 'Panel de Administración'}
  </h2>
  <p className="text-sm text-muted-foreground">Back Office</p>
  </div>
  </div>
  <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
  </div>

  <div className="flex-1 flex flex-col overflow-hidden min-h-0">

  {(defaultTab || 'users') === 'users' && (
  <div className="flex-1 overflow-hidden min-h-0 flex flex-col p-4">
 <div className="flex gap-2 mb-4">
 <div className="relative flex-1">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
 <Input placeholder="Buscar usuarios..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
 </div>
 </div>
 <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-8">
 {loading ? (
 <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
 ) : filteredUsers.length === 0 ? (
 <div className="text-center py-12 text-muted-foreground">No se encontraron usuarios</div>
 ) : (
 <div className="space-y-2">
 {filteredUsers.map(user => (
 <div key={user.id} className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
 <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
 {user.avatar_url ? (<img src={user.avatar_url} alt="" className="w-full h-full object-cover" />) : (<span className="text-sm font-medium text-primary">{(user.display_name || user.username).charAt(0).toUpperCase()}</span>)}
 </div>
 <div className="flex-1 min-w-0">
 <div className="font-medium truncate">{user.display_name || user.username}</div>
 <div className="text-sm text-muted-foreground truncate">@{user.username}</div>
 </div>
 <div className="flex items-center gap-2 flex-wrap justify-end">
 {ALL_ROLES.filter(r => r !== 'user').map(role => {
 const hasRole = user.roles.includes(role);
 const isSaving = savingRole === `${user.id}-${role}`;
 return (
 <button key={role} onClick={() => toggleUserRole(user.id, role, hasRole)} disabled={isSaving}
 className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${hasRole ? `${ROLE_COLORS[role]} text-white` : 'bg-muted text-muted-foreground hover:bg-muted/80'} ${isSaving ? 'opacity-50' : ''}`}>
 {isSaving ? (<Loader2 className="w-3 h-3 animate-spin" />) : (ROLE_LABELS[role])}
 </button>
 );
 })}
 </div>
 {isMaster() && (
 <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handlePurgePreview(user); }}
 className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0" title="Limpiar usuario">
 <Trash2 className="w-4 h-4" />
 </Button>
 )}
 </div>
 ))}
 </div>
 )}
 </div>
  </div>
  )}

  {isMaster() && defaultTab === 'permissions' && (
  <div className="flex-1 overflow-hidden min-h-0 flex flex-col p-4">
 <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-8">
 <div className="space-y-4 pr-4">
 {ALL_ROLES.filter(r => r !== 'user').map(role => {
 const isExpanded = expandedRoles.has(role);
 return (
 <div key={role} className="border rounded-lg overflow-hidden">
 <button onClick={() => { setExpandedRoles(prev => { const next = new Set(prev); if (next.has(role)) next.delete(role); else next.add(role); return next; }); }}
 className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
 <div className="flex items-center gap-3">
 <Badge className={`${ROLE_COLORS[role]} text-white`}>{ROLE_LABELS[role]}</Badge>
 <span className="text-sm text-muted-foreground">{rolePermissions.filter(rp => rp.role === role).length} permisos</span>
 </div>
 {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
 </button>
 <AnimatePresence>
 {isExpanded && (
 <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t overflow-hidden">
 <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
 {ALL_PERMISSIONS.map(permission => {
 const hasPerm = roleHasPermission(role, permission);
 const isSaving = savingRole === `${role}-${permission}`;
 return (
 <label key={permission} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 cursor-pointer">
 {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Checkbox checked={hasPerm} onCheckedChange={() => togglePermission(role, permission, hasPerm)} />}
 <span className="text-sm">{PERMISSION_LABELS[permission]}</span>
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
  </div>
  )}

  {isMaster() && defaultTab === 'markers' && (
  <div className="flex-1 overflow-hidden min-h-0 flex flex-col"><MarkerSizeManager /></div>
  )}

  {isMaster() && defaultTab === 'routes' && (
  <div className="flex-1 overflow-hidden min-h-0 flex flex-col"><RouteSettingsPanelContent /></div>
  )}

   {isMaster() && defaultTab === 'icons' && (
   <div className="flex-1 overflow-hidden min-h-0 flex flex-col"><IconLibraryManager /></div>
   )}

   {isMaster() && defaultTab === 'enrichment' && (
   <div className="flex-1 overflow-hidden min-h-0 flex flex-col"><EnrichmentCardConfig /></div>
   )}
   </div>
 </motion.div>

 {/* Confirmación de eliminación */}
 <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>¿Eliminar todos los roles?</AlertDialogTitle>
 <AlertDialogDescription>Esto eliminará todos los roles de {userToDelete?.display_name || userToDelete?.username}. El usuario quedará como usuario básico.</AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar roles</AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* Confirmación de limpieza de usuario */}
 <AlertDialog open={!!userToPurge} onOpenChange={() => { if (purgeStep !== 'executing') { setUserToPurge(null); setPurgeStep('idle'); setPurgePreview(null); setPurgeProgress(0); } }}>
 <AlertDialogContent className="max-w-md">
 <AlertDialogHeader>
 <AlertDialogTitle>{purgeStep === 'executing' || purgeStep === 'done' ? 'Limpiando usuario...' : '¿Limpiar usuario?'}</AlertDialogTitle>
 <AlertDialogDescription asChild>
 <div className="space-y-3">
 {purgeStep === 'loading-preview' && (
 <div className="flex items-center gap-2 py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /><span>Obteniendo datos del usuario...</span></div>
 )}
 {purgeStep === 'preview' && purgePreview && (
 <>
 {userToPurge?.id === currentUserId && (
 <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-600 dark:text-amber-400 font-medium">
 Estás a punto de limpiar <strong>tu propia cuenta</strong>. Se borrarán todos tus puntos, documentos, notas, fotos y logros.
 </div>
 )}
 <p>Se eliminarán <strong>permanentemente</strong> todos los datos de <strong>{purgePreview.targetUser}</strong>:</p>
 <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1.5 text-sm">
 {purgePreview.locations > 0 && (<div className="flex justify-between"><span>Puntos/Ubicaciones</span><span className="font-bold text-destructive">{purgePreview.locations}</span></div>)}
 {purgePreview.documents > 0 && (<div className="flex justify-between"><span>Documentos</span><span className="font-bold text-destructive">{purgePreview.documents}</span></div>)}
 {purgePreview.notes > 0 && (<div className="flex justify-between"><span>Notas</span><span className="font-bold text-destructive">{purgePreview.notes}</span></div>)}
 {purgePreview.photos > 0 && (<div className="flex justify-between"><span>Fotos</span><span className="font-bold text-destructive">{purgePreview.photos}</span></div>)}
 {purgePreview.achievements > 0 && (<div className="flex justify-between"><span>Logros</span><span className="font-bold text-destructive">{purgePreview.achievements}</span></div>)}
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
 <div className={`h-full rounded-full transition-all duration-300 ${purgeStep === 'done' ? 'bg-green-500' : 'bg-destructive'}`} style={{ width: `${Math.min(purgeProgress, 100)}%` }} />
 </div>
 <p className="text-center text-sm text-muted-foreground">{purgeStep === 'done' ? 'Limpieza completada' : `Eliminando datos... ${Math.round(purgeProgress)}%`}</p>
 </div>
 )}
 </div>
 </AlertDialogDescription>
 </AlertDialogHeader>
 {purgeStep === 'preview' && (
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <Button variant="destructive" onClick={handlePurgeExecute}
 disabled={!purgePreview || (purgePreview.locations === 0 && purgePreview.documents === 0 && purgePreview.notes === 0 && purgePreview.photos === 0 && purgePreview.achievements === 0)}>
 Sí, limpiar usuario
 </Button>
 </AlertDialogFooter>
 )}
 {purgeStep === 'loading-preview' && (<AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel></AlertDialogFooter>)}
 </AlertDialogContent>
 </AlertDialog>
  </motion.div>
  );
}
