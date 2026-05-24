# Visual validation — POI counts post PR-COUNTS-1 + PR-COUNTS-2

> Status: **VALIDATION** (read-only). Captura visual del estado runtime
> tras desplegar PR-COUNTS-1 (`getVisibleCatalogUniverse`) y PR-COUNTS-2
> (contract test + source guard para subtab debt/unenriched).
>
> Companions: [`poi-counts-canon.md`](../contracts/poi-counts-canon.md),
> [`poi-visible-counts-unification-postflight.md`](./poi-visible-counts-unification-postflight.md),
> [`poi-debt-subtab-unification-postflight.md`](./poi-debt-subtab-unification-postflight.md).

---

## 1. Explorar — PASS

Top bar y FilterBar leen ya el MISMO `catalogVisibleUniverse`.

| Fuente                    | Valor visible | Esperado | Resultado |
| ------------------------- | ------------- | -------- | --------- |
| Top bar (verde)           | 4.739         | 4.739    | PASS      |
| Top bar (azul)            | 5.095         | 5.095    | PASS      |
| FilterBar header          | 0 / 5.095     | 0 / 5.095 | PASS     |
| FilterBar — Míos          | 0 / 4.739     | 0 / 4.739 | PASS     |
| FilterBar — Seguidos      | 0 / 356       | 0 / 356  | PASS      |
| Árbol Geo Σ raíces        | 98+372+66+4.554+5 = **5.095** | 5.095 | PASS |
| Footer "Acciones sobre N POIs" | 5.095     | 5.095    | PASS      |

Gap top bar vs FilterBar = **0**. PR-COUNTS-1 confirmado en runtime.

## 2. Mantener → Con deuda — **FAIL (bug visual crítico)**

| Fuente                         | Valor visible | Resultado |
| ------------------------------ | ------------- | --------- |
| Subtab "Con deuda"             | **22**        | divergente |
| Header `X / T (con deuda)`     | 0 / **18**    | base      |
| Header — Míos                  | 0 / 11        | (11+7=18) |
| Header — Seguidos              | 0 / 7         | (11+7=18) |
| CTA `ACCIÓN SOBRE CON DEUDA`   | **(18)**      | base      |
| Árbol Geo Σ raíces             | 2 (Africa) + 16 (Europe) = **18** | base |
| Footer `Acciones sobre N POIs con deuda` | 18  | base      |

**Gap subtab vs resto = 4 POIs.** Pre-PR-COUNTS-1 el gap era 22 vs 18
(idéntico). Post-PR-COUNTS-1+2 el gap PERSISTE en runtime, aunque el
análisis estático y los contract tests (`filterbar-debt-subtab-unification.test.ts`
7/7 PASS) confirman que ambos contadores derivan del mismo
`resolveUniverseBase('debt', allLocationsForUniverseSource)`.

### Hipótesis a investigar (no fixea aquí — fuera de alcance)

1. **Ownership guard en `getPointHealthRings`**: el helper toma argumento
   opcional `currentUserId` y devuelve `[]` para POIs ajenos cuando se
   pasa. `isLocationInDebtUniverse` NO pasa `currentUserId`, por lo que
   ve rings de followed (debería ser consistente entre subtab y
   universeBase, ambos consumen el mismo predicado). Verificar si algún
   consumidor downstream filtra owner que canibalice 4 POIs followed.
2. **`matchesLocationFilters` con `filters = {}` y `includeHealth=false`**:
   con filtros vacíos debe devolver `true` para todos. Verificar si
   algún POI followed con `ownerUserId` nulo cae por defensa de
   `filterBySource`/`filterByUserId` (no debería con filters vacíos).
3. **Subset divergente entre `allLocationsForUniverseSource` (memo
   curationBuckets) y `allLocationsForUniverse` (alias provider)**: 
   estáticamente equivalentes, pero el runtime podría estar viendo
   referencias distintas si un re-render parcial deja un memo desactualizado.
4. **POIs followed con `ownerUserId` no aprobados que entran/salen del
   universo según refresh de `documents`**: el FilterBar refresca
   `documents` por evento; ventana de race podría producir el delta de 4.

### Recomendación

Abrir **PR-COUNTS-2.1** (investigación + fix runtime del subtab `debt`):

- Instrumentar `curationBuckets` y `universeBaseLocations` con un
  `useEffect` dev-only que loguee `length` + `ids.symmetricDifference`
  cuando difieran.
- Identificar los 4 POIs del gap y clasificarlos (own/followed,
  approved/detached, rings vs geoHealth).
- Aplicar fix transversal (helper único, no parche local).
- Añadir test runtime (no sólo source guard) que reproduzca el delta.

## 3. Mantener → Sin enriquecer — PASS

| Fuente                         | Valor visible | Resultado |
| ------------------------------ | ------------- | --------- |
| Subtab "Sin enriquecer"        | 1.335         | base      |
| Header `X / T (sin enriquecer)`| 0 / 1.335     | PASS      |
| Header — Míos                  | 0 / 1.306     | (1.306+29=1.335) |
| Header — Seguidos              | 0 / 29        | PASS      |
| CTA `ACCIÓN SOBRE SIN ENRIQUECER` | (1.335)    | PASS      |
| Árbol Geo Σ raíces             | 54+341+32+903+5 = **1.335** | PASS |
| Footer `Acciones sobre N POIs sin enriquecer` | 1.335 | PASS |

Gap = **0**. Subtab y resto convergen. Confirma que el predicado
unificado funciona en runtime para `unenriched`; el bug se localiza
ÚNICAMENTE en `debt`.

## 4. Seleccionar todo en cada modo — no validado en esta pasada

No ejecutado (límite de tiempo de la sesión visual). Cubierto a nivel
de invariante por los contract tests:

- `filterbar-counts-unification.test.ts`: `subtab == CTA == universeBase`.
- `filterbar-debt-subtab-unification.test.ts`: source-level guard + invariante.
- `effective-action-footer.test.tsx` / `effective-action-footer-label.test.ts`:
  delete usa `destructiveActionSet`, no `effectiveActionSet` implícito.

Recomendación: validar manualmente "Seleccionar todo" en una sesión
posterior una vez cerrado el bug de §2.

## 5. Resumen ejecutivo

- **Explorar**: counts unificados, gap 5.095 vs 5.100 cerrado. PR-COUNTS-1
  confirmado en runtime.
- **Sin enriquecer**: counts unificados, gap = 0. PR-COUNTS-2 source-guard
  funcionando en runtime para este modo.
- **Con deuda**: **gap 22 vs 18 PERSISTE en runtime** pese a que el código
  estático y los tests garantizan unificación. Bug visual crítico aislado
  a este modo. Requiere PR-COUNTS-2.1 (investigación runtime + fix).
- **Seleccionar todo**: no validado visualmente; invariantes cubiertas por
  tests existentes.

## 6. Restricciones respetadas

- No se tocó código en esta validación.
- No datos, schema, backend, serializers, `PR-EXPORT-2 core`, markers.
- Sin bump de versión.
