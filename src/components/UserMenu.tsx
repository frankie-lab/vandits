import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
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
import { areSoundsEnabled, setSoundsEnabled, playSuccessChime } from '@/lib/sounds';
import { useExportTracking } from '@/hooks/use-export-tracking';

interface UserMenuProps {
  onOpenProfile?: () => void;
  onOpenFollowers?: () => void;
  onOpenSettings?: () => void;
  onOpenAdmin?: () => void;
  onOpenUsers?: () => void;
  // New props for settings menu
  onToggleBatchEnrich?: () => void;
  onToggleDuplicates?: () => void;
  onUploadClick?: () => void;
  onToggleExport?: () => void;
  onToggleCriteriaConfig?: () => void;
}

export function UserMenu({ 
  onOpenProfile, 
  onOpenFollowers, 
  onOpenSettings,
  onOpenAdmin,
  onOpenUsers,
  onToggleBatchEnrich,
  onToggleDuplicates,
  onUploadClick,
  onToggleExport,
  onToggleCriteriaConfig,
}: UserMenuProps) {
  const { user, profile, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [soundsOn, setSoundsOn] = useState(areSoundsEnabled);
  const { hasPermission, isAdmin, isMaster } = usePermissions();
  
  const selectedDocument = useLocationsStore(state => state.selectedDocument);
  const removeDocument = useLocationsStore(state => state.removeDocument);
  const clearAllDocuments = useLocationsStore(state => state.clearAllDocuments);
  const getEnrichedStats = useLocationsStore(state => state.getEnrichedStats);
  const pendingDuplicatesCount = useLocationsStore(state => state.pendingDuplicates.length);
  
  const stats = getEnrichedStats();
  const { modifiedCount, formatLastExportTime, lastExport } = useExportTracking();
  
  // Check if user can access admin features
  const canAccessAdmin = hasPermission('manage_users') || isAdmin() || isMaster();
  const canManageCriteria = hasPermission('manage_criteria') || isAdmin() || isMaster();
  const canRunEnrichment = hasPermission('run_global_enrichment') || isAdmin() || isMaster();
  
  // Sync state if localStorage changes
  useEffect(() => {
    setSoundsOn(areSoundsEnabled());
  }, []);
  
  const handleToggleSounds = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newState = !soundsOn;
    setSoundsEnabled(newState);
    setSoundsOn(newState);
    // Play a test sound when enabling
    if (newState) {
      playSuccessChime();
    }
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
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || profile?.username?.slice(0, 2).toUpperCase() || 'U';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-14 w-14 rounded-full p-0">
          <Avatar className="h-14 w-14 border-[3px] border-primary/30 shadow-lg">
            <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.display_name || 'Usuario'} />
            <AvatarFallback className="bg-gradient-to-br from-primary to-blue-500 text-white text-lg font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {/* Online indicator */}
          <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-72 z-[1001]">
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
        
        <DropdownMenuItem onClick={onOpenProfile} className="cursor-pointer">
          <UserCircle className="w-4 h-4 mr-2" />
          Mi perfil
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={onOpenUsers} className="cursor-pointer">
          <Users className="w-4 h-4 mr-2" />
          <span className="flex-1">Explorar usuarios</span>
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={onOpenFollowers} className="cursor-pointer">
          <UserCircle className="w-4 h-4 mr-2" />
          <span className="flex-1">Mis seguidores</span>
          <Badge variant="secondary" className="ml-2 text-xs">
            Próximamente
          </Badge>
        </DropdownMenuItem>
        
        <DropdownMenuItem className="cursor-pointer">
          <Bell className="w-4 h-4 mr-2" />
          <span className="flex-1">Notificaciones</span>
          <Badge variant="secondary" className="ml-2 text-xs">
            0
          </Badge>
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={handleToggleSounds}
          className="cursor-pointer"
        >
          {soundsOn ? (
            <Volume2 className="w-4 h-4 mr-2 text-green-500" />
          ) : (
            <VolumeX className="w-4 h-4 mr-2 text-muted-foreground" />
          )}
          <span className="flex-1">Sonidos</span>
          <Switch 
            checked={soundsOn} 
            onCheckedChange={() => {}}
            className="ml-2 pointer-events-none"
          />
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        {/* Admin Panel - only visible to users with admin permissions */}
        {canAccessAdmin && (
          <DropdownMenuItem onClick={onOpenAdmin} className="cursor-pointer">
            <Shield className="w-4 h-4 mr-2 text-purple-500" />
            <span className="flex-1">Panel de administración</span>
            <Badge variant="secondary" className="ml-2 text-xs bg-purple-100 text-purple-700">
              Admin
            </Badge>
          </DropdownMenuItem>
        )}
        
        {/* Configuración submenu - contains all management options */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer">
            <Settings className="w-4 h-4 mr-2" />
            Configuración
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-64 z-[1002]">
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
                <span className="flex-1">Gestionar duplicados</span>
                {pendingDuplicatesCount > 0 && (
                  <Badge variant="destructive" className="ml-2 text-xs animate-pulse">
                    {pendingDuplicatesCount}
                  </Badge>
                )}
              </DropdownMenuItem>

              <DropdownMenuItem onClick={onToggleCriteriaConfig} className="cursor-pointer">
                <SlidersHorizontal className="w-4 h-4 mr-2 text-purple-500" />
                Criterios de actualización
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Datos</DropdownMenuLabel>
              
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

              {selectedDocument && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Documento actual</DropdownMenuLabel>
                  
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
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={signOut} 
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}