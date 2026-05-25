# POI Export Canon (PR-EXPORT-DISCOVERY-1)

Documento de diagnóstico + propuesta UX. **No** redefine helpers ni
contratos. Consume y referencia:

- `docs/contracts/poi-export-contract.md` (PR-EXPORT-1 — eligibility + scope).
- `docs/contracts/pr-export-2-poi-export-canon.md` (PR-EXPORT-2 — DTO + pipeline + tamaño).
- `docs/contracts/share-vs-export-contract.md` (PR-SHARE-1 — share ≠ export).
- Audits previos: `docs/audits/pr-export-2-*`.

---

## 1. Separación conceptual (recordatorio)

| Concepto | Canal | SoT actual | Notas |
|---|---|---|---|
| Export técnico | Archivo descargable (KML/CSV/JSON/GeoJSON) | `src/domains/content/lib/poi-export-pipeline.ts` | PR-EXPORT-2 |
| Backup / snapshot del dueño | Archivo, scope `internal` | mismo pipeline | C1: own POIs |
| Share humano / social | URL pública `vandits.lovable.app/{p|c|r}/{id}` | `src/domains/sharing/` | PR-SHARE-1 |
| Colección Vandits compartible | URL `/c/{id}` | `share-url.ts` | Deuda v1.1: páginas `/c` con OG |
| Interoperabilidad externa (GIS/GPS/Maps) | KML/GPX/GeoJSON | pipeline export | Adaptador, no SoT |

**Regla dura**: share ≠ export. Pipelines NUNCA se invocan mutuamente.

---

## 2. Estado actual

| surface | acción | formato | sync/async | límite | scope default | owner check | helper visibilidad | estado | evidencia |
|---|---|---|---|---|---|---|---|---|---|
| ExportPanel | Exportar (panel) | KML/CSV/JSON/GeoJSON | sync | warn 5k / block 10k | `public` | `evaluatePoiExport` | `resolveExportCandidates` | wired PR-EXPORT-2 | `src/domains/content/components/ExportPanel.tsx` L105–258 |
| SelectionActions | Exportar selección | KML/CSV/JSON/GeoJSON | sync | warn 5k / block 10k | `public` | `evaluatePoiExport` | `selectedLocations` cross-doc | wired | `src/components/filters/SelectionActions.tsx` L226–305 |
| Popup POI (footer) | `share-poi` | URL Vandits | sync | — | n/a (share) | `isPoiShareable` | `ShareSheet` | wired | `src/domains/content/hooks/use-popup-actions.ts` |
| SelectionActions | Compartir selección | URL Vandits | sync | — | n/a (share) | `partitionForShare` | `ShareSheet` | wired | mismo fichero |
| CollectionFocusView | Compartir colección | URL Vandits | sync | — | n/a (share) | `partitionForShare` | `ShareSheet` | wired | `domains/content/components/*` |
| kml-parser legacy | `exportToKML/CSV/JSON` | — | sync | — | `internal` (warn deduplicado) | C2 grep test | — | compat temporal | `src/lib/kml-parser.ts` L400–470 |
| Background jobs | — | — | — | — | — | — | — | **NO EXISTE** | — |
| ExportHistory | últimas N | — | — | — | — | — | `useExportTracking` | **sólo `lastExport`** en localStorage | `src/hooks/use-export-tracking.ts` |
| RouteHeaderActions | `share-route` | URL Vandits | — | — | — | — | — | **PENDIENTE v1.1** | PR-SHARE-1 backlog |
| Event bus | `lovable:open-export-panel` | — | — | — | — | — | — | wired (bridge ShareSheet→Export) | `domains/sharing/components/ShareSheet.tsx` |
| Index.tsx | `ExportPanelSource` | — | — | — | — | — | — | wired cross-doc | `src/pages/Index.tsx` L81–330 |

---

## 3. Caso 3614 POIs propios desde filtros país

- **Qué ocurre hoy**: `ExportPanel` resuelve candidatos vía
  `resolveExportCandidates` (`explicit > selection > filtered`). Llama
  `previewPoiExport` → `partitionForExport(scope)`. Botones de formato
  invocan `runPoiExport` y `downloadPoiExportBlob`.
- **Por qué se siente agresiva**: `POI_EXPORT_SIZE_THRESHOLDS = { warn:
  5000, block: 10000 }`. Con 3614 elegibles **NO** dispara
  `warn-pending`. La sensación viene del `window.confirm()` plano, del
  lenguaje "bloqueado/EXPORTAR" y de la **ausencia de resumen humano**
  (de dónde vienen, qué incluye, propiedad).
- **Formatos**: KML (sub-targets `mymaps`/`gurumaps`/`general`), CSV,
  JSON, GeoJSON. Sin GPX.
- **Datos incluidos**: shape `PoiExportRecord` (sin `ownerUserId`,
  internal-only fields omitidos cuando scope=`public`).
- **Límites**: warn 5k → `window.confirm`; block 10k → `PoiExportSizeError`.
- **Sync/async**: 100% sync, hilo principal. `Blob` + anchor `<a>`. Sin
  job background.
- **Falla por tamaño**: a >10k aborta. Con 3614 + serialización
  JSON/KML con descripciones largas puede congelar UI varios segundos.
- **Ownership**: respeta. `internal` exige `currentUserId === ownerUserId`
  (C1). `public` filtra POI-9/10 + shareable + enriched.
- **POI export contract**: respeta. C2 verificado por
  `src/test/poi-export-contract.test.ts`.
- **Job/history**: NO job. `useExportTracking` guarda **sólo el último**
  export en `localStorage` (`vandits-last-export`).

---

## 4. Propuesta UX — Export Resolver (no destructivo)

Reemplaza el VISUAL del actual `ExportPanel` sin tocar el pipeline.

```text
┌────────────────────────────────────────────────────┐
│ Exportar tus ubicaciones                           │
├────────────────────────────────────────────────────┤
│ Resumen                                            │
│   3614 POIs · 4 países · 12 filtros activos        │
│   Origen: filtros activos del mapa                 │
│   "Son tuyas. Vandits crea una copia;              │
│    tus datos siguen aquí."                         │
├────────────────────────────────────────────────────┤
│ Alcance                                            │
│   ( ) Compartible (público)   3402 elegibles       │
│   (•) Mis datos (interno)     3614 elegibles       │
│   detalle excluidos · ver razones                  │
├────────────────────────────────────────────────────┤
│ Formato                                            │
│   [KML] [GPX†] [CSV] [JSON] [GeoJSON]              │
│   destino sugerido según formato                   │
├────────────────────────────────────────────────────┤
│ Opciones                                           │
│   [x] Incluir imágenes (URLs públicas)             │
│   [x] Incluir notas                                │
│   [x] Incluir jerarquía territorial                │
│   [ ] Incluir metadata operativa (sólo interno)    │
├────────────────────────────────────────────────────┤
│ Estimación                                         │
│   ~2.4 MB · ~3 s · descarga directa                │
│   (>5k: preparación con progreso visible)          │
│   (>10k: bloqueado, ofrecer trocear)               │
├────────────────────────────────────────────────────┤
│              [Cancelar]      [Generar archivo]     │
└────────────────────────────────────────────────────┘
† GPX = backlog, ver §10
```

**Reglas de copy (duras)**:
- Prohibido "EXPORTAR" como typed-token. CTA = "Generar archivo".
- Prohibido "bloqueado" sin salida (trocear, cambiar scope).
- Siempre frase de propiedad: "Son tuyas, esto es una copia".
- Typed-token (`DestructiveConfirmDialog`) reservado a destructivas
  reales (`PURGAR`, `MASTER`, etc.). **Export NUNCA** lo usa.

---

## 5. Matriz de formatos

| formato | para qué sirve | incluye | no incluye | límite | destino recomendado |
|---|---|---|---|---|---|
| KML | apps de mapas | nombre, coords, desc, img, tags | rutas, jerarquía operativa | 5k/10k | Google My Maps, Guru Maps |
| GPX † | GPS y navegación | nombre, coords, alt | desc HTML, tags, imágenes | 5k/10k | Garmin, OsmAnd, Locus |
| CSV | análisis / hoja de cálculo | columnas planas | imágenes, rutas | 5k/10k | Excel, Sheets, pandas |
| JSON | backup / snapshot | DTO completo (scope-aware) | RLS, IDs externos | 5k/10k | backup propio, scripts |
| GeoJSON | GIS, herramientas espaciales | features `geometry`+`properties` | rutas (sólo POIs) | 5k/10k | QGIS, Kepler, Mapbox Studio |
| Paquete Vandits (futuro) | round-trip Vandits | DTO + colección + envelope | — | tbd | re-import Vandits |
| Colección compartible (futuro) | share humano social | URL pública | archivo | — | redes, mensajería |

† GPX no existe hoy en el pipeline.

---

## 6. Reglas formato → destino

- GuruMaps → KML/GPX
- Google My Maps → KML
- Garmin/GPS → GPX
- Backup → JSON
- Análisis → CSV / GeoJSON
- Compartir humano → URL Vandits. Google/Apple Maps son **adaptadores**
  ("abrir en…"), no SoT.

---

## 7. Ownership y permisos (recordatorio PR-EXPORT-1)

- POIs propios: exportables salvo rechazo técnico de `evaluatePoiExport`.
- POIs ajenos: NUNCA en `internal` (`not-owner`).
- `public`: sólo POI-9/10 + `isShareablePoi` + `isPointEnriched`,
  excluye `editorial-only-1b`.
- Principio rector: **no secuestrar datos del usuario**.

---

## 8. Thresholds (recordatorio PR-EXPORT-2)

`POI_EXPORT_SIZE_THRESHOLDS = { warn: 5000, block: 10000 }`.

Niveles propuestos sólo para mensajería UX (no cambia helper):

- **pequeño** (<1000): descarga inmediata, sin diálogo.
- **mediano** (1000–5000): spinner inline + estimación tamaño.
- **grande** (5000–10000): preparación con progreso visible +
  confirmación amable (no typed-token).
- **bloqueado** (>10000): UI ofrece trocear por país / colección / zona.

---

## 9. KEEP / CHANGE / REMOVE

### KEEP
- `runPoiExport`, `partitionForExport`, `evaluatePoiExport`,
  `POI_EXPORTERS`, `mapToPoiExportRecords`.
- `resolveExportCandidates` (origen `explicit`/`selection`/`filtered`).
- Separación share vs export.
- DTO `PoiExportRecord` (sin `ownerUserId`).
- Compat temporal `kml-parser` con `console.warn` deduplicado.

### CHANGE (sólo UX, no helpers)
- Reescribir UI de `ExportPanel` siguiendo §4 (resumen, propiedad,
  scope claro, opciones, estimación).
- Sustituir `window.confirm` por diálogo amable cuando `size = warn`.
- `ExportHistory` real (>1 entrada).
- Mensaje "bloqueado >10k" con CTA "trocear por país / colección".

### REMOVE
- Lenguaje "EXPORTAR" / typed-token en export.
- Doble UI casi idéntica entre `ExportPanel` y `SelectionActions` →
  unificar en `<ExportResolver source=… />`.
- `console.warn` del default scope en `kml-parser` una vez cubierto C2.

---

## 10. Backlog técnico ordenado

| PR | descripción | dependencias |
|---|---|---|
| PR-EXPORT-3  | UX Resolver: rediseño visual ExportPanel + diálogo amable warn. | — |
| PR-EXPORT-4  | Unificar `ExportPanel` y `SelectionActions` en `<ExportResolver source=…>`. | PR-EXPORT-3 |
| PR-EXPORT-5  | Opciones de payload (toggles imágenes/notas/jerarquía/metadata). | PR-EXPORT-4 |
| PR-EXPORT-6  | ExportHistory persistente (últimas N, no sólo `lastExport`). | PR-EXPORT-5 |
| PR-EXPORT-7  | GPX serializer en `POI_EXPORTERS`. | — |
| PR-EXPORT-8  | Trocear export grande (>10k) por país / colección / zona. | PR-EXPORT-3 |
| PR-EXPORT-9  | Job background para >10k (edge function + polling + estimación real). | PR-EXPORT-8 |
| PR-EXPORT-10 | Paquete Vandits round-trip (re-import). | DTO estable |
| PR-EXPORT-11 | Colecciones compartibles `/c/{id}` con OG / Helmet. | PR-SHARE-1 v1.1 |

---

## 11. Fuera de alcance

- Sin cambios en RLS.
- Sin cambios en helpers de elegibilidad ni de tamaño.
- Sin cambios en serializers existentes.
- Sin tocar share contract.
- Sin nuevas tablas, edge functions ni `pg_cron`.

---

Ver memoria: `mem://logic/export/poi-export-canon`.
