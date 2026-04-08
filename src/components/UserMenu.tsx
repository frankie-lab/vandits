import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
 User, 
 Settings, 
 LogOut, 
 UserCircle, 
 Users, 
 Bell,
 Lock,
 Unlock,
 Volume2,
 VolumeX,
 Sparkles,
 Copy,
 FileUp,
 Download,
 Trash2,
 RotateCcw,
 MapPin,
 SlidersHorizontal,
 ChevronRight,
 Shield,
 AlertCircle,
 Wand2,
 Target,
 Compass,
 Star,
 Flag,
 Heart,
 Mountain,
 TreePine,
 Waves,
 Sun,
 Leaf,
 Flower2,
 Shell,
 Bird,
 Building,
 Landmark,
 Church,
 Castle,
 Home,
 Anchor,
 Camera,
 Palette,
 Music,
 BookOpen,
 Gem,
 Crown,
 UtensilsCrossed,
 Wine,
 Coffee,
 Fish,
 Car,
 Fuel,
 Plane,
 Ship,
 Train,
 Footprints,
 Tent,
 Route as RouteIcon,
  Ruler,
 type LucideIcon,
} from 'lucide-react';

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
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuLabel,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
 DropdownMenuSub,
 DropdownMenuSubTrigger,
 DropdownMenuSubContent,
 DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';
import { useLocationsStore } from '@/store/locations-store';
import { usePermissions } from '@/hooks/use-permissions';
import { useSoundPreferences } from '@/hooks/use-sound-preferences';
import { useExportTracking } from '@/hooks/use-export-tracking';
import { supabase } from '@/integrations/supabase/client';
import { CuratorEnrichmentSettings } from '@/components/CuratorEnrichmentSettings';

interface UserMenuProps {
 onOpenProfile?: (tab?: string) => void;
 onOpenFollowers?: () => void;
 onOpenSettings?: () => void;
 onOpenAdmin?: (tab?: string) => void;
 onOpenUsers?: () => void;
 onOpenSoundSettings?: () => void;
  // New props for settings menu
 onToggleBatchEnrich?: () => void;
 onToggleDuplicates?: () => void;
 onOpenTrash?: () => void;
 onUploadClick?: () => void;
 onToggleExport?: () => void;
  onToggleCriteriaConfig?: () => void;
  onOpenRouteSettings?: () => void;
   // Curator mode props
  curatorMode?: boolean;
  curatorId?: string;
  curatorColor?: string;
  curatorIcon?: string;
  curatorAvatar?: string | null;
  curatorName?: string;
  curatorCategory?: string | null;
  onExitCuratorMode?: () => void;
}

export function UserMenu({ 
 onOpenProfile, 
 onOpenFollowers, 
 onOpenSettings,
 onOpenAdmin,
 onOpenUsers,
 onOpenSoundSettings,
 onToggleBatchEnrich,
 onToggleDuplicates,
 onOpenTrash,
 onUploadClick,
 onToggleExport,
  onToggleCriteriaConfig,
  onOpenRouteSettings,
 curatorMode,
 curatorId,
 curatorColor,
 curatorIcon,
 curatorAvatar,
 curatorName,
 curatorCategory,
 onExitCuratorMode,
}: UserMenuProps) {
 const [showCuratorSettings, setShowCuratorSettings] = useState(false);
 const { user, profile, signOut, loading } = useAuth();
 const navigate = useNavigate();
 const { globalEnabled: soundsOn, toggleGlobal: toggleSounds } = useSoundPreferences();
 const { hasPermission, isAdmin, isMaster } = usePermissions();
 
 const selectedDocument = useLocationsStore(state => state.selectedDocument);
 const removeDocument = useLocationsStore(state => state.removeDocument);
 const clearAllDocuments = useLocationsStore(state => state.clearAllDocuments);
 const getEnrichedStats = useLocationsStore(state => state.getEnrichedStats);
 const pendingDuplicatesCount = useLocationsStore(state => state.pendingDuplicates.length);
 const [trashCount, setTrashCount] = useState(0);
 
 const stats = getEnrichedStats();
 
  // Fetch trash count
 const fetchTrashCount = useCallback(async () => {
 if (!user) {
 setTrashCount(0);
 return;
 }
 
 const thirtyDaysAgo = new Date();
 thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
 
 const { count, error } = await supabase
 .from('locations')
 .select('*', { count: 'exact', head: true })
 .not('deleted_at', 'is', null)
 .gte('deleted_at', thirtyDaysAgo.toISOString());
 
 if (!error && count !== null) {
 setTrashCount(count);
 }
 }, [user]);
 
 useEffect(() => {
 fetchTrashCount();
 }, [fetchTrashCount]);
 
  // Listen for trash updates
 useEffect(() => {
 const handleTrashUpdate = () => {
 fetchTrashCount();
 };
 
 window.addEventListener('trash-updated', handleTrashUpdate);
 return () => window.removeEventListener('trash-updated', handleTrashUpdate);
 }, [fetchTrashCount]);
 
 const { modifiedCount, formatLastExportTime, lastExport } = useExportTracking();
 
  // Check if user can access admin features
 const canAccessAdmin = hasPermission('manage_users') || isAdmin() || isMaster();
 const canManageCriteria = hasPermission('manage_criteria') || isAdmin() || isMaster();
 const canRunEnrichment = hasPermission('run_global_enrichment') || isAdmin() || isMaster();
 
 const handleToggleSounds = (e: React.MouseEvent) => {
 e.preventDefault();
 e.stopPropagation();
 toggleSounds();
 };

 if (loading) {
 return (
 <div className="w-14 h-14 rounded-full bg-muted animate-pulse" />
 );
 }

 if (!user) {
 return (
 <Button
 variant="ghost"
 size="sm"
 onClick={() => navigate('/auth')}
 className="gap-2"
 >
 <User className="w-4 h-4" />
 Entrar
 </Button>
 );
 }

 const initials = profile?.display_name
 ?.split('')
 .map(n => n[0])
 .join('')
 .toUpperCase()
 .slice(0, 2) || profile?.username?.slice(0, 2).toUpperCase() || 'U';

 return (
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button variant="ghost" size="icon" className="relative h-14 w-14 rounded-full p-0">
 {curatorMode ? (
 <div 
 className="h-14 w-14 rounded-full flex items-center justify-center border-[3px] shadow-lg"
 style={{ 
 borderColor: curatorColor || '#14b8a6',
 backgroundColor: `${curatorColor || '#14b8a6'}20`
 }}
 >
 {(() => {
 const IconComponent = CURATOR_ICON_MAP[curatorIcon || 'map-pin'] || MapPin;
 return <IconComponent className="w-7 h-7" style={{ color: curatorColor || '#14b8a6' }} />;
 })()}
 </div>
 ) : (
 <Avatar className="h-14 w-14 border-[3px] border-primary/30 shadow-lg">
 <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.display_name || 'Usuario'} />
 <AvatarFallback className="bg-gradient-to-br from-primary to-blue-500 text-white text-lg font-semibold">
 {initials}
 </AvatarFallback>
 </Avatar>
 )}
 {/* Online indicator */}
 <span 
 className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 border-2 border-background rounded-full"
 style={{ backgroundColor: curatorMode ? (curatorColor || '#14b8a6') : '#22c55e' }}
 />
 </Button>
 </DropdownMenuTrigger>
 
 <DropdownMenuContent align="end" className="w-72 z-[1001]">
 {curatorMode ? (
          // CURATOR MODE MENU
 <>
 <DropdownMenuLabel className="font-normal">
 <div className="flex items-center gap-3">
 {curatorAvatar ? (
 <Avatar className="h-10 w-10" style={{ borderColor: curatorColor }}>
 <AvatarImage src={curatorAvatar} />
 <AvatarFallback style={{ backgroundColor: curatorColor }}>
 {curatorIcon || ''}
 </AvatarFallback>
 </Avatar>
 ) : (
 <div 
 className="h-10 w-10 rounded-full flex items-center justify-center"
 style={{ backgroundColor: `${curatorColor}30` }}
 >
 <span className="text-lg">{curatorIcon || ''}</span>
 </div>
 )}
 <div className="flex flex-col flex-1 min-w-0">
 <p className="text-sm font-medium truncate" style={{ color: curatorColor }}>
 {curatorName || 'Curador'}
 </p>
 <p className="text-xs text-muted-foreground truncate">
 {curatorCategory || 'Modo curador activo'}
 </p>
 </div>
 <Badge 
 className="text-[10px] px-1.5"
 style={{ backgroundColor: `${curatorColor}20`, color: curatorColor, border: 'none' }}
 >
 Curador
 </Badge>
 </div>
 </DropdownMenuLabel>
 
 <DropdownMenuSeparator />
 
 <DropdownMenuItem onClick={onUploadClick} className="cursor-pointer">
 <FileUp className="w-4 h-4 mr-2" style={{ color: curatorColor }} />
 Subir puntos al curador
 </DropdownMenuItem>
 
 <DropdownMenuItem onClick={onToggleBatchEnrich} className="cursor-pointer">
 <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
 <div className="flex flex-col flex-1">
 <span>Enriquecer puntos</span>
 <span className="text-xs text-muted-foreground">
 {stats.byCriteria.current} actualizadas / {stats.total} total
 </span>
 </div>
 </DropdownMenuItem>
 
 <DropdownMenuItem onClick={() => setShowCuratorSettings(true)} className="cursor-pointer">
 <Wand2 className="w-4 h-4 mr-2 text-purple-500" />
 Configurar enriquecimiento
 </DropdownMenuItem>
 
 <DropdownMenuItem onClick={onToggleDuplicates} className="cursor-pointer">
 <Copy className="w-4 h-4 mr-2 text-orange-500" />
 <span className="flex-1">Gestionar duplicados</span>
 {pendingDuplicatesCount > 0 && (
 <Badge variant="destructive" className="ml-2 text-xs animate-pulse">
 {pendingDuplicatesCount}
 </Badge>
 )}
 </DropdownMenuItem>
 
 <DropdownMenuItem onClick={onToggleExport} className="cursor-pointer">
 <Download className="w-4 h-4 mr-2 text-green-500" />
 Exportar puntos del curador
 </DropdownMenuItem>
 
 <DropdownMenuItem onClick={onOpenTrash} className="cursor-pointer">
 <Trash2 className="w-4 h-4 mr-2 text-muted-foreground" />
 <span className="flex-1">Papelera</span>
 {trashCount > 0 && (
 <Badge variant="secondary" className="ml-2 text-xs bg-red-100 text-red-700">
 {trashCount}
 </Badge>
 )}
 </DropdownMenuItem>
 
 <DropdownMenuSeparator />
 
 <DropdownMenuItem 
 onClick={onExitCuratorMode} 
 className="cursor-pointer"
 style={{ color: curatorColor }}
 >
 <LogOut className="w-4 h-4 mr-2" />
 Salir del modo curador
 </DropdownMenuItem>
 </>
 ) : (
          // NORMAL USER MENU
 <>
 <DropdownMenuLabel className="font-normal">
 <div className="flex items-center gap-3">
 <Avatar className="h-10 w-10">
 <AvatarImage src={profile?.avatar_url || undefined} />
 <AvatarFallback className="bg-gradient-to-br from-primary to-blue-500 text-white">
 {initials}
 </AvatarFallback>
 </Avatar>
 <div className="flex flex-col flex-1 min-w-0">
 <p className="text-sm font-medium truncate">
 {profile?.display_name || 'Usuario'}
 </p>
 <p className="text-xs text-muted-foreground truncate">
 @{profile?.username}
 </p>
 </div>
 {profile?.is_private ? (
 <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
 ) : (
 <Unlock className="w-4 h-4 text-green-500 flex-shrink-0" />
 )}
 </div>
 </DropdownMenuLabel>
 
 <DropdownMenuSeparator />
 
 <DropdownMenuItem onClick={() => onOpenProfile?.('profile')} className="cursor-pointer">
 <UserCircle className="w-4 h-4 mr-2" />
 Perfil
 </DropdownMenuItem>
 
 <DropdownMenuItem onClick={() => onOpenProfile?.('travel')} className="cursor-pointer">
 <Compass className="w-4 h-4 mr-2" />
 Viaje
 </DropdownMenuItem>
 
 <DropdownMenuItem onClick={() => onOpenProfile?.('privacy')} className="cursor-pointer">
 <Shield className="w-4 h-4 mr-2" />
 Privacidad
 </DropdownMenuItem>
 
 <DropdownMenuItem onClick={() => onOpenProfile?.('map')} className="cursor-pointer">
 <MapPin className="w-4 h-4 mr-2" />
 Mapa
 </DropdownMenuItem>
 
 <DropdownMenuItem onClick={onOpenUsers} className="cursor-pointer">
 <Users className="w-4 h-4 mr-2" />
 <span className="flex-1">Explorar usuarios</span>
 </DropdownMenuItem>
 
  
  <DropdownMenuItem onClick={onOpenSoundSettings} className="cursor-pointer">
  {soundsOn ? (
  <Volume2 className="w-4 h-4 mr-2 text-primary" />
  ) : (
  <VolumeX className="w-4 h-4 mr-2 text-muted-foreground" />
  )}
  <span className="flex-1">Notificaciones</span>
  {soundsOn && (
  <span className="w-2 h-2 rounded-full bg-primary ml-2" />
  )}
  </DropdownMenuItem>
 
  <DropdownMenuSeparator />

  <DropdownMenuItem onClick={onUploadClick} className="cursor-pointer">
  <FileUp className="w-4 h-4 mr-2 text-blue-500" />
  Subir archivo KML
  </DropdownMenuItem>

  <DropdownMenuItem onClick={onToggleExport} className="cursor-pointer">
  <Download className="w-4 h-4 mr-2 text-green-500" />
  <div className="flex flex-col flex-1">
  <span>Exportar datos</span>
  {lastExport && (
  <span className="text-xs text-muted-foreground">
  Última: {formatLastExportTime()}
  </span>
  )}
  </div>
  {modifiedCount > 0 && (
  <Badge variant="secondary" className="ml-2 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
  <AlertCircle className="w-3 h-3 mr-1" />
  {modifiedCount}
  </Badge>
  )}
  </DropdownMenuItem>

  <DropdownMenuItem onClick={onToggleDuplicates} className="cursor-pointer">
  <Copy className="w-4 h-4 mr-2 text-orange-500" />
  <span className="flex-1">Gestionar duplicados</span>
  {pendingDuplicatesCount > 0 && (
  <Badge variant="destructive" className="ml-2 text-xs animate-pulse">
  {pendingDuplicatesCount}
  </Badge>
  )}
  </DropdownMenuItem>

  <DropdownMenuItem onClick={onOpenTrash} className="cursor-pointer">
  <Trash2 className="w-4 h-4 mr-2 text-muted-foreground" />
  <span className="flex-1">Papelera</span>
  {trashCount > 0 && (
  <Badge variant="secondary" className="ml-2 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
  {trashCount}
  </Badge>
  )}
  </DropdownMenuItem>


  {selectedDocument && (
  <>
  <DropdownMenuSeparator />
  <AlertDialog>
  <AlertDialogTrigger asChild>
  <DropdownMenuItem 
  onSelect={(e) => e.preventDefault()}
  className="cursor-pointer text-amber-600 focus:text-amber-600"
  >
  <Trash2 className="w-4 h-4 mr-2" />
  Eliminar "{selectedDocument.name?.slice(0, 15) || 'documento'}..."
  </DropdownMenuItem>
  </AlertDialogTrigger>
  <AlertDialogContent className="z-[2001]">
  <AlertDialogHeader>
  <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
  <AlertDialogDescription>
  Se eliminarán todas las ubicaciones de este documento.
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

  {/* Back Office - only visible to admin/master, separated before logout */}
  {canAccessAdmin && (
  <>
  <DropdownMenuSeparator />
  <DropdownMenuSub>
  <DropdownMenuSubTrigger className="cursor-pointer">
  <Shield className="w-4 h-4 mr-2 text-purple-500" />
  <span className="flex-1">Back Office</span>
  <Badge variant="secondary" className="ml-2 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
  Admin
  </Badge>
  </DropdownMenuSubTrigger>
  <DropdownMenuPortal>
  <DropdownMenuSubContent className="w-64 z-[1002]">
  
  <DropdownMenuItem onClick={() => onOpenAdmin?.('users')} className="cursor-pointer">
  <Users className="w-4 h-4 mr-2 text-purple-500" />
  Gestión de usuarios
  </DropdownMenuItem>

  {isMaster() && (
  <>
  <DropdownMenuItem onClick={() => onOpenAdmin?.('curators')} className="cursor-pointer">
  <MapPin className="w-4 h-4 mr-2 text-teal-500" />
  Gestión de curadores
  </DropdownMenuItem>

  <DropdownMenuItem onClick={() => onOpenAdmin?.('druids')} className="cursor-pointer">
  <Sparkles className="w-4 h-4 mr-2 text-green-500" />
  Gestión de druidas
  </DropdownMenuItem>

  <DropdownMenuItem onClick={() => onOpenAdmin?.('permissions')} className="cursor-pointer">
  <SlidersHorizontal className="w-4 h-4 mr-2 text-blue-500" />
  Permisos por rol
  </DropdownMenuItem>


               <DropdownMenuItem onClick={() => onOpenAdmin?.('markers')} className="cursor-pointer">
               <Ruler className="w-4 h-4 mr-2 text-orange-500" />
               Tamaños de marcadores
               </DropdownMenuItem>

               <DropdownMenuItem onClick={() => onOpenAdmin?.('routes')} className="cursor-pointer">
               <RouteIcon className="w-4 h-4 mr-2 text-primary" />
               Motor de rutas
               </DropdownMenuItem>

               <DropdownMenuItem onClick={() => onOpenAdmin?.('icons')} className="cursor-pointer">
               <Settings className="w-4 h-4 mr-2 text-indigo-500" />
               Galería de iconos
               </DropdownMenuItem>
   </>
   )}

  <DropdownMenuSeparator />
  
  <DropdownMenuItem onClick={onToggleBatchEnrich} className="cursor-pointer">
  <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
  <div className="flex flex-col flex-1">
  <span>Enriquecimiento IA</span>
  <span className="text-xs text-muted-foreground">
  {stats.byCriteria.current} actualizadas / {stats.total} total
  </span>
  </div>
  </DropdownMenuItem>
  
  {canManageCriteria && (
  <DropdownMenuItem onClick={onToggleCriteriaConfig} className="cursor-pointer">
  <SlidersHorizontal className="w-4 h-4 mr-2 text-purple-500" />
  Criterios de actualización
  </DropdownMenuItem>
  )}
  
  </DropdownMenuSubContent>
  </DropdownMenuPortal>
  </DropdownMenuSub>
  </>
  )}
  
  <DropdownMenuSeparator />
  
  <DropdownMenuItem 
  onClick={signOut} 
  className="cursor-pointer text-destructive focus:text-destructive"
  >
  <LogOut className="w-4 h-4 mr-2" />
  Cerrar sesión
  </DropdownMenuItem>
 </>
 )}
 </DropdownMenuContent>
 
 {/* Curator Enrichment Settings Dialog */}
 {curatorMode && curatorId && (
 <CuratorEnrichmentSettings
 curatorId={curatorId}
 curatorName={curatorName || 'Curador'}
 open={showCuratorSettings}
 onOpenChange={setShowCuratorSettings}
 />
 )}
 </DropdownMenu>
 );
}