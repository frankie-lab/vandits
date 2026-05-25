# PR-IMPORT-DISCOVERY-1 — Auditoría de medios de importación

Solo lectura. No se toca schema, RLS, scrapers, edge functions ni UI. Único deliverable: `docs/audits/import-discovery.md`.

## Alcance ya localizado (no exhaustivo, base de exploración)

UI / handlers candidatos:
- `src/components/ImportedContentPanel.tsx` (hub Archivos · Web · OneDrive · Documentos)
- `src/domains/content/components/FileUploadZone.tsx`
- `src/domains/content/components/WebImportPanel.tsx`
- `src/domains/content/components/BackgroundScrapeJobs.tsx`
- `src/domains/content/components/UploadPreviewDialog.tsx`
- `src/domains/content/components/ImportSummaryDialog.tsx`
- `src/components/OneDrivePhotosPanel.tsx`, `OneDrivePhotoBrowser.tsx`
- `src/components/LocationMap.tsx` (creación manual desde mapa)

Parsers:
- `src/lib/{kml,kmz,gpx,geojson,csv,geo-file}-parser.ts`
- `src/lib/parsers/{networklink,shared}.ts`
- `src/domains/content/lib/parsers.ts` (barrel)

Services / writes:
- `src/services/import.service.ts`
- `src/domains/v2/dual-write-import.ts`
- `src/repositories/{waypoint,document-v2,document-track,user-place,place,collection}.repository.ts`

Edge functions de ingesta:
- `supabase/functions/scrape-atlas-obscura/index.ts` (sync)
- `supabase/functions/scrape-enqueue/index.ts` + `scrape-tick/index.ts` (queue/cron, tabla `scrape_jobs`)
- `supabase/functions/fetch-remote-kml/index.ts`
- `supabase/functions/browse-onedrive/index.ts`, `scan-onedrive-geo/index.ts`
- `supabase/functions/backfill-scraped-locations/index.ts`

Tablas escritas (a verificar caso por caso): `documents`, `document_tracks`, `locations`, `waypoints`, `places`, `user_places`, `collections`, `collection_items`, `scrape_jobs`, `enrichment_jobs`.

## Plan de trabajo

### 1. Barrido completo de surfaces
- `rg` por triggers de importación (botones, handlers, llamadas a parsers/edge fns).
- Cruzar con menú y rutas para detectar surfaces ocultas/legacy/desconectadas.
- Clasificar cada una: `active | partial | hidden | disconnected | legacy | dead`.

### 2. Trazabilidad por flujo
Para cada surface, seguir: **UI → handler → parser/scraper → mapper → DB write → POI**. Marcar dónde se rompe la cadena.

### 3. Foco web import
Documentar exhaustivamente `WebImportPanel` + `scrape-atlas-obscura` + `scrape-enqueue`/`scrape-tick` + `fetch-remote-kml`:
URL aceptada, provider, presets, campos extraídos (JSON-LD), mapping → POI, validación, dedupe, ownership, errores, límites, queue model, provenance/source URL.

### 4. Modelo de datos importado
Tabla campo×surface: nombre, coords, dirección, descripción, imagen, tags, source URL, external_refs, enriched_data, ownership, visibility, jerarquía geo, collection.

### 5. Calidad y seguridad
URLs inválidas, scraping fallido, sanitización HTML, dedupe, coords ausentes, imports masivos, rate limits, provider terms, provenance, rollback, preview pre-creación.

### 6. UX por surface
preview / edición previa / errores humanos / qué se va a crear / duplicados / cancelar.

### 7. Entregable
`docs/audits/import-discovery.md` con:
- Tabla maestra `surface | ruta | entrada | parser | edge/RPC | tablas | ownership | dedupe | status`
- Sección dedicada web import
- Huecos y riesgos
- Recomendación: mantener / eliminar / consolidar (sin ejecutar)

### 8. Fuera de alcance
Schema, RLS, scrapers, edge functions, UI. Cero cambios.

## Próximo paso
Aprobar → entro en build mode solo para crear el `.md` de auditoría.
