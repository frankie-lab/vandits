import { useState, useEffect, useRef } from 'react';
import { HeroCropFrame, type HeroCropFrameHandle } from './HeroCropFrame';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, Loader2, Check, Image as ImageIcon, RefreshCw, ExternalLink, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchAllSources } from '@/shared/enrichment/image-search-providers';
import { filterAndRankPlacePhotos, type NormalizedImage } from '@/shared/enrichment/image-filters';

interface LocationPhotoSearchProps {
  locationId: string;
  locationName: string;
  locationCoordinates: { lat: number; lng: number };
  isOpen: boolean;
  onClose: () => void;
  onPhotoSelected: (imageUrl: string, isDefaultImage: boolean) => void;
  isAdminMode: boolean;
}

const DEFAULT_SOURCES = ['wikimedia_commons', 'wikipedia', 'wikimedia_geosearch', 'wikidata', 'openverse', 'osm'];

export function LocationPhotoSearch({
  locationId,
  locationName,
  locationCoordinates,
  isOpen,
  onClose,
  onPhotoSelected,
  isAdminMode,
}: LocationPhotoSearchProps) {
  const [images, setImages] = useState<NormalizedImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<NormalizedImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSources, setActiveSources] = useState<string[]>(DEFAULT_SOURCES);

  // Load active image sources from card config
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'enrichment_card_config')
          .maybeSingle();
        if (cancelled) return;
        const cfg = data?.value as { image_sources?: string[] } | null;
        if (cfg?.image_sources?.length) {
          const externals = cfg.image_sources.filter(s => s !== 'user_uploaded');
          if (externals.length) setActiveSources(externals);
        }
      } catch {
        // keep defaults
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery(locationName);
      setSelectedImage(null);
      runSearch(locationName);
    } else {
      setImages([]);
      setSelectedImage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, locationName, activeSources]);

  const runSearch = async (query: string) => {
    if (!query.trim() && !locationCoordinates) return;
    setLoading(true);
    setImages([]);
    setSelectedImage(null);
    try {
      const raw = await searchAllSources(query, locationCoordinates, activeSources);
      const ranked = filterAndRankPlacePhotos(raw);
      setImages(ranked);
      if (ranked.length === 0) {
        toast.info('No se encontraron fotografías del lugar');
      }
    } catch (error) {
      console.error('Error searching images:', error);
      toast.error('Error al buscar imágenes');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(searchQuery);
  };

  const handleSelect = async () => {
    if (!selectedImage) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Debes iniciar sesión'); return; }

      const imageResponse = await fetch(selectedImage.url);
      const imageBlob = await imageResponse.blob();
      const ext = (selectedImage.url.split('.').pop()?.split('?')[0] || 'jpg').slice(0, 5);
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
        enrichedData.imagen_fuente = selectedImage.sourceLabel || selectedImage.source;
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
          visibility: 'private', is_primary: true,
          caption: `${selectedImage.sourceLabel || selectedImage.source}: ${selectedImage.author || ''}`,
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

  // Per-source counts for the indicator
  const counts = images.reduce<Record<string, number>>((acc, img) => {
    acc[img.source] = (acc[img.source] || 0) + 1;
    return acc;
  }, {});

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
              placeholder="Buscar en fuentes libres..."
              className="flex-1 h-9 text-sm"
            />
            <Button type="submit" disabled={loading} size="icon" variant="secondary" className="h-9 w-9 shrink-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
            <Button
              type="button"
              onClick={() => { setSearchQuery(locationName); runSearch(locationName); }}
              disabled={loading}
              size="icon" variant="outline"
              title="Reiniciar búsqueda"
              className="h-9 w-9 shrink-0"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </form>

          {/* Selected image preview */}
          {selectedImage && (
            <div className="rounded-lg overflow-hidden border border-primary/30 bg-muted/30 animate-in fade-in-0 slide-in-from-top-1 duration-200">
              <img
                src={selectedImage.url}
                alt={selectedImage.title}
                className="w-full max-h-[28vh] object-contain bg-black/5"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
              <div className="px-3 py-2 border-t border-border space-y-0.5">
                <h3 className="text-xs font-medium leading-snug line-clamp-1">{selectedImage.title}</h3>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="truncate">{selectedImage.author}</span>
                  <span className="shrink-0">{selectedImage.license}</span>
                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-muted text-[10px]">{selectedImage.sourceLabel}</span>
                  {selectedImage.descriptionUrl && (
                    <a
                      href={selectedImage.descriptionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-0.5 text-primary hover:underline shrink-0 ml-auto"
                    >
                      Ver
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Source indicator */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
            <Globe className="w-3 h-3" />
            <span>Fuentes activas:</span>
            {activeSources.map(s => (
              <span key={s} className="px-1.5 py-0.5 rounded bg-muted text-[10px]">
                {s.replace(/_/g, ' ')}{counts[s] ? ` · ${counts[s]}` : ''}
              </span>
            ))}
            {!loading && images.length > 0 && (
              <span className="ml-auto">{images.length} resultados</span>
            )}
          </div>

          {/* Results grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-xs">Buscando imágenes...</p>
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <ImageIcon className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-sm">No hay imágenes</p>
              <p className="text-xs">Prueba con otra búsqueda</p>
            </div>
          ) : (
            <div className={cn(
              'grid gap-1.5',
              selectedImage ? 'grid-cols-4' : 'grid-cols-3 gap-2'
            )}>
              {images.map((image) => (
                <button
                  key={image.id}
                  onClick={() => setSelectedImage(image)}
                  className={cn(
                    'relative rounded-md overflow-hidden border-2 transition-all text-left',
                    selectedImage?.id === image.id
                      ? 'border-primary ring-1 ring-primary/30'
                      : 'border-transparent hover:border-primary/40'
                  )}
                >
                  <div className="aspect-square relative">
                    <img
                      src={image.thumbUrl}
                      alt={image.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                    <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-black/60 text-white text-[8px] uppercase tracking-wide">
                      {image.source.replace('wikimedia_', '').replace('_', ' ').slice(0, 9)}
                    </span>
                    {selectedImage?.id === image.id && (
                      <div className="absolute top-1 right-1">
                        <Check className="w-4 h-4 text-primary bg-background rounded-full p-0.5 shadow-sm" />
                      </div>
                    )}
                  </div>
                  {!selectedImage && (
                    <div className="px-1.5 py-1 bg-muted/80 border-t border-border">
                      <p className="text-[9px] text-foreground truncate leading-tight">{image.title}</p>
                      <p className="text-[8px] text-muted-foreground truncate">{image.license} · {image.author}</p>
                    </div>
                  )}
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
