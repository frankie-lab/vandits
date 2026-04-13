import { useState, useEffect, useCallback } from 'react';
import { Cloud, FolderOpen, ChevronLeft, Image as ImageIcon, Loader2, RefreshCw, MapPin, Camera, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { OneDriveVisitValidator } from './OneDriveVisitValidator';

interface OneDriveFolder {
  id: string;
  name: string;
  childCount: number;
}

interface OneDrivePhoto {
  id: string;
  name: string;
  downloadUrl: string | null;
  thumbnailUrl: string | null;
  largeThumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  size: number | null;
  lastModified: string | null;
  location: {
    latitude: number | null;
    longitude: number | null;
    altitude: number | null;
  } | null;
  camera: {
    cameraMake: string | null;
    cameraModel: string | null;
    takenDateTime: string | null;
    focalLength: number | null;
    fNumber: number | null;
    iso: number | null;
  } | null;
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export function OneDrivePhotosPanel() {
  const [folders, setFolders] = useState<OneDriveFolder[]>([]);
  const [photos, setPhotos] = useState<OneDrivePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [photosNextLink, setPhotosNextLink] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: 'OneDrive' }]);
  const [selectedPhoto, setSelectedPhoto] = useState<OneDrivePhoto | null>(null);
  const [activeTab, setActiveTab] = useState<'browse' | 'validate'>('browse');

  const loadContents = useCallback(async (folderId: string | null) => {
    setLoading(true);
    setPhotos([]);
    setFolders([]);
    setSelectedPhoto(null);
    setPhotosNextLink(null);

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
      setPhotosNextLink(photosRes.data?.nextLink || null);
    } catch (error: any) {
      console.error('Error loading OneDrive:', error);
      toast.error('Error al cargar OneDrive');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMorePhotos = useCallback(async () => {
    if (!photosNextLink || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await supabase.functions.invoke('browse-onedrive', {
        body: { action: 'list-photos', folderId: null, nextLink: photosNextLink },
      });
      if (res.error) throw res.error;
      setPhotos(prev => [...prev, ...(res.data?.photos || [])]);
      setPhotosNextLink(res.data?.nextLink || null);
    } catch (error: any) {
      console.error('Error loading more photos:', error);
      toast.error('Error al cargar más fotos');
    } finally {
      setLoadingMore(false);
    }
  }, [photosNextLink, loadingMore]);

  useEffect(() => {
    loadContents(null);
  }, [loadContents]);

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

  const currentFolderId = breadcrumb[breadcrumb.length - 1].id;

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
        <button
          onClick={() => setActiveTab('browse')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            activeTab === 'browse' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Explorar
        </button>
        <button
          onClick={() => setActiveTab('validate')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            activeTab === 'validate' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Scan className="w-3.5 h-3.5" />
          Validar visitas
        </button>
      </div>

      {activeTab === 'validate' ? (
        <OneDriveVisitValidator />
      ) : (
      <>
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap min-w-0 flex-1">
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
                  'hover:text-foreground transition-colors truncate max-w-[120px]',
                  i === breadcrumb.length - 1 ? 'text-foreground font-medium' : ''
                )}
              >
                {item.name}
              </button>
            </span>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => loadContents(currentFolderId)}
          disabled={loading}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Selected photo preview */}
      {selectedPhoto && (
        <div className="rounded-lg overflow-hidden border border-primary/30 bg-muted/30 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <img
            src={selectedPhoto.largeThumbnailUrl || selectedPhoto.thumbnailUrl || selectedPhoto.downloadUrl || ''}
            alt={selectedPhoto.name}
            className="w-full max-h-[30vh] object-contain bg-black/5"
          />
          <div className="px-3 py-2 border-t border-border space-y-1">
            <p className="text-xs font-medium truncate">{selectedPhoto.name}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {selectedPhoto.width && selectedPhoto.height && (
                <span>{selectedPhoto.width} × {selectedPhoto.height}</span>
              )}
              {selectedPhoto.size && (
                <span>{(selectedPhoto.size / 1024 / 1024).toFixed(1)} MB</span>
              )}
              {selectedPhoto.camera?.takenDateTime && (
                <span>{new Date(selectedPhoto.camera.takenDateTime).toLocaleDateString()}</span>
              )}
            </div>

            {/* Location metadata */}
            {selectedPhoto.location?.latitude != null && selectedPhoto.location?.longitude != null && (
              <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <MapPin className="w-3 h-3 shrink-0" />
                <span>{selectedPhoto.location.latitude.toFixed(5)}, {selectedPhoto.location.longitude.toFixed(5)}</span>
                {selectedPhoto.location.altitude != null && (
                  <span className="text-muted-foreground">({Math.round(selectedPhoto.location.altitude)}m)</span>
                )}
              </div>
            )}

            {/* Camera info */}
            {selectedPhoto.camera && (selectedPhoto.camera.cameraMake || selectedPhoto.camera.cameraModel) && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Camera className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {[selectedPhoto.camera.cameraMake, selectedPhoto.camera.cameraModel].filter(Boolean).join(' ')}
                  {selectedPhoto.camera.focalLength && ` · ${selectedPhoto.camera.focalLength}mm`}
                  {selectedPhoto.camera.fNumber && ` · ƒ/${selectedPhoto.camera.fNumber}`}
                  {selectedPhoto.camera.iso && ` · ISO ${selectedPhoto.camera.iso}`}
                </span>
              </div>
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
        <ScrollArea className="flex-1">
          <div className="space-y-3">
            {/* Folders */}
            {folders.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Carpetas</p>
                <div className="grid grid-cols-2 gap-1.5">
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

            {/* Photos — only those with GPS coordinates */}
            {(() => {
              const geoPhotos = photos.filter(p => p.location?.latitude != null && p.location?.longitude != null);
              const totalPhotos = photos.length;
              return geoPhotos.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                    Fotos con GPS ({geoPhotos.length} de {totalPhotos})
                  </p>
                  <div className="space-y-1">
                    {geoPhotos.map(photo => (
                      <button
                        key={photo.id}
                        onClick={() => setSelectedPhoto(prev => prev?.id === photo.id ? null : photo)}
                        className={cn(
                          'flex items-center gap-2 w-full rounded-md overflow-hidden border-2 transition-all text-left p-1.5',
                          selectedPhoto?.id === photo.id
                            ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
                            : 'border-transparent hover:border-primary/40 hover:bg-muted/50'
                        )}
                      >
                        <div className="w-10 h-10 rounded shrink-0 relative overflow-hidden">
                          <img
                            src={photo.thumbnailUrl || photo.downloadUrl || ''}
                            alt={photo.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-foreground truncate font-medium">{photo.name}</p>
                          <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                            <MapPin className="w-2.5 h-2.5 shrink-0" />
                            <span>{photo.location!.latitude!.toFixed(5)}, {photo.location!.longitude!.toFixed(5)}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {photosNextLink && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={loadMorePhotos}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Cargando más...</>
                      ) : (
                        'Cargar más fotos'
                      )}
                    </Button>
                  )}
                </div>
              ) : (
                totalPhotos > 0 ? (
                  <div className="flex flex-col items-center justify-center h-20 text-muted-foreground">
                    <p className="text-xs">{totalPhotos} fotos sin coordenadas GPS</p>
                    {photosNextLink && (
                      <Button variant="link" size="sm" className="text-xs mt-1" onClick={loadMorePhotos} disabled={loadingMore}>
                        {loadingMore ? 'Buscando...' : 'Buscar más fotos con GPS'}
                      </Button>
                    )}
                  </div>
                ) : null
              );
            })()}

            {folders.length === 0 && photos.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <ImageIcon className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">Carpeta vacía</p>
                <p className="text-xs">No hay fotos ni subcarpetas aquí</p>
              </div>
            )}
          </div>
        </ScrollArea>
      )}
      </>
      )}
    </div>
  );
}
