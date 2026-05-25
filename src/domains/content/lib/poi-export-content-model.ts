/**
 * PR-EXPORT-5 — POI Export Content Model.
 *
 * SoT única de QUÉ datos exportables se extraen de un `GeoLocation` y
 * cómo se organizan por capas semánticas, scope-aware y format-aware.
 * Los serializers (KML/CSV/JSON/GeoJSON) consumen este modelo y NO
 * vuelven a leer `GeoLocation` directamente para decidir contenido.
 *
 * Capas canónicas (ver `docs/contracts/poi-export-content-model.md`):
 *   A. identity       — id, slug, name, primaryCategory.
 *   B. summary        — highlight, shortDescription, longDescription, observation.
 *   C. geography      — country, region, province, locality, sublocality, address.
 *   D. media          — imageUrl, imageAttribution, sourceUrl.
 *   E. classification — category, subcategory, tags, taxonomyLabel, curationLevel.
 *   F. userContext    — internal-only: createdAt, collection, personalNotes, ownState.
 *   G. provenance     — fuentes públicas, web reference, canonical Vandits URL.
 *   H. internal/forbidden — ownerUserId, RLS, debug, raw provider dump, secrets, caches.
 *
 * Reglas duras:
 *   - Capa H jamás se serializa. Grep test (`pr-export-5-content-model.test.ts`)
 *     verifica que ningún output contiene `ownerUserId` ni claves prohibidas.
 *   - `scope === 'public'` ⇒ F omitido + sólo URL pública validada para imageUrl.
 *   - `scope === 'internal'` ⇒ F incluido + máximo contexto útil del dueño.
 *   - El modelo NO decide elegibilidad — eso vive en `evaluatePoiExport`.
 */

import type { GeoLocation } from '@/types/location';
import { getPoiCurationLevel } from '@/domains/content/lib/poi-curation-level';
import type { PoiExportScope } from '@/domains/content/lib/poi-export-record';

export type PoiExportFormatForContent = 'kml' | 'csv' | 'json' | 'geojson';

export interface BuildPoiExportContentOptions {
  scope: PoiExportScope;
  format?: PoiExportFormatForContent;
  /** Sub-target del formato (p.ej. 'gurumaps' para KML). */
  target?: string;
}

export interface PoiContentIdentity {
  id: string;
  slug?: string;
  name: string;
  primaryCategory?: string;
}

export interface PoiContentSummary {
  highlight?: string;
  shortDescription?: string;
  longDescription?: string;
  observation?: string;
}

export interface PoiContentGeography {
  country?: string;
  region?: string;
  province?: string;
  locality?: string;
  sublocality?: string;
  address?: string;
}

export interface PoiContentMedia {
  imageUrl?: string;
  imageAttribution?: string;
  sourceUrl?: string;
}

export interface PoiContentClassification {
  category?: string;
  subcategory?: string;
  tags: string[];
  taxonomyLabel?: string;
  curationLevel?: number;
}

export interface PoiContentUserContext {
  createdAt?: string;
  collection?: string;
  personalNotes?: string;
  ownState?: string;
}

export interface PoiContentProvenance {
  sources: string[];
  webReference?: string;
  vanditsCanonicalUrl?: string;
}

export interface PoiExportContent {
  scope: PoiExportScope;
  identity: PoiContentIdentity;
  summary: PoiContentSummary;
  geography: PoiContentGeography;
  media: PoiContentMedia;
  classification: PoiContentClassification;
  /** Sólo presente cuando scope === 'internal'. */
  userContext?: PoiContentUserContext;
  provenance: PoiContentProvenance;
}

/**
 * Claves prohibidas que JAMÁS deben aparecer en ningún output exportado.
 * Usado por grep tests defensivos.
 */
export const FORBIDDEN_EXPORT_KEYS = [
  'ownerUserId',
  'owner_user_id',
  'rls',
  'debug',
  'raw_geocode',
  'rawGeocode',
  'api_key',
  'apiKey',
  'secret',
] as const;

function nonEmpty(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function isLikelyPrivateImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return true;
  if (/\/storage\/v1\/object\/sign\//i.test(trimmed)) return true;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return true;
  }
  const search = parsed.search.toLowerCase();
  if (!search) return false;
  return (
    search.includes('token=') ||
    search.includes('signature=') ||
    search.includes('x-amz-') ||
    search.includes('expires=') ||
    search.includes('sig=') ||
    /[?&]se=/.test(search)
  );
}

function pickImageUrl(loc: GeoLocation, scope: PoiExportScope): string | undefined {
  const url = loc.enrichedData?.imagen;
  if (!nonEmpty(url)) return undefined;
  if (scope === 'public') {
    return isLikelyPrivateImageUrl(url) ? undefined : url;
  }
  // internal: cualquier http(s) URL
  return /^https?:\/\//i.test(url.trim()) ? url : undefined;
}

function pickLongDescription(loc: GeoLocation): string | undefined {
  const ia = loc.enrichedData?.descripcion;
  if (nonEmpty(ia)) return ia.trim();
  if (nonEmpty(loc.description)) return loc.description.trim();
  return undefined;
}

function pickHighlight(loc: GeoLocation): string | undefined {
  const h = loc.enrichedData?.punto_destacado;
  return nonEmpty(h) ? h.trim() : undefined;
}

function pickObservation(loc: GeoLocation): string | undefined {
  const o = loc.enrichedData?.observacion;
  return nonEmpty(o) ? o.trim() : undefined;
}

function pickGeography(loc: GeoLocation): PoiContentGeography {
  const dg = loc.enrichedData?.datos_geograficos;
  const out: PoiContentGeography = {};
  const country =
    loc.country ?? loc.countryResolved ?? dg?.pais ?? undefined;
  const region =
    loc.region ?? loc.regionResolved ?? dg?.admin_nivel_1 ?? undefined;
  const province =
    loc.zone ?? loc.zoneResolved ?? dg?.admin_nivel_2 ?? undefined;
  const locality =
    loc.localidad ?? loc.localityResolved ?? dg?.localidad ?? undefined;
  const sublocality = loc.sublocalidad ?? dg?.sublocalidad ?? undefined;
  const address = dg?.direccion_postal ?? undefined;
  if (nonEmpty(country)) out.country = country;
  if (nonEmpty(region)) out.region = region;
  if (nonEmpty(province)) out.province = province;
  if (nonEmpty(locality)) out.locality = locality;
  if (nonEmpty(sublocality)) out.sublocality = sublocality;
  if (nonEmpty(address)) out.address = address;
  return out;
}

function pickTags(loc: GeoLocation): string[] {
  const ed = loc.enrichedData;
  const all = [
    ...(Array.isArray(ed?.etiquetas_personales) ? ed!.etiquetas_personales : []),
    ...(Array.isArray(ed?.etiquetas) ? ed!.etiquetas : []),
    ...(Array.isArray(ed?.etiquetas_geograficas) ? ed!.etiquetas_geograficas : []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of all) {
    if (typeof t !== 'string') continue;
    const clean = t.replace(/^#+/, '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function pickClassification(loc: GeoLocation): PoiContentClassification {
  const ed = loc.enrichedData;
  const cls = ed?.clasificacion;
  const level = getPoiCurationLevel(loc).level;
  const out: PoiContentClassification = {
    tags: pickTags(loc),
  };
  if (nonEmpty(cls?.categoria_principal)) out.category = cls!.categoria_principal;
  else if (nonEmpty(ed?.categoria)) out.category = ed!.categoria;
  if (nonEmpty(cls?.subcategoria)) out.subcategory = cls!.subcategoria;
  if (nonEmpty(cls?.tipo_especifico)) out.taxonomyLabel = cls!.tipo_especifico;
  if (typeof level === 'number') out.curationLevel = level;
  return out;
}

function pickProvenance(loc: GeoLocation): PoiContentProvenance {
  const ed = loc.enrichedData;
  const sources = Array.isArray(ed?.fuentes)
    ? ed!.fuentes.filter(nonEmpty).map((s) => s.trim())
    : [];
  const out: PoiContentProvenance = { sources };
  const web = ed?.datos_clave?.web_referencia;
  if (nonEmpty(web)) out.webReference = web.trim();
  // canonical Vandits URL: dejado opcional — no se inventa si no existe SoT
  return out;
}

function pickUserContext(loc: GeoLocation): PoiContentUserContext | undefined {
  const out: PoiContentUserContext = {};
  if (loc.createdAt instanceof Date && !Number.isNaN(loc.createdAt.getTime())) {
    out.createdAt = loc.createdAt.toISOString();
  }
  const cd = loc.customData ?? {};
  if (nonEmpty(cd.collection)) out.collection = cd.collection;
  if (nonEmpty(cd.note)) out.personalNotes = cd.note;
  if (nonEmpty(cd.visited)) out.ownState = `visited=${cd.visited}`;
  if (nonEmpty(cd.user_rating)) {
    out.ownState = out.ownState
      ? `${out.ownState};rating=${cd.user_rating}`
      : `rating=${cd.user_rating}`;
  }
  const hasAny = Object.keys(out).length > 0;
  return hasAny ? out : undefined;
}

function pickPrimaryCategory(loc: GeoLocation): string | undefined {
  if (nonEmpty(loc.placeType)) return loc.placeType;
  const cat = loc.enrichedData?.categoria;
  return nonEmpty(cat) ? cat : undefined;
}

export function buildPoiExportContent(
  loc: GeoLocation,
  options: BuildPoiExportContentOptions,
): PoiExportContent {
  const { scope } = options;
  const summary: PoiContentSummary = {};
  const highlight = pickHighlight(loc);
  const longDesc = pickLongDescription(loc);
  const observation = pickObservation(loc);
  if (highlight) summary.highlight = highlight;
  if (longDesc) summary.longDescription = longDesc;
  // shortDescription: derivada del highlight si no hay corta explícita
  if (highlight && !summary.shortDescription) summary.shortDescription = highlight;
  if (observation) summary.observation = observation;

  const content: PoiExportContent = {
    scope,
    identity: {
      id: loc.id,
      name: loc.name ?? '',
      primaryCategory: pickPrimaryCategory(loc),
    },
    summary,
    geography: pickGeography(loc),
    media: {
      imageUrl: pickImageUrl(loc, scope),
      imageAttribution: nonEmpty(loc.enrichedData?.imagen_fuente)
        ? loc.enrichedData!.imagen_fuente
        : undefined,
    },
    classification: pickClassification(loc),
    provenance: pickProvenance(loc),
  };

  if (scope === 'internal') {
    const uc = pickUserContext(loc);
    if (uc) content.userContext = uc;
  }

  return content;
}

/**
 * Matriz canónica formato × capa. Espejo en
 * `docs/contracts/poi-export-content-model.md`.
 */
export const EXPORT_FORMAT_MATRIX = {
  kml: {
    identity: 'full',
    summary: 'html',
    geography: 'html+extended',
    media: 'html+extended',
    classification: 'extended',
    userContext: 'internal-only-extended',
    provenance: 'html',
    forbidden: 'never',
  },
  csv: {
    identity: 'columns',
    summary: 'columns',
    geography: 'columns',
    media: 'url',
    classification: 'columns',
    userContext: 'internal-only-columns',
    provenance: 'joined',
    forbidden: 'never',
  },
  json: {
    identity: 'full',
    summary: 'full',
    geography: 'full',
    media: 'full',
    classification: 'full',
    userContext: 'internal-only-full',
    provenance: 'full',
    forbidden: 'never',
  },
  geojson: {
    identity: 'properties',
    summary: 'properties',
    geography: 'properties',
    media: 'properties',
    classification: 'properties',
    userContext: 'internal-only-properties',
    provenance: 'properties',
    forbidden: 'never',
  },
} as const;
