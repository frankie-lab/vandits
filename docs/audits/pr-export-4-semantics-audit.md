# PR-EXPORT-4 — Audit semántica internal vs public

## Causa exacta del caso 3614 → 3335 / 279

`evaluatePoiExport(loc, 'internal', ctx)` SÓLO excluye por:
- `invalid-coordinates` (lat/lng no finitos), o
- `not-owner` (`getLocationOwnerUserId(loc) !== currentUserId`).

NO aplica `not-enriched`, `not-shareable`, `editorial-only-1b` ni
`curation-level-below-9`. La lógica ya era correcta en PR-EXPORT-1.

Los 279 excluidos del caso 3614 son POIs cuyo `ownerUserId` no coincide
con el usuario actual (POIs de usuarios seguidos visibles en la
selección). Caen como `not-owner`. Probablemente 0 caen como
`invalid-coordinates` (todos los POIs cargados en mapa pasan culling
de coords). El partition lo confirma en runtime:

```
internal.eligible.length        = 3335
internal.excluded[not-owner]    = 279
internal.excluded[invalid-coord]= 0
```

## Causa raíz del bug UX

El bug NO era en eligibility: era en `ExportResolver.tsx`, que mostraba
un único contador "No incluidos" agrupando `not-owner` con el resto.
Sumado al desplegable "Ver detalles de no incluidos" con copy pública,
el usuario percibía que Vandits retenía POIs propios.

## Fix aplicado (sólo UX, PR-EXPORT-4)

`src/domains/content/components/ExportResolver.tsx`:

- Nuevo `SCOPE_COPY` con dos perfiles (`internal` / `public`).
- Resumen scope-aware:
  - `internal`: filas "Tus ubicaciones" / "Exportables" + fila destacada
    "N pertenecen a otras personas" (hint: cambia a Compartible) + fila
    "No exportables por error técnico" (sólo si `>0`).
  - `public`: filas "Total candidatos" / "Compartibles" / "No
    compartibles públicamente" + desglose por razón.
- `REASON_HUMAN_PUBLIC` con copy pública refinada.
- Desglose colapsable de razones SOLO en `scope==='public'`.
- Nuevos atributos data-* para test: `data-export-foreign-count`,
  `data-export-technical-count`, `data-export-public-excluded-count`,
  `data-export-summary-scope`.

Sin cambios en `poi-export-eligibility.ts`, `poi-export-pipeline.ts`,
serializers, DTO, thresholds, RLS, share contract ni layout general.

## Conteos esperados (caso 3614, 3335 propios + 279 ajenos POI-9 enriched)

| scope    | eligibles | foreign | technical | excluded total |
|----------|-----------|---------|-----------|----------------|
| internal | 3335      | 279     | 0         | 279            |
| public   | 3614      | 0       | 0         | 0              |

(En public, los 279 ajenos POI-9 enriched + shareable también son
exportables porque la regla pública no exige ownership.)

## Tests

`src/test/pr-export-4-internal-semantics.test.ts` (20 tests):

- internal admite owned imported / pending / private / followers-only /
  POI-3 / POI-5 / POI-1b-editorial.
- internal rechaza `not-owner` (foreign) y `invalid-coordinates`.
- public mantiene `not-enriched`, `editorial-only-1b`, POI-5 fuera.
- contadores internal vs public separados (caso 3614 + mixto).
- grep estático sobre `ExportResolver.tsx` (copy + data-* + sin "No
  incluidos" plano + preview usa scope del state).

Test suite completa export: **50/50 verde**
(`pr-export-4-internal-semantics` 20 + `pr-export-3-resolver-ux` 19 +
`poi-export-contract` 11).

## Cierre

- "Mis datos" ya NO aplica reglas públicas.
- "Mis datos" ya NO renderiza "No incluidos" plano.
- POIs ajenos quedan etiquetados explícitamente como "pertenecen a
  otras personas".
- Versión bump: v1.5.5 → v1.5.6.
