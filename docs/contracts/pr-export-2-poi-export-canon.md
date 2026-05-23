# PR-EXPORT-2 — POI Export Canon

Contrato canónico de exportación de POIs en Vandits. Extiende
**PR-EXPORT-1** (`docs/contracts/poi-export-contract.md`) y coexiste con
**PR-SHARE-1** (`docs/contracts/share-vs-export-contract.md`) sin
invalidarlos. Se ancla en la auditoría previa
`docs/audits/poi-export-existing-logic-audit.md`.

> Este documento es **contrato**. No introduce código. Toda
> implementación futura DEBE conformar a esta especificación.

---

## 1. Objetivo

Definir qué significa exportar POIs en Vandits:

- **Qué** se puede exportar (POIs, no rutas/tracks/colección-envelope).
- **Quién** puede exportarlo (propietario, viewer público, admin
  autorizado según scope).
- **En qué formatos** (CSV, KML, JSON, GeoJSON).
- **Con qué campos** (allowlist explícita vía `PoiExportRecord`).
- **Con qué permisos** (scopes `public` / `internal`, respeto a
  `visibility`, `is_approved`, `ownerUserId`).
- **Qué queda prohibido** (campos sensibles, `customData` completo,
  `GeoLocation` crudo, debug/audit/tokens).

Regla raíz: **Share ≠ Export**. Share = URL pública Vandits para
humanos. Export = archivo portable con datos. Helpers independientes,
sin cross-call.

---

## 2. Modelo conceptual

Pipeline canónico **inmutable**:

```text
POIs fuente (GeoLocation[])
   │
   ▼
permiso / visibility / ownership
   │
   ▼
evaluatePoiExport(scope, ctx)        ← PR-EXPORT-1 (SoT)
   │  (partitionForExport)
   ▼
mapToPoiExportRecord(scope)          ← PR-EXPORT-2 (nuevo)
   │
   ▼
PoiExportRecord[]                    ← único input del serializer
   │
   ▼
serializer (CSV | KML | JSON | GeoJSON)
   │
   ▼
Blob + download (cliente síncrono)
   │
   ▼
tracking cliente (use-export-tracking consolidado)
```

Invariantes derivadas:

- **Los serializers NO leen `GeoLocation` crudo.** Reciben sólo
  `PoiExportRecord[]`.
- **Los campos prohibidos no llegan al serializer.** El mapper
  `mapToPoiExportRecord` aplica el allowlist por scope.
- **`evaluatePoiExport` corre SIEMPRE antes** del mapper y del
  serializer. El `applyExportGate` existente en
  `src/lib/kml-parser.ts` se conserva como defensa en profundidad.

---

## 3. Scopes

Dos scopes mutuamente excluyentes por invocación.

### 3.1 `public`

Exportación segura/compartible. Pensada para distribuir POIs a
terceros, publicarlos o subirlos a herramientas externas (MyMaps,
GuruMaps, GeoJSON viewers).

- **Quién**: cualquier viewer sobre POIs que pasen
  `evaluatePoiExport(loc, 'public', ctx)`.
- **Elegibilidad**: POI-9 / POI-10 + `isPointEnriched` +
  `isShareablePoi`. POI-1b-editorial excluido (PR-EXPORT-1).
- **Campos permitidos**: ver tabla §5, columna `public`.
- **Campos prohibidos**: ver §6. **Nunca** `ownerUserId`, `email`,
  `enriched_data` completo, `raw_geocode`, signed URLs, debug.
- **Ejemplos**: compartir KML de una selección curada con un amigo;
  exportar JSON para una web pública.

### 3.2 `internal`

Exportación de diagnóstico/dump del **propietario** (o admin con
permiso equivalente). Puede incluir campos operativos limitados, pero
SIEMPRE allowlisted.

- **Quién**: `ownerUserId === currentUserId` (regla C1 PR-EXPORT-1) o
  admin con capability futura `export_poi_internal` (queda en §15
  preguntas abiertas, no se cierra aquí).
- **Elegibilidad**: cualquier nivel POI-0/1/3/5/9/10 del propietario.
- **Campos permitidos**: superconjunto de `public` + bloque `internal`
  (`countryCode`, `enrichmentStatus`, `geoHealth`).
- **Campos prohibidos**: ver §6. `internal` NO es vía para extraer
  POIs ajenos.
- **Ejemplos**: backup operativo del propio catálogo; auditoría de
  curación; revisión offline.

> `internal` **no implica** "todo expuesto". Sigue gobernado por el
> allowlist. No es un dump SQL.

---

## 4. DTO canónico: `PoiExportRecord`

Único shape aceptado por todos los serializers. Estable, versionable,
documentado.

```ts
export type PoiExportRecord = {
  id: string;
  name: string;

  coordinates: {
    latitude: number;   // serializer traduce a lat/lng según formato
    longitude: number;  // GeoJSON debe emitir [lng, lat] (ver §8)
  };

  geography: {
    continent?: string;
    country?: string;
    region?: string;
    province?: string;
    municipality?: string;
    locality?: string;
  };

  classification?: {
    poiLevel?: number;             // 0 | 1 | 3 | 5 | 9 | 10
    rootStatus?: 'A' | 'B' | 'C' | 'D';
    category?: string;
    tags?: string[];               // user/semantic tags filtrados
  };

  content?: {
    description?: string;          // descripcion IA canónica, sanitizada
    imageUrl?: string;             // solo si pública y validada
  };

  metadata?: {
    source?: string;               // alto nivel: 'manual' | 'web_import' | 'kml' | ...
    exportedAt: string;            // ISO 8601, set por el mapper
  };

  // Bloque OMITIDO completamente en scope='public'
  internal?: {
    countryCode?: string;          // ISO-3166 alpha-2
    enrichmentStatus?: string;
    geoHealth?: string;            // resumen: 'ok' | 'partial' | 'stale_name' | 'empty'
  };

  // Solo claves presentes en CUSTOM_DATA_EXPORT_ALLOWLIST (§7)
  customData?: Record<string, unknown>;
};
```

**Notas de naming y composición:**

- DTO usa `latitude/longitude` para legibilidad externa; el código
  interno sigue usando `{lat, lng}` (`GeoLocation.coordinates`). El
  mapper traduce. No se filtran propiedades internas.
- `ownerUserId` **no existe** en el DTO. Está prohibido en ambos
  scopes (§6).
- `classification.poiLevel` y `classification.rootStatus` son
  **internal-only** en PR-EXPORT-2: el mapper los **omite** cuando
  `scope === 'public'`, aunque vivan estructuralmente bajo
  `classification` (decisión §15.2 / §15.3).
- `content.imageUrl` en `public` se exporta **solo si es URL pública,
  validada y no firmada**. Signed/private URLs quedan prohibidas
  (decisión §15.4).
- Envelope opcional `collection { id, name, description? }`: solo
  cuando el origen del export sea una colección y el usuario tenga
  permiso sobre ella. Vive en la metadata del envelope (JSON /
  GeoJSON / cabecera KML), nunca dentro del `PoiExportRecord`
  (decisión §15.6).

---

## 5. Campos permitidos por scope

| Campo                              | public | internal | Notas |
|------------------------------------|:------:|:--------:|-------|
| `id`                               |   ✓    |    ✓     | UUID estable |
| `name`                             |   ✓    |    ✓     | Sanitizado para el formato destino |
| `coordinates.latitude`             |   ✓    |    ✓     | Number finito |
| `coordinates.longitude`            |   ✓    |    ✓     | Number finito |
| `geography.continent`              |   ✓    |    ✓     | Resuelto (`v_locations_resolved`) |
| `geography.country`                |   ✓    |    ✓     | Nombre resuelto |
| `geography.region`                 |   ✓    |    ✓     | |
| `geography.province`               |   ✓    |    ✓     | `zone_id` resuelto |
| `geography.municipality`           |   ✓    |    ✓     | |
| `geography.locality`               |   ✓    |    ✓     | |
| `classification.poiLevel`          |   ✗    |    ✓     | Internal-only en PR-EXPORT-2 (§15.2) |
| `classification.rootStatus` A/B/C/D|   ✗    |    ✓     | Internal-only en PR-EXPORT-2 (§15.3) |
| `classification.category`          |   ✓    |    ✓     | `effectivePlaceType` |
| `classification.tags[]`            |   ✓    |    ✓     | Solo tags públicos filtrados (`filterPersonalTags`) |
| `content.description`              |   ✓    |    ✓     | Solo `enriched_data.descripcion` canónica; sanitización por formato (§15.10) |
| `content.imageUrl`                 |   ⚠    |    ✓     | En `public` solo URLs públicas validadas, no firmadas (§15.4) |
| `metadata.source`                  |   ✓    |    ✓     | Alto nivel, no URL interna |
| `metadata.exportedAt`              |   ✓    |    ✓     | ISO timestamp |
| `internal.countryCode`             |   ✗    |    ✓     | ISO alpha-2 |
| `internal.enrichmentStatus`        |   ✗    |    ✓     | |
| `internal.geoHealth`               |   ✗    |    ✓     | Resumen, no payload completo |
| `customData[allowlisted]`          |   ✓    |    ✓     | Solo claves de §7 |
| Envelope `collection {id,name,…}`  |   ✓    |    ✓     | Solo si origen es colección y hay permiso (§15.6). Vive en metadata del envelope, no en el record. |

Leyenda: ✓ permitido · ✗ prohibido · ⚠ permitido con condición
explícita.

---

## 6. Campos prohibidos (regla dura)

**Si un campo no está explícitamente permitido en §5, no se exporta.**
Lista no exhaustiva de prohibidos por defecto:

- `ownerUserId` (incluido en scope `internal` — el dueño ya se conoce
  por el contexto del export).
- Email del usuario o cualquier PII del propietario/curador.
- `raw_geocode` completo de Nominatim/Google.
- `enriched_data` completo (sólo `descripcion` allowlisted).
- `customData` completo o claves no allowlisted (§7).
- Notas privadas (`user_notes`).
- Audit logs (`poi_p2_runner_audit`, etc.).
- Tokens, claves, signed URLs, `*_signed_url`.
- URLs internas de storage no validadas como públicas.
- Internal debug payloads (`_debug*`, `_perf*`, `_diag*`).
- Metadatos RLS/seguridad (`is_approved`, `visibility` raw,
  `created_by`, `updated_by`).
- Identificadores internos de import (`_docId`, `_docUserId`,
  `_importBatchId`).
- Cualquier campo que aparezca después de esta versión del contrato y
  no esté añadido al allowlist.

> El mapper aplica el allowlist por **inclusión**, no por exclusión.
> Esto previene fugas cuando se añadan nuevas columnas en el schema.

---

## 7. `CUSTOM_DATA_EXPORT_ALLOWLIST`

`customData` es un sobre abierto. **Nunca** se exporta entero.

```ts
// Propuesta inicial — sujeta a §15
export const CUSTOM_DATA_EXPORT_ALLOWLIST = {
  public: [
    'source',
    'external_id',
    'user_label',
  ] as const,
  internal: [
    'source',
    'external_id',
    'user_label',
    // futuros campos operativos previa revisión
  ] as const,
};
```

Reglas:

- Claves desconocidas → **omitidas** silenciosamente.
- Valores no serializables (functions, symbols, DOM nodes) → omitidos.
- Estado personal (`visited`, `user_rating`) NO va en `customData`
  exportable. Personal state no influye en export (PR-EXPORT-1).
- Nombres concretos se pulen tras revisión de datos reales (§15).

---

## 8. Formatos soportados en PR-EXPORT-2

Todos los formatos consumen `PoiExportRecord[]`. Ninguno lee
`GeoLocation`.

### 8.1 CSV

- Tabla plana, una fila por POI.
- Columnas estables y documentadas (orden fijo).
- Encoding UTF-8 + BOM opcional para Excel.
- Escape correcto de `,`, `"`, `\n`, `\r`.
- Campos anidados se aplanan: `geography_country`,
  `classification_poiLevel`, etc.
- `tags[]` se serializan como `;`-separated string.
- `customData[k]` se aplana como columnas `custom_<k>` sólo si la
  clave está en allowlist (§7).

### 8.2 KML

- Un `<Placemark>` por POI.
- `<Point><coordinates>lng,lat,0</coordinates></Point>`.
- `<name>` sanitizado (escape XML).
- `<description>` sanitizada (escape XML, sin HTML crudo de
  `enriched_data`).
- `<ExtendedData>` con `<Data name="…">` sólo para campos
  allowlisted.
- Cabecera con `<Document><name>` y metadata `exportedAt`,
  `export_scope`.

### 8.3 JSON

- Envelope con metadata + array de records:

```json
{
  "export_scope": "public",
  "exported_at": "2026-05-23T12:34:56.000Z",
  "count": 42,
  "records": [ /* PoiExportRecord[] */ ]
}
```

- **Prohibido** exportar `GeoLocation` completo (regla dura). El
  `exportToJSON` actual debe migrar a `PoiExportRecord` en la
  implementación PR-EXPORT-2.

### 8.4 GeoJSON

- `FeatureCollection` con `Feature[]`.
- `geometry`: `{ type: 'Point', coordinates: [longitude, latitude] }`
  (orden **GeoJSON canónico** `[lng, lat]`).
- `properties`: todos los campos allowlisted de `PoiExportRecord`
  excepto `coordinates` (ya en `geometry`).
- `id` en `Feature.id` y duplicado en `properties.id` para
  compatibilidad.
- Envelope `FeatureCollection` puede llevar `metadata` extra fuera del
  estándar estricto si el consumidor lo tolera; default sin metadata.

### 8.5 Exclusiones explícitas (fuera de PR-EXPORT-2)

- XLSX (Excel binario).
- PDF.
- ZIP / multi-file bundle.
- Backup full-account.
- Export async server-side / edge jobs.
- Storage + signed URLs.
- GPX (queda pendiente decisión waypoint-only, §15).

---

## 9. Reglas de permisos

Por entrada del flujo:

| Origen UI                          | Scope default | Reglas adicionales |
|------------------------------------|---------------|--------------------|
| `ExportPanel` (panel lateral)      | usuario elige `public` / `internal` | `scopeProvided: true` obligatorio |
| `SelectionActions` (selección)     | usuario elige | si N items mezcla scopes elegibles, partición + report |
| Popup POI `export-poi`             | `public` por defecto | single POI; si no pasa gate `public`, ofrecer `internal` solo si owner |
| `ShareSheet → open-export-panel`   | hereda del panel | bridge SOLO abre panel, no serializa |

Reglas universales:

- Respetar `visibility` (`public` / `followers` / `private`).
- Respetar `is_approved`.
- Respetar `ownerUserId` (scope `internal` exige owner).
- POIs no autorizados se **excluyen silenciosamente** del archivo y se
  **reportan en UI** como count + razón genérica (§10).
- Selección parcialmente exportable: nunca abortar; exportar elegibles
  y mostrar excluidos.
- `internal` requiere owner o capability futura
  `export_poi_internal` (§15).

---

## 10. UX

Flujos soportados (sin cambios respecto al estado actual; sólo se
añade el bridge ShareSheet):

- **`ExportPanel`** (`src/domains/content/components/ExportPanel.tsx`).
- **`SelectionActions`** (`src/components/filters/SelectionActions.tsx`).
- **Popup POI** action `export-poi` (single POI).
- **Bridge `ShareSheet → ExportPanel`**: evento
  `lovable:open-export-panel`. ShareSheet **nunca** invoca serializers.

La UI debe mostrar:

- Lista de formatos disponibles (CSV, KML, JSON, GeoJSON).
- Selector de scope (`public` / `internal`) cuando ambos son
  aplicables.
- Contador de POIs elegibles para el scope/format actual.
- Contador de POIs excluidos.
- Motivo genérico de exclusión (no detalle por POI por defecto; lista
  expandible opcional).
- Nombre de archivo sugerido (`vandits-<scope>-<count>-<yyyymmdd>.<ext>`).
- Botón de descarga que dispara `Blob` + `URL.createObjectURL`.
- Feedback de tracking (último export, count) reutilizando
  `use-export-tracking` consolidado.

---

## 11. Tracking / auditoría

PR-EXPORT-2:

- **Tracking cliente** mínimo, basado en `localStorage`.
- **Consolidar** la duplicidad detectada en la auditoría:
  - `src/hooks/use-export-tracking.ts`
  - `src/domains/content/hooks/use-export-tracking.ts`
  Una sola implementación canónica; la otra re-exporta o se elimina.
- **No auditoría server-side** en PR-EXPORT-2.

Registro por export:

```ts
{
  format: 'csv' | 'kml' | 'json' | 'geojson',
  scope: 'public' | 'internal',
  countExported: number,
  countExcluded: number,
  origin: 'panel' | 'selection' | 'popup',
  timestamp: string,  // ISO
}
```

**No registrar** el contenido exportado, ni IDs de POIs, ni nombres.

---

## 12. Errores

| Caso                                | Comportamiento |
|-------------------------------------|----------------|
| 0 POIs elegibles tras gate          | No descargar. Mostrar mensaje "Nada exportable en este scope". |
| Formato no soportado                | Error UI inmediato; no llamada a serializer. |
| Coordenadas inválidas en un POI     | Excluir POI; contar en excluidos. KML/GeoJSON nunca emiten geometry inválida. |
| Permiso insuficiente (`not-owner` en internal) | Excluir; reportar en count. |
| Selección 100% no elegible          | Tratar como "0 POIs"; no descargar. |
| Serializer lanza excepción          | Cancelar descarga; mostrar error UI; registrar `tracking failure` (sin contenido). |
| `customData` con valor no serializable | Omitir clave; no abortar export. |

---

## 13. Tests obligatorios futuros (para la implementación)

La implementación de PR-EXPORT-2 deberá añadir, como mínimo:

1. `evaluatePoiExport` se invoca **antes** de `mapToPoiExportRecord`
   en cada entry point.
2. Scope `public` nunca incluye campos del bloque `internal`.
3. Scope `internal` exige owner o capability equivalente; falla
   `not-owner` se respeta server-side y client-side.
4. `customData` exportado ⊆ `CUSTOM_DATA_EXPORT_ALLOWLIST[scope]`.
5. JSON **no** exporta `GeoLocation` completo (snapshot test contra
   shape de `PoiExportRecord`).
6. CSV/KML/JSON/GeoJSON aceptan únicamente `PoiExportRecord[]` en su
   firma (test de tipos + runtime).
7. GeoJSON serializa `coordinates` como `[lng, lat]`.
8. KML escapa XML en `name` y `description`; sanitiza HTML.
9. Export desde colección respeta permisos POI a POI (no
   short-circuit por colección pública).
10. Single POI desde popup respeta el gate canónico.
11. Selección mixta reporta `countExcluded > 0` y exporta elegibles.
12. Tracking consolidado: existe una sola implementación efectiva de
    `use-export-tracking`.
13. Defensa en profundidad: `applyExportGate` sigue activo en
    `kml-parser`; un POI ajeno colado en `internal` se descarta.
14. ShareSheet `bridge` no invoca serializers (grep estático).

---

## 14. Fuera de alcance

Explícitamente **NO** entran en PR-EXPORT-2:

- Backend export jobs / edge functions de export.
- Export asíncrono con polling.
- Backup full-account.
- ZIP / multi-file bundles.
- XLSX, PDF.
- GPX (decisión pendiente, §15).
- Auditoría server-side de exports.
- Cambios de datos.
- Cambios de schema.
- Cambios en `evaluatePoiExport` (PR-EXPORT-1 sigue intacto).
- Cambios en `ShareSheet`, `share-eligibility`, `share-payload`
  (PR-SHARE-1 sigue intacto).
- Export de rutas / tracks / documentos completos (solo POIs).
- Envelope de colección (nombre/descripción de la colección como
  metadata del archivo) — §15.

---

## 15. Preguntas abiertas

Pendientes de resolución antes de implementar PR-EXPORT-2:

1. **`customData` allowlist real**: ¿`source`, `external_id`,
   `user_label` cubren los casos reales? ¿Hay claves operativas que
   queremos exponer en `internal`?
2. **`classification.poiLevel` (POI-N)**: ¿se permite en `public` o
   queda restringido a `internal`? Riesgo: expone curación interna.
3. **`classification.rootStatus` (A/B/C/D)**: misma pregunta. Es
   metadato de pipeline; probablemente `internal` only.
4. **`content.imageUrl` en `public`**: ¿se exporta cualquier URL o
   sólo si pasa validación de origen público (no signed, no storage
   privado)?
5. **GeoJSON default scope**: ¿debe ofrecerse como `public` por
   defecto al ser el formato más "compartible"?
6. **Export de colección**: ¿debe incluir nombre/descripción de la
   colección como envelope en JSON/GeoJSON? ¿O sólo POIs?
7. **Límite máximo de POIs para export síncrono cliente**: la
   auditoría sugiere ~5.000. Confirmar techo duro y comportamiento al
   superarlo (bloquear vs warning).
8. **`export_poi_internal` capability**: ¿se crea una nueva capability
   para admins que necesiten exportar POIs ajenos en modo internal, o
   se mantiene strict owner-only?
9. **GPX waypoint-only**: ¿se añade como formato de PR-EXPORT-2 o se
   pospone? Decisión binaria.
10. **Sanitización de `description`**: ¿se exporta markdown crudo,
    plaintext o HTML escapado por formato? Propuesta: plaintext en
    CSV/JSON/GeoJSON, escaped en KML.

---

## Anexos: anclajes al repo

- SoT eligibility: `src/domains/content/lib/poi-export-eligibility.ts`
  (`evaluatePoiExport`, `partitionForExport`,
  `EXPORT_EXCLUSION_LABEL`).
- Serializers actuales: `src/lib/kml-parser.ts` (`exportToKML`,
  `exportToCSV`, `exportToJSON`, `applyExportGate`).
- UI entry points: `src/domains/content/components/ExportPanel.tsx`,
  `src/components/filters/SelectionActions.tsx`, popup action
  `export-poi`.
- Tracking: `src/hooks/use-export-tracking.ts` +
  `src/domains/content/hooks/use-export-tracking.ts` (consolidar).
- Contratos relacionados:
  - `docs/contracts/poi-export-contract.md` (PR-EXPORT-1).
  - `docs/contracts/share-vs-export-contract.md` (PR-SHARE-1).
  - `mem://logic/sharing/share-vs-export-canon`.
  - `mem://logic/export/poi-export-contract`.
- Auditoría: `docs/audits/poi-export-existing-logic-audit.md`.
