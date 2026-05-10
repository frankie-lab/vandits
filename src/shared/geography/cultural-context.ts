/**
 * Client-side reader for the cultural/functional context layer.
 * Lives outside the canonical administrative tree (continent → country → ... → street).
 * Source: Wikidata P31, populated by the enrich-location edge function.
 *
 * Persistence path: `enriched_data.cultural_context`.
 */

export interface CulturalContext {
  wikidata_id: string;
  type_code: string;
  type_label: string;
  source: "wikidata";
}

export function getCulturalContext(
  enrichedData: unknown,
): CulturalContext | null {
  if (!enrichedData || typeof enrichedData !== "object") return null;
  const cc = (enrichedData as { cultural_context?: unknown }).cultural_context;
  if (!cc || typeof cc !== "object") return null;
  const obj = cc as Record<string, unknown>;
  if (typeof obj.type_code !== "string" || typeof obj.type_label !== "string") {
    return null;
  }
  return {
    wikidata_id: typeof obj.wikidata_id === "string" ? obj.wikidata_id : "",
    type_code: obj.type_code,
    type_label: obj.type_label,
    source: "wikidata",
  };
}
