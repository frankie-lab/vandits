# PR-EXPORT-2 — Implementation Plan

**Status:** Fase 1 (plan técnico). No implementa código.
**Owner contract:** [`docs/contracts/pr-export-2-poi-export-canon.md`](../contracts/pr-export-2-poi-export-canon.md)
**Referencias:**
- [`docs/audits/poi-export-existing-logic-audit.md`](./poi-export-existing-logic-audit.md)
- [`docs/contracts/poi-export-contract.md`](../contracts/poi-export-contract.md) (PR-EXPORT-1)
- [`docs/contracts/share-vs-export-contract.md`](../contracts/share-vs-export-contract.md)

---

## 1. Objetivo y alcance

Traducir el contrato PR-EXPORT-2 a una implementación incremental en 3 fases:

1. **Fase 2 — Core**: tipos, mapper, serializers, registry, wiring invisible.
2. **Fase 3 — UX mínima**: exponer formatos y scopes en `ExportPanel`, `SelectionActions`, popup `export-poi`.
3. **Fase 4 — QA UX**: validación end-to-end.

Share queda intacto. Backend, async, ZIP, XLSX, PDF, GPX, capability admin export ajeno, RLS export → fuera.

---

## 2. Ubicación de tipos

Nueva ruta canónica de dominio:

```
src/domains/content/lib/
  poi-export-record.ts         # tipos + allowlist
  poi-export-mapper.ts         # mapToPoiExportRecord
  exporters/
    index.ts                   # registry
    poi-csv.ts
    poi-kml.ts
    poi-json.ts
    poi-geojson.ts
```

Cohesión con `poi-export-eligibility.ts` (ya en `domains/content/lib`).
Re-export desde el barrel de dominio si existe; si no, importar por path absoluto `@/domains/content/lib/...`.

Tipos a definir en `poi-export-record.ts`:
- `PoiExportRecord` (DTO canónico, ver §3 y §4 del contrato).
- `PoiExportScope = 'public' | 'internal'`.
- `PoiExportFormat = 'csv' | 'kml' | 'json' | 'geojson'`.
- `CUSTOM_DATA_EXPORT_ALLOWLIST = ['source', 'external_id', 'user_label'] as const`.

**Regla dura sobre `ownerUserId`** (ajuste obligatorio #1):
- `ownerUserId` se usa **exclusivamente** dentro de `evaluatePoiExport` para validar permisos (C1 PR-EXPORT-1).
- **Nunca** forma parte de `PoiExportRecord`.
- **Nunca** se exporta en `public` ni en `internal`.
- Tipo `PoiExportRecord` no declara la clave `ownerUserId`. Un contract test de Fase 2 lo garantiza.

---

## 3. Mapper canónico `mapToPoiExportRecord`

Firma:

```ts
function mapToPoiExportRecord(
  loc: GeoLocation,
  scope: PoiExportScope,
): PoiExportRecord
```

Único punto del codebase que lee `GeoLocation` para export. Responsabilidades:

- Coordenadas: `loc.lat`/`loc.lng` → `latitude`/`longitude`.
- Geografía resuelta: usar `v_locations_resolved` o helpers existentes; no inventar campos.
- Clasificación: `classification.poiLevel` y `classification.rootStatus` **omitidos** si `scope === 'public'`.
- `content.imageUrl`: incluida solo si es URL pública validada; signed/private → omitir.
- `content.description`: plaintext. La sanitización XML para KML vive en el serializer KML, no aquí.
- `customData`: filtrar contra `CUSTOM_DATA_EXPORT_ALLOWLIST`; cualquier otra clave se descarta silenciosamente (warn dev).
- **Nunca** emite: `ownerUserId`, PII, `enriched_data` crudo, `raw_geocode`, `_docUserId`, signed URLs, debug fields.

El mapper es puro (no I/O, no side effects). Idempotente.

---

## 4. Pipeline canónico (orden inmutable)

```text
GeoLocation[]
  → permissions check (caller — has_permission / role)
  → for each loc: evaluatePoiExport(loc, { scope, currentUserId })
  → split: { eligible, excluded[] }
  → eligible.map(loc => mapToPoiExportRecord(loc, scope))   // PoiExportRecord[]
  → serializer[format](records, { scope, envelope? })       // string
  → new Blob([str], { type: mime })
  → download (anchor click)
  → use-export-tracking.track({ format, scope, count, excludedCount })
```

Invariantes:
- Serializers reciben **`PoiExportRecord[]`**, nunca `GeoLocation`.
- `evaluatePoiExport` corre **antes** del mapper y del serializer.
- POIs no elegibles nunca llegan al mapper.
- `excluded[]` se preserva para mensajería UX (contador "X excluidos").

---

## 5. Scopes public vs internal

Tabla de campos (referencia normativa: §DTO del contrato PR-EXPORT-2).

| Campo                          | public | internal |
|--------------------------------|--------|----------|
| `id`                           | sí     | sí       |
| `name`                         | sí     | sí       |
| `latitude` / `longitude`       | sí     | sí       |
| `geography.*` (resuelta)       | sí     | sí       |
| `content.description`          | sí     | sí       |
| `content.imageUrl` (pública)   | sí     | sí       |
| `classification.poiLevel`      | **no** | sí       |
| `classification.rootStatus`    | **no** | sí       |
| `enrichmentStatus`             | no     | sí       |
| `geoHealth`                    | no     | sí       |
| `customData` (allowlist)       | sí     | sí       |
| `ownerUserId`                  | **no** | **no**   |
| PII / email / debug            | no     | no       |
| `enriched_data` crudo          | no     | no       |
| `raw_geocode`                  | no     | no       |
| signed URLs                    | no     | no       |

Permisos:
- `internal` exige `ownerUserId === currentUserId` (C1 PR-EXPORT-1, ya garantizado por `evaluatePoiExport`).
- `internal` es **owner-only** en PR-EXPORT-2. Capability `export_poi_internal` para admins → pospuesta.

### Default scope (ajuste obligatorio #2 — DECISIÓN PENDIENTE antes de Fase 2)

Recomendación conservadora a confirmar:

- **Todos los formatos default `public`** (CSV, KML, JSON, GeoJSON).
- `internal` solo si el usuario lo selecciona explícitamente en UI **y** pasa el gate de owner.
- No se asigna `internal` automático a CSV/JSON aunque el caller sea owner.

Esta decisión **debe ratificarse antes de empezar Fase 2** porque define el comportamiento por defecto del registry y de `ExportPanel`. Ver §15.

---

## 6. CUSTOM_DATA_EXPORT_ALLOWLIST

```ts
export const CUSTOM_DATA_EXPORT_ALLOWLIST = [
  'source',
  'external_id',
  'user_label',
] as const;
```

Helper interno:

```ts
function filterCustomData(
  raw: Record<string, unknown> | undefined,
  allowlist: readonly string[],
): Record<string, unknown> | undefined
```

Aplicado **dentro de `mapToPoiExportRecord`**, no en serializers. Cualquier clave fuera de la allowlist se descarta silenciosamente. Ampliar la lista requiere auditoría y bump del contrato.

---

## 7. JSON deja de exportar `GeoLocation` completo

Estado actual (audit §3): el export JSON vuelca el objeto `GeoLocation` crudo, incluyendo `enriched_data`, `_docUserId`, `raw_geocode`, etc. Esto viola el contrato.

Cambio:
- `poi-json.ts` recibe `PoiExportRecord[]` y serializa solo esas claves.
- Envelope canónico:

```json
{
  "export_format_version": "poi-export-json-v2",
  "scope": "public" | "internal",
  "generatedAt": "ISO-8601",
  "collection": { "id": "...", "name": "...", "description": "..." } | null,
  "count": 123,
  "items": [ /* PoiExportRecord[] */ ]
}
```

**Breaking change consciente** (ajuste obligatorio #5):
- Consumidores externos que parseaban el dump crudo de `GeoLocation` se romperán.
- `export_format_version: "poi-export-json-v2"` actúa como marker explícito de versión.
- Documentar en release notes y en `poi-export-existing-logic-audit.md` cuando se ejecute Fase 2.
- Mitigación: snapshot test contra fixture `public` y `internal` para detectar regresiones futuras.

---

## 8. GeoJSON (formato nuevo)

`poi-geojson.ts` produce un `FeatureCollection` válido:

```json
{
  "type": "FeatureCollection",
  "export_format_version": "poi-export-geojson-v1",
  "scope": "public",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [lng, lat] },
      "properties": { /* PoiExportRecord sin latitude/longitude */ }
    }
  ]
}
```

Reglas:
- `coordinates` orden **`[lng, lat]`** (canon GeoJSON).
- `properties` = `PoiExportRecord` excepto `latitude`/`longitude` (ya en `geometry`).
- Default scope: ver §5 (decisión pendiente).
- Envelope de colección opcional: `properties` a nivel `FeatureCollection` con `collection: { id, name, description? }` si aplica.

---

## 9. CSV / KML (formatos existentes)

- `poi-csv.ts`: cabecera fija derivada de las claves de `PoiExportRecord` para el `scope` dado. `description` plaintext. Escape RFC 4180.
- `poi-kml.ts`: XML escape de `description` y `name`. Coordenadas KML `<coordinates>lng,lat,0</coordinates>`. Mantiene compatibilidad con `kml-parser` actual; default temporal `'internal'` con warn (PR-EXPORT-1 C2) se elimina en este paso al pasar siempre `scope` explícito.

Ambos consumen `PoiExportRecord[]`. Cero acceso a `GeoLocation`.

---

## 10. Consolidación `use-export-tracking`

Audit detectó dos implementaciones de `use-export-tracking` (ver `poi-export-existing-logic-audit.md` §6).

Plan (ajuste obligatorio #4):
1. Diff manual de las dos implementaciones antes de tocar nada.
2. **Si el diff confirma cero cambio de comportamiento** → consolidar en `src/hooks/use-export-tracking.ts` (path canónico) y borrar el duplicado.
3. **Si hay cualquier divergencia** (eventos emitidos, payload, side effects, storage keys) → **posponer la consolidación**, dejar comentario `// TODO PR-EXPORT-2.1 consolidate` en ambos y registrar la divergencia en el reporte de Fase 2.

No bloquea Fase 2 core si se pospone.

---

## 11. Cambios mínimos en UX (Fase 3)

### `ExportPanel`
- Añadir opción **GeoJSON** al selector de formato.
- Añadir selector explícito de scope `public` / `internal` (visible solo si la selección actual es 100% del usuario actual; si no, scope locked a `public`).
- Contador `exportables / excluidos` alimentado por el split de `evaluatePoiExport`.
- Mensajes UX: 0 exportables, formato no soportado, warning > 5.000, bloqueo > 10.000 (helpers ya previstos en contrato).
- Descarga: `serialize → Blob → anchor`.

### `SelectionActions`
- Reutilizar el mismo pipeline. No duplicar serializers.
- Mantener `scope` + `scopeProvided: true` (ya cumple C2 PR-EXPORT-1).
- Botón unificado que abre `ExportPanel` o ejecuta flujo compartido idéntico.

### Popup `export-poi`
- Single POI usa exactamente `evaluatePoiExport` + `mapToPoiExportRecord` + registry.
- No serializa inline.
- Mantiene UX actual; solo cambia el pipeline subyacente.

### `ShareSheet` (ajuste obligatorio #3)
- **ShareSheet solo abre `ExportPanel`.**
- **Nunca invoca serializers, mapper, registry ni `evaluatePoiExport` directamente.**
- Contract test grep en Fase 2: `ShareSheet` no importa `exporters/*`, `mapToPoiExportRecord` ni `PoiExportRecord`.
- Mantiene el boundary Share ≠ Export definido en `share-vs-export-contract.md`.

---

## 12. Tests obligatorios

### Fase 2 — Core (ubicación `src/test/`)

- `poi-export-record-type.test.ts` — typecheck/runtime guard: `PoiExportRecord` no declara `ownerUserId`, ni PII, ni `enriched_data`.
- `poi-export-mapper.test.ts`
  - `public` omite `poiLevel`, `rootStatus`, `enrichmentStatus`, `geoHealth`, `raw_geocode`, `enriched_data`, `ownerUserId`.
  - `internal` incluye campos internal allowlisted, sigue omitiendo `ownerUserId`.
  - `customData` solo allowlist; claves no allowlisted descartadas.
  - `imageUrl` signed/private excluida en `public`.
- `poi-export-json-no-geolocation.test.ts`
  - Output JSON no contiene `enriched_data`, `_docUserId`, `raw_geocode`, `ownerUserId`.
  - Incluye `export_format_version: "poi-export-json-v2"`.
- `poi-export-geojson.test.ts`
  - `FeatureCollection` válido (parse + validate).
  - `coordinates` orden `[lng, lat]`.
  - `properties` no contiene `latitude`/`longitude` duplicadas.
- `poi-export-serializers-dto-only.test.ts` (contract test)
  - Grep estático: `exporters/*` no importan `GeoLocation`.
  - Runtime: pasar `GeoLocation` directo a un serializer arroja en dev.
- `poi-export-pipeline.test.ts`
  - `evaluatePoiExport` siempre corre antes del mapper.
  - POI no elegible nunca aparece en output.
  - `excluded[]` se reporta a tracking.
- `poi-export-sharesheet-boundary.test.ts` (contract test)
  - Grep estático: `ShareSheet` no importa `exporters/*`, `mapToPoiExportRecord`, `PoiExportRecord`.
- `poi-export-tracking-single-hook.test.ts`
  - Solo existe un `use-export-tracking` exportado (si consolidación ocurrió).
  - Si pospuesta: marca el test como `skip` con razón documentada.

### Fase 3 — UX
- `ExportPanel` renderiza opción GeoJSON.
- `ExportPanel` muestra selector de scope solo cuando aplica.
- `ExportPanel` muestra contador exportables/excluidos.
- Popup single POI respeta gate.
- Límites: 5k → warning, 10k → bloqueo (si helper existe).

---

## 13. Riesgos

| ID | Riesgo | Mitigación |
|----|--------|------------|
| R1 | Mapper omite campos que un consumidor espera | Snapshot fixture por scope; revisión manual en PR |
| R2 | JSON v2 rompe integraciones externas | `export_format_version` marker; release notes; comunicación previa |
| R3 | Consolidación tracking arrastra diferencias sutiles | Diff manual; posponer si diverge (§10) |
| R4 | Default scope sorprende al owner | Decisión pendiente (§5, §15) antes de Fase 2 |
| R5 | Performance cliente > 5k POIs | Warning UX; > 10k bloqueo duro |
| R6 | ShareSheet regression | Contract test grep + smoke test boundary |
| R7 | `customData` allowlist excluye campo necesario | Documentar proceso de ampliación con auditoría |
| R8 | Serializer KML mal escape XML | Test con `description` que contiene `<`, `>`, `&`, `'`, `"` |

---

## 14. Orden de implementación (Fase 2)

1. Crear `poi-export-record.ts` (tipos + allowlist).
2. Crear `poi-export-mapper.ts`.
3. Crear `exporters/poi-json.ts` (reemplaza dump crudo) + `poi-geojson.ts` (nuevo).
4. Portar `exporters/poi-csv.ts` + `poi-kml.ts` para consumir DTO.
5. Crear `exporters/index.ts` (registry con metadata: extension, mime, defaultScope).
6. Wiring invisible: `ExportPanel`/`SelectionActions`/popup `export-poi` enchufan el nuevo pipeline manteniendo UI actual.
7. Tests core (§12).
8. Evaluar consolidación `use-export-tracking` (§10).

Criterio de salida Fase 2:
- Todos los tests core verdes.
- Grep confirma cero acceso a `GeoLocation` desde serializers.
- Grep confirma cero acceso de `ShareSheet` al pipeline.
- ShareSheet abre `ExportPanel` exactamente igual que antes.
- Sin cambios de schema, datos ni backend.

---

## 15. Decisiones tomadas y decisiones pendientes

### Decisiones tomadas en este plan
1. `ownerUserId` nunca entra en `PoiExportRecord`; solo se usa en `evaluatePoiExport`.
2. `ShareSheet` nunca invoca serializers, mapper ni registry; solo abre `ExportPanel`.
3. JSON migra a `export_format_version: "poi-export-json-v2"` con envelope `{ scope, generatedAt, collection?, count, items }`. Breaking change asumido y documentado.
4. GeoJSON nuevo, `coordinates: [lng, lat]`, `properties` = `PoiExportRecord` sin lat/lng duplicadas.
5. `CUSTOM_DATA_EXPORT_ALLOWLIST = ['source', 'external_id', 'user_label']` (allowlist inicial conservadora).
6. `internal` = owner-only en PR-EXPORT-2. Capability admin pospuesta.
7. Consolidación `use-export-tracking` solo si diff = cero cambio; si no, posponer y documentar.
8. Pipeline orden inmutable: permissions → `evaluatePoiExport` → `mapToPoiExportRecord` → serializer → Blob → tracking.
9. Serializers prohibidos leer `GeoLocation`; contract test grep + runtime guard.
10. Sanitización: plaintext en CSV/JSON/GeoJSON; XML escape en KML.

### Decisiones ratificadas (antes de Fase 2)

Las 6 decisiones pendientes quedaron cerradas. Estas son las reglas vinculantes para Fase 2 Core:

1. **Default scope por formato** — CERRADA.
   - Todos los formatos (CSV, KML, JSON, GeoJSON) usan `public` por defecto.
   - `internal` solo si: (a) el usuario lo selecciona explícitamente, (b) tiene permiso, (c) `evaluatePoiExport` lo autoriza.
   - **No hay `internal` automático por ser owner.**
   - Registry expone `defaultScope: 'public'` para los 4 formatos.

2. **Envelope de colección** — CERRADA.
   - Habilitado en JSON, GeoJSON y KML cuando el origen sea una colección.
   - Shape canónica:
     ```ts
     collection: {
       id: string;
       name: string;
       description?: string;
     }
     ```
   - Condiciones:
     - Solo si el usuario tiene permiso sobre la colección.
     - No incluir campos privados de colección.
     - CSV puede usar columnas `collection_id` / `collection_name` si añade valor; el envelope formal **no** aplica a CSV.
   - `description` de colección se trata como texto plano en JSON/GeoJSON y se XML-escapa en KML (misma regla que `description` de POI).

3. **`customData` keys no allowlisted** — CERRADA.
   - Descartar silenciosamente en producción.
   - En desarrollo (`import.meta.env.DEV`), emitir `console.warn` con la key descartada.
   - Nunca exportar keys no allowlisted. Nunca exportar `customData` completo.

4. **Consolidación `use-export-tracking`** — CERRADA.
   - Criterio operativo de "cero cambio":
     - mismo API público del hook;
     - mismos eventos emitidos;
     - mismos payloads;
     - mismos call sites;
     - mismos side effects (storage keys, broadcasts);
     - diff manual o tests que lo documenten.
   - Si hay **cualquier** divergencia funcional → posponer consolidación a un PR separado (no bloquea Fase 2 Core).

5. **Comunicación del breaking change JSON v2** — CERRADA.
   - Registrar en:
     - `docs/releases/version-history.md` si existe el patrón de release notes en el proyecto;
     - README/changelog si el patrón actual lo exige;
     - comentario doc-block en el serializer `poi-json.ts` describiendo el cambio y el marker `export_format_version: "poi-export-json-v2"`.
   - **No** añadir modal UX adicional en PR-EXPORT-2.

6. **Límites 5k / 10k** — CERRADA.
   - Helpers viven en **Fase 2 Core** (regla de contrato compartida).
   - Fase 2:
     - helper único `evaluatePoiExportSize(count): { level: 'ok' | 'warn' | 'block', thresholds: { warn: 5000, block: 10000 } }`;
     - registry expone el límite y nivel (`opts.size = evaluatePoiExportSize(records.length)`);
     - tests unitarios sobre el helper (límites exactos, edge cases 4999/5000/5001/9999/10000/10001);
     - serializers **abortan** si `level === 'block'` (defensa en profundidad).
   - Fase 3 UX consume el helper para mostrar warning > 5.000 y bloquear > 10.000.
   - Export > 10.000 nunca se ejecuta cliente-side.

---

## Listo para UX cuando

- Fase 2 cierra todos los tests del §12 en verde.
- Grep confirma serializers DTO-only y `ShareSheet` boundary.
- `ExportPanel`, `SelectionActions` y popup `export-poi` usan el mismo pipeline.
- Las 6 decisiones ratificadas del §15 están implementadas tal cual.
- Share sigue funcionando idéntico (smoke manual + contract test).

