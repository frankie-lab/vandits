import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, Upload, Loader2, MapPin, Calendar, CheckCircle2, AlertTriangle } from 'lucide-react';
import exifr from 'exifr';

interface ExifData {
  latitude?: number;
  longitude?: number;
  dateTime?: Date;
  dateTimeOriginal?: Date;
  createDate?: Date;
}

interface LocationPhotoUploadProps {
  locationId: string;
  locationName: string;
  locationCoordinates: { lat: number; lng: number };
  isOpen: boolean;
  onClose: () => void;
  onPhotoUploaded: (imageUrl: string) => void;
  defaultVisibility?: string;
}

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function LocationPhotoUpload({
  locationId,
  locationName,
  locationCoordinates,
  isOpen,
  onClose,
  onPhotoUploaded,
  defaultVisibility = 'private'
}: LocationPhotoUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [uploading, setUploading] = useState(false);
  const [exifData, setExifData] = useState<ExifData | null>(null);
  const [extractingExif, setExtractingExif] = useState(false);
  const [gpsValidation, setGpsValidation] = useState<{
    isValid: boolean;
    distance?: number;
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract EXIF data when file is selected
  const extractExifData = async (file: File) => {
    setExtractingExif(true);
    try {
      const exif = await exifr.parse(file, {
        gps: true,
        exif: true,
        pick: ['latitude', 'longitude', 'DateTimeOriginal', 'CreateDate', 'DateTime', 'GPSLatitude', 'GPSLongitude']
      });

      if (exif) {
        const extractedData: ExifData = {
          latitude: exif.latitude,
          longitude: exif.longitude,
          dateTimeOriginal: exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal) : undefined,
          createDate: exif.CreateDate ? new Date(exif.CreateDate) : undefined,
          dateTime: exif.DateTime ? new Date(exif.DateTime) : undefined,
        };

        setExifData(extractedData);

        // Validate GPS if available
        if (extractedData.latitude && extractedData.longitude) {
          const distance = calculateDistance(
            locationCoordinates.lat,
            locationCoordinates.lng,
            extractedData.latitude,
            extractedData.longitude
          );

          const MAX_DISTANCE = 500; // 500 meters
          if (distance <= MAX_DISTANCE) {
            setGpsValidation({
              isValid: true,
              distance,
              message: `GPS válido (${Math.round(distance)}m del punto)`
            });
          } else {
            const distanceText = distance < 1000 
              ? `${Math.round(distance)}m` 
              : `${(distance / 1000).toFixed(1)}km`;
            setGpsValidation({
              isValid: false,
              distance,
              message: `La foto está a ${distanceText} del punto (máx. 500m)`
            });
          }
        } else {
          setGpsValidation({
            isValid: false,
            message: 'Sin datos GPS en la foto'
          });
        }
      } else {
        setExifData(null);
        setGpsValidation({
          isValid: false,
          message: 'Sin metadatos EXIF en la imagen'
        });
      }
    } catch (error) {
      console.error('Error extracting EXIF:', error);
      setExifData(null);
      setGpsValidation({
        isValid: false,
        message: 'Error al leer metadatos'
      });
    } finally {
      setExtractingExif(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Extract EXIF data
      await extractExifData(file);
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

      // Get the photo date (prefer DateTimeOriginal, then CreateDate, then DateTime)
      const photoDate = exifData?.dateTimeOriginal || exifData?.createDate || exifData?.dateTime;

      // Save to location_photos table with EXIF metadata
      const { error: dbError } = await supabase
        .from('location_photos')
        .insert({
          location_id: locationId,
          user_id: user.id,
          image_url: publicUrl,
          visibility,
          is_primary: true,
          caption: gpsValidation?.isValid 
            ? `Verificado GPS: ${Math.round(gpsValidation.distance || 0)}m` 
            : null
        });

      if (dbError) throw dbError;

      // Update location with user image
      const updateData: Record<string, any> = {
        user_image_url: publicUrl,
        user_image_visibility: visibility
      };

      // Fetch current custom_data to merge
      const { data: currentLocation } = await supabase
        .from('locations')
        .select('custom_data')
        .eq('id', locationId)
        .single();

      const currentCustomData = (currentLocation?.custom_data as Record<string, string>) || {};
      const updatedCustomData = { ...currentCustomData };

      // If GPS is valid, mark as visited and store verification data
      if (gpsValidation?.isValid && exifData?.latitude && exifData?.longitude) {
        updatedCustomData.visited = 'true';
        updatedCustomData.verified_visit_photo = 'true';
        updatedCustomData.visit_photo_distance_m = Math.round(gpsValidation.distance || 0).toString();
        
        if (photoDate) {
          const photoDateStr = photoDate.toISOString();
          
          // Check if this is the oldest geotagged photo
          const existingOldest = updatedCustomData.oldest_geotagged_photo_date;
          if (!existingOldest || new Date(photoDateStr) < new Date(existingOldest)) {
            updatedCustomData.oldest_geotagged_photo_date = photoDateStr;
          }
          
          // Also set visited_verified_at if not already set or if photo is older
          const existingVerified = updatedCustomData.visited_verified_at;
          if (!existingVerified || new Date(photoDateStr) < new Date(existingVerified)) {
            updatedCustomData.visited_verified_at = photoDateStr;
          }
        } else {
          // No photo date, use current time
          const now = new Date().toISOString();
          if (!updatedCustomData.visited_verified_at) {
            updatedCustomData.visited_verified_at = now;
          }
          if (!updatedCustomData.oldest_geotagged_photo_date) {
            updatedCustomData.oldest_geotagged_photo_date = now;
          }
        }
      }

      updateData.custom_data = updatedCustomData;

      const { error: locationError } = await supabase
        .from('locations')
        .update(updateData)
        .eq('id', locationId);

      if (locationError) throw locationError;

      // Show appropriate success message
      if (gpsValidation?.isValid) {
        const dateInfo = photoDate 
          ? ` (${photoDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })})` 
          : '';
        toast.success(`Foto verificada y visita registrada${dateInfo}`, {
          description: `GPS válido a ${Math.round(gpsValidation.distance || 0)}m del punto`
        });
      } else {
        toast.success('Foto subida correctamente');
      }

      onPhotoUploaded(publicUrl);
      
      // Dispatch event to refresh map
      window.dispatchEvent(new CustomEvent('store-updated'));
      
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
    setExifData(null);
    setGpsValidation(null);
    setVisibility(defaultVisibility);
    onClose();
  };

  // Get the best available date from EXIF
  const getPhotoDate = (): Date | null => {
    return exifData?.dateTimeOriginal || exifData?.createDate || exifData?.dateTime || null;
  };

  const photoDate = getPhotoDate();

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

          {/* EXIF Data Display */}
          {extractingExif && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analizando metadatos de la imagen...
            </div>
          )}

          {selectedFile && !extractingExif && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Datos EXIF detectados
              </p>
              
              {/* GPS Validation */}
              {gpsValidation && (
                <div className={`flex items-center gap-2 text-sm ${
                  gpsValidation.isValid 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {gpsValidation.isValid ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  {gpsValidation.message}
                </div>
              )}

              {/* Photo Date */}
              {photoDate && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  Fecha: {photoDate.toLocaleDateString('es-ES', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              )}

              {/* GPS Coordinates if available */}
              {exifData?.latitude && exifData?.longitude && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  GPS: {exifData.latitude.toFixed(6)}, {exifData.longitude.toFixed(6)}
                </div>
              )}

              {/* Auto-validation message */}
              {gpsValidation?.isValid && (
                <div className="mt-2 p-2 bg-green-100 dark:bg-green-900/30 rounded text-xs text-green-700 dark:text-green-300">
                  ✅ Esta foto <strong>validará automáticamente</strong> tu visita al punto.
                  {photoDate && (
                    <span className="block mt-1">
                      📅 Se registrará como visitado el {photoDate.toLocaleDateString('es-ES')}.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Visibility selector */}
          <div className="space-y-2">
            <Label>Visibilidad de la foto</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[2002]">
                <SelectItem value="private">Solo yo</SelectItem>
                <SelectItem value="followers">Mis seguidores</SelectItem>
                <SelectItem value="public">Pública</SelectItem>
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
          <Button onClick={handleUpload} disabled={!selectedFile || uploading || extractingExif}>
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {gpsValidation?.isValid ? 'Subir y verificar visita' : 'Subir foto'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
