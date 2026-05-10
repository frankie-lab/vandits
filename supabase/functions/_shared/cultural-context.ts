/**
 * Cultural / functional context layer extracted from Wikidata P31 (instance of).
 *
 * This is OUTSIDE the canonical administrative tree (continent → country →
 * region → province → comarca → locality → sublocality → street). It captures
 * non-administrative concepts like cultural regions ("Costa da Morte"),
 * functional areas ("Silicon Valley", "Downtown"), microtoponyms
 * (urbanizations, campuses, industrial parks).
 *
 * Source of truth: this file. Mirror in `src/shared/geography/cultural-context.ts`.
 */

export type CulturalTypeCode =
  | "cultural_region"
  | "historical_region"
  | "geographic_region"
  | "metro_area"
  | "urban_area"
  | "functional_zone"
  | "downtown"
  | "campus"
  | "industrial_park"
  | "tech_hub"
  | "shopping_center"
  | "urbanization"
  | "neighborhood_informal"
  | "tourist_area"
  | "wine_region"
  | "natural_region";

interface TypeMeta {
  code: CulturalTypeCode;
  label: string;
}

// Wikidata QID → cultural type. Keep this list closed and curated.
// References: https://www.wikidata.org/wiki/Q{id}
const QID_TO_TYPE: Record<string, TypeMeta> = {
  // Cultural / historical regions
  Q1620908: { code: "cultural_region", label: "Región cultural" },
  Q15243209: { code: "historical_region", label: "Región histórica" },
  Q3024240: { code: "historical_region", label: "Región histórica" },
  Q82794: { code: "geographic_region", label: "Región geográfica" },
  Q271669: { code: "natural_region", label: "Región natural" },
  Q4022: { code: "natural_region", label: "Región natural" }, // river basin/valley
  // Wine / agricultural cultural regions
  Q262166: { code: "wine_region", label: "Región vinícola" },
  Q1322142: { code: "wine_region", label: "Denominación de origen" },

  // Metro / urban / functional
  Q1907114: { code: "metro_area", label: "Área metropolitana" },
  Q1093829: { code: "urban_area", label: "Área urbana" },
  Q702492: { code: "urban_area", label: "Área urbana" },
  Q2074737: { code: "functional_zone", label: "Zona funcional" },
  Q2983893: { code: "downtown", label: "Centro / Downtown" },

  // Microtoponyms
  Q1187811: { code: "campus", label: "Campus" },
  Q209465: { code: "campus", label: "Campus universitario" },
  Q2143825: { code: "industrial_park", label: "Polígono industrial" },
  Q1411996: { code: "industrial_park", label: "Parque empresarial" },
  Q1412224: { code: "tech_hub", label: "Parque tecnológico" },
  Q11315: { code: "shopping_center", label: "Centro comercial" },
  Q183061: { code: "urbanization", label: "Urbanización" },
  Q1248784: { code: "neighborhood_informal", label: "Barrio informal" }, // careful: also airport in some refs
  Q123705: { code: "neighborhood_informal", label: "Barrio" },

  // Tourist
  Q570116: { code: "tourist_area", label: "Destino turístico" },
};

export interface CulturalContext {
  wikidata_id: string;
  type_code: CulturalTypeCode;
  type_label: string;
  source: "wikidata";
}

/**
 * Given the array of P31 QIDs returned by Wikidata for a place, extract
 * the first non-administrative cultural/functional concept that maps to
 * our closed taxonomy. Returns null if nothing matches.
 */
export function extractCulturalContext(
  instanceOfQids: string[] | undefined | null,
): CulturalContext | null {
  if (!instanceOfQids || instanceOfQids.length === 0) return null;
  for (const qid of instanceOfQids) {
    const meta = QID_TO_TYPE[qid];
    if (meta) {
      return {
        wikidata_id: qid,
        type_code: meta.code,
        type_label: meta.label,
        source: "wikidata",
      };
    }
  }
  return null;
}
