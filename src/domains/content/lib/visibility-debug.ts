/**
 * visibility-debug — Helper genérico de diagnóstico de visibilidad en mapa global.
 *
 * Expone `window.__whyHidden(locationId)` para CUALQUIER id de location.
 * Recorre las mismas puertas que aplica el pipeline real
 * (`isLocationVisibleInGlobalMap` + `matchesLocationFilters`) y reporta
 * cuál es la primera que devuelve false. Solo lectura, sin side-effects en
 * producción.
 *
 * Importado en el root del app (Index.tsx) para registrarse en window.
 * Se puede borrar sin afectar a la app.
 */
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore, type AnnotatedLocation } from '@/domains/content/store/locations-store';
import {
  isPointInAnyCatalogCollection,
  isPointInAnyVisibleCatalogCollection,
  isPointVisibleViaCollections,
  getCollectionVisibilityState,
} from '@/domains/content/lib/collection-visibility';
import { isLocationVisibleInGlobalMap } from '@/domains/content/lib/document-visibility';
import { matchesLocationFilters } from '@/domains/content/lib/location-filtering';
import { isOrphan, isOrphanGroupVisible, isOrphanLoaded } from '@/domains/content/lib/orphan-points';

type GateRow = {
  gate: string;
  pass: boolean | 'n/a';
  detail: string;
};

async function whyHidden(locationId: string): Promise<void> {
  if (!locationId || typeof locationId !== 'string') {
    console.warn('[whyHidden] usage: window.__whyHidden("<location-id>")');
    return;
  }

  const rows: GateRow[] = [];
  const log = (gate: string, pass: boolean | 'n/a', detail = '') =>
    rows.push({ gate, pass, detail });

  // 0. ¿Está en el store?
  const state = useLocationsStore.getState();
  const loc = state.documents
    .flatMap(d => d.locations as AnnotatedLocation[])
    .find(l => l.id === locationId);

  if (!loc) {
    log('0. in-store', false, 'no aparece en locations-store; revisa RLS o fetch');
    // Comprobamos DB
    try {
      const { data } = await supabase
        .from('locations')
        .select('id,name,is_approved,deleted_at,document_id,owner_user_id,visibility')
        .eq('id', locationId)
        .maybeSingle();
      if (!data) {
        log('0b. in-db', false, 'tampoco existe en DB (id inválido o borrado fuerte)');
      } else {
        log('0b. in-db', true, JSON.stringify(data));
      }
    } catch (e) {
      log('0b. in-db', 'n/a', String(e));
    }
    console.table(rows);
    return;
  }

  log('0. in-store', true, `name="${loc.name}" doc=${loc.documentId ?? '-'}`);

  // 1. is_approved
  const approved = loc.isApproved === true;
  log('1. is_approved', approved, approved ? 'true' : 'false (pending approval)');

  // 2. Ownership
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? null;
  const ownership =
    !currentUserId ? 'n/a' :
    !loc._docUserId ? 'manual/sin doc' :
    loc._docUserId === currentUserId ? 'own' : `followed (${loc._docUserId.slice(0, 8)})`;
  log('2. ownership', currentUserId ? true : 'n/a', ownership);

  // 3. Orphan group
  const orphanLoaded = isOrphanLoaded();
  const isOrphanPoint = orphanLoaded ? isOrphan(loc.id) : false;
  const orphanVisible = isOrphanGroupVisible();
  log('3. orphan-group',
    orphanLoaded ? (isOrphanPoint ? orphanVisible : 'n/a') : 'n/a',
    `loaded=${orphanLoaded} isOrphan=${isOrphanPoint} groupVisible=${orphanVisible}`);

  // 4. Catalog membership
  const inAnyCatalog = isPointInAnyCatalogCollection(loc.id);
  log('4a. in-any-catalog-collection', inAnyCatalog,
    inAnyCatalog ? 'es miembro de ≥1 colección catálogo (snapshot in-memory)' : 'no miembro');

  if (inAnyCatalog) {
    const inAnyVisible = isPointInAnyVisibleCatalogCollection(loc.id);
    log('4b. in-any-VISIBLE-catalog', inAnyVisible,
      inAnyVisible ? 'al menos una colección catálogo visible contiene el punto' :
      'TODAS las colecciones catálogo del punto están con el ojo OFF (o índice rancio)');
  }

  // 5. Private collection forcing visibility
  const viaPrivate = isPointVisibleViaCollections(loc.id);
  log('5. via-private-collection', viaPrivate ? true : 'n/a',
    viaPrivate ? 'forzado visible por colección privada' : 'sin colección privada visible');

  // 6. Resultado canónico
  const globalVisible = isLocationVisibleInGlobalMap(loc);
  log('6. isLocationVisibleInGlobalMap', globalVisible,
    globalVisible ? 'pasaría la puerta de visibilidad global' : 'OCULTO por regla global');

  // 7. Filtros activos
  const filters = state.filters;
  const activeFilters = Object.entries(filters).filter(([, v]) =>
    v !== undefined && v !== '' && v !== null && (!Array.isArray(v) || v.length > 0)
  );
  if (activeFilters.length === 0) {
    log('7. matchesLocationFilters', 'n/a', 'sin filtros activos');
  } else {
    const passes = matchesLocationFilters(loc, filters, {
      currentUserId,
      hiddenFollowedUserIds: state.hiddenFollowedUserIds ?? [],
    } as any);
    log('7. matchesLocationFilters', passes,
      `${passes ? 'pasa' : 'BLOQUEADO por'} filtros: ${activeFilters.map(([k]) => k).join(', ')}`);
  }

  // 8. Visible final
  const finalVisible = globalVisible && (
    activeFilters.length === 0 ||
    matchesLocationFilters(loc, filters, {
      currentUserId,
      hiddenFollowedUserIds: state.hiddenFollowedUserIds ?? [],
    } as any)
  );
  log('FINAL', finalVisible, finalVisible ? 'DEBERÍA VERSE' : 'OCULTO');

  // Contexto extra
  const collVis = getCollectionVisibilityState();
  const visibleCollIds = Object.keys(collVis.visible);
  console.groupCollapsed(`[whyHidden] ${loc.name} (${loc.id})`);
  console.table(rows);
  console.log('Contexto:', {
    documentId: loc.documentId,
    isApproved: loc.isApproved,
    _docUserId: loc._docUserId,
    placeType: loc.placeType,
    visibleCollectionsInSession: visibleCollIds.length,
    activeFilterKeys: activeFilters.map(([k]) => k),
  });
  console.groupEnd();
}

export function registerVisibilityDebug() {
  if (typeof window === 'undefined') return;
  (window as any).__whyHidden = whyHidden;
}
