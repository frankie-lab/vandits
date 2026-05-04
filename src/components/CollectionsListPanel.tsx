/**
 * CollectionsListPanel — Lista las colecciones del usuario con CRUD inline y
 * toggle de visibilidad en mapa. La visibilidad reusa el bus `itinerary-focus`
 * (mismo mecanismo que usa el panel de itinerarios para resaltar puntos).
 *
 * Reglas:
 *  - No emojis: todos los iconos son SVG Lucide.
 *  - Sync vía custom events (`collections-updated`).
 *  - El toggle resuelve los locationIds de items tipo `place`/`waypoint` y los
 *    envía al evento global para que el mapa filtre/destaque.
 */
import React, { useCallback, useState } from 'react';
import { Folder, Plus, Pencil, Trash2, Eye, EyeOff, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCollections } from '@/domains/content/hooks/use-collections';
import { collectionService } from '@/services/collection.service';
import type { Collection } from '@/domains/v2';
import { toast } from 'sonner';

interface Props {
  visibleCollectionIds: Set<string>;
  onToggleVisibility: (collection: Collection) => void;
}

function CollectionRow({
  collection,
  isVisible,
  onToggleVisibility,
  onEdit,
  onDelete,
  isEditing,
  onSaveEdit,
  onCancelEdit,
}: {
  collection: Collection;
  isVisible: boolean;
  onToggleVisibility: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isEditing: boolean;
  onSaveEdit: (newName: string) => void;
  onCancelEdit: () => void;
}) {
  const [draft, setDraft] = useState(collection.name);

  if (isEditing) {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 flex items-center gap-2">
        <Folder className="w-4 h-4 shrink-0" style={{ color: collection.color || undefined }} />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 flex-1"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit(draft.trim());
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onSaveEdit(draft.trim())}>
          <Check className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCancelEdit}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 transition-all ${
        isVisible
          ? 'border-primary/30 bg-primary/5 shadow-sm'
          : 'border-border/60 bg-card hover:bg-accent/30 hover:border-border'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Folder className="w-4 h-4 shrink-0" style={{ color: collection.color || undefined }} />
        <h4 className="font-bold text-sm truncate flex-1">{collection.name}</h4>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 rounded-full ${isVisible ? 'text-primary' : 'text-muted-foreground'}`}
            onClick={onToggleVisibility}
            title={isVisible ? 'Ocultar en mapa' : 'Mostrar en mapa'}
          >
            {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-foreground" onClick={onEdit}>
            <Pencil className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-destructive" onClick={onDelete}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {collection.description && (
        <p className="text-[11px] text-muted-foreground mt-1 truncate">{collection.description}</p>
      )}
    </div>
  );
}

export function CollectionsListPanel({ visibleCollectionIds, onToggleVisibility }: Props) {
  const { collections, loading, create, update, remove } = useCollections();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const handleSaveEdit = useCallback(async (id: string, name: string) => {
    if (!name) return;
    try {
      await update(id, { name });
      setEditingId(null);
      toast.success('Colección actualizada');
    } catch (e: any) {
      toast.error('No se pudo guardar', { description: e?.message });
    }
  }, [update]);

  const handleDelete = useCallback(async (collection: Collection) => {
    if (!confirm(`¿Eliminar la colección "${collection.name}"? Los puntos no se borrarán.`)) return;
    try {
      const items = await collectionService.getItems(collection.id);
      for (const it of items) {
        await collectionService.removeItem(collection.id, it.itemType, it.itemId);
      }
      await remove(collection.id);
      toast.success('Colección eliminada');
    } catch (e: any) {
      toast.error('No se pudo eliminar', { description: e?.message });
    }
  }, [remove]);

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
          <Folder className="w-8 h-8 mx-auto mb-2 opacity-50" />
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
                onToggleVisibility={() => onToggleVisibility(c)}
                onEdit={() => setEditingId(c.id)}
                onDelete={() => handleDelete(c)}
                isEditing={editingId === c.id}
                onSaveEdit={(name) => handleSaveEdit(c.id, name)}
                onCancelEdit={() => setEditingId(null)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
