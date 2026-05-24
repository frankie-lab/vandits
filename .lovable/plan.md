
# PR-EXPORT-DISCOVERY-1 — Diagnóstico + Canon UX de exportación

## Objetivo

Producir UN único entregable documental que describa el sistema real de exportación de POIs tal como existe hoy en el repo, separe export de share, defina la UX amable que reemplaza la confirmación agresiva actual, y deje un backlog técnico priorizado.

**No** se toca código, RLS, helpers de elegibilidad, contratos PR-EXPORT-1/2, ni share-vs-export-contract. Es plan-only.

---

## Alcance (qué SÍ se hace)

1. Auditoría in-situ del código actual relacionado con export/share.
2. Caso real obligatorio: usuario con 3614 POIs propios pulsa Exportar.
3. Diagnóstico de la UX actual (confirmación agresiva, mensajería, scope, formatos).
4. Propuesta cerrada de Export Resolver (pantalla amable, no destructiva).
5. Matriz de formatos × destinos.
6. KEEP / CHANGE / REMOVE sobre lo existente.
7. Backlog técnico ordenado por dependencias.

## Alcance (qué NO se hace)

- No se implementan componentes nuevos.
- No se cambian: `evaluatePoiExport`, `partitionForExport`, `runPoiExport`, `kml-parser`, RLS, serializers, niveles POI, `isShareablePoi`, `isPointEnriched`.
- No se crean tablas, edge functions ni jobs.
- No se tocan helpers de elegibilidad ni de tamaño (`POI_EXPORT_SIZE_THRESHOLDS`).
- No se reabre PR-EXPORT-1 ni PR-EXPORT-2 ni share-vs-export-contract.

---

## Entregable único

```text
docs/contracts/poi-export-canon.md
```

Documento canon que CONSUME (no duplica) los contratos ya cerrados:
- `docs/contracts/poi-export-contract.md` (PR-EXPORT-1, eligibility + scope).
- `docs/contracts/pr-export-2-poi-export-canon.md` (DTO + pipeline + tamaño).
- `docs/contracts/share-vs-export-contract.md` (PR-SHARE-1, share != export).

Y referencia los audits existentes en `docs/audits/pr-export-2-*`.

### Índice del documento

1. Contexto y separación conceptual
2. Tabla de estado actual (surface × acción × formato × …)
3. Caso 3614 POIs: qué ocurre hoy y por qué
4. Propuesta UX: Export Resolver (pantalla amable)
5. Matriz de formatos
6. Reglas formato → destino
7. Ownership y permisos (sólo recordatorio, sin redefinir)
8. Thresholds de tamaño (sólo recordatorio)
9. KEEP / CHANGE / REMOVE
10. Backlog técnico ordenado (PRs futuros)
11. Fuera de alcance

---

## 1. Separación conceptual (recordatorio, no se redefine)

| Concepto | Canal | SoT actual | Notas |
|---|---|---|---|
| Export técnico | Archivo descargable (KML/CSV/JSON/GeoJSON) | `poi-export-pipeline.ts` | PR-EXPORT-2 |
| Backup / snapshot del dueño | Archivo, scope `internal` | mismo pipeline | Sólo own POIs (C1) |
| Share humano / social | URL pública `vandits.lovable.app/p|c|r/{id}` | `domains/sharing/` | PR-SHARE-1 |
| Colección Vandits compartible | URL `/c/{id}` | `share-url.ts` | Deuda v1.1: páginas `/c` con OG |
| Interoperabilidad externa (GIS/GPS/Maps) | KML/GPX/GeoJSON | pipeline export | Adaptador, no SoT |

Regla dura ya establecida: **share != export**. Los pipelines no se invocan mutuamente. Este doc lo reitera, no lo modifica.

---

## 2. Auditoría del estado actual (tabla a rellenar)

Estructura fija. Se rellena leyendo: `ExportPanel.tsx`, `SelectionActions.tsx`, `poi-export-pipeline.ts`, `export-source-resolver.ts`, `kml-parser.ts`, `use-popup-actions.ts`, `Index.tsx`, hooks `use-export-tracking.ts`, exporters `poi-{csv,kml,json,geojson}.ts`.

```text
surface              | acción            | formato         | sync/async | límite          | scope default | owner check         | visibilidad helper      | estado
---------------------|-------------------|-----------------|------------|-----------------|---------------|---------------------|-------------------------|--------
ExportPanel          | Exportar (panel)  | KML/CSV/JSON/GJ | sync       | warn 5k/block 10k| public        | evaluatePoiExport   | resolveExportCandidates | wired (PR-EXPORT-2)
SelectionActions     | Exportar selecc.  | KML/CSV/JSON/GJ | sync       | warn 5k/block 10k| public        | evaluatePoiExport   | selectedLocations       | wired
Popup POI (footer)   | share-poi         | URL Vandits     | sync       | —               | n/a (share)   | isPoiShareable      | ShareSheet              | wired
SelectionActions     | Compartir selecc. | URL Vandits     | sync       | —               | n/a (share)   | partitionForShare   | ShareSheet              | wired
CollectionFocusView  | Compartir colec.  | URL Vandits     | sync       | —               | n/a (share)   | partitionForShare   | ShareSheet              | wired
kml-parser legacy    | exportToKML/...   | —               | sync       | —               | internal warn | C2 grep test        | —                       | compat temporal
Background jobs      | —                 | —               | —          | —               | —             | —                   | —                       | NO EXISTE
ExportHistory        | últimos N         | —               | —          | —               | —             | —                   | useExportTracking       | sólo `lastExport` en localStorage
RouteHeaderActions   | share-route       | URL Vandits     | —          | —               | —             | —                   | —                       | PENDIENTE v1.1
```

Cada fila se valida abriendo el fichero. Hallazgos extra (event bus `lovable:open-export-panel`, default scope `public` en todos los formatos, `ExportPanelSource` para wiring cross-doc, etc.) se anotan como notas.

---

## 3. Caso real: 3614 POIs propios desde filtros país

Preguntas a responder con evidencia de código (no especulación):

- **Qué ocurre hoy**: `ExportPanel` resuelve candidatos vía `resolveExportCandidates` (`explicit > selection > filtered`). Llama `previewPoiExport` → `partitionForExport` con `scope` actual.
- **Por qué confirmación agresiva**: `POI_EXPORT_SIZE_THRESHOLDS.warn = 5000`. Con 3614 elegibles NO dispara warn-pending; con scope `public`, los excluidos (POI-0/1/3/5) se descuentan y el contador queda en X<3614. Si el usuario eligió scope `internal` y todos pasan, sigue por debajo de 5k → no warn. La sensación "agresiva" viene del `window.confirm(...)` plano y del lenguaje "EXPORTAR" / "bloqueado" + falta de resumen humano.
- **Formatos ofrecidos**: KML (con sub-targets mymaps/gurumaps/general), CSV, JSON, GeoJSON.
- **Datos incluidos**: shape `PoiExportRecord` (DTO sin `ownerUserId`, internal-only fields omitidos en `public`).
- **Límites**: warn 5k (confirm), block 10k (`PoiExportSizeError`).
- **Sync/async**: 100% sync, hilo principal, `Blob` + anchor click. No hay job background.
- **Falla por tamaño**: sí, a 10k+ lanza error visible. Riesgo con 3614 = bajo, pero serialización JSON/KML de 3614 con `description` larga puede congelar UI varios segundos.
- **Ownership**: respeta. `internal` exige `currentUserId === ownerUserId` (C1).
- **POI export contract**: respeta. C2 verificado por test estático.
- **Job/history**: NO hay job. `useExportTracking` guarda **sólo el último** export en `localStorage` (no histórico real).

---

## 4. Propuesta UX — "Export Resolver" (no destructivo)

Reemplaza el actual `ExportPanel` visual sin tocar el pipeline. Estructura propuesta:

```text
┌────────────────────────────────────────────────────┐
│ Exportar tus ubicaciones                           │
├────────────────────────────────────────────────────┤
│ Resumen                                            │
│   3614 POIs · 4 países · 12 filtros activos       │
│   Origen: filtros activos del mapa                 │
│   "Son tus ubicaciones. Vandits crea una copia;   │
│    tus datos siguen aquí."                         │
├────────────────────────────────────────────────────┤
│ Alcance                                            │
│   ( ) Compartible (público)   3402 elegibles      │
│   (•) Mis datos (interno)     3614 elegibles      │
│   detalle excluidos · ver razones                  │
├────────────────────────────────────────────────────┤
│ Formato                                            │
│   [KML] [GPX†] [CSV] [JSON] [GeoJSON]              │
│   destino sugerido según formato                   │
├────────────────────────────────────────────────────┤
│ Opciones                                           │
│   [x] Incluir imágenes (URLs públicas)            │
│   [x] Incluir notas                                │
│   [x] Incluir jerarquía territorial                │
│   [ ] Incluir metadata operativa (sólo interno)    │
├────────────────────────────────────────────────────┤
│ Estimación                                         │
│   ~2.4 MB · ~3 s · descarga directa                │
│   (>5k: preparación en pantalla)                   │
│   (>10k: bloqueado, ofrecer trocear)               │
├────────────────────────────────────────────────────┤
│              [Cancelar]      [Generar archivo]    │
└────────────────────────────────────────────────────┘
† GPX = backlog, ver §10
```

Reglas duras de copy:
- Nunca "EXPORTAR" en mayúsculas como confirmación typed-token. Solo "Generar archivo".
- Nunca "bloqueado" sin explicar la salida (trocear, cambiar scope, contactar).
- Siempre frase de propiedad: "Son tuyas, esto es una copia".
- Typed-token sólo para acciones destructivas reales (purgar, borrar masivo). **Export NUNCA** lleva typed-token.

---

## 5. Matriz de formatos

```text
formato  | para qué sirve              | incluye                          | no incluye                  | límite     | destino recomendado
---------|-----------------------------|----------------------------------|-----------------------------|------------|--------------------
KML      | apps de mapas               | nombre, coords, desc, img, tags  | rutas, jerarquía operativa  | 5k/10k     | Google My Maps, Guru Maps
GPX†     | GPS y navegación            | nombre, coords, alt              | desc HTML, tags, imágenes   | 5k/10k     | Garmin, OsmAnd, Locus
CSV      | análisis / hoja de cálculo  | columnas planas                  | imágenes, rutas             | 5k/10k     | Excel, Sheets, pandas
JSON     | backup / snapshot           | DTO completo (scope-aware)       | RLS / IDs externos          | 5k/10k     | backup propio, scripts
GeoJSON  | GIS, herramientas espaciales| features con geometry+properties | rutas (sólo POIs)           | 5k/10k     | QGIS, Kepler, Mapbox Studio
Paquete Vandits (futuro) | round-trip Vandits  | DTO + colección + envelope      | —                           | tbd        | re-import Vandits
Colección compartible (futuro) | share humano social | URL pública                | archivo                     | —          | redes, mensajería
† GPX no existe hoy en el pipeline. Backlog §10.
```

---

## 6. Reglas formato → destino (referencia rápida)

- GuruMaps → KML/GPX
- Google My Maps → KML
- Garmin/GPS → GPX
- Backup → JSON
- Análisis → CSV / GeoJSON
- Compartir humano → URL Vandits (no Google Maps como SoT, los adaptadores Maps son sólo "abrir en…")

---

## 7. Ownership y permisos (recordatorio)

No se redefine. Se cita PR-EXPORT-1:
- POIs propios: exportables salvo `evaluatePoiExport` rechazo técnico.
- POIs ajenos: nunca en `internal` (`not-owner`).
- `public`: sólo elegibles según `evaluatePoiExport` (POI-9/10 + shareable + enriched, sin `editorial-only-1b`).
- "no secuestrar datos" = principio rector.

## 8. Thresholds (recordatorio)

`POI_EXPORT_SIZE_THRESHOLDS = { warn: 5000, block: 10000 }`. Niveles propuestos para UX (no cambia el helper):
- pequeño (<1000): descarga inmediata silenciosa.
- mediano (1000–5000): spinner inline + estimación de tamaño.
- grande (5000–10000): preparación con progreso visible, confirmación amable (no typed-token).
- bloqueado (>10000): no se descarga; UI ofrece trocear por país/colección/zona.

## 9. KEEP / CHANGE / REMOVE

```text
KEEP
- runPoiExport, partitionForExport, evaluatePoiExport, POI_EXPORTERS, mapToPoiExportRecords.
- resolveExportCandidates (origen explicit/selection/filtered).
- Separación share vs export.
- DTO PoiExportRecord (sin ownerUserId).
- Compat temporal en kml-parser con warn.

CHANGE (sólo UX, no helpers)
- Reescribir UI de ExportPanel siguiendo §4 (resumen, propiedad, scope claro, opciones, estimación).
- Sustituir window.confirm por diálogo amable cuando size=warn.
- ExportHistory real (>1 entrada) en localStorage o tabla.
- Mensaje "bloqueado >10k" con CTA "trocear por país/colección".

REMOVE
- Lenguaje "EXPORTAR" / typed-token en export.
- Doble UI casi idéntica entre ExportPanel y SelectionActions → unificar componente (`<ExportResolver source=… />`).
- console.warn del default scope en kml-parser una vez cubierto C2 (deuda compat).
```

## 10. Backlog técnico ordenado

```text
PR-EXPORT-3  UX Resolver: rediseño visual ExportPanel + diálogo amable warn (sin tocar pipeline).
PR-EXPORT-4  Unificar ExportPanel y SelectionActions en <ExportResolver source=…>.
PR-EXPORT-5  Opciones de payload (toggles imágenes/notas/jerarquía/metadata).
PR-EXPORT-6  ExportHistory persistente (últimas N, no sólo lastExport).
PR-EXPORT-7  GPX serializer en POI_EXPORTERS (Garmin/GPS).
PR-EXPORT-8  Trocear export grande (>10k) por país / colección / zona.
PR-EXPORT-9  Job background para >10k (edge function + polling + estimación real).
PR-EXPORT-10 Paquete Vandits round-trip (re-import).
PR-EXPORT-11 Colecciones compartibles (`/c/{id}`) — coordinar con PR-SHARE v1.1.
```

Dependencias: 3→4→5→6, 7 independiente, 8 antes de 9, 10 después de DTO estable, 11 con PR-SHARE.

## 11. Fuera de alcance

- Sin cambios en RLS.
- Sin cambios en helpers de elegibilidad ni tamaño.
- Sin cambios en serializers existentes.
- Sin tocar share contract.
- Sin nuevas tablas, edge functions ni `pg_cron`.

---

## Validación del entregable

- El documento queda como `docs/contracts/poi-export-canon.md`.
- Cada fila de la tabla §2 cita el fichero+líneas que lo respalda.
- §9 KEEP/CHANGE/REMOVE no contradice PR-EXPORT-1/2 ni PR-SHARE-1.
- §10 backlog tiene dependencias explícitas y nada urgente entra como "tocar ahora".
- Memoria: añadir 1 referencia en `mem://index.md` Memories → `[POI export canon (DISCOVERY-1)](mem://logic/export/poi-export-canon)` apuntando a un memory-file corto que sólo diga "ver docs/contracts/poi-export-canon.md".

## Versionado

Cambio sólo-doc → bump `patch` en `APP_VERSION` vía `scripts/release/bump-version.ts patch`, entrada en `docs/releases/version-history.md`.
