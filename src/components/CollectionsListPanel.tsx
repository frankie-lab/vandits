/**
 * CollectionsListPanel — Lista las colecciones del usuario con expand inline
 * (chevron), edición de apariencia (color + icono Lucide) y borrado.
 *
 * Reglas:
 *  - Expand inline (chevron): muestra puntos y rutas dentro de la fila.
 *  - Click en el nombre: abre la vista enfocada (Focus) — manejada por el padre.
 *  - El icono y color de la colección se aplican como tinte sobre todos sus
 *    miembros cuando la colección está visible (helper collection-visibility).
 *  - No emojis: SVG Lucide.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Loader2, Check, X,
  ChevronRight, ChevronDown, MapPin, Route as RouteIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCollections } from '@/domains/content/hooks/use-collections';
import { collectionService } from '@/services/collection.service';
import type { Collection, CollectionItem } from '@/domains/v2';
import { toast } from 'sonner';
import { CollectionAppearanceDialog, getCollectionIconComponent } from './CollectionAppearanceDialog';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  visibleCollectionIds: Set<string>;
  onToggleVisibility: (collection: Collection) => void;
  onFocusCollection: (collection: Collection) => void;
}

interface ExpandedContent {
  loading: boolean;
  places: { id: string; name: string }[];
  routes: { id: string; name: string }[];
}

function CollectionRow({
  collection,
  isVisible,
  isExpanded,
  expanded,
  onToggleVisibility,
  onToggleExpand,
  onFocus,
  onEditAppearance,
  onDelete,
}: {
  collection: Collection;
  isVisible: boolean;
  isExpanded: boolean;
  expanded: ExpandedContent | null;
  onToggleVisibility: () => void;
  onToggleExpand: () => void;
  onFocus: () => void;
  onEditAppearance: () => void;
  onDelete: () => void;
}) {
  const Icon = getCollectionIconComponent(collection.icon);
  const tint = collection.color || '#6b7280';

  return (
    <div
      className={`w-full min-w-0 rounded-xl border transition-all overflow-hidden ${
        isVisible
          ? 'border-primary/30 bg-primary/5 shadow-sm'
          : 'border-border/60 bg-card hover:bg-accent/30 hover:border-border'
      }`}
    >
      <div className="flex items-center gap-1 px-2 py-2 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0 text-muted-foreground"
          onClick={onToggleExpand}
          aria-label={isExpanded ? 'Contraer' : 'Expandir'}
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </Button>
        <button
          type="button"
          onClick={onFocus}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
        >
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: tint }}
          >
            <Icon className="w-3.5 h-3.5 text-white" />
          </span>
          <h4 className="font-bold text-sm truncate flex-1">{collection.name}</h4>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost" size="sm"
            className={`h-6 w-6 p-0 rounded-full ${isVisible ? 'text-primary' : 'text-muted-foreground'}`}
            onClick={onToggleVisibility}
            title={isVisible ? 'Ocultar en mapa' : 'Mostrar en mapa'}
          >
            {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-foreground"
            onClick={onEditAppearance}
            title="Editar nombre, color e icono"
          >
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title="Eliminar colección"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border/40 bg-background/40 px-3 py-2">
          {!expanded || expanded.loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Cargando contenido…
            </div>
          ) : expanded.places.length === 0 && expanded.routes.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">Colección vacía</p>
          ) : (
            <div className="space-y-1.5">
              {expanded.places.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Puntos · {expanded.places.length}
                  </p>
                  <ul className="space-y-0.5">
                    {expanded.places.map(p => (
                      <li key={p.id} className="flex items-center gap-1.5 text-xs">
                        <MapPin className="w-3 h-3 shrink-0" style={{ color: tint }} />
                        <span className="truncate">{p.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {expanded.routes.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Rutas · {expanded.routes.length}
                  </p>
                  <ul className="space-y-0.5">
                    {expanded.routes.map(r => (
                      <li key={r.id} className="flex items-center gap-1.5 text-xs">
                        <RouteIcon className="w-3 h-3 shrink-0" style={{ color: tint }} />
                        <span className="truncate">{r.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CollectionsListPanel({ visibleCollectionIds, onToggleVisibility, onFocusCollection }: Props) {
  const { collections, loading, create, update, remove } = useCollections();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingAppearance, setEditingAppearance] = useState<Collection | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Collection | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<Record<string, ExpandedContent>>({});

  const loadExpandedContent = useCallback(async (collectionId: string) => {
    setExpandedContent(prev => ({ ...prev, [collectionId]: { loading: true, places: [], routes: [] } }));
    try {
      const items = await collectionService.getItems(collectionId);
      const placeIds = items.filter(i => i.itemType === 'place' || i.itemType === 'waypoint').map(i => i.itemId);
      const routeIds = items.filter(i => i.itemType === 'route').map(i => i.itemId);

      const [placesRes, routesRes] = await Promise.all([
        placeIds.length > 0
          ? supabase.from('locations').select('id, name').in('id', placeIds).is('deleted_at', null)
          : Promise.resolve({ data: [], error: null } as any),
        routeIds.length > 0
          ? supabase.from('routes').select('id, name').in('id', routeIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      setExpandedContent(prev => ({
        ...prev,
        [collectionId]: {
          loading: false,
          places: (placesRes.data || []).map((p: any) => ({ id: p.id, name: p.name || 'Sin nombre' })),
          routes: (routesRes.data || []).map((r: any) => ({ id: r.id, name: r.name || 'Sin nombre' })),
        },
      }));
    } catch {
      setExpandedContent(prev => ({ ...prev, [collectionId]: { loading: false, places: [], routes: [] } }));
    }
  }, []);

  const handleToggleExpand = useCallback((c: Collection) => {
    if (expandedId === c.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(c.id);
    if (!expandedContent[c.id]) loadExpandedContent(c.id);
  }, [expandedId, expandedContent, loadExpandedContent]);

  // Refresh expanded content when collections list changes (after edits/visibility)
  useEffect(() => {
    if (expandedId) loadExpandedContent(expandedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections.length]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await create({ name });
      setNewName('');
      setCreating(false);
      toast.success('Colección creada');
    } catch (e: any) {
      toast.error('No se pudo crear', { description: e?.message });
    }
  }, [newName, create]);

  const handleSaveAppearance = useCallback(async (id: string, updates: { name: string; color: string; icon: string }) => {
    try {
      await update(id, updates);
      toast.success('Colección actualizada');
    } catch (e: any) {
      toast.error('No se pudo guardar', { description: e?.message });
    }
  }, [update]);

  const handleConfirmDelete = useCallback(async () => {
    const collection = pendingDelete;
    if (!collection) return;
    try {
      const items = await collectionService.getItems(collection.id);
      for (const it of items) {
        await collectionService.removeItem(collection.id, it.itemType, it.itemId);
      }
      await remove(collection.id);
      toast.success('Colección eliminada');
    } catch (e: any) {
      toast.error('No se pudo eliminar', { description: e?.message });
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete, remove]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden p-3 gap-3">
      {creating ? (
        <div className="flex items-center gap-2 shrink-0">
          <Input
            placeholder="Nombre de la colección"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            className="h-9 flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
          />
          <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
            <Check className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(''); }}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <Button size="sm" className="w-full shrink-0" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva colección
        </Button>
      )}

      {collections.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No hay colecciones</p>
          <p className="text-xs mt-1">Crea tu primera colección para agrupar puntos</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-2 pr-1">
            {collections.map((c) => (
              <CollectionRow
                key={c.id}
                collection={c}
                isVisible={visibleCollectionIds.has(c.id)}
                isExpanded={expandedId === c.id}
                expanded={expandedContent[c.id] ?? null}
                onToggleVisibility={() => onToggleVisibility(c)}
                onToggleExpand={() => handleToggleExpand(c)}
                onFocus={() => onFocusCollection(c)}
                onEditAppearance={() => setEditingAppearance(c)}
                onDelete={() => setPendingDelete(c)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {editingAppearance && (
        <CollectionAppearanceDialog
          open={!!editingAppearance}
          collection={editingAppearance}
          onClose={() => setEditingAppearance(null)}
          onSave={(updates) => handleSaveAppearance(editingAppearance.id, updates)}
        />
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la colección?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar la colección <strong>{pendingDelete?.name}</strong>.
              Los puntos y rutas que contiene NO se borrarán: solo se quita la
              agrupación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
