import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Calendar,
  MapPin,
  Trash2,
  Filter,
  Loader2,
  FolderOpen,
  Sparkles,
  AlertCircle,
  Eye,
  RefreshCw,
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
import { useLocationsStore } from '@/store/locations-store';
import { toast } from 'sonner';

interface DocInfo {
  id: string;
  name: string;
  original_filename: string | null;
  created_at: string;
  location_count: number;
  enriched_count: number;
  deleted_count: number;
}

export function DocumentsPanel() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  

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
          const [active, enrichedQ, deletedQ] = await Promise.all([
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
          ]);
          return {
            ...doc,
            location_count: active.count ?? 0,
            enriched_count: enrichedQ.count ?? 0,
            deleted_count: deletedQ.count ?? 0,
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
      // Soft-delete locations first
      const { error: locError } = await supabase
        .from('locations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('document_id', docId)
        .is('deleted_at', null);

      if (locError) throw locError;

      // Delete the document record
      const { error: docError } = await supabase
        .from('documents')
        .delete()
        .eq('id', docId);

      if (docError) throw docError;

      toast.success(`"${docName}" eliminado`);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      window.dispatchEvent(new CustomEvent('trash-updated'));
      window.dispatchEvent(new CustomEvent('store-updated'));
    } catch (e) {
      console.error('Error deleting document:', e);
      toast.error('Error al eliminar documento');
    } finally {
      setDeletingId(null);
    }
  };

  const handleFilterByDocument = (docId: string, docName: string) => {
    window.dispatchEvent(new CustomEvent('filter-by-document', { detail: { documentId: docId, documentName: docName } }));
    toast.info(`Filtrando por "${docName}"`);
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
                <div className="flex items-center gap-1 mt-2 pl-[38px] opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleFilterByDocument(doc.id, doc.name)}
                  >
                    <Eye className="w-3 h-3" />
                    Ver en mapa
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
                          Se moverán las {doc.location_count} ubicaciones de "{doc.name}" a la papelera.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(doc.id, doc.name)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Eliminar
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
