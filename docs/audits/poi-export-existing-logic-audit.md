# POI Export — Existing Logic Audit

Fecha UTC: 2026-05-23
Alcance: inventario **exhaustivo y read-only** de toda la superficie de
exportación de POIs (UI, helpers, parsers, backend, contratos) ya
presente en el repo. **No se ha modificado código, datos ni schema.**
No bump.

Esta auditoría existe para que cualquier decisión futura sobre
exportación parta del estado real y no duplique trabajo ya hecho bajo
los contratos PR-EXPORT-1 y PR-SHARE-1.

---

## 1. Documentación existente

### 1.1 Contratos canónicos (ya escritos, vigentes)

| Doc | Estado | Resumen |
|-----|--------|---------|
| `docs/contracts/poi-export-contract.md` | **vigente — PR-EXPORT-1** | Define `evaluatePoiExport`, scopes `public` / `internal`, matriz nivel × scope, C1 (internal exige ownership), C2 (call sites pasan `scopeProvided: true`), defensa en profundidad en `kml-parser`. |
| `docs/contracts/share-vs-export-contract.md` | **vigente — PR-SHARE-1 (parcial)** | Separa share humano (URL Vandits) vs export técnico (archivo). Aclara que `share-eligibility` y `poi-export-eligibility` no se invocan entre sí. Define el bridge `lovable:open-export-panel`. |
| `mem://logic/export/poi-export-contract` | core memory | Resumen del contrato + helper único + defensa en profundidad. |
| `mem://logic/sharing/curated-only-rule` (PR-1) | core memory | Frontera curated-only que `evaluatePoiExport` reusa vía `isShareablePoi`. |

### 1.2 Otras referencias

- `docs/audits/constants-thresholds-inventory.md`: lista `EXPORT_*`
  constantes (target labels, scope labels).
- `docs/audits/b2-geo-health-stale-dry-run.md` y
  `docs/audits/t2-2-territorial-data-otros-plan.md`: mencionan export
  como dependiente de geo-health (no exportar POIs con geo `partial`
  vía scope `public`), criterio ya cubierto por `isShareablePoi`.
- `docs/architecture/current-architecture.md`: describe el split
  Import vs Export y la ubicación del ExportPanel dentro de `Index.tsx`.

### 1.3 NO existe

- No hay especificación de export server-side, signed URLs, jobs async,
  Excel, PDF, ZIP, GPX-de-tracks ni backup completo.
- No hay README dedicado en `src/domains/content/` sobre export.

---

## 2. Código frontend

### 2.1 Helpers / SoT

| Archivo | Rol | Estado |
|---------|-----|--------|
| `src/domains/content/lib/poi-export-eligibility.ts` (162 LOC) | **SoT único** `evaluatePoiExport`, `partitionForExport`, `publicExportEligible`, `internalExportEligible`, tipos `ExportScope`, `ExportContext`, `ExportEligibility`, `ExportPartition`, `ExportExclusionReason`, mapa `EXPORT_EXCLUSION_LABEL`. | implementado + usado |
| `src/lib/kml-parser.ts` (570 LOC) | Implementación de `exportToKML`, `exportToCSV`, `exportToJSON` + parsers de import KML/KMZ. Aplica `applyExportGate` (defensa en profundidad). Marca `<atom:author>vandits-{scope}</atom:author>` y `<Data name="export_scope">`. | implementado + usado |
| `src/lib/kmz-parser.ts`, `src/lib/gpx-parser.ts`, `src/lib/geojson-parser.ts`, `src/lib/geo-file-parser.ts` | **Sólo import.** No emiten archivos. | sólo import |

### 2.2 Componentes UI

| Componente | Ruta | Estado |
|------------|------|--------|
| `ExportPanel` | `src/domains/content/components/ExportPanel.tsx` (288 LOC) — montado en `src/pages/Index.tsx` (col. derecha, panel `exportPanel`). | implementado + conectado |
| `SelectionActions` (sección "Exportar") | `src/components/filters/SelectionActions.tsx` (729 LOC, líneas 71-273, 495-510). Permite exportar la selección activa con scope `public`/`internal`. | implementado + conectado |
| Popup POI · acción `export-poi` | `src/domains/content/hooks/use-popup-actions.ts` líneas 252-280. Exporta un único POI a KML, scope auto: `internal` si own, `public` si ajeno; valida con `evaluatePoiExport`. | implementado + conectado |
| `ShareSheet` (modo grupo) | `src/domains/sharing/components/ShareSheet.tsx`. Emite evento `lovable:open-export-panel` (bridge documentado en share-vs-export). | implementado |

### 2.3 Tracking / observabilidad

| Archivo | Rol | Estado |
|---------|-----|--------|
| `src/hooks/use-export-tracking.ts` (143 LOC) | Persiste último export en `localStorage` (`vandits-last-export`) y cuenta locations modificadas (`updated_at > lastExport.timestamp`) usando query directa a `locations`. | implementado + usado en ExportPanel |
| `src/domains/content/hooks/use-export-tracking.ts` | **Duplicado** del anterior (mismo contenido, distinta ubicación). Riesgo de drift — ver §6. | implementado, **probable dead code** |

### 2.4 Tipos

- `ExportFormat = 'kml' | 'csv' | 'json'` en `src/types/location.ts:446`.
- No existe `ExportFormat` extendido (csv-excel, geojson, gpx-track, pdf).

### 2.5 NO existe en frontend

- Exportador GeoJSON, GPX-de-tracks/rutas, XLSX/Excel, PDF, ZIP,
  copy-to-clipboard, "imprimir colección".
- Botón export a nivel de **colección** (sólo a nivel de documento o
  selección). El ShareSheet de colección abre el ExportPanel general,
  no exporta directamente la colección.
- Export desde `RouteBuilder` / paneles de itinerarios (rutas no se
  exportan a archivo; explícitamente fuera de PR-EXPORT-1).
- Job UI / progress / cola async — el flujo actual es 100% síncrono
  y bloquea el hilo del navegador mientras serializa.

---

## 3. Código backend / Supabase

### 3.1 Edge functions

| Función | Rol respecto a export | Estado |
|---------|----------------------|--------|
| `fetch-remote-kml` | **Import-only.** Resuelve `<NetworkLink>` de KMZ remotos esquivando CORS. No genera export. | irrelevante a export |

**No existe** ninguna edge function de export server-side: no hay
`export-pois`, no hay `generate-kml`, no hay `bulk-export`, no hay
firmas de URL ni storage buckets dedicados a archivos exportados.

### 3.2 Storage

- No hay bucket destinado a archivos exportados.
- Los exports se entregan **en memoria como `Blob`** y se descargan
  vía `URL.createObjectURL` + `<a download>`. Sin paso por servidor,
  sin persistencia.

### 3.3 RLS / permisos

- No hay políticas RLS específicas para export. La protección actual es:
  1. **Cliente**: `evaluatePoiExport` filtra antes de serializar.
  2. **Defensa en profundidad**: `applyExportGate` dentro del parser
     descarta cualquier loc que el call site pase indebidamente.
  3. **RLS general de `locations`**: el cliente sólo recibe locations
     que el viewer puede ver; el export se construye sobre esa
     proyección ya filtrada.
- **No hay tabla de auditoría de exports** (ni `export_runs`, ni
  `export_audit`, ni equivalente). El único rastro es `localStorage`.

### 3.4 Jobs / colas

- No existe queue ni job runner para exports. Sin precedente de
  background processing en este dominio.

---

## 4. Modelos y campos exportados hoy

### 4.1 Campos emitidos por formato

**KML** (`exportToKML`, líneas 464-520 de `kml-parser.ts`):

- `<name>` = `loc.name`
- `<Snippet>` (sólo target `gurumaps`): `enriched_data.nombre_lugar` + ` — ` + `enriched_data.localizacion`
- `<description>` CDATA = `formatEnrichedDescription(loc)` (descripción IA enriquecida formateada)
- `<ExtendedData>`:
  - `export_scope` (siempre)
  - `continent`, `country`, `region`, `zone` (resolved names cuando hay)
  - `enriched=true` si `enrichedData` presente
  - `tags` = `enriched_data.etiquetas.join(', ')`
  - cada par de `loc.customData` como `<Data name=...>`
- `<Point><coordinates>lng,lat[,altitude]</coordinates>`
- `<atom:author><atom:name>vandits-{scope}</atom:name></atom:author>`

**CSV** (`exportToCSV`):

- Columnas fijas: `name, description, latitude, longitude, altitude, continent, country, region, zone, export_scope`
- + columnas dinámicas por unión de keys en `customData`

**JSON** (`exportToJSON`):

- `{ export_scope, locations: GeoLocation[] }` — vuelca el `GeoLocation`
  completo tal cual está en cliente (incluye `enrichedData`, `customData`,
  `coordinates`, `continent/country/region/zone` resueltos, sin FKs UUID).

### 4.2 Qué NO se emite

- **No** se emiten FKs (`region_id`, `zone_id`, `admin3_id`,
  `locality_id`, `place_id`, `owner_user_id`, `parent_place_id`,
  `collection_id`).
- **No** se emite `id` interno del POI ni timestamps (`created_at`,
  `updated_at`, `enriched_at`).
- **No** se emiten media URLs / imágenes (`enriched_data.imagenes` no
  pasa al KML/CSV explícitamente — sólo se incluye si va dentro de la
  descripción IA renderizada o como parte de `customData`).
- **No** se emite POI-N (`getPoiCurationLevel`) ni Root Status
  (A/B/C/D) ni `geoHealth`. La exportación los **usa para filtrar**
  pero **no los serializa**.
- **No** se emite `visibility`, `is_approved`, `owner_user_id`,
  `visited`, `user_rating`. Estado personal se omite por contrato.

### 4.3 Ownership / selección / visibilidad

- **Scope `public`** (POI-9/10 + `isShareablePoi`): puede contener
  POIs ajenos siempre que pasen el contrato curated-only. No requiere
  `currentUserId`.
- **Scope `internal`** (PR-EXPORT-1 C1): exige
  `getLocationOwnerUserId(loc) === currentUserId`. Sin sesión, todo
  cae como `not-owner`.
- **Selección activa**: `ExportPanel` usa
  `selectedLocations` si hay selección, si no `getFilteredLocations()`
  (filtros activos del store). `SelectionActions` opera siempre sobre
  selección.
- **Colecciones**: no hay export por-colección dedicado. La unidad de
  trabajo es "documento + filtros/selección".

### 4.4 Riesgo de exposición de datos privados

| Vector | Estado |
|--------|--------|
| POIs privados de otros usuarios en `public` | mitigado por `isShareablePoi` (`visibility ∈ {followers, public}`, `is_approved`, no deleted) + matriz nivel POI |
| POI-1b editorial filtrado | sí, excluido explícitamente con razón `editorial-only-1b` |
| Bypass por call site (olvido de scope) | mitigado por C2 (test estático) + `applyExportGate` defensivo + `console.warn` |
| Datos personales (visited/rating) en export | no emitidos en ningún formato |
| `customData` libre | **riesgo abierto** — `customData` se emite sin filtrar. Si un import metió campos sensibles (e.g. notas privadas con prefijo libre), salen tal cual. Hoy no hay allowlist/denylist de keys. |
| Tags `enriched_data.etiquetas` | salen siempre en KML/CSV — son IA-generadas, sin riesgo personal conocido |
| Coordenadas privadas (POIs `private`) | filtrado por `isShareablePoi` en `public`; en `internal` sólo salen las propias |

---

## 5. Formatos existentes

| Formato | Export | Import | Notas |
|---------|:------:|:------:|-------|
| KML | sí | sí | full UI + targets `general`/`mymaps`/`gurumaps` |
| CSV | sí | no | columnas fijas + dinámicas de `customData` |
| JSON | sí | no | dump tal cual de `GeoLocation` |
| GeoJSON | **no** | sí | parser existe (`geojson-parser.ts`); no hay exporter |
| GPX | **no** | sí | parser existe (`gpx-parser.ts`); no exporter, ni para POIs ni para tracks |
| KMZ | **no** | sí | parser/NetworkLink resolver existe; no exporter |
| Excel/XLSX | **no** | no | — |
| PDF | **no** | no | — |
| ZIP/bundle | **no** | no | — |
| Clipboard / copy text | **no** | n/a | (ShareSheet sí copia URL, no contenido de export) |

---

## 6. Estado actual — clasificación por flujo

| Flujo | Estado |
|-------|--------|
| ExportPanel (panel lateral, documento + filtros/selección) | implementado y **usado** en UI |
| SelectionActions → Export sección | implementado y **usado** |
| Popup POI · `export-poi` (KML un único POI) | implementado y **usado** |
| ShareSheet → bridge `lovable:open-export-panel` | implementado, **conectado parcialmente** (depende de listener en call site) |
| `exportToKML/CSV/JSON` + `applyExportGate` | implementados, **usados** por las 3 UIs |
| `evaluatePoiExport` / `partitionForExport` | implementado, **SoT activa** |
| `useExportTracking` (cliente, `localStorage`) | implementado y **usado** en ExportPanel |
| `src/domains/content/hooks/use-export-tracking.ts` (duplicado) | **probable dead code** (mismo contenido que el de `src/hooks/`); requiere verificar imports antes de borrar |
| `fetch-remote-kml` edge | implementado, **sólo import** |
| Export server-side / signed URL / job async | **no existe** |
| Export por-colección dedicado | **no existe** (se cubre indirectamente vía selección) |
| Export de rutas / tracks (GPX) | **explícitamente fuera de alcance** (§7 contrato) |
| Auditoría server-side de exports | **no existe** (sólo `localStorage`) |
| Tests | `src/test/poi-export-contract.test.ts` (11 tests), `parsers.test.ts`, `parsers-parity.test.ts`, fixtures en `src/test/fixtures/poi-export-fixtures.ts` y `golden-poi-popup.ts` |

---

## 7. Recomendación — arquitectura mínima incremental

> Esta sección es **propuesta**, no implementación. Sólo se construirá
> bajo aprobación explícita en un PR posterior.

### 7.1 Mantener lo que ya existe (no reinventar)

- Reusar SoT: `evaluatePoiExport`, scopes `public`/`internal`,
  `applyExportGate`, C1+C2. Cualquier nuevo formato (GeoJSON, GPX-POIs,
  XLSX) **debe** pasar por el mismo gate; prohibido bypassear con un
  helper paralelo.
- Mantener `exportToKML/CSV/JSON` como API estable.

### 7.2 Tres extensiones priorizadas

1. **GeoJSON exporter** (`exportToGeoJSON`).
   - Coste bajo, simetría con parser existente, formato estándar para
     ingestión por GIS y herramientas web.
   - Misma firma `(locations, scope, ctx, opts)`, misma gate
     defensiva, `properties` = subset whitelisteado (NO volcar
     `GeoLocation` entero; ver §7.4 sobre allowlist).
2. **GPX-de-POIs** (opcional, sólo `<wpt>` waypoints).
   - GPX-de-tracks queda fuera (es otra entidad, `document_tracks`).
3. **Export por-colección** desde `CollectionFocusView` y dropdown del
   sidebar Collections. Sin nuevo SoT — sólo nuevo call site con
   `scopeProvided: true` que reusa `ExportPanel` o un wrapper
   `exportCollection(collectionId, format, scope)`.

### 7.3 Campos mínimos canónicos (allowlist propuesta)

Por POI, en cualquier formato:

```
id_export        # uuid estable, no el id interno si se desea anonimizar
name             # loc.name
description      # formatEnrichedDescription(loc) — sólo si scope=public
coordinates      # {lat, lng, altitude?}
geo              # {continent, country, region, zone} (resolved names)
enriched         # boolean
tags             # enriched_data.etiquetas
poi_level        # opcional (debate: filtra ya, no necesariamente serializa)
export_scope     # 'public' | 'internal'
custom           # subset de customData filtrado por allowlist global
```

NUNCA serializar: `owner_user_id`, FKs UUID, `visited`, `user_rating`,
`is_approved`, `visibility`, timestamps personales, notas privadas.

### 7.4 Riesgo abierto: `customData` libre

Hoy `customData` se emite sin filtrar. Recomendación:

- Definir `EXPORT_CUSTOM_ALLOWLIST: Set<string>` en
  `poi-export-eligibility.ts`.
- `applyExportGate` adicionalmente sanea `customData` según scope:
  `public` → sólo claves en allowlist; `internal` → todas (es el
  propio owner).

### 7.5 Síncrono vs async

- **Mantener síncrono** para selecciones ≤ ~5 000 POIs (cubre el 99%
  de casos reales; KML/CSV/JSON de ese tamaño se serializa en < 1 s).
- Async sólo necesario si en el futuro se añade export full-account
  (back-up). En ese caso → edge function dedicada + storage signed
  URL + tabla `export_jobs` con RLS por `user_id` + cron de TTL. **No
  introducir ahora.**

### 7.6 UI

- No crear panel nuevo. ExportPanel ya es el SoT visual. Para nuevos
  formatos, añadir entradas al grid existente. Mantener el bloque
  "Alcance de la exportación" (public/internal) inalterado — es el
  control crítico de seguridad.

### 7.7 Permisos

- No crear nuevas capabilities. El export ya está implícitamente
  gated: cualquier autenticado puede ejecutar `public` (sin
  `currentUserId` también, para anónimos navegando contenido público
  shareable); sólo el owner puede `internal` (C1).
- Si en el futuro se exige export auditado, introducir capability
  `export_pois_internal` aplicada **sólo** al modo `internal` masivo
  (>N POIs). No bloquear el caso del único POI desde popup.

### 7.8 Auditoría / logs

- Hoy: sólo `localStorage` (`vandits-last-export`).
- Mínimo recomendado **si** se requiere auditoría server-side:
  tabla `poi_export_audit (id, user_id, scope, format, target,
  poi_count, created_at)` con RLS `user_id = auth.uid()`. Persistir
  desde el call site tras éxito. NO almacenar la lista de IDs por
  RGPD/coste; opcional `selection_signature` (hash).

### 7.9 Tests mínimos por extensión

- Matriz nivel × scope para cada nuevo exporter (clonar la suite de
  `poi-export-contract.test.ts`).
- Grep estático C2 actualizado a la nueva función exportada.
- Test que cualquier nuevo exporter pasa por `applyExportGate`
  (verificable inspeccionando el módulo, ya hay precedente).
- Test de allowlist `customData` si se implementa §7.4.

### 7.10 Riesgos identificados

1. **Duplicado `use-export-tracking`**: dos copias del hook. Si una
   se modifica y la otra no, divergencia silenciosa. Acción
   recomendada antes de cualquier extensión: consolidar en una sola
   ubicación (probablemente `src/hooks/`) y reexportar desde
   `src/domains/content/hooks/` si hay imports legacy.
2. **`customData` sin allowlist**: vector residual de filtración en
   exports `public`. Bloqueante para añadir nuevos formatos sin
   sanear (§7.4).
3. **Ausencia de auditoría server-side**: aceptable hoy (tamaño de
   exports pequeño, escala individual); revisar antes de habilitar
   exports masivos / bulk.
4. **Rutas / tracks fuera de alcance**: si en el futuro se pide
   "export completo del itinerario", la decisión de incluir
   `document_tracks` / GPX-tracks debe redactar un nuevo contrato —
   PR-EXPORT-1 explícitamente lo excluye.
5. **Tipo `GeoLocation` en `exportToJSON`**: hoy se vuelca el objeto
   completo del cliente. Cambios en el shape del store pueden filtrar
   campos nuevos al export sin que nadie lo note. Riesgo de
   exposición silenciosa. Recomendación: sustituir por `toJSONExport(
   loc, scope)` con allowlist explícita.

---

## 8. Ficheros tocados por esta auditoría

Ninguno. Sólo se ha creado este documento bajo `docs/audits/`.

## 9. Próximos pasos sugeridos (no ejecutados)

1. Consolidar duplicado `use-export-tracking` (limpieza, no
   funcional).
2. Implementar `EXPORT_CUSTOM_ALLOWLIST` y aplicarlo en
   `applyExportGate` (mitigación de riesgo §7.4).
3. Decidir si se priorizan GeoJSON exporter, export por-colección o
   ambos en un PR `PR-EXPORT-2`.
4. Documentar en `mem://logic/export/poi-export-contract` cualquier
   extensión que se apruebe — no introducir nuevas memorias hasta que
   haya código merged.
