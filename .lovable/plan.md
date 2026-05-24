# PR-EXPORT-4 — Semántica "Mis datos" vs "Compartible"

## 1. Auditoría (causa exacta de los 279)

Revisión del pipeline ya en repo:

- `evaluatePoiExport(loc, 'internal', ctx)` en `src/domains/content/lib/poi-export-eligibility.ts` SÓLO excluye por:
  - `invalid-coordinates` (lat/lng no finitos)
  - `not-owner` (`getLocationOwnerUserId(loc) !== currentUserId`)
- NO aplica `not-enriched`, `not-shareable`, `editorial-only-1b`, `curation-level-below-9` en internal.
- `partitionForExport` → `previewPoiExport` → `runPoiExport` respetan esa regla.

Conclusión técnica del 3614 → 3335 eligibles / 279 excluidos en scope "Mis datos":

- Los 279 caen casi con seguridad como `not-owner` (POIs de usuarios seguidos visibles en la selección) y/o un residual con `invalid-coordinates`.
- La lógica de elegibilidad es CORRECTA. El bug es de UX/copy: el resolver los etiqueta genéricamente como "No incluidos" en la tarjeta resumen, lo que en "Mis datos" se lee como si Vandits retuviera POIs propios.

Como condición de cierre, el resolver debe **reportar en vivo** ese desglose por razón (ya lo calcula en `exclusionGroups`) y el caso 3614 debe verse como "279 pertenecen a otras personas", no como "No incluidos".

## 2. Cambios (sólo UX en `ExportResolver.tsx`)

Fichero único: `src/domains/content/components/ExportResolver.tsx`.

### 2.1 Copy y etiquetas por scope

Introducir un objeto `SCOPE_COPY` con dos perfiles:

- `internal` (Mis datos):
  - Header summary: "Tus ubicaciones", "Exportables", "No exportables por error técnico"
  - Ownership line: "Vandits creará una copia. Tus ubicaciones seguirán aquí."
  - Sin "No incluidos" genérico.
- `public` (Compartible):
  - Header summary: "Total candidatos", "Compartibles", "No compartibles públicamente"
  - Ownership line: mantiene copy actual.

### 2.2 Reclasificación visual de exclusiones por scope

En internal:

- `not-owner` se muestra **separado** del bloque de errores técnicos, con su propia línea destacada:
  - "N pertenecen a otras personas — no se exportan en Mis datos"
  - No cuenta en el contador "No exportables por error técnico".
- "Errores técnicos" agrupa SÓLO `invalid-coordinates` (y cualquier futuro fallo técnico real). Si hay 0, no se muestra la fila.
- Resto de razones (`not-enriched`, `not-shareable`, etc.) NO pueden aparecer en internal — si aparecen, es bug del partition; se muestran bajo "Errores técnicos" como defensa.

En public:

- Mantiene el desglose actual con `REASON_HUMAN`, ya alineado con la copy pedida ("No compartibles públicamente", "Aún sin ficha", "Pertenece a otra persona", etc.).
- Refinar labels:
  - `not-enriched` → "Aún sin ficha"
  - `not-shareable` → "No listo para compartir"
  - `curation-level-below-9` → "Aún en proceso de curación"
  - `editorial-only-1b` → "Sólo material editorial"
  - `not-owner` → "Pertenece a otra persona"

### 2.3 Contadores derivados separados

Sustituir el `excludedCount` plano por contadores calculados por scope:

```ts
const foreignCount = preview.excluded.filter(e => e.reason === 'not-owner').length;
const technicalCount = preview.excluded.filter(e => e.reason === 'invalid-coordinates').length;
const publicNotEligibleCount = preview.excluded.filter(e => e.reason !== 'not-owner').length;
```

Render según scope. Atributos data-* nuevos:
- `data-export-foreign-count`
- `data-export-technical-count`
- `data-export-public-excluded-count`

Se mantiene `data-export-eligible-count` y `data-export-total-count`.

### 2.4 Scope visual ↔ scope real

Garantizar que `previewPoiExport`, `runPoiExport` y los counters usen el MISMO `scope` del state. Auditar que no hay invocación residual con scope hardcoded en este fichero (ya está OK; añadir test estático).

### 2.5 Sin cambios en

- `poi-export-eligibility.ts`
- `poi-export-pipeline.ts`
- `kml-parser` legacy
- Serializers / DTO
- Thresholds / RLS / share contract
- `EffectiveActionFooter` ni `SelectionActions` (sólo consumen el resolver)

## 3. Tests (nuevo fichero `src/test/pr-export-4-internal-semantics.test.ts`)

Tests sobre `evaluatePoiExport` + `partitionForExport` (lógica) y grep sobre `ExportResolver.tsx` (copy/contadores):

1. Owned imported (sin enriched) → eligible en internal.
2. Owned pending/empty con coords válidas → eligible en internal.
3. Owned private / followers-only → eligible en internal.
4. Owned POI-3/POI-5 → eligible en internal.
5. Not-owned POI → NO eligible en internal (razón `not-owner`).
6. Public scope sigue excluyendo `not-enriched`, `not-shareable`, `curation-level-below-9`, `editorial-only-1b`.
7. Contadores: para [3335 owned válidos, 279 followed] internal eligibleCount=3335, foreignCount=279, technicalCount=0; public puede dar otro número distinto.
8. Grep estático en `ExportResolver.tsx`:
   - No contiene la cadena `"No incluidos"` fuera del bloque scope=public.
   - Contiene `"Tus ubicaciones"`, `"Exportables"`, `"pertenecen a otras personas"`.
   - El preview se invoca con el `scope` del state (no literal).

También extender `pr-export-3-resolver-ux.test.ts` para mantener los asserts previos.

## 4. Reporte de cierre

Al finalizar, dejar en `docs/audits/pr-export-4-semantics-audit.md` un resumen con:

- Causa de los 279: clasificación `not-owner` vs `invalid-coordinates` por evaluación en vivo (texto explicativo + lectura del partition).
- Conteos internal vs public para el caso 3614.
- Confirmación de tests verdes y de que "Mis datos" no aplica reglas públicas.

## 5. Versionado y memoria

- Bump patch → `v1.5.6` vía `scripts/release/bump-version.ts`.
- Actualizar `docs/releases/version-history.md` con entrada PR-EXPORT-4.
- Actualizar `mem/logic/export/poi-export-canon.md` añadiendo apartado "PR-EXPORT-4 — internal ≠ public en UX/contadores" sin redefinir helpers.
- Si procede, breve nota en el índice de memoria principal.

## Detalles técnicos clave

- `ExportResolverBody` ya tiene `preview.excluded` con razones; sólo reagrupamos por scope.
- `currentUserId` viene de `useAuth`; el `internalDisabled` actual sigue válido.
- Sin cambios en el flujo de descarga ni en `useExportTracking`.
- Render guards: cuando scope=internal y `not-owner > 0`, mostrar fila destacada (no en rojo) con copy "N pertenecen a otras personas — no se exportan en Mis datos. Cambia a Compartible para verlas tratadas como POIs de terceros." (Compartible las descartará igual por `not-owner`, pero al menos contextualiza.)

## Out of scope (no tocar en este PR)

RLS, serializers, DTO, formatos, thresholds, share contract, layout general del resolver, jobs background, GPX, export history persistente, server-side export.
