/**
 * wiki-name-search — búsqueda manual de candidatos por nombre desde el cliente.
 *
 * Usado por <UnenrichedRecoveryBlock> cuando el usuario teclea un nombre alternativo
 * en el buscador del bloque de recuperación. Reutiliza el mismo endpoint público de
 * Wikipedia (es.wikipedia.org, CORS abierto) que ya consulta la edge function
 * `enrich-location` en su coherence check, pero solo la parte "buscar por texto +
 * traer coordenadas".
 *
 * Ver mem://logic/enrichment/per-poi-recovery-block
 */

import type { CoherenceCandidate } from './enrichment-error-kind';

const WIKI_API = 'https://es.wikipedia.org/w/api.php';

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Busca artículos Wikipedia por nombre, devuelve candidatos con coordenadas.
 * Si `near` está definido, ordena por distancia ascendente.
 */
export async function searchWikiCandidates(
  term: string,
  near?: { lat: number; lng: number },
  limit = 8,
): Promise<CoherenceCandidate[]> {
  const cleaned = term.trim();
  if (!cleaned) return [];

  // 1) Búsqueda textual: obtenemos pageids.
  const searchUrl = `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(
    cleaned,
  )}&srlimit=${limit}&format=json&origin=*`;
  let pageIds: number[] = [];
  let titlesById = new Map<number, string>();
  try {
    const res = await fetch(searchUrl);
    if (!res.ok) return [];
    const data = await res.json();
    const items: Array<{ pageid: number; title: string }> = data?.query?.search ?? [];
    pageIds = items.map((i) => i.pageid);
    titlesById = new Map(items.map((i) => [i.pageid, i.title]));
  } catch {
    return [];
  }
  if (pageIds.length === 0) return [];

  // 2) Coordenadas para cada pageid (una sola llamada).
  const coordsUrl =
    `${WIKI_API}?action=query&prop=coordinates|info&inprop=url&pageids=${pageIds.join('|')}` +
    `&format=json&origin=*`;
  let candidates: CoherenceCandidate[] = [];
  try {
    const res = await fetch(coordsUrl);
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.pages ?? {};
    for (const id of pageIds) {
      const page = pages[String(id)];
      if (!page) continue;
      const coord = Array.isArray(page.coordinates) ? page.coordinates[0] : null;
      if (!coord || typeof coord.lat !== 'number' || typeof coord.lon !== 'number') continue;
      const lat = coord.lat;
      const lng = coord.lon;
      const distanceKm = near ? Math.round(haversineKm(near, { lat, lng }) * 10) / 10 : undefined;
      candidates.push({
        name: page.title || titlesById.get(id),
        lat,
        lng,
        distanceKm,
        url: typeof page.fullurl === 'string' ? page.fullurl : undefined,
      });
    }
  } catch {
    return [];
  }

  if (near) {
    candidates.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  }
  return candidates;
}
