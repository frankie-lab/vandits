/**
 * POI Source Resolver — capa 1 del pipeline canónico de POIs.
 *
 * Pipeline (ver `.lovable/plan.md` y futura mem
 * `mem://logic/poi/source-pipeline-canonical`):
 *
 *   raw POI
 *     -> resolvePoiSource          (qué es)        <-- ESTE ARCHIVO
 *     -> resolveShareability       (puede verlo este viewer)
 *     -> apply filterBySource      (filtro activo)
 *     -> resolveLayerVisibility    (capa + mute + zoom gate)
 *     -> resolveMarkerGrammar      (shape + color + decorations)
 *     -> render
 *
 * Esta capa decide UNA cosa: qué es el POI desde el punto de vista del
 * viewer. NO decide visibilidad, NO decide forma, NO aplica filtros.
 *
 * sourceType:
 *   - own       : owner === viewer
 *   - app       : marcador EXPLÍCITO `sourceKind='app'` (+ sourceId, groupId).
 *                 Nunca se infiere por owner especial — mezclar identidad de
 *                 usuario con fuente de sistema es la fuente de bugs que
 *                 estamos quitando.
 *   - source    : marcador EXPLÍCITO `sourceKind='external'` + sourceId.
 *   - followed  : resto (otro usuario). El estado real de follow se valida
 *                 en `resolveShareability`; aquí basta con identificarlo
 *                 como ajeno con owner conocido.
 *
 * Hashtags:
 *   - own       : `#<username>` o `#<uid-corto>` si no hay username.
 *   - followed  : `#<username>` o `#<uid-corto>`.
 *   - app       : `#vandits-app` + `#<groupId>` si existe.
 *   - source    : `#<sourceId>`.
 *
 * Cache: WeakMap por POI invalidada implícitamente cuando el array de POIs
 * se reemplaza (lo que sucede en cada `_docVersion` del store). El viewerUid
 * forma parte de la clave lógica vía namespace separado.
 */

import type { GeoLocation } from '@/types/location';
import { getLocationOwnerUserId } from '@/domains/content/lib/location-owner';

// ────────────────────────────────────────────────────────────────────────
// Tipos canónicos (también importables vía esta ruta para evitar ciclos
// con el barrel `@/domains/content`).
// ────────────────────────────────────────────────────────────────────────

export type PoiSourceType = 'own' | 'followed' | 'app' | 'source';

export interface ResolvedPoiSource {
  /** Qué es este POI para este viewer. */
  type: PoiSourceType;
  /** UID del owner cuando aplica (own | followed). null para app/source. */
  ownerUid: string | null;
  /**
   * Identificador de la fuente cuando aplica (app | source).
   * - app    : siempre 'vandits-app'
   * - source : id de la fuente externa (e.g. 'osm', 'tripadvisor')
   * - own/followed: null
   */
  sourceId: string | null;
  /**
   * Grupo dentro de la fuente cuando aplica.
   * - app    : 'playas', 'miradores', etc.
   * - resto  : null
   */
  groupId: string | null;
  /** Hashtags clicables que se mostrarán en ficha/popup. Sin el `#`. */
  hashtags: string[];
}

// ────────────────────────────────────────────────────────────────────────
// Lectura defensiva de marcadores de origen.
// ────────────────────────────────────────────────────────────────────────

/**
 * Acceso defensivo a campos de origen que pueden venir anotados en el POI
 * pero todavía no están en el tipo `GeoLocation`. Se irán formalizando en
 * futuros PRs (data plumbing). Mientras tanto, este helper aísla el cast.
 */
type SourceAnnotated = GeoLocation & {
  sourceKind?: 'app' | 'external' | 'user' | string | null;
  source_kind?: string | null;
  sourceId?: string | null;
  source_id?: string | null;
  groupId?: string | null;
  group_id?: string | null;
};

function readSourceMarkers(loc: GeoLocation): {
  sourceKind: string | null;
  sourceId: string | null;
  groupId: string | null;
} {
  const a = loc as SourceAnnotated;
  return {
    sourceKind: a.sourceKind ?? a.source_kind ?? null,
    sourceId: a.sourceId ?? a.source_id ?? null,
    groupId: a.groupId ?? a.group_id ?? null,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Resolución de hashtags.
// ────────────────────────────────────────────────────────────────────────

/**
 * Resolver de username opcional. Las consolas que ya tengan disponible un
 * mapa uid->username pueden inyectarlo. Si no, caemos al uid corto.
 */
export type UsernameLookup = (uid: string) => string | null | undefined;

function shortUid(uid: string): string {
  return uid.slice(0, 8);
}

function buildOwnerHashtag(uid: string, lookup?: UsernameLookup): string {
  const username = lookup?.(uid);
  return (username && username.trim()) || shortUid(uid);
}

// ────────────────────────────────────────────────────────────────────────
// Cache.
// ────────────────────────────────────────────────────────────────────────

/**
 * Cache por (viewer, lookup-version). El POI se referencia por identidad,
 * por lo que un nuevo array de POIs (cada `_docVersion` del store)
 * invalida automáticamente las entradas obsoletas.
 *
 * No cacheamos cuando hay lookup variable porque la salida (hashtags)
 * depende del username, y los usernames se resuelven asincrónicamente en
 * el caller.
 */
const cacheByViewer = new Map<string, WeakMap<GeoLocation, ResolvedPoiSource>>();

function getViewerCache(viewerUid: string | null): WeakMap<GeoLocation, ResolvedPoiSource> {
  const key = viewerUid ?? '__anon__';
  let m = cacheByViewer.get(key);
  if (!m) {
    m = new WeakMap();
    cacheByViewer.set(key, m);
  }
  return m;
}

// ────────────────────────────────────────────────────────────────────────
// API pública.
// ────────────────────────────────────────────────────────────────────────

export interface ResolvePoiSourceOptions {
  /** Resolver opcional uid -> username para hashtags legibles. */
  usernameLookup?: UsernameLookup;
  /** Saltar la cache (útil en tests o cuando cambian usernames). */
  bypassCache?: boolean;
}

/**
 * Resuelve qué es un POI para un viewer concreto.
 *
 * Reglas (en orden):
 *   1. Si el POI declara `sourceKind === 'app'`         -> app
 *   2. Si el POI declara `sourceKind === 'external'`    -> source
 *   3. Si owner === viewer                              -> own
 *   4. Si hay owner conocido (otro)                     -> followed
 *   5. Sin owner y sin marcadores                       -> followed
 *      (POI huérfano se trata como ajeno; shareability decidirá si entra)
 */
export function resolvePoiSource(
  viewerUid: string | null,
  poi: GeoLocation,
  opts: ResolvePoiSourceOptions = {},
): ResolvedPoiSource {
  // Cache solo cuando no hay lookup (los hashtags dependen del username).
  const useCache = !opts.usernameLookup && !opts.bypassCache;
  if (useCache) {
    const hit = getViewerCache(viewerUid).get(poi);
    if (hit) return hit;
  }

  const markers = readSourceMarkers(poi);
  const ownerUid = getLocationOwnerUserId(poi);

  let resolved: ResolvedPoiSource;

  if (markers.sourceKind === 'app') {
    const sourceId = markers.sourceId || 'vandits-app';
    const hashtags: string[] = [sourceId];
    if (markers.groupId) hashtags.push(markers.groupId);
    resolved = {
      type: 'app',
      ownerUid: null,
      sourceId,
      groupId: markers.groupId,
      hashtags,
    };
  } else if (markers.sourceKind === 'external') {
    const sourceId = markers.sourceId || 'unknown-source';
    resolved = {
      type: 'source',
      ownerUid: null,
      sourceId,
      groupId: markers.groupId,
      hashtags: [sourceId],
    };
  } else if (ownerUid && viewerUid && ownerUid === viewerUid) {
    resolved = {
      type: 'own',
      ownerUid,
      sourceId: null,
      groupId: null,
      hashtags: [buildOwnerHashtag(ownerUid, opts.usernameLookup)],
    };
  } else if (ownerUid) {
    resolved = {
      type: 'followed',
      ownerUid,
      sourceId: null,
      groupId: null,
      hashtags: [buildOwnerHashtag(ownerUid, opts.usernameLookup)],
    };
  } else {
    // Huérfano sin owner ni marcadores: lo tratamos como followed/anónimo.
    // Shareability lo descartará si no es curado.
    resolved = {
      type: 'followed',
      ownerUid: null,
      sourceId: null,
      groupId: null,
      hashtags: [],
    };
  }

  if (useCache) {
    getViewerCache(viewerUid).set(poi, resolved);
  }
  return resolved;
}

/** Helper directo: ¿el POI es propio del viewer? */
export function isOwnPoi(viewerUid: string | null, poi: GeoLocation): boolean {
  return resolvePoiSource(viewerUid, poi).type === 'own';
}

/** Helper directo: tipo de origen sin construir hashtags. */
export function getPoiSourceType(viewerUid: string | null, poi: GeoLocation): PoiSourceType {
  return resolvePoiSource(viewerUid, poi).type;
}

/**
 * Limpia toda la cache. Llamar cuando cambia el viewer o hay invalidación
 * global (e.g. logout, switch de cuenta).
 */
export function clearPoiSourceCache(): void {
  cacheByViewer.clear();
}
