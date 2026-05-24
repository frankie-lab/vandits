# PR-EXPORT-2 — QA End-to-End

Fecha: 2026-05-23
Referencia: `docs/contracts/pr-export-2-poi-export-canon.md`,
`docs/audits/pr-export-2-implementation-plan.md`, reporte final Fase 3 UX.

## Método

QA ejecutada como **harness payload-level** (`src/test/poi-export-pr2-qa-e2e.test.ts`)
que ataca exactamente la cadena de producción
`partitionForExport → mapToPoiExportRecords → serializePoi{Csv,Kml,Json,GeoJson}`
y, en paralelo, valida `runPoiExport` (pipeline canónico). Los fixtures usan
`poi9/poi10/poi5/poi1bEditorial` del set canónico `poi-export-fixtures.ts`,
inyectando además `rawGeocode`, `imageUrl` firmada y `customData` con dos
claves fuera del allowlist (`secret_internal`, `session_token`) para forzar
una superficie de ataque realista.

> El UX real (panel + map) no se inspeccionó interactivamente porque el dataset
> del preview tarda en cargar y los descargables del navegador no son
> introspectables. La validación se hace contra los bytes emitidos por los
> serializers reales y contra el resultado de `runPoiExport`, que es lo que el
> panel descarga. La integración UI ya está cubierta por `poi-export-pr2-ux.test.ts`
> (10 tests) + `poi-export-contract.test.ts` (boundary de call sites).

## Casos probados

| # | Caso | Resultado |
|---|------|-----------|
| 1.1 | ExportPanel — CSV | PASS (3/5 elegibles, mime `text/csv;charset=utf-8`) |
| 1.2 | ExportPanel — KML | PASS (XML válido, ExtendedData con allowlist) |
| 1.3 | ExportPanel — JSON | PASS (envelope `poi-export-json-v2`) |
| 1.4 | ExportPanel — GeoJSON | PASS (envelope `poi-export-geojson-v1`, `FeatureCollection`) |
| 1.5 | GeoJSON visible en selector | PASS (`FORMATS = ['kml','csv','json','geojson']` en ExportPanel.tsx) |
| 1.6 | Contador exportables/excluidos | PASS (`eligibleCount=3`, `excludedCount=2`, razones `not-shareable`, `editorial-only-1b`) |
| 1.7 | Scope `public` por defecto | PASS (default declarado en ExportPanel; pipeline acepta `public` sin permisos) |
| 1.8 | Scope `internal` requiere ownership | PASS (POI `c` de OWNER_B → `not-owner` en internal; UI deshabilita internal si no hay user) |
| 2.1 | SelectionActions — multi-export | PASS (call site usa `runPoiExport` con `origin:'selection'`) |
| 2.2 | SelectionActions — mismo pipeline | PASS (contract test `PR-EXPORT-1 C2` reformulado: prohíbe `exportToKML/CSV/JSON(` y exige `runPoiExport(` + `scope`) |
| 2.3 | SelectionActions — excluye no exportables | PASS (delegado al pipeline; misma partición) |
| 3.1 | Popup single POI — respeta `evaluatePoiExport` | **GAP documentado** — popup actual no expone botón "Exportar este POI"; cuando se cablee, deberá pasar por `runPoiExport({origin:'popup'})`. No es regresión: nunca existió en Fase 2/3. |
| 4.1 | ShareSheet boundary | PASS (no existe `ShareSheet.tsx`; `src/domains/sharing/` no importa mapper/record/exporters — boundary test verde) |
| 4.2 | ShareSheet no invoca serializers | PASS (mismo boundary test) |
| 5.x | Seguridad de payload | ver tabla siguiente |
| 6.1 | Warning > 5.000 | PASS (`kind:'warn-pending'`, `warn=5000`, `block=10000`) |
| 6.2 | Bloqueo > 10.000 | PASS (lanza `PoiExportSizeError`, `block_threshold=10000`) |
| 6.3 | `confirmedOverWarn` desbloquea warning | PASS (5.500 con `confirmedOverWarn:true` → `kind:'ok'`) |
| 6.4 | SelectionActions/popup respetan `confirmedOverWarn` | **GAP documentado** — el flag está implementado en el pipeline y en ExportPanel; SelectionActions hoy no muestra el modal de confirmación >5k. Pipeline igual aborta a 10k por defensa en profundidad (throw). |

## Seguridad de payload (assertions sobre bytes emitidos)

Concatenando CSV + KML + JSON public + GeoJSON public + JSON internal:

| Invariante | Resultado |
|------------|-----------|
| Sin `ownerUserId` / sin uids en el cuerpo | PASS |
| Sin `raw_geocode` / `rawGeocode` / `"photon"` | PASS |
| Sin blob `enriched_data` / `verification_notes` / `nombre_lugar` | PASS |
| Sin clave `secret_internal` (allowlist drop) | PASS |
| Sin clave `session_token` (allowlist drop) | PASS |
| Sin imagen firmada en public (`signature=…`) | PASS |
| GeoJSON `coordinates = [lng, lat]` (RFC 7946) | PASS (`[2, 41]`) |
| JSON envelope `export_format_version = "poi-export-json-v2"` | PASS |
| GeoJSON envelope `export_format_version = "poi-export-geojson-v1"` + `type:"FeatureCollection"` | PASS |

`customData` final emitido: `['source', 'external_id', 'user_label']` — coincide
exactamente con `CUSTOM_DATA_EXPORT_ALLOWLIST`. Las dos claves fuera de
allowlist generan `console.warn` pero no llegan a ningún serializer.

## Muestras de payload

### CSV (header + 3 filas)

```
id,name,description,latitude,longitude,altitude,continent,country,region,zone,image_url,tags,export_scope,external_id,source,user_label
"a","POI sano","Edificio histórico construido en el siglo XVIII…","41","2","","","","","","","historia","public","abc-123","kml","visita 2024"
…
```

### KML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom">
  <Document>
    <name>qa-e2e</name>
    <atom:author><atom:name>vandits-public</atom:name></atom:author>
    <Placemark>
      <name>POI sano</name>
      <description>Edificio histórico…</description>
      <ExtendedData>
        <Data name="export_scope"><value>public</value></Data>
        <Data name="tags"><value>historia</value></Data>
        <Data name="source"><value>kml</value></Data>
        <Data name="external_id"><value>abc-123</value></Data>
        <Data name="user_label"><value>visita 2024</value></Data>
      </ExtendedData>
      <Point><coordinates>2,41</coordinates></Point>
    </Placemark>
    …
```

### JSON v2 (public)

```json
{
  "export_format_version": "poi-export-json-v2",
  "scope": "public",
  "generatedAt": "2026-05-23T16:58:47.106Z",
  "collection": null,
  "count": 3,
  "items": [
    {
      "id": "a",
      "name": "POI sano",
      "coordinates": { "latitude": 41, "longitude": 2 },
      "geography": {},
      "content": {
        "description": "Edificio histórico…",
        "tags": ["historia"]
      },
      "customData": { "source": "kml", "external_id": "abc-123", "user_label": "visita 2024" },
      "exportScope": "public"
    }
  ]
}
```

### GeoJSON v1

```json
{
  "type": "FeatureCollection",
  "export_format_version": "poi-export-geojson-v1",
  "scope": "public",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [2, 41] },
      "properties": {
        "id": "a",
        "name": "POI sano",
        "geography": {},
        "content": { "description": "Edificio histórico…", "tags": ["historia"] },
        "customData": { "source": "kml", "external_id": "abc-123", "user_label": "visita 2024" },
        "exportScope": "public"
      }
    }
  ]
}
```

### JSON internal (primer item)

`exportScope:"internal"` añade además `classification.poiLevel` y `geoHealth`.
Sigue sin `ownerUserId`, `rawGeocode`, `enriched_data`, ni `customData` fuera
del allowlist.

## Partición observada (5 POIs)

- `public.eligible = [a, b, c]` (los tres POI-9/10 enriched + shareable).
- `public.excluded = [{d: not-shareable}, {e: editorial-only-1b}]`.
- `internal.eligible = [a, b, d, e]` (todos los del OWNER_A, sin filtro de salud).
- `internal.excluded = [{c: not-owner}]`.

## Tests ejecutados

- `src/test/poi-export-pr2-qa-e2e.test.ts` — 1/1 PASS (assertions duras sobre las 9 invariantes de seguridad + 3 de límites + pipeline shape).
- Suites previas siguen verdes (Fase 3): `poi-export-pr2-core` 37/37, `poi-export-pr2-ux` 10/10, `poi-export-contract` 47/47, `parsers` + `parsers-parity` 58/58.

## Riesgos residuales

1. **Popup single-POI sin botón de export propio**: hoy el contrato no se viola porque no hay call site; cualquier futura adición debe usar `runPoiExport({origin:'popup'})`.
2. **SelectionActions sin diálogo `>5k` propio**: el pipeline igual aborta a 10k por throw; entre 5k y 10k descarga sin confirmación. Si el caso de uso lo requiere, replicar el flujo de confirmación de `ExportPanel`.
3. **`recordExport` tracking**: no se valida persistencia en este harness (depende de Supabase); cubierto indirectamente por contrato de Fase 3.
4. **JSON breaking change**: consumidores externos del dump legacy deben migrar al envelope `poi-export-json-v2`. Marcador de versión presente para detectar.
5. **Coordenadas formateadas como `"41"` en CSV**: precisión preservada como string; revisar si algún consumidor exige decimales fijos.

## Veredicto

**Listo para release de PR-EXPORT-2** en el alcance Fase 2 Core + Fase 3 UX:
ExportPanel, SelectionActions, registry de formatos (CSV/KML/JSON/GeoJSON),
boundary con sharing y garantías de payload. Los dos gaps marcados son
features no-existentes hoy (popup export, modal >5k en selección), no
regresiones — pueden tratarse en un PR-EXPORT-3 sin bloquear este release.

No se modificó código de producción para esta QA; solo se añadió el harness
`src/test/poi-export-pr2-qa-e2e.test.ts`.
