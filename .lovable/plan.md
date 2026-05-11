## Objetivo

Cablear los toggles del panel "Fuentes de datos" para que apagar una fuente de **enriquecimiento** o un **scraper** tenga efecto real. Hoy solo los 7 toggles de Búsqueda funcionan; los 8 de Enriquecimiento y los 2 de Scrapers son cosméticos.

## Cambios

### 1. Helper único compartido

Crear `supabase/functions/_shared/data-sources.ts`:

- `getEnabledSourceCodes(supabase, kind)` → `Promise<Set<string> | null>`
- Devuelve los `code` con `enabled=true` para `kind` (`'search' | 'enrichment' | 'scraper'`)
- Cache en memoria del worker, TTL 60s (los toggles de admin se propagan en ≤1 min)
- Failsafe: si la query falla, devuelve `null` = "no filtrar" (no rompe enriquecimiento por fallo de DB)
- Helper `isSourceEnabled(set, code)` que trata `null` como permitido

Refactor: `search-candidates/index.ts` pasa a usar este helper en lugar de su query inline.

### 2. `enrich-location/index.ts` — gating de las 8 fuentes

Al inicio del handler, una sola llamada:
```ts
const enriched = await getEnabledSourceCodes(supabase, 'enrichment');
```

Envolver cada llamada existente con `isSourceEnabled(enriched, '<code>')`:

| Code | Funciones afectadas |
|------|---------------------|
| `enrich.wikipedia` | `searchWikipedia`, `fetchNearbyWikipediaPages`, geosearch de coherencia |
| `enrich.wikidata` | `searchWikidata` |
| `enrich.wikidata_sparql` | `getWikidataSparqlNearbyImage` |
| `enrich.commons` | `searchWikimediaImage` + fallback Commons cercano |
| `enrich.nominatim` | reverse geocode + `getNominatimNearbyImage` |
| `enrich.overpass` | query Overpass de tags/imágenes |
| `enrich.geonames` | `searchGeoNames` |
| `enrich.openverse` | `searchOpenverseImage` |

Comportamiento por defecto (todo activado, estado actual de la DB): idéntico al de hoy. Sin cambios funcionales en happy path.

### 3. `scrape-tick/index.ts` — gating de scrapers

Al elegir adapter (`atlas_obscura` / `web_import`), comprobar `scraper.<source>` en `data_sources`. Si está deshabilitado: marcar el job como `paused` con `last_error = 'source disabled in data_sources'` y no consumir páginas. Se reanuda solo al reactivar el toggle.

### 4. `DataSourcesPanel.tsx` — badge "wired"

Pequeña constante local con los `code` que están realmente cableados en edge functions. Al lado del toggle, badge gris "no-op" si una fuente del panel todavía no está cableada (red de seguridad para evitar que futuras fuentes añadidas al panel pasen desapercibidas).

Tras los cambios 1-3, las 17 fuentes quedan "wired" y el badge no aparece.

### 5. Verificación

- `curl_edge_functions` sobre `enrich-location` con un POI conocido y `enrich.openverse` deshabilitado → comprobar en `edge_function_logs` que NO se llama a `api.openverse.engineering`.
- Reactivar y repetir.
- Repetir el ciclo con `scrape-tick` + `scraper.atlas_obscura`.

### 6. Memoria

Actualizar `mem://admin/data-sources-panel` y el índice:
> "Edge functions leen `enabled` antes de consultar. Cableado vía helper único `_shared/data-sources.ts` en search-candidates, enrich-location y scrape-tick."

## Detalles técnicos

- Sin migración SQL: la tabla `data_sources` ya está bien definida.
- Sin cambios en el cliente más allá del badge opcional del panel admin.
- El helper se importa desde edge functions (Deno) con ruta relativa: `../_shared/data-sources.ts`.
- Cache TTL 60s es suficiente para una config de admin; no introduce inconsistencia perceptible para el usuario.
- No se toca `batch-enrich`: invoca `enrich-location` internamente, así que hereda el gating automáticamente.
