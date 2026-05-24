# PR-COUNTS-2.1 — Debt subtab runtime delta (22 vs 18) — Audit

**Estado:** Diagnóstico cerrado · sin fix de código aplicado
**Alcance:** Solo lectura. No toca datos, schema, backend, PR-EXPORT-2 core ni serializers.
**Relacionado:**
- `docs/audits/search-filter-debt-subtab-count-mismatch-ticket.md`
- `docs/audits/poi-debt-subtab-unification-postflight.md` (PR-COUNTS-2)
- `docs/audits/poi-counts-visual-validation-post-pr-counts-1-2.md`
- `docs/contracts/poi-counts-canon.md`

---

## 1. Resumen ejecutivo

**Hallazgo bloqueante:** En `src/components/FilterBar.tsx` (post PR-COUNTS-2)
el contador del subtab "Con deuda" y el `T` del header derivan de **la misma
expresión pura sobre la misma fuente memoizada**. Por construcción son
idénticos en cualquier render coherente. No existe en el código un camino
que pueda producir `subtab = 22` mientras `header = 18`.

El delta observado visualmente (22 vs 18) **no puede originarse en código
post-PR-COUNTS-2**. Las hipótesis vivas son operativas (caché de bundle,
preview no recargado, estado transitorio pre-build), no lógicas.

---

## 2. Evidencia de equivalencia estructural

### Fuente única (línea 142–146)

```ts
const allLocationsForUniverseSource = useMemo(
  () => getVisibleCatalogUniverse(getAllLocations(), user?.id ?? null),
  [getAllLocations, documents, user?.id],
);
```

### Contador del subtab (línea 148–151)

```ts
const curationBuckets = useMemo(() => ({
  conDeuda:    resolveUniverseBase('debt',       allLocationsForUniverseSource).length,
  sinEnriquecer: resolveUniverseBase('unenriched', allLocationsForUniverseSource).length,
}), [allLocationsForUniverseSource]);
```

### Universo activo (línea 247–253)

```ts
const allLocationsForUniverse = allLocationsForUniverseSource;
const universeBaseLocations = useMemo(
  () => resolveUniverseBase(activeModeUniverse, allLocationsForUniverse),
  [activeModeUniverse, allLocationsForUniverse],
);
```

### Header (línea 285)

```ts
const T = universeBaseLocations.length;
```

### CTA / footer / árbol

Todos consumen `universeBaseLocations` vía `UniverseBaseProvider` (mismo
array por referencia que el del header). `effectiveActionSet` parte de
`universeBaseLocations.filter(matchesLocationFilters(..., {includeHealth:false}))`,
es decir nunca **amplía** el universo — sólo lo recorta.

### Conclusión

Cuando `activeModeUniverse === 'debt'`:

```
curationBuckets.conDeuda
  === resolveUniverseBase('debt', allLocationsForUniverseSource).length
  === resolveUniverseBase('debt', allLocationsForUniverse).length
  === universeBaseLocations.length
  === T (header)
```

Igualdad **estructural**, no estadística. `resolveUniverseBase` es pura
(`src/domains/content/lib/resolve-universe-base.ts`) y `allLocationsForUniverseSource`
es la misma referencia memoizada pasada a ambos consumidores.

No hay segunda fuente (`getVisibleUniverseLocations`, `filteredLocations`,
`selectedDocument`, `detachedVisibleLocations`) involucrada en el cálculo
del subtab.

---

## 3. Tabla comparativa de inclusión por consumidor

| Consumidor | Fuente | Filtro debt | Cuenta esperada |
|---|---|---|---|
| Subtab pill `Con deuda`     | `allLocationsForUniverseSource` | `resolveUniverseBase('debt', …)` | `N` |
| Header `T` (cuando debt)    | `universeBaseLocations`         | `resolveUniverseBase('debt', …)` | `N` |
| CTA (`HealthFilterActionCTA`) | `universeBaseLocations` (via Provider) | igual | `N` |
| Árbol Geo (root sum)        | `universeBaseLocations` (via Provider) | igual | `N` |
| Footer (`EffectiveActionFooter`) | `effectiveActionSet ⊆ universeBaseLocations` | igual + tree/selection | `≤ N` |

`N` es **el mismo número** por construcción. Footer puede ser menor sólo si
hay filtros de árbol o selección activos; nunca mayor.

---

## 4. Tests estáticos vigentes

- `src/test/filterbar-debt-subtab-unification.test.ts` (7/7 PASS) cubre:
  - `subtab.debt === universeBase('debt').length === effectiveActionSet`
    cuando no hay filtros adicionales.
  - Misma fuente (`allLocationsForUniverseSource`) en ambas ramas.
  - Ausencia de `getVisibleUniverseLocations` en la rama del subtab.
- `src/test/visible-catalog-universe-unification.test.ts` (9/9 PASS) cubre
  `getVisibleCatalogUniverse` (la fuente común).

Ningún test simulado reproduce un delta de 4. Para que ocurriera tendría
que existir un consumidor que **NO** use `allLocationsForUniverseSource`,
y no existe.

---

## 5. Hipótesis del delta 22 vs 18 observado

Descartadas (incompatibles con el código actual):

- ❌ `curationBuckets` lee `getVisibleUniverseLocations`.
- ❌ Predicado legacy de deuda en la rama del subtab.
- ❌ Set `detached` / `followed` / `orphan` extra en el subtab.
- ❌ Universo `debt` distinto entre header y subtab.

Vivas (operativas, no lógicas):

1. **Caché de bundle / preview no recargado.** El observador midió antes
   de que el bundle con PR-COUNTS-2 se hubiera servido al iframe de
   preview. Hard reload (`Cmd-Shift-R`) debería resolverlo.
2. **Render transitorio inter-PR.** Snapshot tomado mientras
   `documents` cambiaba: una de las dos `useMemo` se actualizó un frame
   antes que la otra. React garantiza coherencia al cierre del commit, así
   que el delta sólo sería visible con DevTools paused.
3. **Confusión visual sobre qué número correspondía al "header"**: el
   header del modo Mantener muestra `X / T` donde `X = effectiveActionSet.length`.
   Si el usuario interpretó `X` como "header del universo", podría haber
   comparado 18 (`X` con árbol/selección recortando) contra 22 (subtab
   completo). En `Mantener → debt` sin filtros de árbol y sin selección,
   `X === T === subtab`.

Sin acceso a una captura del runtime con DevTools abierto no es posible
discriminar entre (1), (2) y (3). Las tres se descartan con un hard reload
+ verificación de que no hay filtros de árbol/selección activos al medir.

---

## 6. Identificación de los 4 POIs del delta

**No reproducible en el código actual.** El delta `subtab − universeBase`
es ∅ por construcción. No hay 4 POIs concretos que listar porque la
diferencia no existe a nivel de lógica.

Si tras hard reload el delta persiste, la única instrumentación útil sería
volcar a consola los `id`s de ambos sets en `FilterBar.tsx` y restar:

```ts
// Sólo dev — NO commitear:
if (import.meta.env.DEV) {
  const subtabIds = new Set(
    resolveUniverseBase('debt', allLocationsForUniverseSource).map(l => l.id)
  );
  const headerIds = new Set(universeBaseLocations.map(l => l.id));
  const onlyInSubtab = [...subtabIds].filter(id => !headerIds.has(id));
  const onlyInHeader = [...headerIds].filter(id => !subtabIds.has(id));
  console.log('[debt-delta]', { onlyInSubtab, onlyInHeader });
}
```

Por el análisis estructural anterior, ambos arrays deben ser `[]`.

---

## 7. Causa raíz

**Estructuralmente, no hay causa raíz en código.** Tras PR-COUNTS-2 la
unificación es completa. El delta 22 vs 18 reportado en la validación
visual previa es un **artefacto de medición** (caché / bundle stale /
interpretación del header) y no un bug de cálculo.

---

## 8. Fix recomendado

**Ninguno en código.** Acciones operativas:

1. Hard reload de la preview (`Cmd-Shift-R` / `Ctrl-Shift-R`).
2. Reabrir `Buscar y Filtrar → Mantener → Con deuda` SIN filtros de árbol
   ni selección.
3. Verificar que `subtab === T (header) === Σ raíces árbol Geo === CTA`.

Si tras (1)–(3) persiste un delta, añadir el bloque de instrumentación
dev del §6, capturar los `id`s y reabrir como bug real (probablemente
ligado a una mutación stale en `getAllLocations` que rompa identidad
referencial de `documents`, lo que indicaría un problema más profundo en
el store, no en FilterBar).

---

## 9. Validación visual pendiente

Re-ejecutar el checklist de
`docs/audits/poi-counts-visual-validation-post-pr-counts-1-2.md` §2
tras hard reload, registrando:

- número exacto que muestra el subtab pill;
- número exacto que muestra el header `T`;
- estado de `filters` (vacío esperado);
- estado de `selectedLocations` (vacío esperado);
- versión de bundle visible (`window.__APP_VERSION__` si disponible).

---

## 10. No-impacto

Este audit es **docs-only**. No se han modificado:

- código de `FilterBar.tsx`, `resolve-universe-base.ts`,
  `visible-catalog-universe.ts`, `location-bucket.ts`;
- predicados de deuda (`isLocationInDebtUniverse`, `getPointHealthRings`);
- tests (`filterbar-debt-subtab-unification.test.ts`,
  `visible-catalog-universe-unification.test.ts`);
- datos, schema, backend, edge functions;
- PR-EXPORT-2 core, serializers;
- versión / bump.
