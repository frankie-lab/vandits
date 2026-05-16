/**
 * Helper único transversal: filtra `enriched_data.etiquetas_personales` para
 * que NUNCA se muestren entradas que dupliquen el nombre de una colección a
 * la que el punto pertenece.
 *
 * Motivo: por flujos antiguos de import el nombre de la colección/documento
 * quedó persistido dentro de `etiquetas_personales` (ej. "#fulltrips" para
 * la colección "FullTrips", "#atlas obscura_españa" para "Atlas Obscura_España",
 * "#les plus beaux villages de france" para la colección homónima). Como el
 * chip de colección se pinta aparte, el tag personal duplicaría visualmente.
 *
 * P-POPUP-4B — la normalización usa `tagSlug` canónico de `@/shared/popup/tags`:
 * lowercase, sin '#', sin acentos (NFKD), y **colapsa todo carácter no
 * alfanumérico** (espacios, '_', '-', '/', '&', '.', '(', ')', etc.). Es la
 * misma normalización que `dedupePopupTagBuckets` aplica al resto de buckets
 * del popup, por lo que un único slug rige tag personal vs colección vs
 * taxonomía vs semántico.
 *
 * Fuente de verdad de las colecciones de un POI:
 * `getCollectionsForLocation(locationId)` — lee `collection_items WHERE
 *  item_type='place' AND item_id = location.id` (cache + realtime sync).
 *
 * Úsese en TODA UI que pinte etiquetas personales (popup, ficha completa,
 * miniaturas).
 */
import { getCollectionsForLocation } from '@/domains/content/store/location-collections-store';
import { tagSlug } from '@/shared/popup/tags';

const toSlug = tagSlug;

/**
 * Devuelve las etiquetas personales que NO coinciden con ninguna colección
 * a la que el punto pertenece. Mantiene el orden original y deduplica entre
 * sí (case/space-insensitive).
 */
export function filterPersonalTags(
  locationId: string,
  rawTags: unknown,
): string[] {
  const list = Array.isArray(rawTags) ? (rawTags as string[]) : [];
  if (list.length === 0) return [];
  const collectionSlugs = new Set(
    getCollectionsForLocation(locationId).map((c) => toSlug(c.name ?? '')),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const slug = toSlug(raw);
    if (!slug) continue;
    if (collectionSlugs.has(slug)) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(raw);
  }
  return out;
}
