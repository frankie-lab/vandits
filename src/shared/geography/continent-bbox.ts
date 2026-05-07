// Domain: Geography — Fallback continente desde lat/lng cuando aún no hay
// continent_id resuelto en BD. Tabla simple de bounding boxes ISO-7.
// Determinista, sin red. Usado SOLO en UI; nunca se persiste como verdad.

export type ContinentCode = 'EU' | 'AF' | 'AS' | 'NA' | 'SA' | 'OC' | 'AN';

export const CONTINENT_LABELS_ES: Record<ContinentCode, string> = {
  EU: 'Europa',
  AF: 'África',
  AS: 'Asia',
  NA: 'Norteamérica',
  SA: 'Sudamérica',
  OC: 'Oceanía',
  AN: 'Antártida',
};

interface Box { code: ContinentCode; minLat: number; maxLat: number; minLng: number; maxLng: number; }

// Bboxes deliberadamente generosos y ordenados por especificidad.
const BOXES: Box[] = [
  { code: 'AN', minLat: -90, maxLat: -60, minLng: -180, maxLng: 180 },
  { code: 'EU', minLat: 36, maxLat: 72, minLng: -25, maxLng: 45 },
  { code: 'EU', minLat: 60, maxLat: 82, minLng: 45, maxLng: 65 }, // Urales/Rusia europea
  { code: 'AF', minLat: -35, maxLat: 37, minLng: -18, maxLng: 52 },
  { code: 'AS', minLat: 0, maxLat: 80, minLng: 26, maxLng: 180 },
  { code: 'AS', minLat: -10, maxLat: 0, minLng: 95, maxLng: 145 }, // Indonesia (parte)
  { code: 'OC', minLat: -50, maxLat: 0, minLng: 110, maxLng: 180 },
  { code: 'OC', minLat: -50, maxLat: 30, minLng: -180, maxLng: -130 }, // Pacífico
  { code: 'NA', minLat: 7, maxLat: 84, minLng: -170, maxLng: -50 },
  { code: 'SA', minLat: -56, maxLat: 13, minLng: -82, maxLng: -34 },
];

export function continentFromCoords(lat: number, lng: number): ContinentCode | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const b of BOXES) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) return b.code;
  }
  return null;
}

export function continentLabelFromCoords(lat: number, lng: number): string | undefined {
  const c = continentFromCoords(lat, lng);
  return c ? CONTINENT_LABELS_ES[c] : undefined;
}
