# POI Counts Canon

> Status: **ACTIVE — FOUNDATION**. Contrato global de contadores de POIs
> en Vandits. Aplica a toda UI operativa que muestre cantidades de POIs,
> ubicaciones, seleccionados, elegibles o equivalentes.
>
> Companions:
> - [`./canon-change-policy.md`](./canon-change-policy.md)
> - [`./filter-axis-contract.md`](./filter-axis-contract.md)
> - [`./poi-export-contract.md`](./poi-export-contract.md)
> - [`./subset-fit-contract.md`](./subset-fit-contract.md)
> - [`../audits/poi-counts-global-sources-audit.md`](../audits/poi-counts-global-sources-audit.md)
> - [`../governance/documentation-governance-policy.md`](../governance/documentation-governance-policy.md)
>
> Owner doc-set: Content domain.

---

## 1. Principio central

Los POIs son entidades **discretas**. Sus contadores en UI operativa
deben ser **exactos**. Está prohibido redondear, suavizar, estimar o
mostrar números aproximados de POIs.

Corolario: si dos contadores no pueden coincidir es porque están
mirando **universos distintos** — y en ese caso DEBEN usar etiquetas
distintas (ver §5).

---

## 2. Reglas duras

### 2.1 No redondeo

Ningún contador de POIs puede aplicar redondeo. Lista negra (en código
que produce un count de POIs):

- `Math.round`
- `Math.ceil`
- `Math.floor`
- `.toFixed(...)`
- `.toPrecision(...)`
- prefijos textuales: `~`, `aprox.`, `aproximadamente`, `cerca de`,
  `más de`, `casi`, `unos`, `±N`

Se **permite** `Intl.NumberFormat('es-ES').format(count)` (o helper
equivalente) **únicamente** para añadir separador de miles. El valor
numérico NO se altera.

> Excepción explícita: **porcentajes** y métricas derivadas no-cardinales
> (ej. "70% del total") pueden formatear con `Math.round` porque no son
> counts de POIs. Deben acompañarse del count exacto cuando se muestra
> al usuario.

### 2.2 Todo contador declara universo

Cada contador debe poder responder, en código o documentación:

1. **Fuente** — store getter o prop de entrada.
2. **Universo** — `catalog | map | maintenance | selection | export`.
3. **Filtros aplicados** — axes activos, búsqueda, viewport.
4. **Ownership** — propios / seguidos / ambos / ninguno.
5. **Approval gate** — ¿exige `is_approved=true`?
6. **Deleted / hidden** — ¿incluye soft-deleted u oculto?
7. **Detached** — ¿incluye POIs sin documento?
8. **Seguidos** — ¿se cuentan los ajenos seguidos?
9. **Propios no aprobados** — ¿entran?
10. **Mantenimiento** — ¿incluye POIs en cola técnica?
11. **Categoría visible** — catálogo, mapa, mantenimiento, selección,
    exportación o IA.

La auditoría (`docs/audits/poi-counts-global-sources-audit.md`)
materializa estas declaraciones por componente.

---

## 3. Fuentes canónicas (Sources of Truth)

| Fuente | Helper canónico | Consumidores legítimos | Incluye | Excluye |
|---|---|---|---|---|
| **A. `catalogVisibleUniverse`** | `getVisibleCatalogUniverse` (reservado — a crear en PR-COUNTS-1) sobre `getLocationBucket` / `getBucketStats` | Top bar (`FloatingToolbar`), FilterBar en modo Explorar, ownershipRatios, headers de catálogo | `myCatalog` + `followedCatalog` aprobados, visibles | detached ajenos no aprobados, POIs de mantenimiento técnico |
| **B. `mapVisibleUniverse`** | `getVisibleUniverseLocations()` (`locations-store.ts`) | Markers en mapa, render visual, mantenimiento técnico | annotated visibles + detached visibles | — |
| **C. `maintenanceUniverse`** | `resolveUniverseBase(mode, fuenteDeclarada)` (`src/domains/content/lib/resolve-universe-base.ts`) | Subtab "Con deuda", "Sin enriquecer", revisión, backfills, curación | derivado de fuente declarada filtrado por predicado canónico (`isLocationInDebtUniverse` / `isLocationInUnenrichedUniverse`) | predicados locales duplicados (prohibidos) |
| **D. `selectionUniverse`** | `selectedLocations` (IDs materializados) + `effectiveActionSet` / `destructiveActionSet` | Footer de acciones, header de selección, `SelectionActions` | IDs materializados ∩ universo activo | acciones implícitas sin set declarado |
| **E. `exportUniverse`** | `evaluatePoiExport` sobre `source.locations` (`runPoiExport`) | `ExportPanel`, `runPoiExport`, `kml-parser` | `source.locations` declarado con `scope` + `scopeProvided` | default implícito (prohibido fuera de compat warn) |

**Regla de no-reuso**: prohibido usar `mapVisibleUniverse` para
contadores de catálogo bajo la etiqueta genérica "POIs" o
"ubicaciones". Si un contador necesita un universo distinto a los
listados, debe crearse un helper nuevo, documentarse aquí, y usar
**etiqueta distinta** (ver §5).

---

## 4. Acciones (selectionUniverse)

- **No destructivas** (enriquecer, exportar, etiquetar masivo, etc.):
  pueden operar sobre `effectiveActionSet`. El footer muestra
  `effectiveActionSet.length`.
- **Destructivas** (eliminar, mover a papelera, purgar): **solo**
  `destructiveActionSet`. Prohibido caer implícitamente a
  `effectiveActionSet`.
- **Header "seleccionados"**: cuando habla de selección de usuario,
  muestra `destructiveActionSet.length` (es decir, lo que el usuario
  controla manualmente). Si el modo activo materializa una selección,
  se considera selección controlada.

---

## 5. Etiquetas obligatorias

Diccionario cerrado. Mismas palabras = misma SoT.

| Etiqueta | Universo / set |
|---|---|
| `Catálogo visible` | A. `catalogVisibleUniverse` |
| `Mapa visible` | B. `mapVisibleUniverse` |
| `Con deuda` | C. `maintenanceUniverse('debt')` |
| `Sin enriquecer` | C. `maintenanceUniverse('unenriched')` |
| `Seleccionados` | D. `selectedLocations` materializados |
| `Exportables` | E. `source.locations` antes de `evaluatePoiExport` |
| `Elegibles` | E. resultado eligible de `evaluatePoiExport` |
| `Excluidos` | E. resultado excluded de `evaluatePoiExport` |
| `Internos` | scope `'internal'` (ownerUserId === uid) |
| `Pendientes` | personal-state pendientes; NO mezclar con `Sin enriquecer` |

Prohibido mostrar dos universos distintos bajo una misma etiqueta
genérica (`ubicaciones`, `POIs`). Si una superficie tiene que mostrar
ambos, debe usar dos chips/labels distintos.

---

## 6. Invariantes UX

### Modo Explorar (FilterBar) — todos `catalogVisibleUniverse`

```
FloatingToolbar.catalogTotal
  == FilterBar.headerTotal
  == treeRootSum
  == footerTotal
```

### Modo Con deuda

```
subtab.conDeuda
  == HealthFilterActionCTA.count
  == treeRootSum
  == footerTotal
  == resolveUniverseBase('debt', catalogVisibleUniverse).length
```

### Modo Sin enriquecer

```
subtab.sinEnriquecer
  == HealthFilterActionCTA.count
  == treeRootSum
  == footerTotal
  == resolveUniverseBase('unenriched', catalogVisibleUniverse).length
```

### Selección

```
header.selectedCount       == destructiveActionSet.length
footer.actionCount         == effectiveActionSet.length
deleteAction.candidateSet  == destructiveActionSet      // nunca effective
```

### Exportación

```
ExportPanel.origin    == source.locations.length              (N)
ExportPanel.eligible  == evaluatePoiExport(...).eligible.len  (E)
ExportPanel.excluded  == evaluatePoiExport(...).excluded.len  (X)
N == E + X
```

---

## 7. Predicados canónicos

Prohibido duplicar predicados locales. Helpers SoT:

| Dominio | Helper |
|---|---|
| Bucket de catálogo (per-POI) | `getLocationBucket` (`src/domains/content/lib/location-bucket.ts`) |
| Stats top-bar | `getBucketStats` |
| **Catálogo visible** (a crear) | `getVisibleCatalogUniverse` — reservado para PR-COUNTS-1 |
| Universo de mapa / técnico | `getVisibleUniverseLocations` (`locations-store.ts`) |
| Universo de mantenimiento | `resolveUniverseBase` |
| Predicado debt | `isLocationInDebtUniverse` |
| Predicado unenriched | `isLocationInUnenrichedUniverse` |
| Visibilidad POI mapa | `isLocationVisibleInGlobalMap` |
| Owner | `getLocationOwnerUserId` |
| Exportación | `evaluatePoiExport` (`src/domains/content/lib/poi-export-eligibility.ts`) |
| Sets de acciones | `effectiveActionSet` / `destructiveActionSet` |

**Regla de extensión**: si un nuevo contador exige un universo
distinto:

1. Crear helper explícito (no inline en componente).
2. Documentar nombre + uso en esta tabla + en
   `mem://logic/content/location-bucket-matrix`.
3. Añadir etiqueta distinta en §5.
4. Añadir tests de contrato (ver §8).

---

## 8. Tests de contrato (requeridos en PRs futuros)

Estos tests **no se implementan en este PR**; se exigen en los PRs de
corrección listados en la auditoría.

1. **No-rounding guard**: grep / AST sobre módulos de counts
   (`FilterBar`, `FloatingToolbar`, `*Tree`, `EffectiveActionFooter`,
   `ExportPanel`, `SelectionActions`, `HealthFilterActionCTA`,
   `PanelModeTabs`) que falle si encuentra `Math.round|ceil|floor|
   toFixed|toPrecision` en expresiones que producen counts.
2. **No-approx-language guard**: grep sobre strings de esos módulos
   que falle ante `aprox.|~\s*\d|más de \d|cerca de \d|casi \d|unos
   \d`.
3. **Explorar invariant**: `FloatingToolbar.catalogTotal ===
   FilterBar.headerTotal` con fixture.
4. **Debt invariant**: subtab === CTA === treeRootSum === footer ===
   `resolveUniverseBase('debt')`.
5. **Unenriched invariant**: idem con `'unenriched'`.
6. **Export invariant**: `N === E + X` con fixture mezcla
   POI-1b/POI-9/POI-10 + scope.
7. **Delete uses destructiveActionSet**: snapshot del set pasado al
   handler de eliminar.
8. **Selection intersection**: `selectionCount === |selectedLocations
   ∩ universeBaseLocations|`.
9. **New-counter helper import**: lint custom que exige a todo
   componente que muestre un count de POIs importar uno de los
   helpers SoT de §7 o declarar uno propio documentado.

---

## 9. Formato visual permitido

```ts
const COUNT_FORMATTER = new Intl.NumberFormat('es-ES');
COUNT_FORMATTER.format(5100); // → "5.100"
```

Únicamente separador de miles. No altera valor. No agrupa decimales
(no aplica a counts enteros).

---

## 10. Fuera de alcance

Este contrato:

- **NO** implementa fixes de código.
- **NO** modifica datos, schema, backend ni edge functions.
- **NO** toca `PR-EXPORT-2 core` ni serializers.
- **NO** modifica `getFilteredLocations` (markers).
- **NO** introduce bump de versión.

Los fixes derivados están priorizados en la auditoría companion (§8).

---

## 11. Histórico

- 2026-05-24 — Canon creado tras detectar:
  - gap 5095 (top bar) vs 5100 (FilterBar) por uso de
    `mapVisibleUniverse` como contador de catálogo;
  - gap subtab "Con deuda" 22 vs CTA/árbol/footer 18 por predicado
    duplicado fuera de `resolveUniverseBase`.
  Ver `docs/audits/search-filter-debt-subtab-count-mismatch-ticket.md`
  y `docs/audits/search-filter-selection-state-cross-mode-postflight.md`.
