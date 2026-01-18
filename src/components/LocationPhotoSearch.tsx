import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, Loader2, Check, Image as ImageIcon, RefreshCw, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WikimediaImage {
  title: string;
  url: string;
  thumbUrl: string;
  descriptionUrl: string;
  author?: string;
  license?: string;
}

interface LocationPhotoSearchProps {
  locationId: string;
  locationName: string;
  locationCoordinates: { lat: number; lng: number };
  isOpen: boolean;
  onClose: () => void;
  onPhotoSelected: (imageUrl: string, isDefaultImage: boolean) => void;
  isAdminMode: boolean;
}

export function LocationPhotoSearch({
  locationId,
  locationName,
  locationCoordinates,
  isOpen,
  onClose,
  onPhotoSelected,
  isAdminMode,
}: LocationPhotoSearchProps) {
  const [images, setImages] = useState<WikimediaImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<WikimediaImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Search Wikimedia Commons when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery(locationName);
      searchWikimedia(locationName);
    } else {
      setImages([]);
      setSelectedImage(null);
    }
  }, [isOpen, locationName]);

  const searchWikimedia = async (query: string) => {
    if (!query.trim()) return;
    
    setLoading(true);
    setImages([]);
    
    try {
      // Search Wikimedia Commons API
      const searchUrl = `https://commons.wikimedia.org/w/api.php?` +
        `action=query&format=json&origin=*` +
        `&generator=search&gsrnamespace=6&gsrlimit=20` +
        `&gsrsearch=${encodeURIComponent(query)}` +
        `&prop=imageinfo&iiprop=url|extmetadata|size` +
        `&iiurlwidth=400`;

      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.query?.pages) {
        const results: WikimediaImage[] = [];
        
        for (const page of Object.values(data.query.pages) as any[]) {
          if (page.imageinfo?.[0]) {
            const info = page.imageinfo[0];
            const meta = info.extmetadata || {};
            
            // Filter out non-photo content (logos, flags, maps, icons)
            const title = page.title?.toLowerCase() || '';
            const isPhoto = !title.includes('flag') && 
                           !title.includes('logo') && 
                           !title.includes('icon') &&
                           !title.includes('map') &&
                           !title.includes('coat of arms') &&
                           !title.includes('escudo') &&
                           !title.includes('bandera') &&
                           info.width > 200 && 
                           info.height > 150;
            
            if (isPhoto) {
              results.push({
                title: page.title?.replace('File:', '') || 'Sin título',
                url: info.url,
                thumbUrl: info.thumburl || info.url,
                descriptionUrl: info.descriptionurl,
                author: meta.Artist?.value?.replace(/<[^>]*>/g, '') || 'Desconocido',
                license: meta.LicenseShortName?.value || 'CC',
              });
            }
          }
        }
        
        setImages(results);
        
        if (results.length === 0) {
          toast.info('No se encontraron fotos para este lugar');
        }
      }
    } catch (error) {
      console.error('Error searching Wikimedia:', error);
      toast.error('Error al buscar imágenes');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchWikimedia(searchQuery);
  };

  const handleSelect = async () => {
    if (!selectedImage) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Debes iniciar sesión');
        return;
      }

      // Download image and upload to Supabase Storage
      const imageResponse = await fetch(selectedImage.url);
      const imageBlob = await imageResponse.blob();
      
      // Generate filename
      const ext = selectedImage.url.split('.').pop()?.split('?')[0] || 'jpg';
      const folder = isAdminMode ? 'default' : user.id;
      const fileName = `${folder}/${locationId}/${Date.now()}.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('location-photos')
        .upload(fileName, imageBlob, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('location-photos')
        .getPublicUrl(fileName);

      if (isAdminMode) {
        // Update enriched_data.imagen for the location (official image)
        const { data: location } = await supabase
          .from('locations')
          .select('enriched_data')
          .eq('id', locationId)
          .single();

        const enrichedData = (location?.enriched_data as Record<string, any>) || {};
        enrichedData.imagen = publicUrl;
        enrichedData.imagen_fuente = 'Wikimedia Commons';
        enrichedData.imagen_autor = selectedImage.author;

        const { error: updateError } = await supabase
          .from('locations')
          .update({
            enriched_data: enrichedData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', locationId);

        if (updateError) throw updateError;

        toast.success('Imagen oficial establecida', {
          description: 'Esta imagen será visible para todos los usuarios',
        });
      } else {
        // Update user_image_url for the user's view only
        const { error: updateError } = await supabase
          .from('locations')
          .update({
            user_image_url: publicUrl,
            user_image_visibility: 'private',
            updated_at: new Date().toISOString(),
          })
          .eq('id', locationId);

        if (updateError) throw updateError;

        // Also save to location_photos table
        await supabase
          .from('location_photos')
          .insert({
            location_id: locationId,
            user_id: user.id,
            image_url: publicUrl,
            visibility: 'private',
            is_primary: true,
            caption: `Wikimedia: ${selectedImage.author}`,
          });

        toast.success('Foto guardada', {
          description: 'Solo tú podrás ver esta imagen',
        });
      }

      onPhotoSelected(publicUrl, isAdminMode);
      
      // Dispatch event to refresh map
      window.dispatchEvent(new CustomEvent('store-updated'));
      
      onClose();
    } catch (error: any) {
      console.error('Error saving photo:', error);
      toast.error(`Error al guardar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] z-[2001]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            {isAdminMode ? 'Establecer imagen oficial' : 'Buscar fotos del lugar'}
            {isAdminMode && (
              <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-600 rounded-full ml-2">
                Admin
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search form */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en Wikimedia Commons..."
              className="flex-1"
            />
            <Button type="submit" disabled={loading} size="icon" variant="secondary">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
            <Button 
              type="button" 
              onClick={() => searchWikimedia(locationName)} 
              disabled={loading}
              size="icon"
              variant="outline"
              title="Reiniciar búsqueda"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </form>

          {/* Results grid */}
          <div className="min-h-[300px] max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <p className="text-sm">Buscando imágenes...</p>
              </div>
            ) : images.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <ImageIcon className="w-12 h-12 mb-2 opacity-30" />
                <p className="text-sm">No hay imágenes para mostrar</p>
                <p className="text-xs">Prueba con otra búsqueda</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(image)}
                    className={cn(
                      'relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all group',
                      selectedImage === image
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-transparent hover:border-primary/50'
                    )}
                  >
                    <img
                      src={image.thumbUrl}
                      alt={image.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {selectedImage === image && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Check className="w-8 h-8 text-primary bg-white rounded-full p-1" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[9px] text-white truncate">{image.title}</p>
                      <p className="text-[8px] text-white/70">{image.license} · {image.author}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected image info */}
          {selectedImage && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <img
                src={selectedImage.thumbUrl}
                alt={selectedImage.title}
                className="w-16 h-12 object-cover rounded"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedImage.title}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedImage.license} · {selectedImage.author}
                </p>
              </div>
              <a
                href={selectedImage.descriptionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}

          {/* Admin mode warning */}
          {isAdminMode && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-700 dark:text-amber-300">
              <strong>Modo Admin:</strong> La imagen seleccionada será la imagen oficial de esta ficha y será visible para todos los usuarios.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSelect} disabled={!selectedImage || saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                {isAdminMode ? 'Establecer imagen' : 'Usar esta foto'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
