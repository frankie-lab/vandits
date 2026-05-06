/**
 * CollectionsListPanel — Lista de colecciones del usuario.
 *
 * Funciones:
 *  - Chevron: expande inline (lazy load) el contenido (puntos + rutas).
 *  - Click en nombre: abre la vista enfocada (Focus) — manejada por el padre.
 *  - Badge de conteo en cada fila (puntos · rutas), prefetch en lote.
 *  - Ojo: activa/desactiva el TINTE de la colección sobre el mapa
 *         (anillo coloreado en marcadores miembros, polilínea coloreada en
 *         rutas miembros). NO oculta el resto del catálogo.
 *  - Lápiz: edita SOLO el nombre, inline en la propia fila.
 *  - Paleta: abre el diálogo de apariencia (color + icono).
 *  - Papelera: confirma con AlertDialog y borra (no toca puntos/rutas).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Loader2, Check, X,
  ChevronRight, ChevronDown, MapPin, Route as RouteIcon, Palette,
  MoreVertical, Globe, Lock, Inbox,
} from 'lucide-react';
import { useAuth } from '@/domains/identity';
import {
  recomputeOrphanPoints,
  subscribeOrphanPoints,
  getOrphanCount,
  isOrphanGroupVisible,
  toggleOrphanVisibility,
  setOrphanVisibility,
  wireOrphanAutoRecompute,
} from '@/domains/content/lib/orphan-points';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCollections } from '@/domains/content/hooks/use-collections';
import { collectionService } from '@/services/collection.service';
import type { Collection } from '@/domains/v2';
import { toast } from 'sonner';
import { CollectionAppearanceDialog, getCollectionIconComponent } from './CollectionAppearanceDialog';
import { supabase } from '@/integrations/supabase/client';
import {
  subscribeCollectionVisibility,
  getVisibleCollectionIds,
  toggleCollectionVisibility as toggleCollectionVisibilityHelper,
} from '@/domains/content/lib/collection-visibility';
import { getReadableForeground, isLightColor } from '@/shared/lib/color-contrast';

interface Props {
  /** @deprecated Si no se pasa, el panel lee del helper único (ADR 004). */
  visibleCollectionIds?: Set<string>;
  /** @deprecated Si no se pasa, usa toggleCollectionVisibility del helper. */
  onToggleVisibility?: (collection: Collection) => void;
  onFocusCollection: (collection: Collection) => void;
  /** Click en la fila virtual "Sin colección". */
  onFocusOrphans?: () => void;
}

interface ExpandedContent {
  loading: boolean;
  places: { id: string; name: string }[];
  routes: { id: string; name: string }[];
}

interface Counts { total: number }

function CountsBadge({ counts }: { counts?: Counts }) {
  if (!counts) {
    return (
      <span className="text-[10px] tabular-nums text-muted-foreground/70 px-1 shrink-0">…</span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground bg-muted/60 rounded-full px-1.5 py-0.5 shrink-0"
      title={`${counts.total} elementos`}
    >
      {counts.total}
    </span>
  );
}

function CollectionRow({
  collection,
  isVisible,
  isExpanded,
  expanded,
  counts,
  isRenaming,
  renameValue,
  setRenameValue,
  onCommitRename,
  onCancelRename,
  onStartRename,
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
  counts?: Counts;
  isRenaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
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

        {isRenaming ? (
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: tint,
                borderColor: isLightColor(tint) ? 'hsl(var(--border))' : 'transparent',
              }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: getReadableForeground(tint) }} />
            </span>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              className="h-7 text-sm flex-1 min-w-0"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitRename();
                if (e.key === 'Escape') onCancelRename();
              }}
              onBlur={onCommitRename}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onFocus}
            className="flex items-center gap-2 min-w-0 flex-1 text-left"
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: tint,
                borderColor: isLightColor(tint) ? 'hsl(var(--border))' : 'transparent',
              }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: getReadableForeground(tint) }} />
            </span>
            <h4 className="font-bold text-sm truncate flex-1">{collection.name}</h4>
            <span
              className={`shrink-0 flex items-center justify-center ${
                collection.inCatalog ? 'text-primary' : 'text-muted-foreground'
              }`}
              title={collection.inCatalog
                ? 'Catálogo: sus puntos aprobados aparecen en el mapa general'
                : 'Privada: solo visible si activas el ojo (sesión)'}
              aria-label={collection.inCatalog ? 'Catálogo' : 'Privada'}
            >
              {collection.inCatalog
                ? <Globe className="w-3 h-3" />
                : <Lock className="w-3 h-3" />}
            </span>
            <CountsBadge counts={counts} />
          </button>
        )}

        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost" size="sm"
            className={`h-6 w-6 p-0 rounded-full ${isVisible ? 'text-foreground' : 'text-muted-foreground'}`}
            onClick={onToggleVisibility}
            title={
              collection.inCatalog
                ? (isVisible ? 'Ocultar sus puntos del mapa (sesión)' : 'Mostrar sus puntos en el mapa (sesión)')
                : (isVisible ? 'Ocultar puntos privados (sesión)' : 'Mostrar puntos privados en el mapa (sesión)')
            }
          >
            {isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost" size="sm"
                className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-foreground"
                title="Más acciones"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onStartRename}>
                <Pencil className="w-3.5 h-3.5 mr-2" /> Renombrar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEditAppearance}>
                <Palette className="w-3.5 h-3.5 mr-2" /> Color e icono
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

export function CollectionsListPanel({ visibleCollectionIds: visibleProp, onToggleVisibility, onFocusCollection, onFocusOrphans }: Props) {
  const { user } = useAuth();
  const { collections, loading, create, update, remove } = useCollections();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingAppearance, setEditingAppearance] = useState<Collection | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Collection | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<Record<string, ExpandedContent>>({});
  const [counts, setCounts] = useState<Map<string, Counts>>(new Map());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Grupo virtual "Sin colección".
  const [orphanCount, setOrphanCount] = useState<number>(getOrphanCount());
  const [orphanVisible, setOrphanVisible] = useState<boolean>(isOrphanGroupVisible());
  useEffect(() => {
    if (!user?.id) return;
    wireOrphanAutoRecompute(user.id);
    void recomputeOrphanPoints(user.id);
    return subscribeOrphanPoints(() => {
      setOrphanCount(getOrphanCount());
      setOrphanVisible(isOrphanGroupVisible());
    });
  }, [user?.id]);
  // Recomputar cuando cambian colecciones / items.
  useEffect(() => {
    if (!user?.id) return;
    void recomputeOrphanPoints(user.id);
  }, [user?.id, collections.length]);

  // Visibilidad: si el padre la pasa (legacy), la usamos. Si no, suscripción
  // directa al helper único (ADR 004), evitando un Set paralelo desincronizado.
  const [internalVisible, setInternalVisible] = useState<Set<string>>(() => getVisibleCollectionIds());
  useEffect(() => {
    if (visibleProp) return; // El padre controla — no hace falta suscripción local
    return subscribeCollectionVisibility(() => setInternalVisible(getVisibleCollectionIds()));
  }, [visibleProp]);
  const visibleCollectionIds = visibleProp ?? internalVisible;

  const handleToggle = useCallback((c: Collection) => {
    if (onToggleVisibility) return onToggleVisibility(c);
    void toggleCollectionVisibilityHelper(c).catch((e: any) =>
      toast.error('No se pudo cambiar la visibilidad', { description: e?.message }),
    );
  }, [onToggleVisibility]);

  // Prefetch en lote de los conteos.
  const refreshCounts = useCallback(async () => {
    if (collections.length === 0) {
      setCounts(new Map());
      return;
    }
    try {
      const map = await collectionService.getItemCountsByCollection(collections.map(c => c.id));
      setCounts(map);
    } catch {/* noop */}
  }, [collections]);

  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  // Recontar cuando cambian items en colecciones (evento global emitido por
  // los flujos de añadir/quitar item).
  useEffect(() => {
    const handler = () => refreshCounts();
    window.addEventListener('collection-items-changed', handler);
    return () => window.removeEventListener('collection-items-changed', handler);
  }, [refreshCounts]);

  const loadExpandedContent = useCallback(async (collectionId: string) => {
    setExpandedContent(prev => ({ ...prev, [collectionId]: { loading: true, places: [], routes: [] } }));
    try {
      const items = await collectionService.getItems(collectionId);
      const placeIds = items.filter(i => i.itemType === 'place' || i.itemType === 'waypoint').map(i => i.itemId);
      const routeIds = items.filter(i => i.itemType === 'route').map(i => i.itemId);

      // Chunk .in() to avoid URL-length explosion when collections hold
      // hundreds/thousands of items.
      const CHUNK = 200;
      const fetchInChunks = async (table: 'locations' | 'routes', ids: string[]) => {
        const out: { id: string; name: string | null }[] = [];
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const q = supabase.from(table).select('id, name').in('id', slice);
          const { data, error } = table === 'locations'
            ? await q.is('deleted_at', null)
            : await q;
          if (error) throw error;
          out.push(...(data as any[] ?? []));
        }
        return out;
      };

      const [places, routes] = await Promise.all([
        placeIds.length > 0 ? fetchInChunks('locations', placeIds) : Promise.resolve([]),
        routeIds.length > 0 ? fetchInChunks('routes', routeIds) : Promise.resolve([]),
      ]);

      setExpandedContent(prev => ({
        ...prev,
        [collectionId]: {
          loading: false,
          places: places.map((p: any) => ({ id: p.id, name: p.name || 'Sin nombre' })),
          routes: routes.map((r: any) => ({ id: r.id, name: r.name || 'Sin nombre' })),
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

  // Refresh expanded content when collections list changes
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

  const handleStartRename = useCallback((c: Collection) => {
    setRenamingId(c.id);
    setRenameValue(c.name);
  }, []);

  const handleCommitRename = useCallback(async () => {
    if (!renamingId) return;
    const c = collections.find(x => x.id === renamingId);
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!c || !trimmed || trimmed === c.name) return;
    try {
      await update(c.id, { name: trimmed });
      toast.success('Nombre actualizado');
    } catch (e: any) {
      toast.error('No se pudo renombrar', { description: e?.message });
    }
  }, [renamingId, renameValue, collections, update]);

  const handleSaveAppearance = useCallback(async (id: string, updates: { name: string; color: string; icon: string; inCatalog: boolean }) => {
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
      window.dispatchEvent(new CustomEvent('collection-items-changed', { detail: { collectionId: collection.id } }));
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
      <div className="flex flex-col gap-2 p-3" aria-busy="true" aria-label="Cargando colecciones">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-14 rounded-md bg-muted/40 animate-pulse"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
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

      {collections.length === 0 && orphanCount === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No hay colecciones</p>
          <p className="text-xs mt-1">Crea tu primera colección para agrupar puntos</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0 w-full [&>[data-radix-scroll-area-viewport]>div]:!block">
          <div className="space-y-2 pr-1 w-full min-w-0">
            {orphanCount > 0 && (
              <div
                className={`w-full min-w-0 rounded-xl border transition-all overflow-hidden ${
                  orphanVisible
                    ? 'border-primary/30 bg-primary/5 shadow-sm'
                    : 'border-border/60 bg-card hover:bg-accent/30 hover:border-border'
                }`}
              >
                <div className="flex items-center gap-1 px-2 py-2 min-w-0">
                  <div className="w-6 h-6 shrink-0" aria-hidden />
                  <button
                    type="button"
                    onClick={() => { setOrphanVisibility(true); onFocusOrphans?.(); }}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    title="Ver puntos sin colección"
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border bg-muted"
                      style={{ borderColor: 'hsl(var(--border))' }}
                    >
                      <Inbox className="w-3.5 h-3.5 text-muted-foreground" />
                    </span>
                    <h4 className="font-bold text-sm truncate flex-1">Sin colección</h4>
                    <span
                      className="inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground bg-muted/60 rounded-full px-1.5 py-0.5 shrink-0"
                      title={`${orphanCount} puntos sin colección`}
                    >
                      {orphanCount}
                    </span>
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost" size="sm"
                      className={`h-6 w-6 p-0 rounded-full ${orphanVisible ? 'text-foreground' : 'text-muted-foreground'}`}
                      onClick={() => { toggleOrphanVisibility(); }}
                      title={orphanVisible ? 'Ocultar puntos sin colección del mapa (sesión)' : 'Mostrar puntos sin colección en el mapa (sesión)'}
                    >
                      {orphanVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {collections.map((c) => (
              <CollectionRow
                key={c.id}
                collection={c}
                isVisible={visibleCollectionIds.has(c.id)}
                isExpanded={expandedId === c.id}
                expanded={expandedContent[c.id] ?? null}
                counts={counts.get(c.id)}
                isRenaming={renamingId === c.id}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                onCommitRename={handleCommitRename}
                onCancelRename={() => setRenamingId(null)}
                onStartRename={() => handleStartRename(c)}
                onToggleVisibility={() => handleToggle(c)}
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
