# Plan UX — "Resolver deuda" como subpanel dentro de Buscar y Filtrar

> **Tipo**: Documento de diseño UX (docs-only).
> **Estado**: Aprobado como plan UX. Ninguna parte de este documento autoriza cambios de código, datos, schema, backend ni bump de versión.
> **Relación con otros contratos**:
> - `docs/contracts/root-status-resolution-contract.md` (matriz A/B/C/D + reglas de escritura).
> - `docs/audits/root-status-resolution-current-gaps-audit.md` (estado actual de gaps).
> - `docs/audits/root-status-b-geo-maintenance-scoped-plan.md` + `…-postflight.md` (bridge B → Geo Maintenance, v1.4.1).
> - `mem://ui/discovery/panel-modes` (FilterBar: Explorar / Mantener / Seleccionar).
> - `mem://logic/map/subset-fit-contract`, `mem://logic/map/popup-persist-on-rebuild`.

---

## 1. Contexto y problema UX

`HealthRepairPreviewDialog` (modal central) es hoy el único punto de entrada para "Resolver deuda" en el universo `debt`, abierto desde `FilterBar` y `EffectiveActionFooter`. Es **funcionalmente seguro**:

- particiona grupos A/B/C/D antes de cualquier acción,
- no escribe al abrir,
- sólo el grupo D + `partial`/`chain` entra a repair automático,
- el grupo B puede hacer handoff a Geo Maintenance scoped si el viewer tiene capability (v1.4.1),
- Export y "Abrir en mapa" funcionan dentro del modal.

Pero **rompe el flujo lateral** del usuario:

1. El modal central interrumpe `Buscar y Filtrar` y oculta el mapa.
2. Lista muchos POIs sin afordances para inspeccionar uno a uno.
3. El botón "Geo Maintenance" puede aparecer aunque el viewer no tenga capability real (queda como ruido visual).
4. Para revisión humana (C, A), el usuario necesita abrir el **popup del POI** en el mapa, no sólo leer una lista plana.

## 2. Modelo objetivo

Ruta de interacción canónica:

```text
SemanticSearch  (panel "Buscar y Filtrar", slot lateral derecho)
  └─ FilterBar
     └─ Modo "Mantener"
        └─ Universo "Con deuda"
           └─ Acción "Resolver deuda"           ← abre SUBPANEL
              └─ DebtResolutionPanel             (vista de trabajo lateral)
                 └─ [confirmación]               (modal sólo para escribir)
```

**Regla dura**: el modal central deja de ser la vista primaria. Su único rol legítimo pasa a ser **confirm dialog** para acciones que escriben (hoy: D repair).

## 3. Estructura del subpanel `DebtResolutionPanel`

Vive dentro del slot lateral derecho ya ocupado por `SemanticSearch`. Se modela como **sub-vista del mismo panel**, no como nuevo `RightPanelId` — de esta forma se respeta la regla "un único panel a la derecha" (`useRightPanel`).

Layout (de arriba a abajo):

```text
┌──────────────────────────────────────────────┐
│ PanelHeader   [← back]  Resolver deuda  [×] │
├──────────────────────────────────────────────┤
│ ScopeSummary  (chips read-only)              │
├──────────────────────────────────────────────┤
│ GroupList     (acordeones por partición)     │
│   ▸ Reparable        (n)                     │
│   ▸ B Sistema        (n)                     │
│   ▸ C Revisión       (n)                     │
│   ▸ A Incompleto     (n)                     │
│   ▸ No reparable     (n)                     │
├──────────────────────────────────────────────┤
│ PanelFooter   [acción primaria]  [Más ▾]    │
└──────────────────────────────────────────────┘
```

### 3.1 ScopeSummary (read-only)

Chip-row informativa, sin acciones:

- **Total** en el universo `debt`.
- **Reparables** = D ∩ {partial, chain}.
- **A** / **B** / **C** / **D** (conteo por grupo).
- **No reparables por tipo** (conteo agregado).

### 3.2 GroupList — acordeones por partición

Orden canónico alineado con la matriz A/B/C/D:

1. **Reparable** — verde — D + `partial`/`chain`.
2. **B Sistema** — ámbar — deuda geo/canónica.
3. **C Revisión** — azul — requiere decisión humana.
4. **A Incompleto** — gris — datos faltantes.
5. **No reparable por tipo** — neutral.

Cada acordeón:

- **Header**: icono · nombre · count · checkbox de grupo (tri-state) · chevron.
- **Acciones de grupo** (icon-buttons en el header):
  - `Abrir grupo en mapa` → `requestSubsetFit(ids, { mode: 'always', reason: 'debt-group-fit' })`.
  - `Exportar grupo` → flujo existente, filtrado por `evaluatePoiExport` (PR-EXPORT-1).
  - `Seleccionar todos del grupo` (también accesible vía checkbox tri-state).
  - **Sólo en grupo B**, **sólo con capability** (§5): `Abrir en Geo Maintenance`.
  - **Sólo en grupo Reparable**: `Reparar grupo (N)` → abre modal de confirmación (§6).
- **Body** expandible: lista de POIs (virtualizada si N > 50).

### 3.3 Fila POI

```text
[checkbox]  [icono salud]  Nombre · breadcrumb territorial   [Centrar] [Abrir popup]
```

Acciones por fila (icon-button compactos, **no menú**):

- `Centrar` → `requestSubsetFit([id], { mode: 'always', reason: 'debt-row-focus' })`.
- `Abrir popup` → centra + abre popup del POI en el mapa, **sin cerrar el subpanel**. Respeta `popup-persist-on-rebuild`.

**Sin acciones de escritura por fila.**

## 4. Selección múltiple

- Checkbox por POI + checkbox tri-state por grupo + acción global "Seleccionar todo / Limpiar".
- El estado de selección es **local al subpanel**. No contamina `useLocationsStore` ni `useDiscoveryStore`.
- El footer reacciona a `selection.size` (§7).
- Al cambiar la selección a >0, debounce 250 ms y `requestSubsetFit(ids, { mode: 'always', reason: 'debt-selection-fit' })`.

## 5. Capability gating — Geo Maintenance

Regla **dura**:

- El botón `Abrir en Geo Maintenance` se renderiza **sólo si**:
  - viewer cumple `view_geo_maintenance` **AND** `run_geo_backfill` (vía `useCapability`),
  - **AND** el grupo activo o la selección filtrada pertenecen a **B** (nunca en A/C/D/Reparable/No-reparable).
- Si el viewer **no** tiene capability:
  - El botón **no se renderiza**.
  - En su lugar aparece texto informativo no accionable:
    > "Requiere mantenimiento geográfico por un administrador."
  - Sin tooltip, sin `disabled`-state clicable, sin sugerencia de workaround.
- Click con capability: reusa el bridge existente `lovable:open-geo-maintenance-scoped` (v1.4.1) con `locationIds` = IDs del subgrupo B (o selección filtrada a B) y `source: 'debt-sidepanel'`. Cierra el subpanel y navega a `/admin/geography`. **No ejecuta backfill** (handoff puro).

## 6. Modal — sólo confirmación final

El modal central queda **exclusivamente** como confirm dialog para acciones que **escriben**:

- **Reparar N (D + `partial`/`chain`)** → abre modal con:
  - resumen del payload,
  - listado breve,
  - botones `Cancelar` / `Reparar N`,
  - al confirmar: encola health repair (flujo D actual intacto, sin cambios).
- **Nada más** abre modal:
  - Geo Maintenance → handoff a panel destino, no modal.
  - Export → flujo existente sin modal.
  - Centrar / Abrir popup → no modal.

**`HealthRepairPreviewDialog` se conserva** durante toda la transición y no se elimina en este plan. Coexisten:

- Default desde FilterBar / EffectiveActionFooter → **subpanel**.
- Modal accesible como fallback (feature flag / debug) hasta que el subpanel pase QA.

## 7. Footer contextual

`PanelFooter` muestra **una sola** acción primaria según contexto + menú "Más acciones":

| Estado                                            | Acción primaria                       |
|---------------------------------------------------|---------------------------------------|
| Sin selección, grupo activo = Reparable           | `Reparar grupo (N)`                   |
| Sin selección, grupo activo = B (con capability)  | `Abrir en Geo Maintenance`            |
| Sin selección, grupo activo = B (sin capability)  | (sin CTA primaria; texto informativo) |
| Selección > 0, todos reparables                   | `Reparar selección (N)`               |
| Selección > 0, todos B + capability               | `Abrir en Geo Maintenance (N)`        |
| Selección mixta o sólo A/C                        | `Exportar selección`                  |
| Sin selección, sin grupo activo                   | `Exportar todo` (secundaria)          |

"Más acciones" agrupa: Exportar, Abrir en mapa, Limpiar selección.

**Regla dura**: el footer **nunca** ofrece una acción que el viewer no pueda ejecutar por permisos.

## 8. Relación con mapa y popup

- Cambios de selección → `requestSubsetFit` con `reason` específico (`debt-selection-fit`, `debt-group-fit`, `debt-row-focus`).
- `Abrir popup` por fila **no cierra** el panel; respeta `popup-persist-on-rebuild`.
- Cambiar de grupo **no** mueve la cámara automáticamente; el usuario decide con `Abrir grupo en mapa`.
- Filtros laterales activos (`Geo`, `Tipo`, `Tags`, búsqueda) **no** mueven cámara, conforme a `subset-fit-contract`.

## 9. Diferenciación vista-de-trabajo vs confirmación

| Aspecto                    | Subpanel (vista de trabajo) | Modal (confirmación)            |
|----------------------------|-----------------------------|---------------------------------|
| Persistencia               | Persistente, lateral        | Efímero, central                |
| Escritura                  | Nunca                       | Sólo D repair                   |
| Selección múltiple         | Sí                          | No (payload ya cerrado)         |
| Inspección POI a POI       | Sí (popup en mapa)          | No                              |
| Capability gating          | Render condicional o suprime| Asume permisos ya validados     |
| Coexiste con mapa visible  | Sí                          | No (cubre la pantalla)          |

## 10. Criterios de aceptación del plan

El plan UX se considera aprobado si:

- Define el subpanel como vista primaria y el modal como confirmación.
- Especifica gating duro de Geo Maintenance por capability.
- Permite selección múltiple a nivel POI y grupo.
- Permite inspección POI a POI vía popup en el mapa.
- Garantiza que ninguna acción de lista escribe sin pasar por confirm.
- Conserva `HealthRepairPreviewDialog` hasta que el subpanel pase QA.
- No propone cambios en `EffectiveActionFooter` que rompan el universo no-`debt`.

## 11. Fuera de alcance

Este documento **no** cubre y **no** autoriza:

- Implementación (código, tests, edge functions).
- Cambios en `health-repair-partition.ts` u otra lógica A/B/C/D.
- Nuevas capabilities ni cambios en `CAPABILITIES`.
- Cambios en el bridge `geo-maintenance-handoff` (v1.4.1 ya cubre).
- Rediseño del modal `HealthRepairPreviewDialog` (se conserva tal cual para confirm).
- Cambios en mapa, marker fill, POI-N, health rings o popup canónico.
- Cambios de schema, backend, RLS, datos, Nominatim, PR-EXPORT-2 core.
- Bump de versión.

## 12. Detalles técnicos (referencia preliminar, no contrato)

> **Nota normativa**: esta sección es **referencia orientativa** para el plan técnico posterior. **No es contrato de implementación**. El plan técnico podrá ajustar nombres de componentes, props, organización de hooks y estrategia de tests sin reabrir este documento UX.

Pistas iniciales (sujetas a revisión):

- Sub-vista dentro del panel `semanticSearch` (`useRightPanel`), sin nuevo `RightPanelId`.
- Capability checks vía `useCapability('view_geo_maintenance')` + `useCapability('run_geo_backfill')`.
- Subset fit vía `requestSubsetFit` con `reason` por trigger (`debt-row-focus` / `debt-group-fit` / `debt-selection-fit`).
- Partición reusa `src/components/discovery/health-repair-partition.ts` sin cambios.
- Bridge handoff B reusa `src/shared/events/geo-maintenance-handoff.ts` sin cambios.
- Composición visual con piezas del Panel System (`PanelHeader` / `PanelBody` / `PanelFooter` / `PanelSection`) de `@/shared/components/ui/panel`.
- Estado de selección local al subpanel (hook propio o `useReducer`), no global.

## 13. Entregable

Un único archivo:

- `docs/audits/search-filter-debt-resolution-sidepanel-ux-plan.md` (este documento).

Sin código, sin mocks de UI, sin datos. El plan técnico de implementación se redactará por separado y referenciará este documento como contrato UX vinculante.
