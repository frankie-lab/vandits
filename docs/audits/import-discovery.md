# Import discovery — PR-IMPORT-DISCOVERY-1

> Auditoría de medios de importación / ingesta. Solo lectura. Sin cambios en
> schema, RLS, scrapers, edge functions ni UI. Snapshot tomado contra `main`
> en fecha de `APP_VERSION` activa.

Convenciones de status:

- `active` — flujo en producción, alcanzable desde UI, escribe DB.
- `partial` — funciona pero con huecos relevantes (ver notas).
- `hidden` — código vivo, no expuesto en menú actual.
- `disconnected` — UI presente, handler roto o sin destino.
- `legacy` — sustituido por otro flujo; aún ejecutable.
- `dead` — código presente, sin ningún call site.

---

## 1. Tabla maestra de surfaces

| # | Surface | Ruta / componente | Entrada | Parser / scraper | Edge / RPC | Tablas escritas | Ownership | Dedupe | Status |
|---|---------|-------------------|---------|------------------|------------|------------------|-----------|--------|--------|
| 1 | **Archivos (drag & drop / picker)** | `ImportedContentPanel` → tab `upload` → `FileUploadZone` | `.kml .kmz .gpx .geojson .json .csv` | `parseGeoFile` → `parseKML / parseKMZ / parseGPX / parseGeoJSON / parseCSV` (`src/lib/*-parser.ts`) | `saveDocumentToDatabase` (cliente) + `processImportedDocument` (cliente, fire-and-forget); KMZ `<NetworkLink>` → edge `fetch-remote-kml` | `documents`, `locations`, opcional `routes` + `route_waypoints` (+ `document_tracks` vía dual-write), `storage:document-originals` (raw file) | `owner_user_id = auth.uid()` vía `documents.user_id` + insert RLS | Pre-check por `original_filename` + `import_status='reviewing'` (mismo usuario); dedupe geográfico se delega al pipeline post-import (250 m / 1 km) | active |
| 2 | **Web — Atlas Obscura (Inmediato)** | `ImportedContentPanel` → tab `web` → `WebImportPanel` modo `now` | URL `/places/...` o `/things-to-do/...` (≤200 items) | edge `scrape-atlas-obscura` (sync, JSON-LD + tags por `/categories/...`) | `supabase.functions.invoke('scrape-atlas-obscura')` + `saveDocumentToDatabase` + `processImportedDocument` | `documents`, `locations`, `documents.metadata.pending_collection` | `owner_user_id = auth.uid()` | Preview: haversine 250 m contra `locations` propias (≤5000) + toggle "saltar duplicados" | active |
| 3 | **Web — Background queue (cualquier URL)** | `WebImportPanel` modo `background` + `BackgroundScrapeJobs` (panel jobs) | URL Atlas (listado o ficha) o web genérica con JSON-LD `Place`/`TouristAttraction`/`LocalBusiness`/`Landmark` | edge `scrape-enqueue` (encolado) + edge `scrape-tick` (cron por minuto, adapters `atlas_obscura` + `genericJsonLdAdapter`) | `scrape-enqueue` (INSERT job) → `pg_cron` → `scrape-tick` → `finalizeImportedDocument` | `scrape_jobs`, `scrape_job_pages`, `scrape_job_items`, `documents`, `locations`, `documents.metadata.pending_collection` | `owner_user_id = job.user_id` (token JWT del enqueue) | (a) bbox ±0.003° contra `locations` mismo owner por POI; (b) `scrape_job_items` UNIQUE `(job_id, url)`; gating por `data_sources.kind='scraper'` | active |
| 4 | **KMZ NetworkLink resolver** | Disparado por `parseKMZ` durante surface 1 | URL remota KML/KMZ dentro de un `<NetworkLink>` | edge `fetch-remote-kml` (bypass CORS, devuelve base64) | `supabase.functions.invoke('fetch-remote-kml')` | Sin escritura propia — feeds parser KML/KMZ del cliente | Herencia del documento padre | Ninguno propio | active (sub-flujo) |
| 5 | **OneDrive — listado/exploración** | `ImportedContentPanel` → tab `onedrive` → `OneDrivePhotosPanel`; también `OneDrivePhotoBrowser` y `LocationMap` (selector embebido) | Token OAuth Microsoft Graph | edge `browse-onedrive` (200 ítems / pág.) | `supabase.functions.invoke('browse-onedrive')` | Solo lectura externa | n/a | n/a | active (read-only) |
| 6 | **OneDrive — escaneo geo (EXIF)** | `OneDrivePhotosPanel` → "Auditar" / `OneDriveVisitValidator` | Carpeta OneDrive | edge `scan-onedrive-geo` (indexa GPS de fotos) | `supabase.functions.invoke('scan-onedrive-geo')` | Indexa `onedrive_*` (ver tabla `indexed_photos` interna del flujo) — **no** crea POIs sin validación posterior del usuario | `auth.uid()` | Dedupe por `onedrive_id` | partial — el "convertir foto → POI" final requiere acción del usuario y no está cableado como import canónico unificado |
| 7 | **Adopción desde "Contexto cercano" (manual via popup)** | `PointContextActions.handleSaveAsPersonal` (popup POI no-enriquecido) | Click usuario sobre `NearbyPoint` | n/a (sin parser) | `supabase.from('locations').insert(...)` directo | `locations` (`is_approved=false`, `visibility='private'`) | `owner_user_id = auth.uid()` (implícito vía RLS); pero **no** se setea explícitamente `owner_user_id` en el insert — depende del trigger/RLS | Ninguno explícito; convive con detección 250 m del catálogo | partial — bypasa `saveDocumentToDatabase` / pipeline canónico; no marca `source_type='manual'` ni alimenta `shouldAutoApproveImport` |
| 8 | **Documentos (biblioteca / reanudar)** | `ImportedContentPanel` → tab `documents` → `DocumentsPanel` | Selecciona doc en estado `reviewing` | Reabre worktable doc-view | `documentV2Repository` / `document-add.service` | `documents`, `locations` (aprobaciones, colección, tags, ruta) vía `document-add.service` | `auth.uid()` | n/a (post-import) | active |
| 9 | **Backfill scraped locations (mantenimiento)** | Sin UI cliente | n/a | edge `backfill-scraped-locations` | Invocación admin/manual | `locations` | service-role | n/a | hidden — utilidad de admin, sin call site documentado en `src/` |
| 10 | **Texto pegado / paste import** | — | — | — | — | — | — | — | dead — no existe surface ni handler |
| 11 | **Catálogo externo (Google Places, OSM Overpass, etc.) como import** | — | — | `search-candidates`, `search-nearby-osm` existen, pero como **enrichment / recovery**, no como import a `locations` | — | — | — | — | dead como import canónico (solo alimenta enrichment) |

> Edge functions de ingesta confirmadas: `scrape-atlas-obscura`, `scrape-enqueue`,
> `scrape-tick`, `fetch-remote-kml`, `browse-onedrive`, `scan-onedrive-geo`,
> `backfill-scraped-locations`.

---

## 2. Foco — Importación web

### 2.1 Surface 2 · Atlas Obscura "Inmediato" (`scrape-atlas-obscura`)

- **Inicio**: `WebImportPanel` → input URL → botón "Probar" (`handleTest`) →
  botón "Importar ahora" (`handleImportNow`).
- **URL aceptada** (`isAtlasUrl`):
  `https://*.atlasobscura.com/places/<slug>` o `/things-to-do/<slug>...`.
  Cualquier otra hostname → rechazo `kind:'invalid'`. URLs genéricas se desvían
  automáticamente a modo background.
- **Scrapea**:
  - Listado: walking pages 1..10 (rompe si no aparecen nuevos `/places/<slug>`)
    hasta `maxItems` (UI fuerza `PREVIEW_SIZE=20` en preview, `NOW_MAX=200` máx).
  - Ficha: JSON-LD `Place` o `TouristAttraction` (no `LocalBusiness`/`Landmark`
    en este endpoint — diferente del `scrape-tick`).
- **Provider**: HTTP fetch directo desde la edge con
  `User-Agent: Mozilla/5.0 (compatible; VanditsBot/1.0; +https://vandits.lovable.app)`.
  Concurrencia 6, timeout 12 s/req, budget total 110 s, gather con
  `mapWithConcurrency`.
- **Campos extraídos**: `name`, `description`, `latitude`, `longitude`,
  `country`, `region`, `locality`, `image`, `tags` (parseados de
  `href="/categories/<slug>"`, capped a 12, formateados como `#CamelCase`).
- **Web → POI** (`placeToLocation` en `WebImportPanel`):
  - `id` aleatorio (`crypto.randomUUID`), `coordinates: {lat,lng}`,
    `country/region/localidad` directos.
  - `customData = { source:'atlas-obscura', sourceUrl: place.url, listingUrl }`.
  - `enrichedData.fuentes = ['Atlas Obscura', place.url]`.
  - `enrichedData.etiquetas_personales = tags` (si hay).
  - **No** se setea `visibility` aquí (se aplica más abajo justo antes de
    `saveDocumentToDatabase`).
- **Validación**: la edge valida URL y obligatoriedad de `lat/lng` finitos en
  JSON-LD. Cliente no revalida coords.
- **Dedupe** (en preview): haversine 250 m contra `locations` propias del
  usuario (`owner_user_id=auth.uid()`, `deleted_at IS NULL`, `limit 5000`).
  Toggle "saltar duplicados" opt-in (por defecto ON).
- **Ownership**: `owner_user_id` se asigna server-side vía RLS de `documents`
  + insert helper `saveDocumentToDatabase` (no se pasa explícito desde
  `placeToLocation`).
- **Errores**: toasts: URL inválida, "No se pudo extraer la página",
  "No se encontraron puntos en esa URL", error genérico al guardar.
- **Límites**: `PREVIEW_SIZE=20`, `NOW_MAX=200`, edge cap 200 (`Math.min(200, …)`),
  total 110 s presupuesto edge.
- **Queue/job**: ninguno — síncrono. La respuesta vuelve en una sola llamada.
- **Provenance / source URL**:
  - Sí — `customData.source`, `customData.sourceUrl` (ficha), `customData.listingUrl`.
  - También se replica en `enrichedData.fuentes`.

### 2.2 Surface 3 · Background queue (`scrape-enqueue` + `scrape-tick`)

- **Inicio**: `WebImportPanel` modo `background` → `handleEnqueue` (o auto-forzado
  cuando `sourceKind==='generic'`).
- **URL aceptada**:
  - Atlas: `/places/...`, `/things-to-do/...`, `/categories/...`, `/lists/...`.
  - Genérica: cualquier URL con JSON-LD `Place|TouristAttraction|LocalBusiness|Landmark`.
- **Preset** (`PRESETS` en `scrape-enqueue/index.ts`):
  - `slow`: 2 items / tick, tick 90–240 s, pausa 10–30 min cada 25–50 items.
  - `normal`: 3 items / tick, tick 60–180 s, pausa 5–20 min cada 25–75 items.
  - `fast`: 5 items / tick, tick 45–120 s, pausa 3–10 min cada 50–120 items.
  - Boost adaptativo en `scrape-tick`: backlog ≥50 → x3 rate, tick 20–40 s;
    backlog ≥20 → x2 rate, tick 30–60 s.
- **Provider**: mismas reglas de fetch (UA `VanditsBot/1.0`, timeout 12 s).
- **Pipeline `scrape-tick`** (cada minuto, máx 5 jobs, budget 50 s):
  1. `pickAdapter` (Atlas o genérico JSON-LD).
  2. Gating por `data_sources.kind='scraper'` (`scraper.atlas_obscura` /
     `scraper.web_import`). Si OFF → job pasa a `paused`.
  3. `ensureDocument(job)` — crea `documents` con `source_type='web_import'`,
     `status='draft'`, `import_status='reviewing'`,
     `metadata.scrape_job_id`.
  4. Si no hay pages/items: seed según `detectKind` (list → primera página;
     item → cola directa). URL no reconocida → job `error`.
  5. Mientras `pending_items < rate*5` → expandir páginas. La paginación de
     `/things-to-do/<slug>` se reescribe a `/things-to-do/<slug>/places` (hub no
     pagina; sub-route sí, ~16/pág.). Inserción con `upsert` + `ignoreDuplicates`
     sobre `scrape_job_items (job_id,url)`.
  6. Procesa hasta `effectiveRate` items: jitter 0.8–2.5 s/req,
     `adapter.fetchItem` → `persistPlace`.
  7. Sin items pendientes: cierra job (`status='done'`, calcula `items_lost`),
     intenta adjuntar colección, llama `finalizeImportedDocument`.
- **`persistPlace`**:
  - Dedupe por bbox ±0.003° (~300 m) contra `locations` mismo owner.
  - Construye `allTags = [#AtlasObscura | #GenericJsonld, …place.tags]`.
  - Resuelve FKs admin (`resolve-admin-area`) y persiste
    `continent_id/country_id/region_id/zone_id/admin3_id/locality_id/sublocality_id`.
  - **No** popula `enriched_data` ni `enrichment_status` (regla canónica:
    importados quedan GRIS hasta enriquecimiento explícito).
  - `is_approved=false` siempre (lo decide `finalizeImportedDocument` al
    cerrar — `web_import` auto-aprueba).
  - `visibility = job.default_visibility ?? 'followers'`.
  - `user_image_url = place.image`, `user_image_visibility='private'`.
  - `custom_data = { source, source_url, image, tags, locality, auto_enrich }`.
- **Validación coords**: `isValidWgs84Coord` (rechaza (0,0), NaN, fuera de
  rango).
- **Errores**: item reintentado hasta 3 veces; rate-limit (HTTP 429/403) →
  pausa 30 min; URL no reconocida → job `error`; data_source OFF → `paused`.
- **Límites**: `MAX_JOBS_PER_TICK=5`, `TICK_BUDGET_MS=50_000`,
  paginación hard cap `nextNum <= 100`, `max_items` por job 1..10000.
- **Queue/job**: sí (canon `pending_collection` deferred — ver `mem://logic/import/pending-collection-deferred`).
- **Provenance**: completa — `documents.metadata.seed_url`,
  `documents.metadata.scrape_job_id`, `locations.custom_data.source_url`,
  tag automático `#AtlasObscura` / `#GenericJsonld`. Sin embargo,
  `sourceKind/sourceId/groupId` estructurados (ver
  `mem://logic/popup/provenance-vs-collection-vs-tag`) **no** se pueblan.

### 2.3 Surface 4 · `fetch-remote-kml`

Sub-flujo: KMZ con `<NetworkLink>` apuntando a otro KML/KMZ remoto. La edge
sólo proxy-fetcha (devuelve base64 + content-type), no escribe nada. Se usa
durante surface 1.

---

## 3. Trazabilidad real (UI → POI)

```text
[1] Archivos
  FileUploadZone.handleFile
    └─ parseGeoFile(text|bytes, fileName)
        └─ {parseKML | parseKMZ → fetch-remote-kml | parseGPX | parseGeoJSON | parseCSV}
    └─ saveDocumentToDatabase(doc, {rawFile, sourceType})
        └─ documents INSERT + locations INSERT + storage upload
    └─ processImportedDocument(docId, {autoEnrich, curatorId})  (fire-and-forget)
        └─ shouldAutoApproveImport(source_type) ? auto-approve : leave reviewing
    └─ optional: routes + route_waypoints (saveImportedRoutes)
    └─ setPendingCollection(docId, intent)
    └─ window dispatch 'document:view-on-map'

[2] Web Inmediato (Atlas)
  WebImportPanel.handleTest
    └─ edge scrape-atlas-obscura {url, maxItems:20}  → preview + dedupe 250m
  WebImportPanel.handleImportNow
    └─ edge scrape-atlas-obscura {url, maxItems:200}  (implícito vía preview)
    └─ buildSyntheticDocument → saveDocumentToDatabase
    └─ setPendingCollection + processImportedDocument

[3] Web Background
  WebImportPanel.handleEnqueue
    └─ edge scrape-enqueue → scrape_jobs INSERT (status='running')
  pg_cron (cada minuto)
    └─ edge scrape-tick
        └─ ensureDocument (documents INSERT, source_type='web_import')
        └─ adapter.fetchListPage → scrape_job_items upsert
        └─ adapter.fetchItem → persistPlace → locations INSERT
        └─ on drain: finalizeImportedDocument (auto-approve canónico)

[4] KMZ NetworkLink
  parseKMZ → fetch-remote-kml (proxy) → parser anidado

[5/6] OneDrive
  OneDrivePhotosPanel → browse-onedrive (listado)
                      → scan-onedrive-geo (EXIF index)
  Conversión foto → POI: NO cableada como import canónico unificado.

[7] Adopción manual (popup)
  PointContextActions.handleSaveAsPersonal
    └─ supabase.from('locations').insert(...)
       (saltea saveDocumentToDatabase y processImportedDocument)
```

Roturas detectadas:

- **Surface 6 (OneDrive geo)**: la cadena se detiene en "índice indexed_photos";
  no hay handler `photo → location` unificado. Decisión pendiente.
- **Surface 7 (adopción manual)**: inserta directo, sin `source_type` ni
  `is_approved` vía lifecycle. No pasa por `shouldAutoApproveImport`.
- **Surface 9 (`backfill-scraped-locations`)**: sin call site frontend; sólo
  ejecutable manualmente con service-role.
- **Surfaces 10–11 (texto pegado / catálogo externo)**: no existen.

---

## 4. Modelo de datos importado (campo × surface)

| Campo | 1 Archivos | 2 Web Now (Atlas) | 3 Web Background | 7 Adopt manual |
|-------|------------|-------------------|-------------------|----------------|
| `name` | parser | JSON-LD | JSON-LD | `nearbyPoint.name` |
| `latitude/longitude` | parser (validado por `isValidWgs84Coord` server-side) | edge valida `Number.isFinite` | edge valida WGS84 | `nearbyPoint.{latitude,longitude}` |
| `description` | parser | JSON-LD `description` | JSON-LD `description` | `nearbyPoint.description ?? "<cat> — guardado desde contexto"` |
| `user_image_url` | n/a | n/a | `place.image` | n/a |
| Address (`country/region/locality`) | parser cuando existe | JSON-LD `address.*` | JSON-LD `address.*` + `resolve-admin-area` (FKs reales) | no |
| FKs admin (`*_id`) | resueltas en post-import | resueltas en post-import | **sí, en el insert** (`resolveAdminFks`) | no |
| `tags` | parser (KML/KMZ ExtendedData; CSV cols; GPX ext) | `enrichedData.etiquetas_personales` | `custom_data.tags` con prefijo `#AtlasObscura`/`#GenericJsonld` | n/a |
| `source_url` / external refs | parser cuando existe | `customData.sourceUrl` + `enrichedData.fuentes` | `custom_data.source_url` + `documents.metadata.seed_url` | **no** |
| `enriched_data` | null (a menos que el parser cargue algo) | `{ fuentes, etiquetas_personales? }` semilla | **null** (regla GRIS hasta enrich explícito) | null |
| `enrichment_status` | null | null | null | null |
| `owner_user_id` | RLS via `documents.user_id` | RLS via `documents.user_id` | **explícito** = `job.user_id` | implícito (default RLS) — **no seteado en el insert** |
| `visibility` | UI radio (`public/followers/private`) | UI radio | `job.default_visibility ?? 'followers'` | hard-coded `'private'` |
| `is_approved` | false (lifecycle decide) | false (lifecycle decide) | false (lifecycle decide; `web_import` auto-aprueba) | **hard-coded false** |
| `document_id` | sí (doc real) | sí (doc sintético per import) | sí (doc per job) | doc personal del usuario; fallback DB lookup |
| Collection / list | pending_collection en `documents.metadata` | pending_collection | pending_collection | no |
| `geo hierarchy` | resuelta en post-import (auto-enqueue geo repair) | resuelta en post-import | **resuelta en el insert** (FKs) | no resuelta |

---

## 5. Calidad y seguridad

| Riesgo | Estado |
|--------|--------|
| URLs inválidas | Validadas en cliente (`new URL`) y en edge (`isAtlasUrl` / `isHttpUrl`). |
| Scraping fallido | `scrape-tick` reintenta 3 veces por item, marca `error`. Rate-limit (429/403) → pausa 30 min. |
| HTML malicioso | No se renderiza HTML del scrape directamente: sólo se leen campos JSON-LD planos. Descripciones se guardan como texto (riesgo XSS bajo, pero ver popup contracts P-POPUP-10 — no se hace sanitización explícita). |
| Duplicados | (1) Pre-check `original_filename`+`import_status='reviewing'`. (2) Atlas preview: haversine 250 m. (3) `scrape-tick`: bbox ±0.003°. (4) `scrape_job_items` UNIQUE `(job_id,url)`. Sin dedupe cross-user. |
| Coordenadas ausentes / inválidas | `isValidWgs84Coord` en `scrape-tick`; `scrape-atlas-obscura` rechaza si `!Number.isFinite`. Parsers archivo: rechazo individual por row inválida (ver `parsers.test.ts`). |
| Imports masivos | `maxItems` cap 200 (Now) / 10000 (background); `MAX_JOBS_PER_TICK=5`; budget edge 50–110 s. |
| Rate limits | Por preset (slow/normal/fast) + boost adaptativo + jitter 0.8–2.5 s/req + pausa larga. |
| Provider terms (Atlas Obscura) | Bot identificado por UA; sin obey explícito a `robots.txt`; sin respeto a `Retry-After`. |
| Provenance | Web import: `documents.metadata.seed_url`, `scrape_job_id`, `locations.custom_data.source_url`, tag `#Source`. Estructurada `sourceKind/sourceId/groupId` **no poblada** (ver `mem://logic/popup/provenance-vs-collection-vs-tag` — INERTE). |
| Rollback / cancel | `scrape_jobs.status` admite pausa/cancel desde UI background; documentos `reviewing` pueden eliminarse desde Documentos. Adopción manual surface 7: sin rollback explícito. |
| Preview pre-creación | Sí en Atlas Now (lista 20 + dups). NO en background. NO en archivos (se guarda directo `reviewing` y luego se revisa en doc-view). NO en adopción manual. |

---

## 6. UX por surface

| Surface | Preview | Edición previa | Errores humanos | "Qué se va a crear" | Duplicados visibles | Cancelar |
|---------|---------|----------------|-----------------|---------------------|---------------------|----------|
| 1 Archivos | No (revisión post-import en doc-view) | No antes de subir; sí post-import (Mesa de trabajo) | Sí (toast por warnings y errores) | Conteo de puntos/rutas en `ImportSummaryDialog` | Pre-check filename; dedup geográfico es post-import | Cancelar pre-subida; tras subida → borrar documento |
| 2 Web Now (Atlas) | Sí (20 fichas, miniaturas) | No (sólo seleccionar quitar duplicados) | Sí (toasts específicos) | `ImportSummaryDialog` final | Sí, badge "Existe" + toggle | Reset de formulario |
| 3 Web Background | No (sólo validación URL) | No | Sí (toast al encolar) | Sólo en `BackgroundScrapeJobs` tras tick | No (dedupe ocurre en server) | Pausar/cancelar job desde panel |
| 5 OneDrive list | Lista de fotos | n/a | toast | n/a (read-only) | n/a | n/a |
| 6 OneDrive geo audit | Indexación visible | n/a | toast | n/a | n/a | Sólo cierre del panel |
| 7 Adopción manual | El popup actúa como preview implícita | Selección de categoría | toast | toast | No verifica duplicados | n/a |
| 8 Documentos / reanudar | Mesa de trabajo completa | Sí (aprobar, etiquetar, asignar colección, ruta) | Sí | Sí | Vista de geo health / chains | Eliminar documento |

---

## 7. Huecos y riesgos

1. **Adopción manual (surface 7) no es canónica.** Bypasa
   `saveDocumentToDatabase`/`processImportedDocument`, no marca `source_type`,
   no setea `owner_user_id`, ignora `shouldAutoApproveImport`. Riesgo de
   ownership ambiguo y de aparecer como huérfano si el doc personal se borra.
2. **`backfill-scraped-locations` (surface 9) sin UI.** Sólo ejecutable por
   service-role; no documentado en panel admin. Decidir: exponer en
   `BackOffice` o mover a `_archive`.
3. **OneDrive geo (surface 6) parcialmente integrado.** No existe el puente
   "foto → location" como import unificado. Hoy convive con la herramienta
   de validación de visitas (`OneDriveVisitValidator`) pero no produce POIs
   directamente.
4. **Sin texto pegado, sin import de catálogo externo (Google/OSM) como POI
   propio.** Esas APIs sólo alimentan enrichment/recovery.
5. **Provenance estructurada (`sourceKind/sourceId/groupId`) sin poblar** en
   ningún flujo. P-POPUP-4A queda inerte hasta que el pipeline import escriba
   esos campos. Background scraper ya conoce la `source`+`source_url`: candidato
   natural a poblar primero.
6. **Provider terms / robots.txt**: `scrape-tick` no respeta `Retry-After` ni
   inspecciona `robots.txt`. Sólo reacciona a 429/403 con backoff fijo.
7. **Sanitización de descripción**: `description` proveniente de JSON-LD se
   persiste raw. Los popups usan estilo editorial sin renderizar HTML, pero
   un eventual cambio a HTML-render lo expondría a XSS de terceros.
8. **Dedupe geográfico inconsistente entre flujos**: archivos delegan al
   pipeline (250 m / 1 km), `scrape-atlas-obscura` preview usa 250 m,
   `scrape-tick` server-side usa bbox ±0.003° (~300 m). Conviene unificar.
9. **`enrichedData.fuentes` (surface 2) está mezclando provenance con
   enrichment**: la web Now siembra `enriched_data` parcial, pero
   `scrape-tick` deliberadamente **no** lo hace (regla GRIS). Asimetría que
   provoca que algunos POIs Atlas aparezcan "casi-enriched" desde el día 0.
10. **UI background no muestra preview ni dedupe** antes de encolar. El usuario
    sólo descubre duplicados a posteriori.

---

## 8. Recomendación (mantener / eliminar / consolidar) — sin ejecutar

| Acción | Surface(s) | Notas |
|--------|-----------|-------|
| Mantener | 1, 2, 3, 4, 5, 8 | Núcleo de ingesta. Funcional. |
| Consolidar | 7 → 1 | Migrar `handleSaveAsPersonal` a `saveDocumentToDatabase` + lifecycle canónico (`source_type='manual'`). |
| Consolidar | 2 ↔ 3 | Eliminar asimetría `enriched_data.fuentes` en surface 2 — alinear con la regla GRIS del background. |
| Consolidar | 1 ↔ 3 | Unificar dedupe geográfico server-side en un único helper compartido (`shared/import/dedupe-radius.ts`). |
| Decidir | 6 | O cablear el bridge "foto → POI" como import canónico, o desclasificarlo de "Importar" y moverlo a una pestaña "Validar visitas". |
| Decidir | 9 | Mover `backfill-scraped-locations` a admin panel o archivar. |
| Decidir | 5/6 | Renombrar tab si OneDrive deja de producir POIs ("Fotos / Visitas" en lugar de "Importar OneDrive"). |
| Implementar | (transversal) | Poblar `sourceKind/sourceId/groupId` desde `scrape-tick` y `processImportedDocument` (cierra el debt P-POPUP-4A). |
| Implementar | 3 | Respeto a `robots.txt` + `Retry-After` en `scrape-tick`. |
| Eliminar | 10, 11 | No existen, no añadir. Si en el futuro se requiere import de catálogo externo, planearlo aparte. |

---

## 9. Fuera de alcance (este PR)

Schema, RLS, scrapers, edge functions, UI. **Cero cambios.** Sólo este
documento.

## 10. Referencias

- `mem://logic/content/import-lifecycle-by-channel`
- `mem://logic/import/unified-parser-contract`
- `mem://logic/import/networklink-resolution`
- `mem://logic/import/pending-collection-deferred`
- `mem://logic/import/scrape-direct-enrichment`
- `mem://logic/import/atlas-obscura-listing-canonical`
- `mem://features/import/unified-two-step-flow`
- `mem://features/import/preview-dialog`
- `mem://features/import/duplicate-matching-ui`
- `mem://logic/popup/provenance-vs-collection-vs-tag`
- `src/lib/{kml,kmz,gpx,geojson,csv,geo-file}-parser.ts`
- `src/domains/content/components/{FileUploadZone,WebImportPanel,BackgroundScrapeJobs,ImportSummaryDialog}.tsx`
- `src/components/{ImportedContentPanel,OneDrivePhotosPanel,OneDrivePhotoBrowser,OneDriveVisitValidator}.tsx`
- `supabase/functions/{scrape-atlas-obscura,scrape-enqueue,scrape-tick,fetch-remote-kml,browse-onedrive,scan-onedrive-geo,backfill-scraped-locations}/index.ts`
- `src/services/{document-add,pending-collection,import}.service.ts`
- `src/domains/content/lib/{process-imported-document,location-lifecycle,db-operations}.ts`
