import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Check, Image as ImageIcon, FolderOpen, ChevronLeft, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OneDrivePhoto {
  id: string;
  name: string;
  downloadUrl: string | null;
  thumbnailUrl: string | null;
  largeThumbnailUrl: string | null;
  width: number | null;
  height: number | null;
}

interface OneDriveFolder {
  id: string;
  name: string;
  childCount: number;
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

interface OneDrivePhotoBrowserProps {
  locationId: string;
  locationName: string;
  isOpen: boolean;
  onClose: () => void;
  onPhotoSelected: (imageUrl: string, isDefaultImage: boolean) => void;
  isAdminMode: boolean;
}

export function OneDrivePhotoBrowser({
  locationId,
  locationName,
  isOpen,
  onClose,
  onPhotoSelected,
  isAdminMode,
}: OneDrivePhotoBrowserProps) {
  const [folders, setFolders] = useState<OneDriveFolder[]>([]);
  const [photos, setPhotos] = useState<OneDrivePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<OneDrivePhoto | null>(null);
  const [saving, setSaving] = useState(false);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: 'OneDrive' }]);

  const currentFolderId = breadcrumb[breadcrumb.length - 1].id;

  useEffect(() => {
    if (isOpen) {
      setBreadcrumb([{ id: null, name: 'OneDrive' }]);
      setSelectedPhoto(null);
      loadContents(null);
    }
  }, [isOpen]);

  const loadContents = async (folderId: string | null) => {
    setLoading(true);
    setPhotos([]);
    setFolders([]);
    setSelectedPhoto(null);

    try {
      const [foldersRes, photosRes] = await Promise.all([
        supabase.functions.invoke('browse-onedrive', {
          body: { action: 'list-folders', folderId },
        }),
        supabase.functions.invoke('browse-onedrive', {
          body: { action: 'list-photos', folderId },
        }),
      ]);

      if (foldersRes.error) throw foldersRes.error;
      if (photosRes.error) throw photosRes.error;

      setFolders(foldersRes.data?.folders || []);
      setPhotos(photosRes.data?.photos || []);
    } catch (error: any) {
      console.error('Error loading OneDrive:', error);
      toast.error('Error al cargar OneDrive');
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (folder: OneDriveFolder) => {
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }]);
    loadContents(folder.id);
  };

  const navigateBack = () => {
    if (breadcrumb.length <= 1) return;
    const newBreadcrumb = breadcrumb.slice(0, -1);
    setBreadcrumb(newBreadcrumb);
    loadContents(newBreadcrumb[newBreadcrumb.length - 1].id);
  };

  const navigateToBreadcrumb = (index: number) => {
    const newBreadcrumb = breadcrumb.slice(0, index + 1);
    setBreadcrumb(newBreadcrumb);
    loadContents(newBreadcrumb[newBreadcrumb.length - 1].id);
  };

  const handleSelect = async () => {
    if (!selectedPhoto?.downloadUrl) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Debes iniciar sesión'); return; }

      // Download photo from OneDrive temp URL
      const imageResponse = await fetch(selectedPhoto.downloadUrl);
      const imageBlob = await imageResponse.blob();
      const ext = selectedPhoto.name.split('.').pop()?.toLowerCase() || 'jpg';
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
        enrichedData.imagen_fuente = 'OneDrive';

        const { error: updateError } = await supabase
          .from('locations')
          .update({ enriched_data: enrichedData, updated_at: new Date().toISOString() })
          .eq('id', locationId);
        if (updateError) throw updateError;
        toast.success('Imagen oficial establecida desde OneDrive');
      } else {
        const { error: updateError } = await supabase
          .from('locations')
          .update({ user_image_url: publicUrl, user_image_visibility: 'private', updated_at: new Date().toISOString() })
          .eq('id', locationId);
        if (updateError) throw updateError;

        await supabase.from('location_photos').insert({
          location_id: locationId, user_id: user.id, image_url: publicUrl,
          visibility: 'private', is_primary: true, caption: `OneDrive: ${selectedPhoto.name}`,
        });
        toast.success('Foto guardada desde OneDrive');
      }

      onPhotoSelected(publicUrl, isAdminMode);
      window.dispatchEvent(new CustomEvent('photo-updated', {
        detail: { locationId, imageUrl: publicUrl, isDefaultImage: isAdminMode }
      }));
      onClose();
    } catch (error: any) {
      console.error('Error saving OneDrive photo:', error);
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
            <Cloud className="w-4 h-4 text-blue-500" />
            OneDrive — {locationName}
            {isAdminMode && (
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-600 rounded-full ml-1 font-medium">
                Admin
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
            {breadcrumb.length > 1 && (
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={navigateBack}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
            )}
            {breadcrumb.map((item, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground/50">/</span>}
                <button
                  onClick={() => navigateToBreadcrumb(i)}
                  className={cn(
                    'hover:text-foreground transition-colors',
                    i === breadcrumb.length - 1 ? 'text-foreground font-medium' : ''
                  )}
                >
                  {item.name}
                </button>
              </span>
            ))}
          </div>

          {/* Selected photo preview */}
          {selectedPhoto && (
            <div className="rounded-lg overflow-hidden border border-primary/30 bg-muted/30 animate-in fade-in-0 slide-in-from-top-1 duration-200">
              <img
                src={selectedPhoto.largeThumbnailUrl || selectedPhoto.thumbnailUrl || selectedPhoto.downloadUrl || ''}
                alt={selectedPhoto.name}
                className="w-full max-h-[28vh] object-contain bg-black/5"
              />
              <div className="px-3 py-2 border-t border-border">
                <p className="text-xs font-medium truncate">{selectedPhoto.name}</p>
                {selectedPhoto.width && selectedPhoto.height && (
                  <p className="text-[11px] text-muted-foreground">{selectedPhoto.width} × {selectedPhoto.height}</p>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-xs">Cargando OneDrive...</p>
            </div>
          ) : (
            <>
              {/* Folders */}
              {folders.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Carpetas</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {folders.map(folder => (
                      <button
                        key={folder.id}
                        onClick={() => navigateToFolder(folder)}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                      >
                        <FolderOpen className="w-4 h-4 text-blue-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{folder.name}</p>
                          <p className="text-[10px] text-muted-foreground">{folder.childCount} elementos</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos grid */}
              {photos.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                    Fotos ({photos.length})
                  </p>
                  <div className={cn('grid gap-1.5', selectedPhoto ? 'grid-cols-4' : 'grid-cols-3 gap-2')}>
                    {photos.map(photo => (
                      <button
                        key={photo.id}
                        onClick={() => setSelectedPhoto(photo)}
                        className={cn(
                          'relative rounded-md overflow-hidden border-2 transition-all text-left',
                          selectedPhoto?.id === photo.id
                            ? 'border-primary ring-1 ring-primary/30'
                            : 'border-transparent hover:border-primary/40'
                        )}
                      >
                        <div className="aspect-square relative">
                          <img
                            src={photo.thumbnailUrl || photo.downloadUrl || ''}
                            alt={photo.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {selectedPhoto?.id === photo.id && (
                            <div className="absolute top-1 right-1">
                              <Check className="w-4 h-4 text-primary bg-background rounded-full p-0.5 shadow-sm" />
                            </div>
                          )}
                        </div>
                        {!selectedPhoto && (
                          <div className="px-1.5 py-1 bg-muted/80 border-t border-border">
                            <p className="text-[9px] text-foreground truncate leading-tight">{photo.name}</p>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {folders.length === 0 && photos.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <ImageIcon className="w-10 h-10 mb-2 opacity-20" />
                  <p className="text-sm">Carpeta vacía</p>
                  <p className="text-xs">No hay fotos ni subcarpetas aquí</p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-5 pb-5 pt-3 border-t border-border shrink-0 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} size="sm">
            Cancelar
          </Button>
          <Button onClick={handleSelect} disabled={!selectedPhoto || saving} size="sm">
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
