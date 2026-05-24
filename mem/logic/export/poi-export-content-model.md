---
name: POI export content model (PR-EXPORT-5/6)
description: Modelo por capas A–H scope-aware/format-aware + renderer KML target-aware (gurumaps default | generic HTML).
type: feature
---

# POI export content model (PR-EXPORT-5)

Doc canon: `docs/contracts/poi-export-content-model.md`. Extiende PR-EXPORT-2 sin romperlo.

Regla DURA:
- Helper único `buildPoiExportContent(loc, { scope, format?, target? })` en `src/domains/content/lib/poi-export-content-model.ts`.
- Capas: A identity, B summary (highlight + longDescription + observation), C geography (country/region/province/locality/sublocality/address), D media (imageUrl + attribution + sourceUrl), E classification (category/subcategory/tags/taxonomyLabel/curationLevel), F userContext (**internal-only**: createdAt/collection/personalNotes/ownState), G provenance (sources + webReference + vanditsCanonicalUrl), H forbidden (`ownerUserId`, `raw_geocode`, debug, secrets…).
- Capa H JAMÁS se serializa — `FORBIDDEN_EXPORT_KEYS` + grep test en `pr-export-5-content-model.test.ts`.
- `scope='public'` ⇒ F omitido + imagen sólo si URL pública validada (rechaza signed/token/X-Amz/se=/sig=).
- `scope='internal'` ⇒ F incluido con máximo contexto del dueño.

Pipeline:
`GeoLocation → mapToPoiExportRecord (adjunta layeredContent vía buildPoiExportContent) → serializers prefieren layeredContent`.

Serializers:
- **KML**: `<description>` con `<![CDATA[…]]>` HTML construido por `buildKmlDescriptionHtml`. Whitelist `<p>/<b>/<i>/<img>/<a>/<br/>`. Orden: imagen → highlight → longDescription → ubicación territorial → categoría+tags → observación → fuentes → footer "Generado por Vandits · {ISO}". ExtendedData estructurada se mantiene.
- **CSV**: columnas planas nuevas (`highlight`, `observation`, `address`, `category`, `subcategory`, `image_attribution`, `links`) + en internal (`created_at`, `collection`, `personal_notes`, `own_state`).
- **JSON**: envelope `poi-export-json-v2` aditivo; cada item incluye `layeredContent` (formato más rico).
- **GeoJSON**: `properties.layeredContent` enriquecido; geometry `[lng,lat]` intacta.

Matriz canónica `EXPORT_FORMAT_MATRIX` en el módulo + espejo en doc.

Fixture canon Torre de Hércules: `src/test/fixtures/poi-torre-hercules-export.ts`.
Contract test: `src/test/pr-export-5-content-model.test.ts` (12 tests).

Fuera de alcance PR-EXPORT-5: RLS, `evaluatePoiExport`, thresholds, ExportResolver UX, jobs, GPX, share canon.
