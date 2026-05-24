# Bug: Con deuda subtab count mismatch (22 vs 18)

**Estado:** OPEN
**Prioridad:** Media
**Alcance:** UI / counts — sin impacto en datos, schema, backend.
**Relacionado:** `docs/audits/search-filter-selection-state-cross-mode-postflight.md`
(cerrado para cross-mode header/selection fix).

## Descripción

En `Buscar y Filtrar → Mantener → Con deuda`, las fuentes de count divergen:

| Fuente                | Valor |
| --------------------- | ----- |
| Subtab "Con deuda"    | **22** |
| Header (X / T)        | 18    |
| CTA (`HealthFilterActionCTA`) | 18 |
| Árbol Geo (root sum)  | 18    |
| Footer (`EffectiveActionFooter`) | 18 |

Tras el fix cross-mode, **header / CTA / árbol / footer** ya consumen
`universeBase = resolveUniverseBase('debt', sameUniverseSource)` y
convergen en 18. La divergencia queda **aislada al subtab counter**.

## Hipótesis de causa raíz

Candidatas a investigar (no priorizadas):

1. `curationBuckets.conDeuda` lee una lista distinta a `universeBase('debt')`
   (probablemente sin filtrar por el mismo `sameUniverseSource` que el resto).
2. `getVisibleUniverseLocations()` devuelve tamaños distintos entre
   `useMemo`s consecutivos (dependencias o snapshot desincronizado).
3. Hay un set `detached` / `followed` / `orphan` incluido en el cálculo
   del subtab y **no** en `universeBase('debt')` (o viceversa) — gap = 4.
4. Predicado legacy de "deuda" aún activo en la rama del subtab
   (anterior al unificado `healthDebtPredicate` / `resolveUniverseBase`).

## Objetivo

Unificar el subtab "Con deuda" con
`resolveUniverseBase('debt', sameUniverseSource)` de modo que **todas las
fuentes lean el mismo array**.

## Criterio de cierre

En `Mantener → Con deuda`:

```
subtab === header === CTA === árbol(root sum) === footer
```

…todos iguales al `universeBase('debt').length` canónico (sea 18 o el número
correcto único que devuelva el SoT tras la investigación).

## Tests requeridos

- **Invariant:** `subtab('debt').count === resolveUniverseBase('debt', src).length`.
- **Fixture** con mezcla `followed` / `detached` / `orphan` que reproduzca el
  gap de 4 POIs entre 22 y 18.
- **Source-level guard** (lint o test) que prohíba predicados legacy de
  deuda en la rama del subtab — sólo permitido el helper canónico.

## Restricciones

- No tocar footer (`EffectiveActionFooter`).
- No tocar el cross-mode header/selection fix ya cerrado.
- No tocar PR-EXPORT-2 core.
- No tocar serializers ni datos.
- No tocar schema ni backend.
- No bump salvo que el proyecto lo exija.
