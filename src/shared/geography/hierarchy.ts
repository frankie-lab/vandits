// Domain: Shared — Single source of truth for geographic hierarchy ordering.
// Cualquier listado, agrupación, exportación o árbol que ordene puntos geográficos
// DEBE delegar en estas funciones. No reimplementar lógica jerárquica inline.
//
// Niveles canónicos (8):
//   1. continent
//   2. country
//   3. region          (admin_nivel_1 — comunidad/región/estado)
//   4. zone            (admin_nivel_2 — provincia/departamento/condado)
//   5. admin_level_3   (comarca/municipio mayor)
//   6. locality        (ciudad/villa/pueblo)
//   7. sublocality     (barrio/distrito)
//   8. street          (calle/vía)

import type { GeoLocation } from '@/types/location';
import { getPointVisualState } from '@/domains/content/lib/point-visual-state';

export const HIERARCHY_LEVELS = [
  'continent',
  'country',
  'region',
  'zone',
  'admin_level_3',
  'locality',
  'sublocality',
  'street',
] as const;

export type HierarchyLevel = (typeof HIERARCHY_LEVELS)[number];

export const HIERARCHY_LEVEL_LABELS: Record<HierarchyLevel, string> = {
  continent: 'Continente',
  country: 'País',
  region: 'Comunidad/Región',
  zone: 'Provincia/Estado',
  admin_level_3: 'Comarca/Municipio',
  locality: 'Ciudad/Localidad',
  sublocality: 'Barrio/Distrito',
  street: 'Calle',
};

const UNCLASSIFIED_SORT_KEY = '\uFFFFsin_clasificar';
export const UNCLASSIFIED_VALUE = '__unclassified__';

/** Devuelve el path jerárquico canónico de 8 niveles para un punto. */
export function getLocationHierarchy(
  loc: GeoLocation,
): Record<HierarchyLevel, string | undefined> {
  const gd = loc.enrichedData?.datos_geograficos as
    | (NonNullable<GeoLocation['enrichedData']>['datos_geograficos'] & { calle?: string })
    | undefined;
  return {
    continent: norm(loc.continent),
    country: norm(loc.country),
    region: norm(loc.region ?? gd?.admin_nivel_1),
    zone: norm(loc.zone ?? gd?.admin_nivel_2),
    admin_level_3: norm(gd?.admin_nivel_3),
    locality: norm(gd?.localidad),
    sublocality: norm(gd?.sublocalidad),
    street: norm(gd?.calle),
  };
}

function norm(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

/** "Europa / España / Aragón / ... / Calle Mayor". Omite niveles vacíos. */
export function getHierarchyBreadcrumb(loc: GeoLocation, separator = ' / '): string {
  const h = getLocationHierarchy(loc);
  return HIERARCHY_LEVELS.map((lv) => h[lv]).filter(Boolean).join(separator);
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Comparador estable por jerarquía geográfica completa, desempate por nombre. */
export function compareLocationsHierarchical(a: GeoLocation, b: GeoLocation): number {
  const ha = getLocationHierarchy(a);
  const hb = getLocationHierarchy(b);
  for (const lv of HIERARCHY_LEVELS) {
    const va = ha[lv] ?? UNCLASSIFIED_SORT_KEY;
    const vb = hb[lv] ?? UNCLASSIFIED_SORT_KEY;
    const c = collator.compare(va, vb);
    if (c !== 0) return c;
  }
  return collator.compare(a.name || '', b.name || '');
}

export interface HierarchyGroupNode {
  level: HierarchyLevel | 'leaf';
  /** Valor del nivel ('España', 'Madrid', ...) o UNCLASSIFIED_VALUE si falta. */
  value: string;
  /** Path acumulado desde la raíz (incluye el propio valor). */
  path: string[];
  /** Total de puntos bajo esta rama (recursivo). */
  count: number;
  /** Sub-grupos. Vacío si esta rama es hoja. */
  children: HierarchyGroupNode[];
  /** Puntos en este nodo cuando ya no hay más niveles disponibles o se llega al maxDepth. */
  locations: GeoLocation[];
}

export function groupLocationsByHierarchy(
  locations: GeoLocation[],
  maxDepth: number = HIERARCHY_LEVELS.length,
): HierarchyGroupNode[] {
  const root: HierarchyGroupNode = {
    level: 'leaf',
    value: '',
    path: [],
    count: 0,
    children: [],
    locations: [],
  };
  for (const loc of locations) {
    insertIntoTree(root, loc, getLocationHierarchy(loc), 0, maxDepth);
  }
  sortTree(root);
  return root.children;
}

function insertIntoTree(
  node: HierarchyGroupNode,
  loc: GeoLocation,
  h: Record<HierarchyLevel, string | undefined>,
  depth: number,
  maxDepth: number,
) {
  node.count++;
  if (depth >= maxDepth) {
    node.locations.push(loc);
    return;
  }
  const lv = HIERARCHY_LEVELS[depth];
  const value = h[lv] ?? UNCLASSIFIED_VALUE;
  let child = node.children.find((c) => c.value === value);
  if (!child) {
    child = {
      level: lv,
      value,
      path: [...node.path, value],
      count: 0,
      children: [],
      locations: [],
    };
    node.children.push(child);
  }
  insertIntoTree(child, loc, h, depth + 1, maxDepth);
}

function sortTree(node: HierarchyGroupNode) {
  node.children.sort((a, b) => {
    if (a.value === UNCLASSIFIED_VALUE) return 1;
    if (b.value === UNCLASSIFIED_VALUE) return -1;
    return collator.compare(a.value, b.value);
  });
  node.locations.sort((a, b) => collator.compare(a.name || '', b.name || ''));
  node.children.forEach(sortTree);
}

// ─────────────────────────────────────────────────────────────────────────
// Grouping modes — single source of truth for list grouping across the app.
// ─────────────────────────────────────────────────────────────────────────

export type GroupingMode = 'geography' | 'category' | 'status';

export const GROUPING_MODE_LABELS: Record<GroupingMode, string> = {
  geography: 'Geografía',
  category: 'Categoría',
  status: 'Estado',
};

export interface FlatGroup {
  /** Raw key (used for stable React keys / persistence) */
  key: string;
  /** Display label */
  label: string;
  /** Total points in the group */
  count: number;
  /** Locations sorted alphabetically by name */
  locations: GeoLocation[];
}

/** Map status enum → display label */
const STATUS_LABELS: Record<'enriched' | 'imported' | 'empty', string> = {
  enriched: 'Enriquecidos',
  imported: 'Importados',
  empty: 'Vacíos',
};
const STATUS_ORDER: Array<'enriched' | 'imported' | 'empty'> = ['enriched', 'imported', 'empty'];

/** Group locations by enrichment visual state (verde/gris/naranja). */
export function groupLocationsByStatus(locations: GeoLocation[]): FlatGroup[] {
  const buckets = new Map<string, GeoLocation[]>();
  for (const loc of locations) {
    const st = getPointVisualState(loc);
    const list = buckets.get(st) ?? [];
    list.push(loc);
    buckets.set(st, list);
  }
  const result: FlatGroup[] = [];
  for (const key of STATUS_ORDER) {
    const list = buckets.get(key);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => collator.compare(a.name || '', b.name || ''));
    result.push({ key, label: STATUS_LABELS[key], count: list.length, locations: list });
  }
  return result;
}

/** Resolve the category label for a single location. */
function getCategoryLabel(loc: GeoLocation): string | undefined {
  const cat = loc.enrichedData?.clasificacion?.categoria_principal;
  if (typeof cat === 'string' && cat.trim().length) return cat.trim();
  if (typeof loc.placeType === 'string' && loc.placeType.trim().length) return loc.placeType.trim();
  return undefined;
}

/** Group by main category (`clasificacion.categoria_principal` → fallback `placeType`). */
export function groupLocationsByCategory(locations: GeoLocation[]): FlatGroup[] {
  const buckets = new Map<string, GeoLocation[]>();
  for (const loc of locations) {
    const label = getCategoryLabel(loc);
    const key = label ?? UNCLASSIFIED_VALUE;
    const list = buckets.get(key) ?? [];
    list.push(loc);
    buckets.set(key, list);
  }
  const entries = Array.from(buckets.entries());
  entries.sort(([ak], [bk]) => {
    if (ak === UNCLASSIFIED_VALUE) return 1;
    if (bk === UNCLASSIFIED_VALUE) return -1;
    return collator.compare(ak, bk);
  });
  return entries.map(([key, list]) => {
    list.sort((a, b) => collator.compare(a.name || '', b.name || ''));
    return {
      key,
      label: key === UNCLASSIFIED_VALUE ? 'Sin clasificar' : key,
      count: list.length,
      locations: list,
    };
  });
}

/** Convert hierarchical tree into flat groups using the first non-empty level (country). */
export function hierarchyToFlatGroups(locations: GeoLocation[]): FlatGroup[] {
  const buckets = new Map<string, GeoLocation[]>();
  for (const loc of locations) {
    const h = getLocationHierarchy(loc);
    const key = h.country ?? h.continent ?? UNCLASSIFIED_VALUE;
    const list = buckets.get(key) ?? [];
    list.push(loc);
    buckets.set(key, list);
  }
  const entries = Array.from(buckets.entries());
  entries.sort(([ak], [bk]) => {
    if (ak === UNCLASSIFIED_VALUE) return 1;
    if (bk === UNCLASSIFIED_VALUE) return -1;
    return collator.compare(ak, bk);
  });
  return entries.map(([key, list]) => {
    list.sort(compareLocationsHierarchical);
    return {
      key,
      label: key === UNCLASSIFIED_VALUE ? 'Sin localización' : key,
      count: list.length,
      locations: list,
    };
  });
}

/** Single-entry grouping facade. Returns flat groups for any mode. */
export function groupLocationsBy(locations: GeoLocation[], mode: GroupingMode): FlatGroup[] {
  switch (mode) {
    case 'category':
      return groupLocationsByCategory(locations);
    case 'status':
      return groupLocationsByStatus(locations);
    case 'geography':
    default:
      return hierarchyToFlatGroups(locations);
  }
}
