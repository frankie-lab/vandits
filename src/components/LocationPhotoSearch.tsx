import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, Loader2, Check, Image as ImageIcon, RefreshCw, ExternalLink, Globe } from 'lucide-react';
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
  const [resultCount, setResultCount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery(locationName);
      setSelectedImage(null);
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
    setSelectedImage(null);

    try {
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
        setResultCount(results.length);
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
      if (!user) { toast.error('Debes iniciar sesión'); return; }

      const imageResponse = await fetch(selectedImage.url);
      const imageBlob = await imageResponse.blob();
      const ext = selectedImage.url.split('.').pop()?.split('?')[0] || 'jpg';
      const folder = isAdminMode ? 'default' : user.id;
      const fileName = `${folder}/${locationId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('location-photos')
        .upload(fileName, imageBlob, { cacheControl: '3600', upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('location-photos')
        .getPublicUrl(fileName);

      if (isAdminMode) {
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
          .update({ enriched_data: enrichedData, updated_at: new Date().toISOString() })
          .eq('id', locationId);
        if (updateError) throw updateError;
        toast.success('Imagen oficial establecida');
      } else {
        const { error: updateError } = await supabase
          .from('locations')
          .update({ user_image_url: publicUrl, user_image_visibility: 'private', updated_at: new Date().toISOString() })
          .eq('id', locationId);
        if (updateError) throw updateError;

        await supabase.from('location_photos').insert({
          location_id: locationId, user_id: user.id, image_url: publicUrl,
          visibility: 'private', is_primary: true, caption: `Wikimedia: ${selectedImage.author}`,
        });
        toast.success('Foto guardada');
      }

      onPhotoSelected(publicUrl, isAdminMode);
      window.dispatchEvent(new CustomEvent('photo-updated', {
        detail: { locationId, imageUrl: publicUrl, isDefaultImage: isAdminMode }
      }));
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
      <DialogContent className="sm:max-w-2xl max-h-[85vh] z-[2001] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Search className="w-4 h-4 text-muted-foreground" />
            {isAdminMode ? 'Establecer imagen oficial' : 'Buscar fotos del lugar'}
            {isAdminMode && (
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-600 rounded-full ml-1 font-medium">
                Admin
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en Wikimedia Commons..."
              className="flex-1 h-9 text-sm"
            />
            <Button type="submit" disabled={loading} size="icon" variant="secondary" className="h-9 w-9 shrink-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
            <Button
              type="button"
              onClick={() => { setSearchQuery(locationName); searchWikimedia(locationName); }}
              disabled={loading}
              size="icon" variant="outline"
              title="Reiniciar búsqueda"
              className="h-9 w-9 shrink-0"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </form>

          {/* Selected image preview — inline, above the grid */}
          {selectedImage && (
            <div className="flex gap-3 p-3 bg-muted/40 rounded-lg border border-primary/30 animate-in fade-in-0 slide-in-from-top-1 duration-200">
              <img
                src={selectedImage.url}
                alt={selectedImage.title}
                className="w-36 h-24 object-cover rounded-md shrink-0 bg-muted"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
              <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                <div className="space-y-1">
                  <h3 className="text-xs font-medium leading-snug line-clamp-2">{selectedImage.title}</h3>
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    <p className="truncate">
                      <span className="text-foreground/60">Autor:</span> {selectedImage.author}
                    </p>
                    <p>
                      <span className="text-foreground/60">Licencia:</span> {selectedImage.license}
                    </p>
                  </div>
                </div>
                <a
                  href={selectedImage.descriptionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline w-fit"
                >
                  Wikimedia Commons
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Source indicator */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Globe className="w-3 h-3" />
            <span>Fuente: <strong>Wikimedia Commons</strong></span>
            {!loading && images.length > 0 && (
              <span className="ml-auto">{resultCount} resultados</span>
            )}
          </div>

          {/* Results grid — always visible */}
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-xs">Buscando imágenes...</p>
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <ImageIcon className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-sm">No hay imágenes</p>
              <p className="text-xs">Prueba con otra búsqueda</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {images.map((image, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedImage(image)}
                  className={cn(
                    'relative rounded-lg overflow-hidden border-2 transition-all group text-left',
                    selectedImage === image
                      ? 'border-primary ring-1 ring-primary/30'
                      : 'border-transparent hover:border-primary/40'
                  )}
                >
                  <div className="aspect-[4/3] relative">
                    <img
                      src={image.thumbUrl}
                      alt={image.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                    {selectedImage === image && (
                      <div className="absolute top-1.5 right-1.5">
                        <Check className="w-5 h-5 text-primary bg-background rounded-full p-0.5 shadow" />
                      </div>
                    )}
                  </div>
                  <div className="px-1.5 py-1 bg-muted/80 border-t border-border">
                    <p className="text-[9px] text-foreground truncate leading-tight">{image.title}</p>
                    <p className="text-[8px] text-muted-foreground truncate">{image.license} · {image.author}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {isAdminMode && selectedImage && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-300">
              <strong>Admin:</strong> Esta imagen será la imagen oficial visible para todos.
            </div>
          )}
        </div>

        <DialogFooter className="px-5 pb-5 pt-3 border-t border-border shrink-0 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} size="sm">
            Cancelar
          </Button>
          <Button onClick={handleSelect} disabled={!selectedImage || saving} size="sm">
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5" />
                {isAdminMode ? 'Establecer imagen' : 'Usar esta foto'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
