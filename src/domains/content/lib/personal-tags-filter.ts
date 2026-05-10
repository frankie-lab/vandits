/**
 * Helper único transversal: filtra `enriched_data.etiquetas_personales` para
 * que NUNCA se muestren entradas que dupliquen el nombre de una colección a
 * la que el punto pertenece.
 *
 * Motivo: por flujos antiguos de import el nombre de la colección quedó
 * persistido dentro de `etiquetas_personales` (p.ej. "#atlas obscura_españa"
 * para la colección "Atlas Obscura_España"). Ahora pintamos el chip de
 * colección encima de la ficha, por lo que se duplicaría visualmente.
 *
 * La normalización (slug) se hace por: lowercase, sin acentos, sin '#', sin
 * espacios. Coincide con el slug que `buildCollectionChipsPlaceholder` usa
 * para el chip de colección.
 *
 * Úsese en TODA UI que pinte etiquetas personales (popup, ficha completa,
 * miniaturas).
 */
import { getCollectionsForLocation } from '@/domains/content/store/location-collections-store';

function toSlug(input: string): string {
  return (input ?? '')
    .replace(/^#/, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

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
