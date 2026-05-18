# POI Export Contract (PR-EXPORT-1)

Contrato canónico de exportación de POIs a archivo (KML / CSV / JSON).

> **Alcance:** sólo POIs (puntos de usuario). Rutas, tracks, exports
> server-side y RLS quedan **fuera** de este contrato.

---

## 1. Single source of truth

Helper único:

```ts
import {
  evaluatePoiExport,
  partitionForExport,
  publicExportEligible,
  internalExportEligible,
} from '@/domains/content/lib/poi-export-eligibility';
```

`evaluatePoiExport(loc, scope, ctx)` es la **única** función que decide si
un POI puede salir del sistema. Reusa los helpers canónicos existentes
sin duplicar criterios:

- `isPointEnriched`        — criterio canónico de enriquecido.
- `isShareablePoi`         — frontera curated-only sharing (PR-1).
- `getPoiCurationLevel`    — niveles POI-0/1/3/5/9/10.
- `getLocationOwnerUserId` — owner resolver único.

Está prohibido reimplementar gates equivalentes en otro punto del código.

---

## 2. Scopes

```ts
type ExportScope = 'public' | 'internal';
```

### 2.1 `public` — exportación compartible

Salida pensada para ser publicada o compartida con terceros.

Reglas (deben cumplirse **todas**):

1. Coordenadas válidas.
2. `isPointEnriched(loc) === true` (descripción IA canónica).
3. `isShareablePoi(loc) === true` (geo `ok`, visibility ∈ {followers, public}, no deleted).
4. Nivel de curación ∈ `{9, 10}`.
5. POI-1b-editorial (snippet/imagen sin `enriched_data.descripcion`)
   queda explícitamente excluido aunque tenga apariencia editorial
   (razón: `editorial-only-1b`).

**Estado personal (`visited`, `user_rating`) NO afecta a la elegibilidad**:
sólo discrimina POI-9 vs POI-10. Un POI-9 no-visitado se exporta igual.

### 2.2 `internal` — exportación diagnóstico / dump del dueño

Salida pensada para el **propio dueño**: backups, diagnóstico, debug.
**No es un bypass para extraer datos de terceros.**

Reglas (Condición C1):

1. Coordenadas válidas.
2. `getLocationOwnerUserId(loc) === ctx.currentUserId`.

Cualquier nivel POI-0/1/3/5/9/10 está permitido siempre que se cumpla el
ownership. Sin `currentUserId` todos los POIs caen como `not-owner`.

---

## 3. Matriz nivel × scope

| Nivel POI | `public` | `internal` (own) | `internal` (foreign) |
|-----------|:--------:|:----------------:|:--------------------:|
| POI-0           | no (`not-enriched`)        | sí | no (`not-owner`) |
| POI-1a          | no (`not-enriched`)        | sí | no (`not-owner`) |
| POI-1b-editorial| no (`editorial-only-1b`)   | sí | no (`not-owner`) |
| POI-3           | no (`not-shareable`)       | sí | no (`not-owner`) |
| POI-5           | no (`curation-level-below-9` o `not-shareable`) | sí | no (`not-owner`) |
| POI-9           | **sí**                     | sí | no (`not-owner`) |
| POI-10          | **sí**                     | sí | no (`not-owner`) |

---

## 4. Condiciones de cierre

### C1 — `internal` exige ownership

`internal` **nunca** es vía genérica de extracción. Si `ownerUserId !==
currentUserId` (o `currentUserId` es null), el POI cae como `not-owner`
sin más evaluación.

### C2 — Call sites UI pasan scope explícito

`ExportPanel` y `SelectionActions` **deben** invocar `exportToKML/CSV/JSON`
pasando `scope` y la flag `scopeProvided: true`. El default `'internal'`
de `kml-parser` es **compat temporal** y emite `console.warn` (deduplicado
por sesión) si se invoca sin scope explícito.

Hay un test estático (`poi-export-contract.test.ts`) que escanea ambos
ficheros y exige que cada `exportTo*(...)` lleve `scopeProvided: true`
en la misma sentencia. Romper esta regla rompe CI.

---

## 5. Defensa en profundidad — `kml-parser`

`exportToKML/CSV/JSON` aplican `applyExportGate` antes de serializar:

- `scope = 'public'` → cada loc pasa por `publicExportEligible(loc)`.
  Los no elegibles se descartan silenciosamente (con `console.warn`
  resumiendo cuántos cayeron).
- `scope = 'internal'` → cada loc pasa por `internalExportEligible(loc,
  ctx)`. Los ajenos se descartan.

Esto garantiza que aunque un call site (presente o futuro) se equivoque
y pase POIs no elegibles, el parser **no** los emite. KML escribe además
`<atom:author>vandits-{scope}</atom:author>` y un comentario
`export_scope` para trazabilidad.

---

## 6. Razones de exclusión

```ts
type ExportExclusionReason =
  | 'invalid-coordinates'
  | 'not-owner'
  | 'not-enriched'
  | 'editorial-only-1b'
  | 'not-shareable'
  | 'curation-level-below-9';
```

Etiquetas es-ES en `EXPORT_EXCLUSION_LABEL`.

---

## 7. Fuera de alcance

- Export server-side / edge functions.
- RLS y filtros de base de datos (la BD ya filtra por ownership;
  este contrato es una capa adicional cliente).
- Exporters de rutas (`document_tracks`) o GPX de tracks.
- Modificar niveles POI, `isShareablePoi` o `isPointEnriched`.

---

## 8. Renderer invariance

Este contrato **no** toca popup, marker grammar, visibilidad ni
clustering. Sólo decide qué entra al exporter.

---

## 9. Tests

`src/test/poi-export-contract.test.ts` — 11 tests cubriendo la matriz
nivel × scope, partition, defensive discard en parser y grep estático
de C2.

Ver también: `mem://logic/export/poi-export-contract`.
