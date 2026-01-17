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
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';
import { areSoundsEnabled, setSoundsEnabled, playSuccessChime } from '@/lib/sounds';

interface UserMenuProps {
  onOpenProfile?: () => void;
  onOpenFollowers?: () => void;
  onOpenSettings?: () => void;
}

export function UserMenu({ onOpenProfile, onOpenFollowers, onOpenSettings }: UserMenuProps) {
  const { user, profile, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [soundsOn, setSoundsOn] = useState(areSoundsEnabled);
  
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
      <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
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
      
      <DropdownMenuContent align="end" className="w-64 z-[1001]">
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
        
        <DropdownMenuItem onClick={onOpenFollowers} className="cursor-pointer">
          <Users className="w-4 h-4 mr-2" />
          <span className="flex-1">Seguidores</span>
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
        
        <DropdownMenuItem onClick={onOpenSettings} className="cursor-pointer">
          <Settings className="w-4 h-4 mr-2" />
          Configuración
        </DropdownMenuItem>
        
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
