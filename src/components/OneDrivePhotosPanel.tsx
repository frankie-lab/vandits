/**
 * OneDrivePhotosPanel — Migrado al Panel System v1.
 *
 * Aplica la "Regla de hijos del PanelBody" (ADR 003):
 *   - Padding raíz 0 (lo pone PanelBody del padre).
 *   - Sub-tabs vía PanelTabs.Group (no Radix Tabs directo, no botones adhoc).
 *   - CTA primaria "Auditar" vive en PanelFooter sticky.
 *   - Labels de agrupación vía PanelSection.
 *   - Estados vacíos vía PanelEmptyState.
 *   - Filas de lista usan --panel-list-row-min-h.
 *
 * Layout: este componente se monta DENTRO de un PanelTabs.Content del panel
 * padre `ImportedContentPanel`. Por tanto, ocupa todo el alto del body padre
 * y gestiona su propio scroll interno mediante un Body local (ver
 * `<div data-panel-inner-body>`). El padre debe usar `<PanelBody noPadding>`
 * o renderizar este componente con `padding-x` y dejar que controle scroll.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  FolderOpen,
  ChevronLeft,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  MapPin,
  Camera,
  Scan,
  Database,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { OneDriveVisitValidator } from './OneDriveVisitValidator';
import {
  PanelTabs,
  PanelSection,
  PanelEmptyState,
  PanelFooter,
} from '@/shared/components/ui/panel';

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

interface IndexedPhoto {
  id: string;
  onedrive_id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  taken_at: string | null;
  folder_path: string | null;
  camera_make: string | null;
  camera_model: string | null;
  thumbnail_url: string | null;
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export function OneDrivePhotosPanel() {
  const [activeTab, setActiveTab] = useState<'index' | 'browse' | 'validate'>('index');

  // Index state
  const [indexPhotos, setIndexPhotos] = useState<IndexedPhoto[]>([]);
  const [indexLoading, setIndexLoading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState<string | null>(null);

  // Browse state
  const [folders, setFolders] = useState<OneDriveFolder[]>([]);
  const [photos, setPhotos] = useState<OneDrivePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [photosNextLink, setPhotosNextLink] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: 'OneDrive' }]);
  const [selectedPhoto, setSelectedPhoto] = useState<OneDrivePhoto | null>(null);

  // Load persisted index from DB
  const loadIndex = useCallback(async () => {
    setIndexLoading(true);
    try {
      const { data, error } = await supabase
        .from('onedrive_photo_index')
        .select('*')
        .order('folder_path', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      setIndexPhotos((data as IndexedPhoto[]) || []);
    } catch (err: any) {
      console.error('Error loading index:', err);
      toast.error('Error al cargar índice');
    } finally {
      setIndexLoading(false);
    }
  }, []);

  // Run full audit
  const runAudit = useCallback(async () => {
    setAuditing(true);
    setAuditProgress('Escaneando OneDrive...');
    try {
      const res = await supabase.functions.invoke('scan-onedrive-geo', {
        body: { recursive: true },
      });
      if (res.error) throw res.error;
      const { totalScanned, geoCount } = res.data;
      toast.success(`Auditoría completa: ${geoCount} fotos con GPS de ${totalScanned} escaneadas`);
      setAuditProgress(null);
      await loadIndex();
      try {
        const { invalidatePhotoCache, isPhotoLayerVisible, setPhotoLayerVisible } = await import(
          './map/map-photo-layer'
        );
        invalidatePhotoCache();
        if (isPhotoLayerVisible()) setPhotoLayerVisible(true);
      } catch {
        /* photo layer not loaded yet */
      }
    } catch (err: any) {
      console.error('Audit error:', err);
      toast.error('Error durante la auditoría');
      setAuditProgress(null);
    } finally {
      setAuditing(false);
    }
  }, [loadIndex]);

  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

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
      setPhotos((prev) => [...prev, ...(res.data?.photos || [])]);
      setPhotosNextLink(res.data?.nextLink || null);
    } catch (error: any) {
      console.error('Error loading more photos:', error);
      toast.error('Error al cargar más fotos');
    } finally {
      setLoadingMore(false);
    }
  }, [photosNextLink, loadingMore]);

  const navigateToFolder = (folder: OneDriveFolder) => {
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }]);
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

  // Group index photos by folder
  const groupedByFolder = indexPhotos.reduce<Record<string, IndexedPhoto[]>>((acc, p) => {
    const key = p.folder_path || '/';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <PanelTabs
      value={activeTab}
      onValueChange={(v) => {
        const next = v as typeof activeTab;
        setActiveTab(next);
        if (next === 'browse' && folders.length === 0 && photos.length === 0) loadContents(null);
      }}
    >
      {/* Sub-tabs canónicos */}
      <div className="shrink-0 px-[var(--panel-padding-x)] pt-[var(--panel-padding-y)] pb-3">
        <PanelTabs.Group>
          <PanelTabs.Trigger value="index" icon={<Database className="w-3.5 h-3.5" />}>
            Índice
          </PanelTabs.Trigger>
          <PanelTabs.Trigger value="browse" icon={<ImageIcon className="w-3.5 h-3.5" />}>
            Explorar
          </PanelTabs.Trigger>
          <PanelTabs.Trigger value="validate" icon={<Scan className="w-3.5 h-3.5" />}>
            Validar
          </PanelTabs.Trigger>
        </PanelTabs.Group>
      </div>

      {/* INDEX TAB */}
      <PanelTabs.Content
        value="index"
        className="flex-1 min-h-0 m-0 flex flex-col data-[state=inactive]:hidden"
      >
        <div className="flex-1 min-h-0 overflow-y-auto px-[var(--panel-padding-x)] pb-4">
          {indexLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs">Cargando índice...</p>
            </div>
          ) : indexPhotos.length === 0 ? (
            <PanelEmptyState
              icon={<Database className="w-10 h-10" />}
              title="Índice vacío"
              description='Pulsa "Auditar fotos de OneDrive" abajo para escanear todas tus carpetas y persistir las fotos con GPS.'
            />
          ) : (
            <PanelSection
              title={`${indexPhotos.length} fotos con GPS indexadas`}
              actions={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={loadIndex}
                  disabled={indexLoading}
                  aria-label="Recargar índice"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', indexLoading && 'animate-spin')} />
                </Button>
              }
            >
              {Object.entries(groupedByFolder).map(([folder, folderPhotos]) => (
                <div key={folder} className="space-y-1">
                  <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                    <FolderOpen className="w-3 h-3" />
                    {folder || '/'}
                    <span className="text-muted-foreground/60">({folderPhotos.length})</span>
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {folderPhotos.map((photo) => (
                      <button
                        key={photo.id}
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent('photo-focus', {
                              detail: {
                                latitude: photo.latitude,
                                longitude: photo.longitude,
                                name: photo.name,
                                onedriveId: photo.onedrive_id,
                              },
                            }),
                          );
                        }}
                        className="flex items-center gap-3 w-full px-2 py-2 rounded-md hover:bg-muted/60 transition-colors text-left min-h-[var(--panel-list-row-min-h)]"
                      >
                        {photo.thumbnail_url ? (
                          <img
                            src={photo.thumbnail_url}
                            alt={photo.name}
                            className="w-10 h-10 rounded object-cover shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-foreground truncate font-medium">{photo.name}</p>
                          <div className="flex items-center gap-1 text-[11px] text-primary">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span>
                              {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
                            </span>
                          </div>
                          {photo.taken_at && (
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(photo.taken_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </PanelSection>
          )}
        </div>

        {/* CTA primaria sticky */}
        <PanelFooter>
          <Button
            onClick={runAudit}
            disabled={auditing}
            className="w-full h-11"
          >
            {auditing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {auditProgress || 'Auditando...'}
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Auditar fotos de OneDrive
              </>
            )}
          </Button>
        </PanelFooter>
      </PanelTabs.Content>

      {/* BROWSE TAB */}
      <PanelTabs.Content
        value="browse"
        className="flex-1 min-h-0 m-0 flex flex-col data-[state=inactive]:hidden"
      >
        <div className="flex-1 min-h-0 overflow-y-auto px-[var(--panel-padding-x)] pb-4 flex flex-col gap-3">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2 -mx-[var(--panel-padding-x)] px-[var(--panel-padding-x)] border-b">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap min-w-0 flex-1">
              {breadcrumb.length > 1 && (
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={navigateBack}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              )}
              {breadcrumb.map((item, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground/50">/</span>}
                  <button
                    onClick={() => navigateToBreadcrumb(i)}
                    className={cn(
                      'hover:text-foreground transition-colors truncate max-w-[120px]',
                      i === breadcrumb.length - 1 ? 'text-foreground font-medium' : '',
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
              aria-label="Recargar"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </Button>
          </div>

          {/* Selected photo preview */}
          {selectedPhoto && (
            <div className="rounded-[var(--panel-card-radius)] overflow-hidden border border-primary/30 bg-muted/30 animate-in fade-in-0 slide-in-from-top-1 duration-200">
              <img
                src={selectedPhoto.largeThumbnailUrl || selectedPhoto.thumbnailUrl || selectedPhoto.downloadUrl || ''}
                alt={selectedPhoto.name}
                className="w-full max-h-[30vh] object-contain bg-black/5"
              />
              <div className="px-3 py-2 border-t border-border space-y-1">
                <p className="text-xs font-medium truncate">{selectedPhoto.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {selectedPhoto.width && selectedPhoto.height && (
                    <span>
                      {selectedPhoto.width} × {selectedPhoto.height}
                    </span>
                  )}
                  {selectedPhoto.size && <span>{(selectedPhoto.size / 1024 / 1024).toFixed(1)} MB</span>}
                  {selectedPhoto.camera?.takenDateTime && (
                    <span>{new Date(selectedPhoto.camera.takenDateTime).toLocaleDateString()}</span>
                  )}
                </div>
                {selectedPhoto.location?.latitude != null && selectedPhoto.location?.longitude != null && (
                  <div className="flex items-center gap-1 text-[11px] text-primary">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span>
                      {selectedPhoto.location.latitude.toFixed(5)}, {selectedPhoto.location.longitude.toFixed(5)}
                    </span>
                  </div>
                )}
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
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs">Cargando OneDrive...</p>
            </div>
          ) : (
            <>
              {folders.length > 0 && (
                <PanelSection title="Carpetas">
                  <div className="grid grid-cols-2 gap-2">
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => navigateToFolder(folder)}
                        className="flex items-center gap-2 p-3 rounded-[var(--panel-card-radius)] bg-muted/50 hover:bg-muted transition-colors text-left min-h-[var(--panel-list-row-min-h)]"
                      >
                        <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{folder.name}</p>
                          <p className="text-[10px] text-muted-foreground">{folder.childCount} elementos</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </PanelSection>
              )}

              {(() => {
                const geoPhotos = photos.filter(
                  (p) => p.location?.latitude != null && p.location?.longitude != null,
                );
                return geoPhotos.length > 0 ? (
                  <PanelSection title={`Fotos con GPS (${geoPhotos.length} de ${photos.length})`}>
                    <div className="flex flex-col gap-1">
                      {geoPhotos.map((photo) => (
                        <button
                          key={photo.id}
                          onClick={() =>
                            setSelectedPhoto((prev) => (prev?.id === photo.id ? null : photo))
                          }
                          className={cn(
                            'flex items-center gap-3 w-full rounded-[var(--panel-card-radius)] overflow-hidden border-2 transition-all text-left p-2 min-h-[var(--panel-list-row-min-h)]',
                            selectedPhoto?.id === photo.id
                              ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
                              : 'border-transparent hover:border-primary/40 hover:bg-muted/50',
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
                            <p className="text-xs text-foreground truncate font-medium">
                              {photo.name}
                            </p>
                            <div className="flex items-center gap-1 text-[11px] text-primary">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span>
                                {photo.location!.latitude!.toFixed(5)},{' '}
                                {photo.location!.longitude!.toFixed(5)}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {photosNextLink && (
                      <Button
                        variant="outline"
                        className="w-full h-11"
                        onClick={loadMorePhotos}
                        disabled={loadingMore}
                      >
                        {loadingMore ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando más...
                          </>
                        ) : (
                          'Cargar más fotos'
                        )}
                      </Button>
                    )}
                  </PanelSection>
                ) : null;
              })()}

              {folders.length === 0 && photos.length === 0 && (
                <PanelEmptyState
                  icon={<Cloud className="w-10 h-10" />}
                  title="Carpeta vacía"
                  description="No hay fotos ni subcarpetas en esta ubicación."
                />
              )}
            </>
          )}
        </div>
      </PanelTabs.Content>

      {/* VALIDATE TAB */}
      <PanelTabs.Content
        value="validate"
        className="flex-1 min-h-0 m-0 flex flex-col data-[state=inactive]:hidden"
      >
        <div className="flex-1 min-h-0 overflow-y-auto px-[var(--panel-padding-x)] pb-4">
          <OneDriveVisitValidator />
        </div>
      </PanelTabs.Content>
    </PanelTabs>
  );
}
