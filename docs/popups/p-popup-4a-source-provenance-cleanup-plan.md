# P-POPUP-4A — Source / Provenance cleanup plan (REESCRITO)

Status: **PREMISA REVISADA 2026-05-16 — pilot v1 INERTE en producción**.
Validation companion: [`./p-popup-4a-validation.md`](./p-popup-4a-validation.md).
Memoria ontológica: [`mem://logic/popup/provenance-vs-collection-vs-tag`](mem://logic/popup/provenance-vs-collection-vs-tag).
Rollout governance: [`../governance/rollout-policy.md`](../governance/rollout-policy.md).

---

## 0. Premisa corregida

El chip `#AtlasObscura_España` visible en el popup **NO es** un
indicador técnico de origen del dato (provenance). Es una mezcla de:

1. **Colección** del usuario llamada `Atlas Obscura_España` —
   renderizada por `LocationCollectionChips` como `#AtlasObscura_España`.
2. **Personal tag legacy** persistido en
   `enriched_data.etiquetas_personales` por flujos de import antiguos
   (ver `src/domains/content/lib/personal-tags-filter.ts`).
3. **Personal tag inyectado por scraper** (`#AtlasObscura`) — añadido
   por `supabase/functions/scrape-tick/index.ts:251-258` como entrada
   de `custom_data.tags`, presentado como hashtag de filtro pero
   ontológicamente es **import origin** disfrazado.

El **origen real del dato** (Atlas Obscura, OneDrive, KML, manual) se
materializa hoy únicamente en:

- `custom_data.source` (`atlas_obscura` / `atlas-obscura` / ...).
- `enriched_data.fuentes` (array de URLs/labels).
- `scrape_jobs.source` (server-side, no propagado a `locations`).

No existe ninguna columna `source_kind`/`source_id`/`group_id` en
`locations`. Los lectores `readPoiProvenance` y
`buildSourceMetadataLineHtml` añadidos en P-POPUP-4A v1 + 4A.1
**nunca encuentran datos** que rendericen en producción.

## 1. Ontología canónica (a respetar antes de cualquier cleanup)

| Concepto | Definición | Storage | Render |
|---|---|---|---|
| **Import origin** | Quién/qué trajo el dato. Histórico, técnico. | `custom_data.source`, `enriched_data.fuentes`, `scrape_jobs.source` | No-hashtag. Metadata secundaria si producto lo decide. |
| **Source / provenance canónico** | Fuente externa declarada en marcadores estructurados. | `sourceKind`/`sourceId`/`groupId` (columnas no pobladas hoy) | Línea metadata + chip clicable (contrato P-POPUP-4A v1, hoy inerte). |
| **Collection / list** | Agrupación curada por el usuario. | `collections` + `collection_items` (referencia `places`). | Chip dedicado con color/icon vía `LocationCollectionChips`. |
| **User tag (personal)** | Etiqueta libre del usuario. | `enriched_data.etiquetas_personales` | Chip ámbar vía `buildPersonalTagsBlock`. |
| **Semantic tag** | Categoría inferida/enriquecida (IA). | `enriched_data.semantic` y derivados | Conforme canon P-POPUP-2. |
| **Taxonomy** | placeType / ClasificacionPunto. | columnas formales | Implícito en el marker. |

**Reglas duras**:

- Import origin nunca se renderiza como `#hashtag` semántico ni
  como chip clicable de filtro por tags.
- Personal tag cuyo slug normalizado coincide con una colección a la
  que el POI pertenece se **suprime** del bloque de personal tags
  (extender `personal-tags-filter`).
- Toda lectura de provenance en popup debe pasar por `readPoiProvenance`
  (helper existente) y degradar a vacío cuando no hay marcadores.

## 2. Estado actual de P-POPUP-4A v1 + 4A.1

- **Flag**: `POPUP_SOURCE_METADATA_V1_DEFAULT = true` + kill-switch
  global `window.__POPUP_SOURCE_METADATA_V1__`. **Sin efecto visible**
  en producción mientras `sourceKind` esté vacío en BD.
- **Código**: `prettifySourceId`, `buildSourceMetadataLineHtml`,
  `buildOwnEnrichedMetadataLineHtml`, `readPoiProvenance` en
  `src/components/map/map-popups.ts`. **Conservar** — son la base
  correcta para el día en que el pipeline de import sí pueble
  marcadores estructurados.
- **Tests**: `src/test/popup-source-metadata.test.ts` (30 casos) +
  guards en `src/test/popup-ownership-strip.test.ts`. **Conservar**.
- **Lo que NO hace**: NO limpia el chip `#AtlasObscura_España` real
  que el usuario reportó. Esa cleanup pertenece a P-POPUP-4B/4C.

Decisión: 4A v1 queda como infraestructura **dormida**. Sin
deprecación, sin revert. La premisa de producto se corrige; el código
se mantiene porque su contrato sigue siendo el deseable cuando exista
provenance real.

## 3. Auditoría de datos (snapshot 2026-05-16)

Total `locations` = **5447**.

| Métrica | Valor |
|---|---|
| `custom_data.source IN ('atlas_obscura','atlas-obscura')` | **1757** |
| `custom_data.tags` contiene `#AtlasObscura*` | **1703** |
| `etiquetas_personales` contiene literal "atlas obscura" | **23** |
| Colecciones con "atlas" en el nombre | **9** |
| `locations.source_kind` / `source_id` / `group_id` poblados | **0** (columnas inexistentes) |

Interpretación:

- El 31% del catálogo arrastra import-origin disfrazado de tag.
- El daño visible es transversal a casi 1/3 del corpus, no a un caso
  aislado.
- La cleanup de tags legacy (4C) tiene impacto medible y reversible
  vía backfill controlado.

## 4. Roadmap revisado de pilots

### P-POPUP-4B — Collection dedup (siguiente)

**Objetivo**: garantizar que ninguna personal tag cuyo slug
normalizado coincide con una colección del POI se renderiza como
chip personal.

- Ampliar `src/domains/content/lib/personal-tags-filter.ts`:
  - normalización debe quitar también `_`, `-`, `.`, signos, y
    aplicar NFKD + strip de combining marks (ya parcial).
  - test específico con caso `etiquetas_personales: ['#Atlas Obscura_España']`
    + colección `Atlas Obscura_España` → tag filtrada.
- Sin tocar `map-popups.ts` (el helper ya se invoca).
- Sin tocar scraper.
- Sin migración de datos.
- Flag: ninguno (la función es una pure filter, ya activa).
- Validation doc: `docs/popups/p-popup-4b-validation.md`.

Auditoría pre-implementación (pendiente cuando se apruebe 4B):
contar POIs con tag-slug == collection-slug usando el puente
`location → place → collection_items` (collection_items referencia
`places`, no `locations`).

### P-POPUP-4C — Import-origin demote (backfill + scraper fix)

**Objetivo**: dejar de tratar `#AtlasObscura` como tag.

- `scrape-tick/index.ts`: dejar de inyectar `sourceTag` en
  `custom_data.tags`. Mantener `custom_data.source` como dato
  estructurado.
- Migración backfill: limpiar de `custom_data.tags` y
  `enriched_data.etiquetas_personales` todas las entradas cuyo slug
  empiece por `atlasobscura`, `osm`, `vandits` u otros source labels
  registrados.
- Sin tocar render de popup (la limpieza ocurre a nivel de datos).
- Validation doc + script de backfill auditable + dry-run.

### P-POPUP-4D — Provenance visible opcional

**Objetivo**: si producto decide mostrar import origin, hacerlo como
línea metadata plana, no hashtag.

- Render: `Importado desde Atlas Obscura el dd/mm/yyyy` leyendo
  `custom_data.source` + `createdAt`.
- No clicable como filtro (import origin no es eje de filtrado
  canónico).
- Posición: misma línea metadata que `buildOwnAddedLineHtml`, con
  separador `·`.
- Flag dedicado, default OFF hasta validación visual.
- Decisión de producto pendiente.

## 5. Contratos preservados (no tocar)

- `LocationCollectionChips` y `useLocationCollections`.
- `SourceFilterBridge` + `.source-filter-chip` + datasets.
- `resolvePoiSource` y pipeline POI canónico.
- `buildSourceHashtagsBlock`, `buildSourceMetadataLineHtml`,
  `buildOwnEnrichedMetadataLineHtml` (inertes pero correctos).
- Ownership, lifecycle, taxonomy, stars/visited, notes,
  camera/subset-fit, geo hierarchy.
- F2, React migration, PopupShell.

## 6. No-goes explícitos para esta auditoría

- No tocar `map-popups.ts`.
- No tocar `scrape-tick`.
- No correr migraciones.
- No revertir 4A v1.
- No renombrar columnas.

## 7. Entregables de este paso (auditoría)

- [x] Reescribir este plan.
- [x] Anotar `p-popup-4a-validation.md` con la inercia del fix
      (`§0.bis Premisa revisada`).
- [x] Crear `mem://logic/popup/provenance-vs-collection-vs-tag`.
- [x] Snapshot de auditoría incluido en §3.
- [ ] Abrir plan P-POPUP-4B cuando producto lo apruebe.
