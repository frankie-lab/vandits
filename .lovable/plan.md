# PR-EXPORT-3 — Export Resolver UX

## Objetivo
Sustituir la UX actual de export de POIs (ExportPanel + bloque de export dentro de SelectionActions, ambos con `window.confirm` agresivo) por un único componente `<ExportResolver>` que sienta el export como gestión legítima de datos propios, manteniendo intacto el pipeline canónico (`evaluatePoiExport`, `partitionForExport`, `runPoiExport`, serializers, scopes, thresholds 5k/10k, DTO, RLS, share contract).

## Alcance estricto
Sólo UX y wiring. Ningún cambio en:
- `poi-export-eligibility.ts` (helpers, scopes, razones)
- `poi-export-pipeline.ts` (partition, sizeVerdict, runPoiExport)
- `exporters/*` (KML/CSV/JSON/GeoJSON)
- `kml-parser.ts` defensive gate
- contrato `docs/contracts/poi-export-contract.md` (PR-EXPORT-1)
- RLS, edge functions, schema

## Arquitectura propuesta

### 1. Nuevo componente único
`src/domains/content/components/ExportResolver.tsx`

Props:
```
{
  open, onOpenChange,
  source: { kind: 'selection'|'filters'|'collection'|'explicit',
            label: string,
            locations: GeoLocation[],
            collection?: { id; name; description? } },
  initialScope?: 'public'|'internal',  // default 'internal'
  initialFormat?: 'kml'|'csv'|'json'|'geojson',
  kmlTarget?: 'general'|'mymaps'|'gurumaps',
}
```

Internamente usa `previewPoiExport(...)` (ya existe en pipeline) para todas las cifras y `runPoiExport(...)` + `downloadPoiExportBlob(...)` para ejecutar. Registra vía `useExportTracking().recordExport(...)` con `meta.origin = source.kind`.

### 2. Estructura visual (un único Dialog)

```text
┌───────────────────────────────────────────┐
│  Exportar tus ubicaciones                 │
│  Vandits creará una copia portable.       │
│  Tus ubicaciones seguirán disponibles.    │
├───────────────────────────────────────────┤
│  Origen: <selección | filtros | col.>     │
│  Total: N   Elegibles: M   No incluidos:K │
│  Países/zonas: ES, PT, FR (si disponible) │
│  Tamaño estimado: ~X MB                   │
├───────────────────────────────────────────┤
│  Scope                                    │
│   ( ) Compartible      ( ) Mis datos      │
│   tooltip / micro-copy bajo cada uno      │
├───────────────────────────────────────────┤
│  Formato                                  │
│  [KML] [CSV] [JSON] [GeoJSON]             │
│  (sub-target sólo si KML)                 │
├───────────────────────────────────────────┤
│  Payload                                  │
│  (sólo opciones reales del pipeline)      │
├───────────────────────────────────────────┤
│  ▸ Ver detalles de no incluidos (k)       │
│     [razón legible] · N POIs              │
├───────────────────────────────────────────┤
│  [Cancelar]            [Generar archivo]  │
└───────────────────────────────────────────┘
```

Estados:
- `idle` → muestra preview reactiva al cambiar scope/format
- `confirm-large` (warn 5k–10k) → banner amable + CTA `Generar archivo` (sin typed-token, sin window.confirm)
- `blocked` (>10k) → mensaje calmado + alternativas: "reducir filtros", "exportar por país", "exportar por colección" (sólo copy + acciones que cierren el diálogo; trocear queda en backlog)
- `running` → spinner + "Preparando archivo…" + format + N POIs
- `success` → "Archivo generado" + cierre auto (toast sonner)
- `error` → mensaje humano + retry

### 3. Mapeo de razones a copy humano
Mapa local `EXPORT_REASON_HUMAN` reutilizando `EXPORT_EXCLUSION_LABEL` (es-ES) pero con copy producto:
- `not-owner` → "Pertenece a otra persona"
- `not-enriched` → "Aún sin ficha"
- `editorial-only-1b` → "Sólo material editorial, no compartible"
- `not-shareable` → "Aún no listo para compartir"
- `curation-level-below-9` → "Aún en proceso de curación"
- `invalid-coordinates` → "Coordenadas inválidas"

Agrupados por razón + contador. Colapsado por defecto.

### 4. Formatos
Render desde `POI_EXPORTERS` (ya existe). GPX **no aparece** (no hay serializer). Sin promesas vacías.

### 5. Payload toggles
Sólo se renderiza el toggle si el pipeline lo soporta hoy. KML: `target` (general/mymaps/gurumaps). Resto: ninguna opción real → sección oculta. Nada de placebos.

### 6. Caso 3614 POIs propios
Con `scope=internal` y owner = current user, `previewPoiExport` devuelve `eligibleCount=3614, sizeVerdict.level='warn'`. UX:
- Sin diálogo destructivo, sin typed-token.
- Banner ámbar suave: "Vas a generar un archivo con 3614 ubicaciones. Puede tardar unos segundos."
- CTA primario `Generar archivo`.
- Click → `runPoiExport({ confirmedOverWarn: true })` → download → toast success.

### 7. Wiring (sustituir, no duplicar)
- `ExportPanel.tsx`: reescrito como wrapper fino que monta `<ExportResolver source={{ kind:'filters'|'collection', ... }}>`. Mantiene su API pública para no romper imports (`src/pages/Index.tsx`, `FilterBar.tsx`, `domains/content/components/index.ts`).
- `SelectionActions.tsx`: el bloque de export (líneas ~250–300, incluido el `window.confirm`) se sustituye por apertura de `<ExportResolver source={{ kind:'selection', locations: selectedLocations }}>`. Resto de acciones (move, delete, etc.) intactas.
- `domains/sharing/index.ts` y `Index.tsx`: sólo si re-exportan ExportPanel, sin cambio de API.

### 8. Tests (nuevos / actualizados)
Nuevo `src/test/pr-export-3-resolver-ux.test.ts`:
1. 3614 POIs propios con scope=internal → no renderiza typed-token ni `window.confirm`; renderiza CTA "Generar archivo".
2. Render muestra `Total / Elegibles / No incluidos` con cifras correctas.
3. Scope=internal con owner ajeno → excluidos clasificados como `not-owner` con copy humano.
4. Scope=public con mezcla → excluidos agrupados por razón visible bajo "Ver detalles".
5. >10000 elegibles → estado `blocked`, sin botón `Generar archivo`, con alternativas listadas.
6. GPX no aparece en la lista de formatos.
7. Pipeline invocado con `scopeProvided: true` (contract test existente sigue verde).

Actualizar `poi-export-pr2-ux.test.ts` y `poi-export-pr2-wiring.test.ts` para apuntar al nuevo componente (mismo pipeline subyacente). Static grep en `poi-export-contract.test.ts` no se toca (C2 sigue verde porque el resolver llama `runPoiExport` con scope explícito).

### 9. Docs + memoria + versión
- `docs/contracts/poi-export-canon.md`: marcar PR-EXPORT-3 como implementado, fijar el contrato de UX (sin typed-token, copy canon, estados, mapa de razones).
- `mem/logic/export/poi-export-canon.md`: nota corta "UX implementada en PR-EXPORT-3, `<ExportResolver>` es SoT UI".
- `mem://index.md`: actualizar la línea de export-canon si procede.
- `scripts/release/bump-version.ts patch` + entrada en `docs/releases/version-history.md` (`v1.5.4 — PR-EXPORT-3 Export Resolver UX`).

## Fuera de alcance (backlog, sin tocar)
GPX serializer (PR-EXPORT-7), trocear >10k (PR-EXPORT-8), background job (PR-EXPORT-9), ExportHistory persistente (PR-EXPORT-6), Vandits package (PR-EXPORT-10), colección compartible (PR-EXPORT-11).

## Postcondición (engineering discipline)
- Tests verdes (incluido contract test PR-EXPORT-1 y nuevo PR-EXPORT-3).
- `APP_VERSION` bumped a v1.5.4.
- `version-history.md` actualizado.
- Memoria sincronizada.
- Sin nuevos `window.confirm` ni typed-token en path de export.
