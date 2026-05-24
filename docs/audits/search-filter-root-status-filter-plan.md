# PR-FILTER-ROOTSTATUS-1 — Filtro Root Status A/B/C/D en Buscar y Filtrar

> Plan-only. Sin código, sin datos, sin schema, sin backend, sin bump.
> Aprobado con dos ajustes obligatorios incorporados (ver §5.1 y §6.6).

---

## 1. Contexto y precedentes

El concepto A/B/C/D ya existe **server-side** como SoT canónica:

- Contrato: `docs/contracts/poi-identity-root-status-contract.md`
- Clasificador Deno: `supabase/functions/_shared/poi-identity-root-status.ts`
  (`classifyPoiIdentityRootStatus`) — usado por `batch-enrich` /
  `enrich-location` como gate pre-IA. Suite Deno: 21 fixtures
  (`_shared/poi-identity-root-status.test.ts`).
- Export: `classification.rootStatus` ya está tipado en
  `src/domains/content/lib/poi-export-record.ts` y se serializa en
  `poi-kml.ts` / `poi-csv.ts`, pero el mapper lo deja sin poblar
  (`poi-export-mapper.ts:140` — "aún sin helper canónico en el codebase
  cliente").

Semántica (canon, no se altera):

| Estado | Color    | Causa                                                              | Dueño            |
|--------|----------|--------------------------------------------------------------------|------------------|
| **A**  | rojo     | Incompleto real (sin nombre útil / coords inválidas / identidad)   | Usuario          |
| **B**  | amarillo | Falta canon/backfill (FK admin chain rota, `partial|chain` sistema)| Sistema          |
| **C**  | naranja  | Nombre/coords incoherentes, `under_review`                         | Usuario/revisión |
| **D**  | verde    | Coherente, `eligibleForAutoEnrich = true`                          | Automático       |

**Reglas DURAS heredadas del contrato:**

- A/B/C/D **no sustituye** POI-N (curation levels 0/1/3/5/9/10).
- A/B/C/D **no sustituye** health debt (rings `partial|chain|review|hardError`).
- A/B/C/D **no cambia marker fill** (paleta verde/gris/naranja sigue siendo
  SoT visual, `mem://style/map/health-rings-rule`).
- A/B/C/D es eje **operativo** ortogonal: identidad/responsabilidad.

---

## 2. Problema

`Mantener → Con deuda` colapsa los POIs con rings activos en una sola pestaña
sin distinguir si la deuda es:

1. Reparable automáticamente (D + `partial|chain`) → `enqueue_health_repair`.
2. Deuda de sistema (B) → canon/backfill (`run_geo_backfill`).
3. Revisión humana (C) → flujo per-POI.
4. Incompleto real (A) → requiere intervención del owner.

Resultado actual: el CTA "Resolver deuda" se ofrece sobre el universo entero
y el worker server-side termina haciendo skip silencioso de A/B/C, gastando
enqueue y rompiendo la expectativa "X confirmados → X reparados".

---

## 3. Objetivo

Añadir un eje de filtrado `rootStatus ∈ {A,B,C,D}` en `FilterBar` que:

1. Se combine con todos los ejes existentes (Geo, Tipo, Tags, Legacy, POI-N,
   ownership, búsqueda, salud).
2. Aplique sobre cualquier `universeBase` (`all` / `debt` / `unenriched`).
3. Se vea como **chip de filtro activo** (axis `rootStatus`).
4. En `Mantener → Con deuda` muestre **desglose de counts A/B/C/D** del
   universo `debt`.
5. **Gating del CTA** "Resolver deuda": auto sólo opera sobre
   **D ∩ {partial, chain}**. A/B/C requieren confirmación explícita o flujo
   alternativo.
6. Respetado por `SelectionActions` (seleccionar todo) y por `ExportPanel`
   tanto en `internal` como en `public` (ver §6.6 — ajuste obligatorio).

---

## 4. Alcance y no-alcance

**Sí incluye (frontend-only):**

- Nuevo eje `rootStatus` en `filter-presets.ts` (`FilterAxis`).
- Helper cliente `classifyPoiRootStatusClient(loc)` — espejo del Deno con
  contract test de paridad obligatorio (ver §5.1).
- Nueva tab `Identity` en el árbol de `FilterBar` con 4 chips A/B/C/D.
- Aplicación en `matchesLocationFilters` + intersección de
  `effectiveActionSet`.
- Desglose A/B/C/D en `MaintainTabs` para `debt` (chips contables).
- Gating del CTA "Resolver deuda" en `EffectiveActionFooter` +
  `HealthRepairPreviewDialog`.
- Propagación a `SelectionActions.handleSelectAllInMode` y a `ExportPanel`
  (recorta el source ANTES de `evaluatePoiExport`, tanto `public` como
  `internal`).
- Tests unitarios + de contrato (§9).

**No incluye:**

- Schema: no se materializa columna `identity_root_status`. Cliente
  clasifica on-the-fly desde campos ya disponibles en `Location` (igual que
  el Deno).
- Backend: no se toca `batch-enrich`, `enrich-location`, ni
  `enqueue_health_repair`.
- Datos: ninguna migración, backfill o seed.
- Visual marker: paleta y rings no cambian (regla DURA del contrato).
- Cambios al popup, scope de export, POI-N levels, ni RLS.
- Bump de versión.

---

## 5. Modelo de datos (cliente)

### 5.1 Helper único `classifyPoiRootStatusClient` — paridad obligatoria

Nueva ubicación: `src/domains/content/lib/poi-identity-root-status-client.ts`.

**Condiciones de aprobación (ajuste obligatorio del review):**

1. **Replica el orden de decisión** del Deno
   `supabase/functions/_shared/poi-identity-root-status.ts` paso a paso.
   El árbol de decisión es idéntico; cualquier divergencia es bug.
2. **Fixtures compartidas**: se extraen las 21 fixtures del Deno a un JSON
   neutro `supabase/functions/_shared/poi-identity-root-status.fixtures.json`
   (o equivalente) y tanto el test Deno como el test cliente las consumen.
   No se duplican casos a mano.
3. **Contract test de paridad** obligatorio:
   `src/test/poi-identity-root-status-client-parity.test.ts` itera las
   fixtures compartidas y valida que el veredicto cliente
   (`rootStatus`, `eligibleForAutoEnrich`, `reason`) coincide exactamente
   con el esperado del Deno.
4. **Cualquier drift rompe CI**: el contract test es bloqueante. Si el Deno
   se modifica sin actualizar las fixtures y el cliente, el job falla.

Firma:

```text
classifyPoiRootStatusClient(loc: Location): {
  rootStatus: 'A' | 'B' | 'C' | 'D';
  eligibleForAutoEnrich: boolean;
  reason: string;
}
```

Inputs canónicos (todos en `Location`): `name`, `lat`, `lng`, `geoHealth`,
`rings`, `under_review`, flags de coherencia nombre↔coords,
`enriched_data.descripcion`.

### 5.2 Estado en `filters`

Añadir a `LocationFilters`:

```text
rootStatus?: Array<'A' | 'B' | 'C' | 'D'>  // multi-select; undefined = sin filtro
```

### 5.3 Nuevo eje en `filter-presets.ts`

```text
export type FilterAxis =
  | 'geography' | 'placeType' | 'tag' | 'classification'
  | 'search' | 'health'
  | 'rootStatus';   // NUEVO
```

- `getActiveFilterChips` emite chip por valor seleccionado.
- `resetAllFilters` limpia `rootStatus`.

### 5.4 Intersección canónica

```text
effectiveActionSet =
  universeBase(activeModeUniverse, allLocationsForUniverseSource)
    ∩ treeSelection
    ∩ rootStatusFilter            // NUEVO, antes de la selección
    ∩ userSelection (si existe)
```

`matchesLocationFilters` añade un predicado:

```text
filters.rootStatus?.length
  ? filters.rootStatus.includes(classifyPoiRootStatusClient(loc).rootStatus)
  : true
```

Memoización por `Location.id` + hash de campos relevantes (clasificador puro,
barato; evita recorrer 5K POIs en cada render).

---

## 6. UI

### 6.1 Eje en el árbol de FilterBar

Tab `treeTab` actual:
`'geography' | 'classification' | 'tags' | 'types'`.

**Decisión propuesta**: añadir 5ª tab `'identity'` con un selector compacto
de 4 chips A/B/C/D + tooltip con la causa canónica. Aísla el eje sin
contaminar trees existentes.

Fallback si UX rechaza la 5ª tab: chip-row fija sobre el árbol.

### 6.2 Desglose en `Mantener → Con deuda`

Bajo los subtabs `Con deuda N / Sin enriquecer N`, una mini-row de 4 chips:

```text
A 4  ·  B 8  ·  C 3  ·  D 3
```

- Counts derivados del mismo `universeBase('debt', allLocationsForUniverseSource)`
  (consistencia con PR-COUNTS-1/2).
- Click activa `rootStatus=[X]` (toggle); multi-select con Cmd/Ctrl.
- Invariante: A+B+C+D ≡ subtab `Con deuda` (test §9).

### 6.3 Chips de filtros activos

`activeChips` ya renderiza por axis con `styleByAxis`/`IconByAxis`. Añadir:

- `rootStatus`: estilo **neutral** (no rojo/amarillo/naranja/verde para no
  competir con marker palette ni health rings), icono `Shield` o
  `BadgeCheck`. Label del chip incluye la letra (`Root A`, `Root B`, …).

### 6.4 Footer CTA — gating

`EffectiveActionFooter` en modo `debt`:

- Si `effectiveActionSet ⊆ D ∩ {partial,chain}` → CTA "Resolver deuda"
  enabled, comportamiento actual.
- Si `effectiveActionSet` contiene A/B/C/D **mezclado** → CTA abre
  `HealthRepairPreviewDialog` con **partición visible**:
  - Reparable ahora (D): N POIs → confirma `enqueue_health_repair`.
  - Pendiente sistema (B): N POIs → deeplink a `GeographyBackfillPanel`
    (capability `run_geo_backfill`, ver `mem://governance/rbac-canon`).
  - Revisión (C): N POIs → "Abrir uno a uno" (sin acción masiva).
  - Incompleto (A): N POIs → "Requiere completar identidad" (sin masiva).
- Si `effectiveActionSet ⊆ A∪B∪C` (sin D) → CTA primary cambia a
  "Ver desglose" (no promete reparación que el server skipearía).

No cambia el server: `enqueue_health_repair` ya filtra. Esto sólo alinea
expectativa cliente ↔ worker.

### 6.5 `SelectionActions` / `handleSelectAllInMode`

Ya recorta por `effectiveActionSet`. Como `rootStatusFilter` entra en la
intersección antes que `userSelection`, "Seleccionar todo respeta el filtro"
se cumple por construcción.

### 6.6 `ExportPanel` — AJUSTE OBLIGATORIO

**Corrección al draft inicial**: `scope='public'` **NO** debe ignorar
`rootStatusFilter`.

Orden canónico (mismo para `public` e `internal`):

```text
sourceSet
  = effectiveActionSet  (ya recortado por rootStatusFilter)
  → evaluatePoiExport(loc, { scope })   // decide elegibles/excluidos
  → exporter (kml/csv/geojson)
```

**Motivo (cita literal del review):** "Los filtros activos de Buscar y
Filtrar deben respetarse siempre. Public/internal es elegibilidad de
exportación, no sustituto del filtro activo."

Implicaciones:

- `rootStatus=[D]` + `scope='public'` → source recortado a D, después
  `evaluatePoiExport` aplica criterio público (POI-9/10 enriched +
  shareable, ver PR-EXPORT-1). Resultado: subconjunto D públicamente
  exportable.
- `rootStatus=[A]` + `scope='public'` → source recortado a A; tras
  `evaluatePoiExport` el resultado será típicamente vacío o casi (A no
  cumple criterio público), y eso es **correcto**: el filtro mandó.
- `internal` sigue exigiendo `ownerUserId === currentUserId` (C1 PR-EXPORT-1).
- No se altera el contrato de export (PR-EXPORT-1/PR-EXPORT-2); sólo se
  garantiza que el source pasado al evaluador honra todos los filtros de
  Buscar y Filtrar.

`ExportPanel` y `SelectionActions` siguen pasando `scope` + `scopeProvided:true`
SIEMPRE (C2 PR-EXPORT-1).

---

## 7. Capability & RBAC

- Filtro `rootStatus` = derivado read-only del mismo `Location` que el
  usuario ya ve → **no requiere capability nueva**.
- Deeplink desde el dialog hacia `GeographyBackfillPanel` sigue gated por
  `run_geo_backfill` (admin+master).

---

## 8. Invariantes y reglas DURAS

- **I1.** `A ∪ B ∪ C ∪ D` (sin filtro adicional) = universo evaluable.
  POIs sin clasificación posible → A (conservador, mismo criterio Deno).
- **I2.** En `Mantener → Con deuda`:
  `count(A)+count(B)+count(C)+count(D) ≡ subtab Con deuda`.
- **I3.** Filtro `rootStatus` **no** muta `geoHealth`, `rings`,
  `getPointVisualState`, ni POI-N.
- **I4.** `enqueue_health_repair` server-side sigue siendo SoT de qué se
  repara — cliente sólo evita ofrecer botón sobre subsets que serán
  skipeados.
- **I5.** Paridad cliente ↔ Deno bloqueada por contract test con fixtures
  compartidas.
- **I6.** Ningún chip A/B/C/D usa la paleta del marker
  (rojo/amarillo/naranja/verde). Tonos neutros con letra prominente.
- **I7.** Export honra `rootStatusFilter` en **ambos** scopes; el scope sólo
  decide elegibilidad sobre el source ya filtrado.

---

## 9. Tests

Nuevos (todos bloqueantes en CI):

1. `poi-identity-root-status-client-parity.test.ts` — fixtures compartidas
   con Deno, mismos veredictos. **Drift rompe CI.**
2. `filterbar-root-status-axis.test.ts`:
   - `rootStatus=['D']` + `debt` → `effectiveActionSet ⊆ D`.
   - `rootStatus=['B']` + `debt` → `effectiveActionSet ⊆ B`.
   - Sin filtro → identidad.
3. `filterbar-debt-root-status-breakdown.test.ts`:
   - A+B+C+D counts ≡ subtab `Con deuda`.
   - Counts no cambian al seleccionar POIs (universeBase ignora selección).
4. `effective-action-footer-root-status-gating.test.ts`:
   - `effectiveActionSet ⊆ D ∩ {partial,chain}` → CTA "Resolver deuda"
     enabled.
   - Mixed → dialog parte en 4 grupos; sólo D ejecuta `enqueue_health_repair`.
   - Sólo A/B/C → CTA label = "Ver desglose".
5. `selection-actions-root-status-respect.test.ts` — "Seleccionar todo" tras
   `[D]` selecciona sólo D.
6. `export-panel-root-status-respect.test.ts`:
   - `rootStatus=['D']` + `scope='internal'` → exporta D del subset.
   - `rootStatus=['D']` + `scope='public'` → recorta a D, luego aplica
     `evaluatePoiExport`; exporta intersección D ∩ públicamente elegible.
   - `rootStatus=['A']` + `scope='public'` → resultado vacío o casi
     (filtro respetado, scope filtra después).
7. `marker-palette-root-status-invariance.test.ts` —
   `getPointVisualState(loc)` snapshot no cambia al añadir/quitar
   `rootStatus`.
8. `filter-presets-root-status-chips.test.ts` — chip por valor, reset
   limpia, multi-select funciona.

Existentes que deben seguir verdes:

- `poi-curation-levels.test.ts`
- `health-rings-rule.test.ts`
- `popup-golden-poi-contract.test.ts`
- `poi-export-contract.test.ts`

---

## 10. Riesgos y mitigaciones

| Riesgo                                              | Mitigación                                                                |
|-----------------------------------------------------|---------------------------------------------------------------------------|
| Drift cliente ↔ Deno                                | Contract test con fixtures compartidas; CI bloqueante.                    |
| Coste de clasificar 5K POIs por render              | Memo por `Location.id` + hash; clasificador puro.                         |
| Confusión visual A/B/C/D vs rings                   | Chips neutros, nunca paleta health/marker; tooltip de causa.              |
| Usuarios esperan reparar A/B/C                      | Dialog parte en 4 grupos; sólo D ejecuta enqueue.                         |
| Sobrecarga UI en FilterBar                          | 5ª tab aislada; fallback chip-row si UX rechaza.                          |
| Doble eje semántico (rootStatus vs POI-N vs health) | Ortogonales por contrato + tests de invariancia.                          |
| Export "rompe" expectativa al filtrar A en public   | Comportamiento correcto y documentado: filtro manda, scope filtra después.|

---

## 11. Entregables

1. Este documento: `docs/audits/search-filter-root-status-filter-plan.md`.
2. Sin cambios de código. La implementación se abre como
   **PR-FILTER-ROOTSTATUS-2** tras aprobación.

---

## 12. Orden sugerido para PR-FILTER-ROOTSTATUS-2 (fuera de este plan)

1. Extracción de fixtures compartidas Deno → JSON neutro.
2. Helper cliente + contract test de paridad (rojo→verde).
3. Extender `LocationFilters` + `FilterAxis` + `filter-presets`.
4. Wire en `matchesLocationFilters` + intersección `effectiveActionSet`.
5. Tab `Identity` en `FilterBar` + chip-row de desglose en
   `Mantener → Con deuda`.
6. Gating del footer + dialog particionado.
7. Propagación a `SelectionActions` + `ExportPanel` (orden:
   recorte source → `evaluatePoiExport` → exporter, **ambos scopes**).
8. Suite de tests §9 verde + revalidación visual.

---

## Restricciones reiteradas

- No tocar datos.
- No tocar schema (`identity_root_status` queda no-materializada por
  decisión del contrato).
- No tocar backend (`batch-enrich`, `enrich-location`,
  `enqueue_health_repair`, RLS).
- No tocar PR-EXPORT-1/2 core ni serializers; sólo se garantiza que el
  source pasado al evaluador honra `rootStatusFilter` en ambos scopes.
- No bump.
- No emojis.
- Cambios transversales SIEMPRE en helpers centralizados
  (`classifyPoiRootStatusClient`, `matchesLocationFilters`,
  `filter-presets`) — nunca parches puntuales en componentes.
