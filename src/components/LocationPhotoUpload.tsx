import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, Upload, Loader2 } from 'lucide-react';

interface LocationPhotoUploadProps {
  locationId: string;
  locationName: string;
  isOpen: boolean;
  onClose: () => void;
  onPhotoUploaded: (imageUrl: string, visibility: string) => void;
  defaultVisibility?: string;
}

export function LocationPhotoUpload({
  locationId,
  locationName,
  isOpen,
  onClose,
  onPhotoUploaded,
  defaultVisibility = 'private'
}: LocationPhotoUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor selecciona una imagen');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('La imagen no puede superar 10MB');
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Debes iniciar sesión para subir fotos');
        return;
      }

      // Generate unique filename
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user.id}/${locationId}/${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('location-photos')
        .upload(fileName, selectedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('location-photos')
        .getPublicUrl(fileName);

      // Save to location_photos table
      const { error: dbError } = await supabase
        .from('location_photos')
        .insert({
          location_id: locationId,
          user_id: user.id,
          image_url: publicUrl,
          visibility,
          is_primary: true
        });

      if (dbError) throw dbError;

      // Update location with user image
      const { error: locationError } = await supabase
        .from('locations')
        .update({
          user_image_url: publicUrl,
          user_image_visibility: visibility
        })
        .eq('id', locationId);

      if (locationError) throw locationError;

      toast.success('Foto subida correctamente');
      onPhotoUploaded(publicUrl, visibility);
      handleClose();
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      toast.error(`Error al subir la foto: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setPreview(null);
    setVisibility(defaultVisibility);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md z-[2001]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Añadir foto a {locationName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File input area */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              preview ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {preview ? (
              <div className="space-y-2">
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-48 mx-auto rounded-lg object-cover"
                />
                <p className="text-sm text-muted-foreground">
                  Click para cambiar imagen
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click o arrastra una imagen aquí
                </p>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG o WEBP (máx. 10MB)
                </p>
              </div>
            )}
          </div>

          {/* Visibility selector */}
          <div className="space-y-2">
            <Label>Visibilidad de la foto</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[2002]">
                <SelectItem value="private">🔒 Solo yo</SelectItem>
                <SelectItem value="followers">👥 Mis seguidores</SelectItem>
                <SelectItem value="public">🌍 Pública</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {visibility === 'private' && 'Solo tú podrás ver esta foto'}
              {visibility === 'followers' && 'Tus seguidores podrán ver esta foto'}
              {visibility === 'public' && 'Cualquiera podrá ver esta foto'}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Subir foto
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
