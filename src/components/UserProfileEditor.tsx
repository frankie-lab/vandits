import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  Camera, 
  User, 
  AtSign, 
  FileText, 
  Lock, 
  Unlock,
  Save,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth, UserProfile } from '@/hooks/use-auth';
import { useSocialStats } from '@/hooks/use-social-stats';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UserProfileEditorProps {
  onClose: () => void;
}

export function UserProfileEditor({ onClose }: UserProfileEditorProps) {
  const { profile, updateProfile, user, refreshProfile, loading: authLoading } = useAuth();
  const { stats, loading: statsLoading } = useSocialStats();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    display_name: '',
    username: '',
    bio: '',
    is_private: false,
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load profile data when component mounts or profile changes
  useEffect(() => {
    if (profile) {
      setFormData({
        display_name: profile.display_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
        is_private: profile.is_private || false,
      });
      setAvatarPreview(profile.avatar_url || null);
      setIsLoading(false);
    } else {
      // Try to refresh profile if not loaded
      refreshProfile?.();
    }
  }, [profile, refreshProfile]);

  const initials = formData.display_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || formData.username?.slice(0, 2).toUpperCase() || 'U';


  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecciona una imagen');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede superar 5MB');
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return profile?.avatar_url || null;

    setUploadingAvatar(true);
    try {
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatarFile, { upsert: true });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error('Error al subir la imagen');
        return profile?.avatar_url || null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      return `${publicUrl}?t=${Date.now()}`; // Add timestamp to bust cache
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Error al subir la imagen');
      return profile?.avatar_url || null;
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!formData.username.trim()) {
      toast.error('El nombre de usuario es obligatorio');
      return;
    }

    setSaving(true);
    try {
      // Upload avatar if changed
      let avatar_url: string | null | undefined = profile?.avatar_url;
      if (avatarFile) {
        const uploadedUrl = await uploadAvatar();
        if (uploadedUrl) {
          avatar_url = uploadedUrl;
        }
      }

      // Update profile - always include avatar_url if we have a new file
      const updates: Partial<UserProfile> = {
        display_name: formData.display_name.trim() || null,
        username: formData.username.trim(),
        bio: formData.bio.trim() || null,
        is_private: formData.is_private,
      };

      // Always include avatar_url if we uploaded a new file
      if (avatarFile && avatar_url) {
        updates.avatar_url = avatar_url;
      }

      const { error } = await updateProfile(updates);
      
      if (!error) {
        onClose();
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Error al guardar el perfil');
    } finally {
      setSaving(false);
    }
  };

  // Show loading state while profile data is being fetched
  if (authLoading || (isLoading && !profile)) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1002] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-background rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando perfil...</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-[1002] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 20 }}
        animate={{ y: 0 }}
        className="bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 pb-16">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute top-3 right-3 rounded-full bg-background/80 hover:bg-background"
          >
            <X className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold">Editar perfil</h2>
        </div>

        {/* Avatar - Overlapping header */}
        <div className="relative -mt-12 flex justify-center">
          <div 
            className="relative cursor-pointer group"
            onClick={handleAvatarClick}
          >
            <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
              <AvatarImage src={avatarPreview || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-blue-500 text-white text-2xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingAvatar ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-white" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-5">
          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="display_name" className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-muted-foreground" />
              Nombre para mostrar
            </Label>
            <Input
              id="display_name"
              value={formData.display_name}
              onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
              placeholder="Tu nombre"
              className="h-11"
            />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username" className="flex items-center gap-2 text-sm">
              <AtSign className="w-4 h-4 text-muted-foreground" />
              Nombre de usuario
            </Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
              }))}
              placeholder="usuario"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Solo letras minúsculas, números y guiones bajos
            </p>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio" className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Biografía
            </Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              placeholder="Cuéntanos algo sobre ti..."
              className="min-h-[80px] resize-none"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground text-right">
              {formData.bio.length}/200
            </p>
          </div>

          {/* Privacy Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              {formData.is_private ? (
                <Lock className="w-5 h-5 text-amber-500" />
              ) : (
                <Unlock className="w-5 h-5 text-green-500" />
              )}
              <div>
                <p className="font-medium text-sm">
                  {formData.is_private ? 'Cuenta privada' : 'Cuenta pública'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formData.is_private 
                    ? 'Solo seguidores aprobados pueden ver tus puntos'
                    : 'Cualquiera puede ver tus puntos públicos'
                  }
                </p>
              </div>
            </div>
            <Switch
              checked={formData.is_private}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_private: checked }))}
            />
          </div>

          {/* Stats preview */}
          <div className="flex items-center justify-center gap-8 pt-2 text-center">
            <div>
              <p className="text-2xl font-bold text-primary">
                {statsLoading ? '-' : stats.myLocationsCount}
              </p>
              <p className="text-xs text-muted-foreground">Puntos</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <p className="text-2xl font-bold">
                {statsLoading ? '-' : stats.followersCount}
              </p>
              <p className="text-xs text-muted-foreground">Seguidores</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <p className="text-2xl font-bold">
                {statsLoading ? '-' : stats.followingCount}
              </p>
              <p className="text-xs text-muted-foreground">Siguiendo</p>
            </div>
          </div>

          {/* Save Button */}
          <Button 
            onClick={handleSave} 
            disabled={saving || uploadingAvatar}
            className="w-full h-11 gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Guardar cambios
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}