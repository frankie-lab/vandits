
# Catálogos "Pueblos más bonitos" como fallback de recovery

## Objetivo

Cuando `search-candidates` (recovery / coherencia / búsqueda manual del `UnenrichedRecoveryBlock`) no devuelve un match suficientemente cercano al POI, consultar también 15 catálogos oficiales de "Pueblos más bonitos" (España, Francia, Italia, Valonia, Suiza, Portugal x2, Sajonia, UK/Cotswolds, Grecia, Países Bajos, Quebec, Japón, China, Líbano + LPBVT internacional). Cada uno con su propio adapter; los resultados se cachean en BD para que llamadas posteriores sean instantáneas.

## Decisiones tomadas

- **Modo**: scrape on-demand como fallback en recovery (no pre-crawl masivo).
- **Adapters**: uno dedicado por web (15 adapters).
- **Gating**: cada catálogo es una fila en `data_sources` con `kind='search'`, código `search.village.<slug>`, toggleable desde `DataSourcesPanel`.

## Cómo encaja en el flujo

```text
search-candidates (edge function)
  ├─ Wikipedia ES/EN     (existente)
  ├─ Wikidata            (existente)
  ├─ Nominatim           (existente)
  ├─ GeoNames            (existente)
  ├─ Photon              (existente)
  ├─ Google Places       (existente)
  └─ Village catalogs    (NUEVO, en paralelo, gated por search.village.*)
        ├─ adapter ES — lospueblosmasbonitosdeespana.org
        ├─ adapter FR — les-plus-beaux-villages-de-france.org
        ├─ adapter IT — borghipiubelliditalia.it
        ├─ adapter BE — beauxvillages.be
        ├─ adapter CH — dieschoenstenschweizerdoerfer.ch
        ├─ adapter PT-AH — aldeiashistoricasdeportugal.com
        ├─ adapter PT-AX — aldeiasdoxisto.pt
        ├─ adapter DE-SX — sachsensdoerfer.de
        ├─ adapter UK    — cotswolds.com
        ├─ adapter GR    — visitgreece.gr (sección villages)
        ├─ adapter NL    — holland.com (sección villages)
        ├─ adapter CA-QC — beauxvillages.qc.ca
        ├─ adapter JP    — utsukushii-mura.jp
        ├─ adapter CN    — zhongguomeilixiangcun.com
        ├─ adapter LB    — villagesduliban.com
        └─ adapter GLOBAL — lpbvt.org
```

Cada adapter expone la misma interfaz y los matches se mezclan con el resto, deduplicados <150 m igual que el resto.

## Cambios

### 1. Nueva tabla `village_catalog_entries` (cache de listings)

```text
village_catalog_entries
  id uuid pk
  catalog_code text not null      -- 'search.village.es', 'search.village.fr', ...
  name text not null              -- nombre del pueblo tal como aparece en el catálogo
  name_canonical text not null    -- minúsculas + sin acentos para fuzzy match
  country_code text                -- ISO α2 (ES, FR, IT, ...)
  latitude double precision
  longitude double precision
  image_url text
  source_url text not null         -- URL de la ficha en el catálogo
  description text
  raw jsonb default '{}'           -- payload original parseado
  last_refreshed_at timestamptz default now()
  unique (catalog_code, source_url)
```

- RLS: lectura para `authenticated`, escritura solo `service_role` (las edge functions).
- Índice GIN/`gin_trgm_ops` sobre `name_canonical` para `ILIKE`/`%` fuzzy.
- Índice geográfico (`lat_bucket`/`lng_bucket`) opcional para queries por proximidad.

### 2. 16 filas en `data_sources` (kind='search')

Una por catálogo, con `code='search.village.<slug>'`, `name`, `description`, `enabled=true` por defecto, `priority` consecutiva (90–105), `config.country_codes`, `config.base_url`. Aparecen automáticamente en la sección "Búsqueda" del `DataSourcesPanel` existente.

### 3. Edge function `search-candidates` — nueva rama paralela

- Tras `getEnabledSourceCodes(supabase, 'search')`, calcular qué adapters están enabled cuyo `country_codes` intersecte con `country_code` del POI (o `*` para LPBVT).
- Llamar `searchVillageCatalogs(name, lat, lng, country, enabledSet)` en paralelo con las fuentes actuales.
- Dentro del helper:
  1. Por cada adapter habilitado y aplicable al país del POI:
     - Si `village_catalog_entries` tiene filas frescas (`last_refreshed_at < 30d`), usarlas.
     - Si no, llamar `adapter.fetchListing()`, parsear, hacer upsert a la tabla.
     - Ejecutar `matchByName(name)` contra las filas (fuzzy con `name_canonical`, trigram similarity ≥ 0.55, o coincidencia por slug).
  2. Devolver hasta 3 candidatos por adapter con su `source_url`, imagen, coords.
- Si un match no tiene coords (catálogos como `utsukushii-mura.jp`, `aldeiasdoxisto.pt`), resolverlas con Nominatim usando `name + country` antes de devolverlas, y persistirlas en la fila.

### 4. Carpeta `supabase/functions/_shared/village-catalogs/`

```text
_shared/village-catalogs/
  index.ts            -- registry + dispatcher (matchByName en paralelo con Promise.allSettled)
  types.ts            -- VillageCatalogAdapter, VillageEntry
  cache.ts            -- helpers de upsert/lookup en village_catalog_entries
  geocode.ts          -- fallback Nominatim para coords ausentes
  adapters/
    es-pueblos.ts          -- listado /pueblos/, ficha por slug
    fr-plus-beaux.ts       -- /nos-plus-beaux-villages, ficha
    it-borghi.ts           -- /borgo-piu-bello/, JSON-LD a veces presente
    be-wallonie.ts
    ch-schoenste.ts
    pt-aldeias-historicas.ts
    pt-aldeias-xisto.ts
    de-sachsen.ts
    uk-cotswolds.ts
    gr-visitgreece.ts
    nl-holland.ts
    ca-qc.ts
    jp-utsukushii.ts
    cn-zhongguo.ts
    lb-villages.ts
    global-lpbvt.ts
```

Cada adapter implementa:

```text
type VillageCatalogAdapter = {
  code: string;                    // 'search.village.es'
  name: string;                    // 'Pueblos más bonitos de España'
  countryCodes: string[] | '*';    // ['ES'] o '*'
  baseUrl: string;
  ttlDays: number;                 // default 30
  fetchListing(): Promise<VillageEntry[]>;   // página índice + descubre fichas
  fetchEntry?(url: string): Promise<Partial<VillageEntry>>; // detalle (opcional, lazy)
  matchByName?(name: string, entries: VillageEntry[]): VillageEntry[];
                                              // por defecto: trigram sobre name_canonical
}
```

### 5. UI (sin cambios estructurales)

- `DataSourcesPanel` ya renderiza por `kind='search'`; los 16 nuevos toggles aparecen automáticamente.
- Cabecera de grupo "Búsqueda" se mantiene; se añade descripción genérica "Catálogos de pueblos certificados — fallback cuando las fuentes principales no devuelven coincidencia".
- `UnenrichedRecoveryBlock` no cambia: ya consume `search-candidates`. Los hits de un catálogo aparecen como un candidato más con su `source_url` y badge del catálogo.

### 6. Tests humo

- Llamar `search-candidates` con `name="Albarracín", country="ES"` → debe devolver hit del adapter ES.
- Apagar `search.village.es` en `data_sources` → no debe llamarse ese adapter.
- Llamar dos veces seguidas → la segunda usa cache de `village_catalog_entries` y no vuelve a hacer fetch HTML.

### 7. Memoria

Crear `mem://logic/enrichment/village-catalogs-fallback` con el registry, los 16 códigos y la regla "cache `village_catalog_entries` TTL 30d, geocoding diferido por Nominatim cuando faltan coords". Añadir línea al índice.

## Riesgos y mitigaciones

- **Sitios sin JSON-LD ni coords**: el helper `geocode.ts` resuelve por Nominatim `${name}, ${country}`. Si falla, la fila se guarda sin coords y se devuelve sin score geográfico (solo nombre).
- **Sitios anti-bot (jp, cn)**: si `fetchListing` falla, el adapter marca `disabled_runtime` en `data_sources.stats` con `last_error`; queda visible en el panel para que el admin pueda intervenir.
- **Coste de primera llamada**: el primer hit a un país hace 1 fetch HTML (~1–3 s) y populariza la cache. Llamadas siguientes son SQL puro.
- **Cambios de estructura del sitio**: cada adapter es un archivo aislado; mantener uno no afecta a los demás.

## Fuera de alcance

- No se programa un crawl masivo periódico. El refresco es lazy (al expirar TTL en una consulta).
- No se introducen estos catálogos en `enrich-location` (Step 0). Si en el futuro queremos que aporten descripción, se añaden ahí como `enrich.village.<slug>`.
