import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Calendar,
  MapPin,
  Trash2,
  Loader2,
  FolderOpen,
  Sparkles,
  Eye,
  RefreshCw,
  Route as RouteIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

interface DocInfo {
  id: string;
  name: string;
  original_filename: string | null;
  created_at: string;
  location_count: number;
  enriched_count: number;
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

  const fetchDocs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: rawDocs, error } = await supabase
        .from('documents')
        .select('id, name, original_filename, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const enriched = await Promise.all(
        (rawDocs || []).map(async (doc) => {
          const [active, enrichedQ, deletedQ, routesQ] = await Promise.all([
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
              .not('deleted_at', 'is', null),
            // Count routes linked to this document via route_preferences
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

      // Notify other components to refresh
      window.dispatchEvent(new CustomEvent('store-updated'));
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

  return (
    <div className="flex flex-col h-full">
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
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="px-4 py-3 hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 rounded-md bg-primary/10 text-primary flex-shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    {doc.original_filename && doc.original_filename !== doc.name && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {doc.original_filename}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(doc.created_at).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        <MapPin className="w-2.5 h-2.5 mr-0.5" />
                        {doc.location_count}
                      </Badge>
                      {doc.route_count > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          <RouteIcon className="w-2.5 h-2.5 mr-0.5" />
                          {doc.route_count}
                        </Badge>
                      )}
                      {doc.enriched_count > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                          {doc.enriched_count}
                        </Badge>
                      )}
                      {doc.deleted_count > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          <Trash2 className="w-2.5 h-2.5 mr-0.5" />
                          {doc.deleted_count} borradas
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className={`flex items-center gap-1 mt-2 pl-[38px] transition-opacity ${activeDocId === doc.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  <Button
                    variant={activeDocId === doc.id ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleViewOnMap(doc.id, doc.name)}
                  >
                    <Eye className="w-3 h-3" />
                    {activeDocId === doc.id ? 'Mostrando' : 'Ver en mapa'}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
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
                    <AlertDialogContent className="z-[2001]">
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminarán permanentemente las {doc.location_count} ubicaciones
                          {doc.route_count > 0 ? ` y ${doc.route_count} rutas` : ''} de "{doc.name}".
                          Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(doc.id, doc.name)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Eliminar permanentemente
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
