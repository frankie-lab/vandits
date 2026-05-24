# Plan UX — Buscar y Filtrar → Mantener → Con deuda como vista operativa inline

> **Tipo**: Documento de diseño UX (docs-only).
> **Estado**: Propuesta para aprobación.
> **Entregable único**: `docs/audits/search-filter-inline-poi-actions-plan.md`.
> **Relaciones**:
> - Reemplaza, en flujo primario, a `docs/audits/search-filter-debt-resolution-sidepanel-ux-plan.md` (Fase 1, v1.4.2) sin eliminarlo del repositorio.
> - Conserva intactos `docs/contracts/root-status-resolution-contract.md` (matriz A/B/C/D), `health-repair-partition.ts` y el bridge `geo-maintenance-handoff` (v1.4.1).
> - Respeta `mem://ui/discovery/panel-modes`, `mem://logic/map/subset-fit-contract`, `mem://logic/map/popup-persist-on-rebuild`, `mem://ui/filter-axes-norm`.

---

## 1. Problema

`Mantener → Con deuda` ya filtra el universo deuda y muestra el árbol Geo/Tipo/Tags/Legacy con su `RootStatusChipRow` A/B/C/D. Pulsar **Resolver deuda** abre `DebtResolutionPanel` — una subvista lateral que vuelve a listar los mismos POIs agrupados.

Consecuencia UX:

- Doble navegación: el universo ya está visible, pero las acciones viven en otra pantalla.
- El árbol queda **pasivo**: no expone POIs ni acciones, sólo cuenta.
- El usuario no puede operar POI a POI desde el contexto donde está mirando.

## 2. Principio rector

> **El árbol/lista de `Con deuda` es la superficie primaria de trabajo.**
> - Acción individual → popup del POI.
> - Acción de lote → footer único.
> - "Resolver deuda" es una **acción** sobre el subconjunto/selección, no una segunda pantalla obligatoria.

## 3. Modelo objetivo

```text
SemanticSearch (panel lateral derecho)
└─ FilterBar
   └─ Modo Mantener
      └─ Subtab Con deuda                  ← VISTA OPERATIVA
         ├─ RootStatusChipRow (A/B/C/D)    transversal, recorta árbol y CTAs
         ├─ Árbol Geo/Tipo/Tags/Legacy     drillable hasta POI rows
         │   ├─ Nodo: tri-state + acciones de grupo
         │   └─ POI row: checkbox · root · ring hint · nombre · breadcrumb · icon-actions
         └─ EffectiveActionFooter          única zona de CTAs
              └─ [modal solo para confirmar escritura]
```

## 4. POI rows en el árbol

Hoy los árboles (`GeographyTree`, `ClassificationTree`, `TagsTree`, `PlaceTypeFilter`) terminan en nodos con counts. Cambio:

- Cualquier nodo hoja admite expansión adicional para listar sus POIs (virtualizada cuando N > 50).
- Fila POI, una línea, alta densidad:
  ```text
  [☐]  [iconRoot]  Nombre · breadcrumb corto    [A|B|C|D]  [ringHint]   [📍] [💬]
  ```
  - **Click en la fila** (área no-checkbox, no icon-button): `setFocusedLocation(id)` + `requestSubsetFit([id], { mode: 'always', reason: 'tree-row-focus' })` + abre popup del POI. Panel permanece abierto. Respeta `popup-persist-on-rebuild`.
  - **Checkbox**: `stopPropagation`, sólo muta selección.
  - **`[📍]` Centrar**: `stopPropagation`, `requestSubsetFit` single, sin popup.
  - **`[💬]` Abrir popup**: equivalente al click de fila.
  - **Badge A/B/C/D**: leído de `rootStatus`.
  - **ringHint**: etiqueta breve y muda (`partial`/`chain`/`review`/`hardError`/∅). No acción.

**Regla dura**: los botones internos usan `event.stopPropagation()` para no dispararse junto al click de fila.

## 5. Selección — contrato explícito

Decisión: **selección local al panel** en esta fase.

- Nuevo hook `useDebtPanelSelection()` (o equivalente) que mantiene `Set<string>` de IDs.
- Razones para NO usar `selectedLocations` global ahora:
  - El árbol de `Mantener` ya colisiona conceptualmente con la selección global usada en modo `Seleccionar`.
  - Marcar 200 POIs B en `Con deuda` no debería contaminar el modo `Seleccionar`.
  - Permite tri-state por nodo sin tocar el contrato global.
- "Materializar a `selectedLocations` global" se ofrece como acción explícita en "Más acciones" (`Promover a selección global`), no automática.
- Checkbox por POI muta `localSelection`.
- Checkbox por nodo: tri-state (∅ / mixed / all). Clickea sobre todos los POIs visibles del nodo bajo los filtros activos (`rootStatusFilter` + axes del árbol).
- Acción `Limpiar selección` siempre disponible cuando `localSelection.size > 0`.

## 6. Footer único — `EffectiveActionFooter`

Una sola barra principal. Sin doble footer en ningún caso.

Subset activo del footer:

- `localSelection.size > 0` → `selected ∩ universeBase ∩ treeSelection ∩ rootStatusFilter`.
- `localSelection.size === 0` → `universeBase ∩ treeSelection ∩ rootStatusFilter`.

Primary CTA por contexto:

| Estado del subset                                | Primary                                  |
|--------------------------------------------------|------------------------------------------|
| 100% D + `partial`/`chain` (reparables)          | `Resolver reparables (N)` / `Reparar selección (N)` |
| 100% B + viewer con capability                   | `Abrir en Geo Maintenance (N)`           |
| 100% B sin capability                            | (sin CTA; chip informativo, no clicable) |
| Mixto o sólo A/C                                 | `Exportar selección` / `Exportar subconjunto` |
| Vacío                                            | (sin CTA primaria)                       |

Menú secundario **Más acciones**:

- Exportar.
- Abrir en mapa (`requestSubsetFit` con `reason: 'footer-subset-fit'`).
- Geo Maintenance (si aplica y no es ya primary).
- Limpiar selección.
- Exportar no reparables (subset \ reparables).
- Promover a selección global (materializa `localSelection` en `selectedLocations`).
- Ver desglose (abre `DebtResolutionPanel`; ver §9).

Reglas duras:

- El footer **nunca** ofrece CTA que el viewer no pueda ejecutar por permisos.
- El footer **nunca** se duplica con CTAs del subpanel.
- El footer se mantiene visible siempre en `Mantener → Con deuda`.

## 7. Acciones de grupo (nodo del árbol)

En el header de cada nodo, además de la tri-state checkbox:

- Seleccionar/limpiar grupo (vía tri-state).
- Abrir grupo en mapa: `requestSubsetFit(ids, { mode: 'always', reason: 'tree-group-fit' })`.
- Exportar grupo: flujo PR-EXPORT-1, filtrado por `evaluatePoiExport`.
- **Si el grupo contiene B y viewer tiene capability** (`view_geo_maintenance` + `run_geo_backfill`): `Geo Maintenance` (bridge `lovable:open-geo-maintenance-scoped`, source `'tree-node'`).
- **Si el grupo contiene reparables (D ∩ partial/chain)**: `Reparar reparables` → abre `HealthRepairPreviewDialog` con el subconjunto reparable del grupo.

Render condicional duro: sin capability → botón Geo Maintenance no se renderiza (ni disabled, ni tooltip). Sin reparables → botón Reparar no se renderiza.

## 8. Popup como superficie individual

Las acciones específicas de un POI viven en el popup (canon P-POPUP-15 + P-POI-CURATION-1):

- Editar, revisar, completar identidad, ratings, acciones puntuales, export individual si existe.
- El panel **no** duplica estas acciones; sólo expone los handles mínimos (checkbox, centrar, abrir popup).

## 9. Rol de `DebtResolutionPanel`

Decisión: **Opción transición (no eliminar)** → migración Opción A a medio plazo.

- Ya **no** se monta automáticamente al pulsar `Resolver deuda` en el footer.
- Pasa a estar accesible **sólo** vía `Más acciones → Ver desglose`.
- Su lógica útil (partición A/B/C/D agrupada) se reusa en el árbol inline (mismo helper `partitionRepairScopeByRootStatus`).
- Tras QA estable del flujo inline (release posterior, fuera de este plan), se elimina como vista; sus tests se reducen al contrato del modal.
- Fallback debug descartado como flujo paralelo; sólo "Ver desglose" sobrevive durante la transición.

## 10. Botón "Resolver deuda" / "Resolver reparables"

- **No** abre lista por defecto.
- Opera sobre el subset del footer (selección o `universeBase ∩ treeSelection ∩ rootStatusFilter`).
- Si subset contiene reparables → abre `HealthRepairPreviewDialog` con esos IDs (escritura confirmada).
- Si subset **no** contiene reparables:
  - CTA muta a `Exportar subconjunto` (o `Abrir en Geo Maintenance` si aplica).
  - Mensaje inline (helper text bajo el footer): "No hay reparación automática para este subconjunto. Puedes exportarlo, abrirlo en el mapa o enviar el grupo B a Mantenimiento Geográfico."

## 11. Modal `HealthRepairPreviewDialog`

Sin cambios funcionales. Recorte de uso:

- Sólo confirma **escritura D + partial/chain**.
- No es vista de exploración ni listado primario.
- Se monta desde: footer (`Resolver reparables` / `Reparar selección`), acción de nodo (`Reparar reparables`), o `Ver desglose → grupo Reparable`.

## 12. RootStatusChipRow como filtro transversal

Sin cambios estructurales. Refuerzo:

- Pulsar B/D/A/C recorta árbol + filas POI + subset del footer.
- Limpiar chip → vuelve al universo `debt` completo.
- No abre otra pantalla.

## 13. Diferenciación vs Fase 1 (v1.4.2)

| Aspecto                     | Fase 1                                  | Fase 2 (este plan)                       |
|-----------------------------|-----------------------------------------|------------------------------------------|
| Vista primaria              | `DebtResolutionPanel` (subvista)        | Árbol inline en `Con deuda`              |
| Capas de navegación         | 2 (panel + subpanel)                    | 1 (panel)                                |
| POI rows con acciones       | Sólo en subpanel                        | En el árbol                              |
| Selección                   | Local al subpanel                       | Local al panel (`useDebtPanelSelection`) |
| Footer                      | Doble (oculto cuando subpanel abierto)  | Único (`EffectiveActionFooter`)          |
| Modal                       | Confirma D                              | Confirma D (sin cambios)                 |
| `DebtResolutionPanel`       | Vista primaria                          | "Ver desglose" en transición             |

## 14. Criterios de aceptación

El plan se aprueba si:

- Elimina la segunda capa: `Con deuda` es directamente operativa.
- POI rows se exponen bajo nodos hoja con click → popup, checkbox, root badge, ring hint.
- Acciones por grupo viven en el nodo del árbol.
- Selección **local** documentada, no mezclada con la global.
- Footer único responde a selección o a `universeBase ∩ treeSelection ∩ rootStatusFilter`.
- Acciones individuales se resuelven en el popup.
- Geo Maintenance gated por capability (render condicional duro).
- `Resolver reparables` envía sólo D + partial/chain.
- Abrir `Con deuda` no dispara RPC ni movimiento de cámara.
- `DebtResolutionPanel` deja de ser vista primaria; queda como `Ver desglose` durante transición.
- Modal sólo confirma escrituras.
- No se rompe D repair ni B handoff existentes.

## 15. Tests (contrato — no implementación)

- `Con deuda` renderiza filas POI bajo nodos finales.
- Click en fila POI llama `setFocusedLocation(id)` y abre popup; panel permanece.
- Click en checkbox **no** abre popup (`stopPropagation` verificado).
- Checkbox POI muta `localSelection`.
- Checkbox de nodo selecciona todos los POIs visibles bajo ese nodo + filtros activos.
- Tri-state de nodo refleja `∅ / mixed / all` correctamente.
- Footer recibe `localSelection` cuando `size > 0`.
- Footer recibe `universeBase ∩ treeSelection ∩ rootStatusFilter` cuando no hay selección.
- `RootStatusChipRow` activo recorta filas y CTAs del footer.
- Botón `Geo Maintenance` aparece **sólo** si todos los seleccionados son B AND viewer tiene capability.
- `Resolver reparables` envía payload con sólo D + `partial`/`chain` (validado contra `partitionRepairScopeByRootStatus`).
- Abrir fila/popup no llama `supabase.rpc`.
- Abrir panel `Con deuda` no llama `supabase.rpc` ni `requestSubsetFit`.
- No existe doble footer ni doble CTA en pantalla.
- `DebtResolutionPanel` sólo se monta tras `Más acciones → Ver desglose`.
- Sin escritura sin paso por modal de confirmación.

## 16. Detalles técnicos (referencia preliminar, no contrato)

> Orientativa. El plan técnico posterior podrá ajustar nombres, hooks y props sin reabrir este documento UX.

- Extender los 4 árboles (`GeographyTree`, `ClassificationTree`, `TagsTree`, `PlaceTypeFilter`) con un slot `renderLeafPois?: (locs, ctx) => ReactNode`. Render compartido en nuevo `TreePoiRow` (en `src/components/filters/`).
- `TreePoiRow` props: `loc`, `selected`, `onToggleSelect`, `onOpenPopup`, `onFocus`. Sin RPC, sin escritura.
- Acciones de grupo abstraídas en `TreeNodeActions` reutilizable por los 4 árboles.
- Selección local en hook `useDebtPanelSelection()` con API: `{ selected, toggle, toggleMany, clear, isMixed(nodeIds), isAll(nodeIds) }`.
- `EffectiveActionFooter` extiende su matriz primary→action con casos B-only + capability, `Resolver reparables` y el helper text "no hay reparación automática".
- `FilterBar`: elimina `debtPanelOpen` como toggle automático; `DebtResolutionPanel` se monta sólo desde `Más acciones → Ver desglose`. Footer único, ya no condicionalmente oculto.
- Bridge `geo-maintenance-handoff` reusado con `source: 'tree-node'` o `'footer'` según origen.
- `RootStatusChipRow` ya filtra; se asegura intersección con árbol y footer vía selector compartido.

## 17. Fuera de alcance

- Cambios en `health-repair-partition.ts`, capabilities, bridge, schema, datos, backend, Nominatim, marker fill, POI-N, health rings, popup canónico, PR-EXPORT-2 core.
- Bump de versión (docs-only).
- Implementación: el plan técnico posterior la cubre.
- Eliminación definitiva de `DebtResolutionPanel` (queda como `Ver desglose` durante transición).

## 18. Entregable

Un único archivo:

- `docs/audits/search-filter-inline-poi-actions-plan.md` (este documento).
