/**
 * T2A-wire — Helper único `applyCanonToParsed`.
 *
 * Punto único de aplicación del canon territorial sobre POIs producidos por
 * parsers de import (KML/KMZ/GPX/GeoJSON/CSV) ANTES de llegar a `resolveAllFks`.
 *
 * Reglas data-driven (ver `docs/contracts/territorial-equivalence-canon.md` §1):
 *   - País con `hasProvincia=false` ⇒ NO se permite poblar `zone`. Se descarta
 *     silenciosamente con warning estructurado (canon-unknown-iso2 es info).
 *   - País con `municipioField='locality'` y `admin3` poblado sin `locality` ⇒
 *     promover `admin3 → locality`. El municipio aterriza en `locality_id`.
 *
 * Idempotente. País desconocido = no-op. NO hace red-trips de red. NO consulta
 * BD. NO hardcodea ISO2 — todo va por `TERRITORIAL_CANON`.
 *
 * Cableado canónico: invocado por `toKMLDocument` en `src/lib/parsers/shared.ts`
 * para cubrir KML/KMZ/GPX/GeoJSON/CSV de un golpe. Web_import/scrape edge no
 * pasa por aquí; queda como deuda T2A-wire-bis (resolver post-process cubre el
 * lado FK).
 */
import { getCountryCanon, regionHasNoProvincia } from '@/shared/geography/territorial-canon';
import { nameToIso2 } from '@/shared/geo/country-iso';

/** Subset mínimo que el validator necesita leer/escribir. */
export interface CanonAwarePoint {
  country?: string | null;
  region?: string | null;
  zone?: string | null;
  /**
   * T2A-wire (§1.b) — Opcional. Cuando el caller ya conoce el `iso_code`
   * canónico de la región (p.ej. `PT-20`, `PT-30`) tras resolución FK,
   * `applyCanonToParsed` aplicará las excepciones regionales del canon
   * (descarte de zone bajo PT-20/PT-30, etc.). Sin este campo, las
   * excepciones regionales se delegan a la edge (ver follow-up).
   */
  regionIsoCode?: string | null;
  /** Equivalente a `regionIsoCode` cuando el caller ya tiene el `zone_id` resuelto. */
  zoneId?: string | null;
  admin3?: string | null;
  locality?: string | null;
  sublocality?: string | null;
  /** Buzón opcional para warnings observables por el caller. */
  canonReview?: string[];
}

export interface ApplyCanonOptions {
  /** ISO2 ya resuelto upstream; si se omite, se infiere de `point.country`. */
  iso2?: string | null;
  /**
   * T2A-wire (§1.b) — iso_code de la región (`PT-20`, etc.). Si se omite,
   * se toma de `point.regionIsoCode`. Sin este dato no se aplican excepciones
   * regionales (las excepciones por país §1 sí se aplican igualmente).
   */
  regionIsoCode?: string | null;
  /** Emite warning a `console.warn` cuando descarta valores. Default `true`. */
  emitWarnings?: boolean;
}

export function applyCanonToParsed<T extends CanonAwarePoint>(
  point: T,
  opts: ApplyCanonOptions = {},
): T {
  const iso2 = opts.iso2 ?? nameToIso2(point.country ?? null);
  const canon = getCountryCanon(iso2);
  // País desconocido o fuera del catálogo PDF: no-op (fallback legacy seguro).
  if (!canon) return point;

  const emit = opts.emitWarnings !== false;
  const reviews = point.canonReview ? [...point.canonReview] : [];
  const regionIso = opts.regionIsoCode ?? point.regionIsoCode ?? null;

  // Regla §1: hasProvincia=false ⇒ zone NO existe.
  if (!canon.hasProvincia && point.zone) {
    if (emit) {
      console.warn(
        `[canon-validator] ${canon.iso2}: descartando zone="${point.zone}" (hasProvincia=false)`,
      );
    }
    reviews.push('canon-zone-forbidden');
    point.zone = null;
  }

  // Regla §1.b: región declarada SIN provincia/distrito (p.ej. PT-20, PT-30).
  // Descarta zone (texto + FK) aunque el país en general sí tenga provincia.
  if (regionHasNoProvincia(canon.iso2, regionIso)) {
    if (point.zone || point.zoneId) {
      if (emit) {
        console.warn(
          `[canon-validator] ${canon.iso2}/${regionIso}: descartando zone="${point.zone ?? ''}" zoneId="${point.zoneId ?? ''}" (region sin provincia)`,
        );
      }
      reviews.push('canon-region-zone-forbidden');
      point.zone = null;
      point.zoneId = null;
    }
  }

  // Regla §1: municipioField='locality' ⇒ admin3 enruta a locality.
  if (canon.municipioField === 'locality' && point.admin3) {
    if (!point.locality) {
      point.locality = point.admin3;
    }
    if (emit) {
      console.warn(
        `[canon-validator] ${canon.iso2}: admin3="${point.admin3}" promovido a locality (municipioField=locality)`,
      );
    }
    reviews.push('canon-admin3-promoted-to-locality');
    point.admin3 = null;
  }

  if (reviews.length) point.canonReview = reviews;
  return point;
}

