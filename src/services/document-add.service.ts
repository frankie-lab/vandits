// Helper único transversal para "Añadir" desde la vista de documento (Mesa de
// trabajo). Cinco modos:
//   - catalog     → marcar puntos seleccionados como aprobados + visibilidad
//   - itinerary   → crear ruta con los puntos como waypoints
//   - collection  → añadir a una collection (existente o nueva) como items
//   - route       → añadir a una ruta existente como waypoints
//   - tag         → fusionar etiquetas con enriched_data.etiquetas
//
// Todo insert/update masivo de locations relacionado con un documento PASA
// por este servicio. No se permiten parches puntuales.

import { supabase } from '@/integrations/supabase/client';
import { collectionRepository } from '@/repositories/collection.repository';

export type AddMode = 'catalog' | 'itinerary' | 'collection' | 'route' | 'tag';
export type Visibility = 'public' | 'followers' | 'private';
export type AddScope = 'all' | 'selected' | 'approved';

export interface AddCommonOptions {
  docId: string;
  userId: string;
  /** Selected location ids in the doc view (used when scope='selected') */
  selectedIds?: string[];
}

export interface AddCatalogOptions extends AddCommonOptions {
  scope: AddScope;
  visibility: Visibility;
  autoEnrich?: boolean;
}

export interface AddCollectionOptions extends AddCommonOptions {
  scope: AddScope;
  /** Existing collection id, or null to create a new one */
  collectionId: string | null;
  /** When collectionId is null, fields to create the collection */
  newCollection?: {
    name: string;
    icon?: string;
    color?: string;
    visibility?: Visibility;
  };
}

export interface AddRouteOptions extends AddCommonOptions {
  scope: AddScope;
  routeId: string;
}

export interface AddTagOptions extends AddCommonOptions {
  scope: AddScope;
  tags: string[];
}

/** Resolve the location ids that should be affected based on scope */
async function resolveLocationIds(
  docId: string,
  scope: AddScope,
  selectedIds?: string[],
): Promise<string[]> {
  if (scope === 'selected') return selectedIds ?? [];

  let q = supabase.from('locations').select('id, is_approved').eq('document_id', docId).is('deleted_at', null);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  if (scope === 'approved') return rows.filter((r) => r.is_approved).map((r) => r.id);
  return rows.map((r) => r.id);
}

/** Mode: catalog — flip is_approved + visibility on the selected points */
export async function applyCatalog(opts: AddCatalogOptions): Promise<{ updated: number }> {
  const ids = await resolveLocationIds(opts.docId, opts.scope, opts.selectedIds);
  if (ids.length === 0) return { updated: 0 };

  const { error } = await supabase
    .from('locations')
    .update({ is_approved: true, visibility: opts.visibility })
    .in('id', ids);
  if (error) throw error;
  return { updated: ids.length };
}

/** Mode: collection — get/create collection then add the points as items */
export async function applyCollection(opts: AddCollectionOptions): Promise<{ added: number; collectionId: string }> {
  let cid = opts.collectionId;
  if (!cid) {
    if (!opts.newCollection?.name) throw new Error('newCollection.name is required');
    const created = await collectionRepository.insert({
      userId: opts.userId,
      name: opts.newCollection.name,
      description: undefined,
      icon: opts.newCollection.icon ?? 'folder',
      color: opts.newCollection.color ?? '#6b7280',
      visibility: opts.newCollection.visibility ?? 'private',
    });
    cid = created.id;
  }

  const ids = await resolveLocationIds(opts.docId, opts.scope, opts.selectedIds);
  if (ids.length === 0) return { added: 0, collectionId: cid! };

  // collection_items uses item_type = 'place' for locations
  const rows = ids.map((id, i) => ({
    collection_id: cid,
    item_type: 'place' as const,
    item_id: id,
    position: i,
  }));

  // Chunk to avoid huge inserts
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from('collection_items').insert(batch);
    if (error) throw error;
  }

  return { added: ids.length, collectionId: cid! };
}

/** Mode: route — append the points as waypoints to an existing route.
 *  Uses route_waypoints table; positions append at the end.
 *  Pulls name + lat/lng from the location row (required NOT NULL columns). */
export async function applyRoute(opts: AddRouteOptions): Promise<{ added: number }> {
  const ids = await resolveLocationIds(opts.docId, opts.scope, opts.selectedIds);
  if (ids.length === 0) return { added: 0 };

  // Determine current max waypoint position to append after it
  const { data: existing, error: exErr } = await supabase
    .from('route_waypoints')
    .select('position')
    .eq('route_id', opts.routeId)
    .order('position', { ascending: false })
    .limit(1);
  if (exErr) throw exErr;
  const startPos = (existing?.[0]?.position ?? -1) + 1;

  // Fetch coordinates and name (NOT NULL on the table)
  const { data: locRows, error: locErr } = await supabase
    .from('locations')
    .select('id, name, latitude, longitude')
    .in('id', ids);
  if (locErr) throw locErr;
  const locMap = new Map((locRows ?? []).map((r) => [r.id, r]));

  const rows = ids
    .map((id, i) => {
      const l = locMap.get(id);
      if (!l) return null;
      return {
        route_id: opts.routeId,
        location_id: id,
        name: l.name,
        latitude: l.latitude,
        longitude: l.longitude,
        position: startPos + i,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from('route_waypoints').insert(batch);
    if (error) throw error;
  }
  return { added: rows.length };
}

/** Mode: tag — merge tags into enriched_data.etiquetas of every selected point */
export async function applyTag(opts: AddTagOptions): Promise<{ updated: number }> {
  const ids = await resolveLocationIds(opts.docId, opts.scope, opts.selectedIds);
  if (ids.length === 0 || opts.tags.length === 0) return { updated: 0 };

  // Fetch current enriched_data, merge tags client-side, then update.
  const cleanTags = Array.from(
    new Set(opts.tags.map((t) => t.replace(/^#/, '').toLowerCase().trim()).filter(Boolean)),
  );

  let updated = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from('locations')
      .select('id, enriched_data')
      .in('id', batch);
    if (error) throw error;

    await Promise.all(
      (data ?? []).map(async (row) => {
        const ed = (row.enriched_data as any) || {};
        const existing: string[] = Array.isArray(ed.etiquetas) ? ed.etiquetas : [];
        const existingSet = new Set(existing.map((t) => String(t).replace(/^#/, '').toLowerCase()));
        for (const t of cleanTags) existingSet.add(t);
        const next = Array.from(existingSet).map((t) => `#${t}`);
        const { error: upErr } = await supabase
          .from('locations')
          .update({ enriched_data: { ...ed, etiquetas: next } })
          .eq('id', row.id);
        if (upErr) throw upErr;
        updated++;
      }),
    );
  }

  return { updated };
}
