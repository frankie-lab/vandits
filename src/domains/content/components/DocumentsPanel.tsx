import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  MapPin,
  Trash2,
  Loader2,
  FolderOpen,
  Sparkles,
  Eye,
  EyeOff,
  RefreshCw,
  Route as RouteIcon,
  AlertTriangle,
  PenLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { DocumentContentManager } from './DocumentContentManager';
import { DocumentFocusView } from './DocumentFocusView';

type DocumentStatus = 'draft' | 'in_review' | 'published' | 'archived';

const DOC_STATUS_BADGE: Record<DocumentStatus, { label: string; className: string }> = {
  draft: { label: 'Original', className: 'bg-muted text-muted-foreground border-border' },
  in_review: { label: 'En revisión', className: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400 dark:border-amber-500/20' },
  published: { label: 'Importado', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400 dark:border-emerald-500/20' },
  archived: { label: 'Archivado', className: 'bg-muted text-muted-foreground/60 border-border' },
};

interface DocInfo {
  id: string;
  name: string;
  original_filename: string | null;
  original_file_path: string | null;
  created_at: string;
  status: DocumentStatus;
  location_count: number;
  enriched_count: number;
  approved_count: number;
  deleted_count: number;
  route_count: number;
}

/** Event dispatched when user clicks "Ver en mapa" on a document */
export const DOCUMENT_VIEW_EVENT = 'document:view-on-map';

export function DocumentsPanel() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [managingDoc, setManagingDoc] = useState<{ id: string; name: string } | null>(null);
  const [focusingDoc, setFocusingDoc] = useState<{ id: string; name: string } | null>(null);

  const fetchDocs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: rawDocs, error } = await supabase
        .from('documents')
        .select('id, name, original_filename, original_file_path, created_at, status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const enriched = await Promise.all(
        (rawDocs || []).map(async (doc) => {
          const [active, enrichedQ, approvedQ, deletedQ, routesQ] = await Promise.all([
            supabase
              .from('locations')
              .select('id', { count: 'exact', head: true })
              .eq('document_id', doc.id)
              .is('deleted_at', null),
            supabase
              .from('locations')
              .select('id', { count: 'exact', head: true })
              .eq('document_id', doc.id)
              .is('deleted_at', null)
              .eq('enrichment_status', 'enriched'),
            supabase
              .from('locations')
              .select('id', { count: 'exact', head: true })
              .eq('document_id', doc.id)
              .is('deleted_at', null)
              .eq('is_approved', true),
            supabase
              .from('locations')
              .select('id', { count: 'exact', head: true })
              .eq('document_id', doc.id)
              .not('deleted_at', 'is', null),
            supabase
              .from('routes')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .contains('route_preferences', { documentId: doc.id }),
          ]);
          return {
            ...doc,
            location_count: active.count ?? 0,
            enriched_count: enrichedQ.count ?? 0,
            approved_count: approvedQ.count ?? 0,
            deleted_count: deletedQ.count ?? 0,
            route_count: routesQ.count ?? 0,
          };
        })
      );

      setDocs(enriched);
    } catch (e) {
      console.error('Error fetching documents:', e);
      toast.error('Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Emit document list for map filtering
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('document:status-visibility', {
      detail: { docs: docs.map(d => ({ id: d.id, status: d.status })) },
    }));
  }, [docs]);

  const handleStatusChange = async (docId: string, newStatus: DocumentStatus) => {
    try {
      const { error } = await supabase
        .from('documents')
        .update({ status: newStatus })
        .eq('id', docId);
      if (error) throw error;
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: newStatus } : d));
      toast.success(`Estado cambiado a "${DOC_STATUS_BADGE[newStatus].label}"`);
    } catch (e) {
      console.error('Error updating status:', e);
      toast.error('Error al cambiar estado');
    }
  };

  const handleDelete = async (docId: string, docName: string) => {
    setDeletingId(docId);
    try {
      // 1. Hard-delete locations (not soft-delete)
      const { error: locError } = await supabase
        .from('locations')
        .delete()
        .eq('document_id', docId);

      if (locError) throw locError;

      // 2. Delete routes linked to this document
      // First find route IDs linked to this document
      const { data: linkedRoutes } = await supabase
        .from('routes')
        .select('id')
        .contains('route_preferences', { documentId: docId });

      if (linkedRoutes && linkedRoutes.length > 0) {
        const routeIds = linkedRoutes.map(r => r.id);
        // Delete waypoints, stops, day stages first (FK constraints)
        await Promise.all([
          supabase.from('route_waypoints').delete().in('route_id', routeIds),
          supabase.from('route_stops').delete().in('route_id', routeIds),
          supabase.from('route_day_stages').delete().in('route_id', routeIds),
        ]);
        // Delete routes
        await supabase.from('routes').delete().in('id', routeIds);
      }

      // 3. Delete the document record
      const { error: docError } = await supabase
        .from('documents')
        .delete()
        .eq('id', docId);

      if (docError) throw docError;

      toast.success(`"${docName}" eliminado con todas sus ubicaciones y rutas`);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      
      // If we were viewing this doc, clear the view
      if (activeDocId === docId) {
        setActiveDocId(null);
        window.dispatchEvent(new CustomEvent(DOCUMENT_VIEW_EVENT, { detail: null }));
      }

      // Reload all locations from DB so map removes deleted markers
      window.dispatchEvent(new CustomEvent('reload-locations'));
      window.dispatchEvent(new CustomEvent('routes:changed'));
    } catch (e) {
      console.error('Error deleting document:', e);
      toast.error('Error al eliminar documento');
    } finally {
      setDeletingId(null);
    }
  };

  const handleViewOnMap = async (docId: string, docName: string) => {
    if (activeDocId === docId) {
      // Toggle off
      setActiveDocId(null);
      window.dispatchEvent(new CustomEvent(DOCUMENT_VIEW_EVENT, { detail: null }));
      toast.info('Mostrando vista general');
      return;
    }

    setActiveDocId(docId);

    try {
      // Fetch locations for this document
      const { data: locations } = await supabase
        .from('locations')
        .select('id, latitude, longitude')
        .eq('document_id', docId)
        .is('deleted_at', null);

      // Fetch routes for this document
      const { data: routes } = await supabase
        .from('routes')
        .select('id')
        .eq('user_id', user.id)
        .contains('route_preferences', { documentId: docId });

      const locationIds = (locations || []).map(l => l.id);
      const routeIds = (routes || []).map(r => r.id);

      // Dispatch event with document content IDs
      window.dispatchEvent(new CustomEvent(DOCUMENT_VIEW_EVENT, {
        detail: { docId, docName, locationIds, routeIds },
      }));

      // Fit map to document bounds
      if (locations && locations.length > 0) {
        const lats = locations.map(l => l.latitude);
        const lngs = locations.map(l => l.longitude);
        const bounds: [[number, number], [number, number]] = [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ];
        window.dispatchEvent(new CustomEvent('map-fit-bounds', {
          detail: { bounds, padding: [60, 60], maxZoom: 15 },
        }));
      }

      toast.info(`Mostrando solo "${docName}"`);
    } catch (e) {
      console.error('Error viewing document on map:', e);
    }
  };

  const totalLocations = docs.reduce((sum, d) => sum + d.location_count, 0);
  const totalEnriched = docs.reduce((sum, d) => sum + d.enriched_count, 0);

  // If focusing a document, show the focus/edit view
  if (focusingDoc && user) {
    return (
      <DocumentFocusView
        docId={focusingDoc.id}
        docName={focusingDoc.name}
        userId={user.id}
        onBack={() => { setFocusingDoc(null); setActiveDocId(null); fetchDocs(); }}
      />
    );
  }

  // If managing a document, show the content manager
  if (managingDoc && user) {
    return (
      <DocumentContentManager
        docId={managingDoc.id}
        docName={managingDoc.name}
        userId={user.id}
        onBack={() => { setManagingDoc(null); fetchDocs(); }}
        onDataChanged={fetchDocs}
      />
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Full overlay spinner while deleting */}
      {deletingId && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-destructive" />
          <p className="text-sm font-medium text-muted-foreground">Eliminando documento...</p>
          <p className="text-xs text-muted-foreground">Borrando ubicaciones, rutas y datos asociados</p>
        </div>
      )}
      {/* Summary header */}
      <div className="px-4 py-3 border-b bg-muted/30 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="w-4 h-4" />
            <span>{docs.length} documento{docs.length !== 1 ? 's' : ''}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchDocs} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {totalLocations} ubicaciones
          </span>
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            {totalEnriched} enriquecidas
          </span>
        </div>
        {activeDocId && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs gap-1"
            onClick={() => {
              setActiveDocId(null);
              window.dispatchEvent(new CustomEvent(DOCUMENT_VIEW_EVENT, { detail: null }));
              toast.info('Mostrando vista general');
            }}
          >
            <Eye className="w-3 h-3" />
            Mostrar vista general
          </Button>
        )}
      </div>


      {/* Documents list */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Cargando documentos...</span>
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <FolderOpen className="w-10 h-10 opacity-30" />
            <p className="text-sm">No hay documentos importados</p>
            <p className="text-xs">Sube un archivo KML, GPX o GeoJSON para empezar</p>
          </div>
        ) : (
          <div className="divide-y">
            {docs.map((doc) => {
              const displayName = doc.original_filename || doc.name;
              const badge = DOC_STATUS_BADGE[doc.status];
              const workspaceEdited = doc.enriched_count > 0 || doc.deleted_count > 0;
              const allApproved = doc.approved_count > 0 && doc.approved_count >= doc.location_count;
              const partialApproved = doc.approved_count > 0 && doc.approved_count < doc.location_count;
              return (
              <div
                key={doc.id}
                onClick={() => handleViewOnMap(doc.id, doc.name)}
                className={`px-3 py-2.5 transition-colors group cursor-pointer ${activeDocId === doc.id ? 'bg-primary/5 border-l-2 border-primary' : 'hover:bg-muted/40 border-l-2 border-transparent'}`}
              >
                {/* Row 1: Name + Eye toggle */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <p className="text-[13px] font-medium truncate flex-1 min-w-0">{displayName}</p>
                  <button
                    onClick={e => { e.stopPropagation(); handleViewOnMap(doc.id, doc.name); }}
                    title={activeDocId === doc.id ? 'Ocultar del mapa' : 'Ver en mapa'}
                    className={`shrink-0 p-0.5 rounded transition-colors ${activeDocId === doc.id ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
                  >
                    {activeDocId === doc.id ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Row 2: Date + Status badge */}
                <div className="flex items-center gap-2 mt-1 pl-[22px]">
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {new Date(doc.created_at).toLocaleDateString('es-ES', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>

                {/* Row 3: Original + Workspace + Catalog stats */}
                <div className="flex flex-col gap-0.5 mt-1.5 pl-[22px] text-[10px]">
                  {/* Original line */}
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-[52px] shrink-0 opacity-60">Original</span>
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5" />{doc.location_count}
                    </span>
                    {doc.route_count > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <RouteIcon className="w-2.5 h-2.5" />{doc.route_count}
                      </span>
                    )}
                  </div>

                  {/* Workspace line (only if edits exist) */}
                  {workspaceEdited && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="w-[52px] shrink-0 opacity-60">Depurado</span>
                      {doc.enriched_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                          <Sparkles className="w-2.5 h-2.5" />{doc.enriched_count}
                        </span>
                      )}
                      {doc.deleted_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-destructive">
                          <Trash2 className="w-2.5 h-2.5" />{doc.deleted_count}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Catalog integration line */}
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-[52px] shrink-0 opacity-60">Catálogo</span>
                    {allApproved ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Todo integrado</span>
                    ) : partialApproved ? (
                      <span className="text-amber-600 dark:text-amber-400">{doc.approved_count}/{doc.location_count} integrados</span>
                    ) : (
                      <span className="opacity-50">No integrado</span>
                    )}
                  </div>
                </div>

                {/* Row 3: Actions (on hover or active) */}
                <div
                  className={`flex items-center gap-1 mt-1.5 pl-[22px] transition-opacity ${activeDocId === doc.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  onClick={e => e.stopPropagation()}
                >
                   <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] gap-1 px-2"
                    onClick={() => setFocusingDoc({ id: doc.id, name: doc.name })}
                  >
                    <PenLine className="w-3 h-3" />
                    Mesa de trabajo
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] gap-1 px-2 text-destructive hover:text-destructive"
                        disabled={deletingId === doc.id}
                      >
                        {deletingId === doc.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                        Eliminar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-md">
                      <AlertDialogHeader>
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-full bg-destructive/10">
                            <AlertTriangle className="w-5 h-5 text-destructive" />
                          </div>
                          <AlertDialogTitle>¿Eliminar documento completo?</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3 pt-2">
                            <p className="text-sm">
                              Estás a punto de eliminar <strong>"{doc.name}"</strong> y todo su contenido asociado:
                            </p>
                            <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
                              <div className="flex justify-between items-center">
                                <span className="flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                                  Ubicaciones activas
                                </span>
                                <span className="font-medium">{doc.location_count}</span>
                              </div>
                              {doc.enriched_count > 0 && (
                                <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                                  <span className="flex items-center gap-1.5 pl-5">
                                    <Sparkles className="w-3 h-3" />
                                    de las cuales enriquecidas
                                  </span>
                                  <span className="font-medium">{doc.enriched_count}</span>
                                </div>
                              )}
                              {doc.deleted_count > 0 && (
                                <div className="flex justify-between items-center text-muted-foreground">
                                  <span className="flex items-center gap-1.5 pl-5">
                                    <Trash2 className="w-3 h-3" />
                                    en papelera
                                  </span>
                                  <span className="font-medium">{doc.deleted_count}</span>
                                </div>
                              )}
                              {doc.route_count > 0 && (
                                <div className="flex justify-between items-center">
                                  <span className="flex items-center gap-1.5">
                                    <RouteIcon className="w-3.5 h-3.5 text-muted-foreground" />
                                    Rutas (con waypoints y paradas)
                                  </span>
                                  <span className="font-medium">{doc.route_count}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span className="flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                                  Registro del documento
                                </span>
                                <span className="font-medium">1</span>
                              </div>
                            </div>
                            <p className="text-xs text-destructive font-medium">
                              Esta acción es irreversible. Los datos no se pueden recuperar.
                            </p>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(doc.id, doc.name)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Eliminar todo permanentemente
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
