/**
 * SelectionActions — Acciones masivas sobre los puntos seleccionados.
 *
 * Se renderiza en el footer de FilterBar cuando selectedCount > 0.
 * Ofrece: Enriquecer IA, Exportar, Etiquetar, Reclasificar, Visitado,
 * Visibilidad, Mover a documento, y Eliminar (papelera).
 *
 * Reutiliza:
 *   - edge function `batch-enrich` (mismo contrato que BatchEnrichmentPanel).
 *   - helpers `exportToKML / exportToCSV / exportToJSON` de `@/lib/kml-parser`.
 *   - `supabase.from('locations').update(...).in('id', ids)` para bulk updates.
 */
import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Download,
  Tag as TagIcon,
  Layers,
  MoreHorizontal,
  Trash2,
  Loader2,
  MapPinCheck,
  MapPinOff,
  Eye,
  EyeOff,
  FolderInput,
  FileCode,
  FileSpreadsheet,
  FileJson,
  Map as MapIcon,
  Mountain,
  Plus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLocationsStore } from '@/domains/content';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { exportToKML, exportToCSV, exportToJSON } from '@/lib/kml-parser';
import {
  GeoLocation,
  ExportFormat,
  PLACE_TYPE_LABELS,
  PlaceType,
} from '@/types/location';

type ExportTarget = 'mymaps' | 'gurumaps' | 'general';

const PLACE_TYPES = Object.keys(PLACE_TYPE_LABELS) as PlaceType[];

function downloadBlob(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function SelectionActions() {
  const documents = useLocationsStore((s) => s.documents);
  const selectedLocations = useLocationsStore((s) => s.selectedLocations);
  const selectedDocument = useLocationsStore((s) => s.selectedDocument);
  const clearSelection = useLocationsStore((s) => s.clearSelection);

  const selectedIds = useMemo(() => Array.from(selectedLocations), [selectedLocations]);
  const count = selectedIds.length;

  const resolvedLocations = useMemo<GeoLocation[]>(() => {
    if (count === 0) return [];
    const idSet = new Set(selectedIds);
    const out: GeoLocation[] = [];
    for (const doc of documents) {
      for (const loc of doc.locations) {
        if (idSet.has(loc.id)) out.push(loc);
      }
    }
    return out;
  }, [documents, selectedIds, count]);

  // Conjunto de tags ya existentes (para sugerencias en el popover)
  const existingTags = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const doc of documents) {
      for (const loc of doc.locations) {
        loc.enrichedData?.etiquetas?.forEach((t) => set.add(t));
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [documents]);

  const [isWorking, setIsWorking] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  if (count === 0) return null;

  const refreshStore = () => {
    window.dispatchEvent(new CustomEvent('store-updated'));
    window.dispatchEvent(new CustomEvent('locations-refresh'));
  };

  // ---- 1. Enriquecer con IA ----
  const handleEnrich = async () => {
    setIsWorking(true);
    const toastId = toast.loading(`Enriqueciendo ${count} ubicaciones con IA...`);
    try {
      const documentId = selectedDocument?.id || resolvedLocations[0]?.documentId || 'consolidated';
      const { data, error } = await supabase.functions.invoke('batch-enrich', {
        body: { action: 'start', documentId, locationIds: selectedIds },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error, { id: toastId });
        return;
      }
      toast.success('Enriquecimiento iniciado en segundo plano', { id: toastId });
      window.dispatchEvent(new CustomEvent('enrichment-started', { detail: { jobId: data?.jobId } }));
    } catch (err) {
      console.error('Bulk enrich error:', err);
      toast.error('Error al iniciar enriquecimiento', { id: toastId });
    } finally {
      setIsWorking(false);
    }
  };

  // ---- 2. Exportar selección ----
  const handleExport = (format: ExportFormat, target: ExportTarget = 'general') => {
    if (resolvedLocations.length === 0) {
      toast.error('No hay puntos para exportar');
      return;
    }
    try {
      const docName = selectedDocument?.name || 'seleccion';
      let content: string;
      let mimeType: string;
      let extension: string;
      switch (format) {
        case 'kml':
          content = exportToKML(resolvedLocations, docName);
          mimeType = 'application/vnd.google-earth.kml+xml';
          extension = 'kml';
          break;
        case 'csv':
          content = exportToCSV(resolvedLocations);
          mimeType = 'text/csv';
          extension = 'csv';
          break;
        case 'json':
          content = exportToJSON(resolvedLocations);
          mimeType = 'application/json';
          extension = 'json';
          break;
      }
      const targetSuffix = target !== 'general' ? `_${target}` : '';
      const timestamp = new Date().toISOString().split('T')[0];
      downloadBlob(content, mimeType, `${docName}_seleccion${targetSuffix}_${timestamp}.${extension}`);
      toast.success(`Exportados ${resolvedLocations.length} puntos en ${format.toUpperCase()}`);
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Error al exportar');
    }
  };

  // ---- 3. Etiquetar (añadir / quitar tag) ----
  const applyTag = async (tag: string, mode: 'add' | 'remove') => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setIsWorking(true);
    const toastId = toast.loading(
      `${mode === 'add' ? 'Añadiendo' : 'Quitando'} etiqueta "${trimmed}"...`,
    );
    try {
      // Cargar enriched_data actual de los seleccionados
      const { data: rows, error: selErr } = await supabase
        .from('locations')
        .select('id, enriched_data')
        .in('id', selectedIds);
      if (selErr) throw selErr;

      const updates = (rows || []).map((row: any) => {
        const enriched = (row.enriched_data && typeof row.enriched_data === 'object')
          ? { ...row.enriched_data }
          : {};
        const current: string[] = Array.isArray(enriched.etiquetas) ? enriched.etiquetas : [];
        let nextTags: string[];
        if (mode === 'add') {
          nextTags = current.includes(trimmed) ? current : [...current, trimmed];
        } else {
          nextTags = current.filter((t) => t !== trimmed);
        }
        enriched.etiquetas = nextTags;
        return { id: row.id, enriched_data: enriched };
      });

      // Actualizar en chunks
      const CHUNK = 100;
      for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        await Promise.all(
          chunk.map((u) =>
            supabase.from('locations').update({ enriched_data: u.enriched_data }).eq('id', u.id),
          ),
        );
      }
      toast.success(
        `Etiqueta "${trimmed}" ${mode === 'add' ? 'añadida a' : 'quitada de'} ${updates.length} puntos`,
        { id: toastId },
      );
      setTagInput('');
      setTagPopoverOpen(false);
      refreshStore();
    } catch (err) {
      console.error('Bulk tag error:', err);
      toast.error('Error al actualizar etiquetas', { id: toastId });
    } finally {
      setIsWorking(false);
    }
  };

  // ---- 4. Reclasificar (place_type) ----
  const handleReclassify = async (placeType: PlaceType) => {
    setIsWorking(true);
    const toastId = toast.loading(`Reclasificando como "${PLACE_TYPE_LABELS[placeType]}"...`);
    try {
      const { error } = await supabase
        .from('locations')
        .update({ place_type: placeType })
        .in('id', selectedIds);
      if (error) throw error;
      toast.success(`${count} puntos reclasificados`, { id: toastId });
      refreshStore();
    } catch (err) {
      console.error('Bulk reclassify error:', err);
      toast.error('Error al reclasificar', { id: toastId });
    } finally {
      setIsWorking(false);
    }
  };

  // ---- 5. Marcar visitado / pendiente ----
  const handleSetVisited = async (visited: boolean) => {
    setIsWorking(true);
    const toastId = toast.loading(visited ? 'Marcando como visitados...' : 'Marcando como pendientes...');
    try {
      // customData es jsonb: leer→merge→escribir en chunks
      const { data: rows, error: selErr } = await supabase
        .from('locations')
        .select('id, custom_data')
        .in('id', selectedIds);
      if (selErr) throw selErr;

      const CHUNK = 100;
      const updates = (rows || []).map((row: any) => ({
        id: row.id,
        custom_data: { ...(row.custom_data || {}), visited: visited ? 'true' : 'false' },
      }));
      for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        await Promise.all(
          chunk.map((u) =>
            supabase.from('locations').update({ custom_data: u.custom_data }).eq('id', u.id),
          ),
        );
      }
      toast.success(`${updates.length} puntos actualizados`, { id: toastId });
      refreshStore();
    } catch (err) {
      console.error('Bulk visited error:', err);
      toast.error('Error al actualizar estado', { id: toastId });
    } finally {
      setIsWorking(false);
    }
  };

  // ---- 6. Cambiar visibilidad (catálogo / workspace) ----
  const handleVisibility = async (status: 'published' | 'draft') => {
    setIsWorking(true);
    const toastId = toast.loading(
      status === 'published' ? 'Publicando en Catálogo...' : 'Moviendo a Workspace...',
    );
    try {
      const { error } = await supabase
        .from('locations')
        .update({ status })
        .in('id', selectedIds);
      if (error) throw error;
      toast.success(`${count} puntos actualizados`, { id: toastId });
      refreshStore();
    } catch (err) {
      console.error('Bulk visibility error:', err);
      toast.error('Error al cambiar visibilidad', { id: toastId });
    } finally {
      setIsWorking(false);
    }
  };

  // ---- 7. Mover a documento ----
  const handleMoveToDocument = async (documentId: string | null) => {
    setIsWorking(true);
    const toastId = toast.loading('Moviendo puntos...');
    try {
      const { error } = await supabase
        .from('locations')
        .update({ document_id: documentId })
        .in('id', selectedIds);
      if (error) throw error;
      toast.success(`${count} puntos movidos`, { id: toastId });
      refreshStore();
    } catch (err) {
      console.error('Bulk move error:', err);
      toast.error('Error al mover puntos', { id: toastId });
    } finally {
      setIsWorking(false);
    }
  };

  // ---- 8. Eliminar (papelera) ----
  const handleDelete = async () => {
    setIsWorking(true);
    const toastId = toast.loading(`Eliminando ${count} puntos...`);
    try {
      const { error } = await supabase
        .from('locations')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', selectedIds);
      if (error) throw error;
      toast.success(`${count} puntos movidos a la papelera`, { id: toastId });
      clearSelection();
      window.dispatchEvent(new CustomEvent('trash-updated'));
      refreshStore();
    } catch (err) {
      console.error('Bulk delete error:', err);
      toast.error('Error al eliminar', { id: toastId });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground flex items-center gap-1">
          Acciones
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            {count}
          </Badge>
        </span>
        {isWorking && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* Fila principal: 4 acciones primarias + Más */}
      <div className="grid grid-cols-2 gap-1">
        {/* Enriquecer IA */}
        <Button
          variant="default"
          size="sm"
          onClick={handleEnrich}
          disabled={isWorking}
          className="h-8 text-xs justify-start gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Enriquecer IA
        </Button>

        {/* Exportar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isWorking}
              className="h-8 text-xs justify-start gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs">Para aplicación</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleExport('kml', 'mymaps')}>
              <MapIcon className="w-4 h-4 mr-2 text-blue-500" />
              Google My Maps (KML)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('kml', 'gurumaps')}>
              <Mountain className="w-4 h-4 mr-2 text-emerald-500" />
              Guru Maps (KML)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Formatos</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleExport('kml')}>
              <FileCode className="w-4 h-4 mr-2" />
              KML
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv')}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('json')}>
              <FileJson className="w-4 h-4 mr-2" />
              JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Etiquetar */}
        <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isWorking}
              className="h-8 text-xs justify-start gap-1.5"
            >
              <TagIcon className="w-3.5 h-3.5" />
              Etiquetar
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <div className="space-y-2">
              <div className="text-xs font-medium">Añadir o quitar etiqueta</div>
              <div className="flex gap-1">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Nombre de etiqueta..."
                  className="h-8 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyTag(tagInput, 'add');
                  }}
                />
                <Button
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => applyTag(tagInput, 'add')}
                  disabled={!tagInput.trim() || isWorking}
                  title="Añadir"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  onClick={() => applyTag(tagInput, 'remove')}
                  disabled={!tagInput.trim() || isWorking}
                  title="Quitar"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              {existingTags.length > 0 && (
                <>
                  <div className="text-[10px] text-muted-foreground">Existentes (clic para usar)</div>
                  <ScrollArea className="max-h-32">
                    <div className="flex flex-wrap gap-1 pr-2">
                      {existingTags.slice(0, 60).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTagInput(t)}
                          className="px-1.5 py-0.5 rounded-full bg-muted hover:bg-muted/80 text-[10px]"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Reclasificar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isWorking}
              className="h-8 text-xs justify-start gap-1.5"
            >
              <Layers className="w-3.5 h-3.5" />
              Reclasificar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
            <DropdownMenuLabel className="text-xs">Asignar tipo</DropdownMenuLabel>
            {PLACE_TYPES.map((pt) => (
              <DropdownMenuItem key={pt} onClick={() => handleReclassify(pt)}>
                {PLACE_TYPE_LABELS[pt]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Fila secundaria: Más + Eliminar */}
      <div className="flex gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isWorking}
              className="flex-1 h-8 text-xs justify-start gap-1.5"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              Más acciones
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs">Estado</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleSetVisited(true)}>
              <MapPinCheck className="w-4 h-4 mr-2 text-emerald-600" />
              Marcar visitados
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSetVisited(false)}>
              <MapPinOff className="w-4 h-4 mr-2 text-slate-600" />
              Marcar pendientes
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Visibilidad</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleVisibility('published')}>
              <Eye className="w-4 h-4 mr-2 text-green-600" />
              Publicar en Catálogo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleVisibility('draft')}>
              <EyeOff className="w-4 h-4 mr-2 text-amber-600" />
              Mover a Workspace
            </DropdownMenuItem>

            {documents.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput className="w-4 h-4 mr-2" />
                    Mover a documento
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56 max-h-80 overflow-y-auto">
                    <DropdownMenuItem onClick={() => handleMoveToDocument(null)}>
                      <X className="w-4 h-4 mr-2" />
                      Quitar de documento
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {documents.map((doc) => (
                      <DropdownMenuItem
                        key={doc.id}
                        onClick={() => handleMoveToDocument(doc.id)}
                      >
                        {doc.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              disabled={isWorking}
              className="h-8 w-8 shrink-0 border-red-300 text-red-600 hover:bg-red-50"
              title={`Eliminar ${count} puntos`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar {count} puntos seleccionados?</AlertDialogTitle>
              <AlertDialogDescription>
                Se moverán a la papelera. Podrás restaurarlos en los próximos 30 días.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
