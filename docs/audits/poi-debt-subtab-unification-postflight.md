# PR-COUNTS-2 — Postflight: Con deuda subtab unificado

> Status: **CLOSED**. Cierra gap subtab "Con deuda" 22 vs árbol/CTA/footer 18.
> Companions: [`poi-counts-canon.md`](../contracts/poi-counts-canon.md),
> [`poi-visible-counts-unification-postflight.md`](./poi-visible-counts-unification-postflight.md),
> [`search-filter-debt-subtab-count-mismatch-ticket.md`](./search-filter-debt-subtab-count-mismatch-ticket.md).

---

## 1. Causa raíz

Pre-PR-COUNTS-1, las dos ramas del panel "Buscar y Filtrar → Mantener"
consumían fuentes distintas:

- **Subtab** ("Con deuda" / "Sin enriquecer"): `getVisibleUniverseLocations()`
  (fuente B, `mapVisibleUniverse`, incluye 4–5 detached/no-aprobados con deuda).
  → 22 POIs.
- **Header / CTA / árbol / footer**: `resolveUniverseBase('debt', sameSource)`
  donde `sameSource` ya había sido recortado por capas previas.
  → 18 POIs.

Gap = 4 POIs detached/no-aprobados con `geoHealth ∈ {partial, stale_name, empty}`
que entraban en subtab y NO en el resto del panel. Misma etiqueta ("Con deuda")
sobre universos distintos → viola §5 de `poi-counts-canon.md` ("etiquetas
únicas por SoT").

## 2. Decisión de producto

**Subtab pasa a leer la MISMA fuente que header/CTA/árbol/footer:**
`getVisibleCatalogUniverse(getAllLocations(), uid)` →
`resolveUniverseBase(mode, …)`.

- Catálogo visible = `myCatalog + followedCatalog` aprobados (canon §3.A).
- Subtab counts derivan del MISMO array que `universeBaseLocations`.
- POIs detached/no-aprobados con deuda quedan **fuera del subtab**
  (siguen visibles en el mapa, fuente B, sin chip de "Con deuda" en el panel).

Resultado: `subtab == header == CTA == árbol(root sum) == footer`
(invariante BLOQUEANTE).

## 3. Archivos modificados

Ningún cambio de código adicional en este PR — PR-COUNTS-1 ya unificó
`allLocationsForUniverseSource` (que alimenta TANTO `curationBuckets`
como `universeBaseLocations`). Este PR sólo blinda la invariante con
contract test + source-level guard y cierra el ticket.

### Nuevos
- `src/test/filterbar-debt-subtab-unification.test.ts`
  - Contract test: `subtab.debt === universeBase("debt").length === effectiveActionSet`.
  - Contract test: idem para `unenriched`.
  - Source-level guard: subtab usa `resolveUniverseBase('debt' / 'unenriched', …)`.
  - Source-level guard: subtab y header pasan EL MISMO identificador de fuente.
  - Source-level guard: NO reaparece `getVisibleUniverseLocations` como fuente
    de subtab/header.

### Sin tocar
- `src/components/FilterBar.tsx` — ya correcto desde PR-COUNTS-1.
- `src/domains/content/lib/resolve-universe-base.ts` — SoT del predicado.
- `src/components/filters/EffectiveActionFooter.tsx`, `HealthFilterActionCTA`,
  trees — no requieren cambio (ya leen del mismo SoT).
- `getVisibleUniverseLocations` (mapa) — intacto.

## 4. Counts antes / después

| Fuente                  | Pre-PR-COUNTS-1 | Post-PR-COUNTS-1 | Post-PR-COUNTS-2 |
| ----------------------- | --------------- | ---------------- | ---------------- |
| Subtab "Con deuda"      | 22              | 18               | 18               |
| Header (X / T)          | 18              | 18               | 18               |
| CTA `HealthFilterActionCTA` | 18          | 18               | 18               |
| Árbol Geo (root sum)    | 18              | 18               | 18               |
| Footer (`EffectiveActionFooter`) | 18     | 18               | 18               |

Gap subtab vs resto = **0**. Counts exactos (`toBe`, no `toBeCloseTo`, sin
`Math.round`).

## 5. Tests ejecutados

- `src/test/filterbar-debt-subtab-unification.test.ts` — 7/7 PASS
  (4 contract + 3 source-guard).
- `src/test/filterbar-counts-unification.test.ts` — 5/5 PASS (regresión).
- `src/test/visible-catalog-universe-unification.test.ts` — 9/9 PASS (regresión).

Build limpio.

## 6. Confirmación de no redondeo

- Todas las asserciones usan `expect(x).toBe(y)` con enteros.
- Ningún `toBeCloseTo`, `Math.round`, `.toFixed`, `~`, "aprox.".
- El único `Math.round` en `FilterBar.tsx:401` es un porcentaje (excepción
  legítima §2.1 del canon).

## 7. POIs detached con deuda — destino

Los 4 POIs detached/no-aprobados con `geoHealth ∈ {partial, stale_name, empty}`
que antes hinchaban el subtab a 22 quedan:

- **Fuera del catálogo visible** (`getVisibleCatalogUniverse` los excluye —
  no son `myCatalog` ni `followedCatalog` aprobados).
- **Dentro del universo técnico/mapa** (`getVisibleUniverseLocations`),
  visibles como markers si la zoom/layer policy lo permite.
- **Visibles en mantenimiento backend** (`IncompleteLocationsPanel`,
  `GeographyBackfillPanel`) que consumen el universo de mantenimiento
  (fuente C), no el subtab del panel.

No se borran, no se desaprueban, no se modifican.

## 8. Restricciones respetadas

- No se tocó: footer (`EffectiveActionFooter`), cross-mode header/selection
  fix, PR-EXPORT-2 core, serializers, datos, schema, backend,
  `getFilteredLocations` (markers), `getVisibleUniverseLocations`.
- Sin bump de versión.

## 9. Cierre

Ticket `search-filter-debt-subtab-count-mismatch-ticket.md` queda
**CLOSED** por este postflight. Próximo: PR-COUNTS-3 (tests de contrato
globales del canon: no-rounding guard, no-approx-language guard,
invariantes Explorar/Debt/Unenriched, delete-uses-destructive,
selection-intersection).
