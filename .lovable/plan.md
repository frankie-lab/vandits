## Qué es este panel (Mantener · Con deuda)

**Buscar y Filtrar → Mantener** es la consola de **triage de salud** de TUS POIs. Su universo es exclusivamente puntos que necesitan intervención humana, particionados por el contrato A/B/C/D (`identity_root_status`):

- **A** — identidad inválida (nombre/coords incoherentes) → revisión manual.
- **B** — gap de canon geográfico (FK admin faltante, comarca sin resolver) → reparable por sistema (Geo Maintenance / backfill).
- **C** — review editorial (texto/imagen no cumple criterios) → curación humana.
- **D-eligible** — listos para enriquecer IA (aún no procesados).

El árbol de la izquierda (Geo/Tipo/Tags) recorta el subconjunto; el footer ejecuta la acción sobre lo seleccionado. **Cero POIs aquí son "sanos"** — todos están porque les falta algo.

## Diagnóstico del bug visible en el screenshot

`Mantener · Con deuda (22)` con `ROOT: A 0 · B 10 · C 4 · D 8`. El partitioner calcula `repairableCount = 0` (no hay auto-fix simple) y el footer cae al **Caso 3** de `EffectiveActionFooter.tsx:316-324` que rotula el primary como **"Exportar"**.

Eso rompe la semántica de Mantener: exportar POIs rotos no resuelve nada, los saca del flujo de saneamiento. El primary debe ser siempre una acción de **resolución**, aunque sea manual.

## Cambio propuesto (PR-MAINTAIN-FOOTER-1)

### Regla canónica
En `mode='debt'` (Mantener · Con deuda), el primary del footer es **SIEMPRE "Resolver"**. Nunca "Exportar". "Exportar" sólo aparece dentro de "Más acciones" como escape hatch.

### Comportamiento de "Resolver" según selección

| Selección usuario | Acción del primary "Resolver" |
|---|---|
| **1 POI** | Cierra el panel y abre el **popup canónico de ese POI**, que ya expone las acciones de curación según su curation level (POI-1, 3, 5, 9). El usuario resuelve in-place. |
| **N POIs (≥2)** | Abre `HealthRepairPreviewDialog` (que ya existe) en modo **"procesar lo posible"**: ejecuta auto-fix sobre los reparables (A→nada, B→geo backfill si capability, C→nada, D→batch-enrich), y deja una lista residual para abordar uno a uno con "Siguiente POI" (navegación secuencial por popups). |
| **0 POIs (todo el subconjunto del árbol)** | Igual que N — sobre todo el subconjunto filtrado. |

### Cambios en `EffectiveActionFooter.tsx`

1. **Eliminar el Caso 3** (`mode==='debt'` con `repairableCount===0` → Exportar). Primary pasa a `Resolver` con icono `Wrench`, count = `count` total del subconjunto (no `repairableCount`).
2. **Caso 1** (hay reparables) sigue siendo `Resolver` pero el onClick abre `HealthRepairPreviewDialog` (ya cableado).
3. **Caso 2** (Geo Maintenance handoff): pasa a "Más acciones" como item secundario; deja de competir por el primary.
4. Si `count===1`, el onClick dispatcha un nuevo evento `lovable:open-poi-popup` (con `locationId`) en lugar de abrir el modal de batch.
5. "Exportar" se mueve a `Más acciones` (`showExportInMenu = true` en `mode==='debt'`).
6. El hint `debtNoRepairablesHint` cambia a: "X POIs requieren intervención manual" en lugar de "no hay reparación automática".

### Integración con popup singular

- Reutilizar el listener existente que abre popup por id en `LocationMap` (ya hay infra de `requestSubsetFit` + click programático). Si no existe un evento `lovable:open-poi-popup`, añadir uno mínimo que: cierra el panel `Buscar y Filtrar`, hace `requestSubsetFit([id], { mode:'always', reason:'maintain-resolve-single' })`, y abre el popup canónico vía `map.openPopup`.

### Procesamiento batch ("lo posible de cada uno")

`HealthRepairPreviewDialog` ya particiona en `repairable / systemDebt / review / identityIncomplete / nonRepairableByType`. Ampliar su CTA principal para que:
- Lance auto-fix sobre `repairable + systemDebt (si capability)`.
- Para el residual (`A + C + nonRepairableByType`), ofrezca un botón **"Resolver uno a uno"** que entra en modo navegación: cierra el modal, abre el primer POI residual en popup, y deja un mini-HUD `[1/N] · Siguiente →` para iterar.

### Postcondiciones (engineering discipline)

- `APP_VERSION` → bump patch (1.5.1) — cambio de comportamiento UX, no schema.
- Memoria nueva: `mem://ui/discovery/maintain-footer-resolve-canon` — primary siempre Resolver, export demoted a menú, 1-POI = popup singular, N-POIs = batch+residual.
- Contract test: `src/test/maintain-footer-primary-resolve.test.ts` asserta que en `mode='debt'` el primary jamás tiene `data-testid='footer-primary-export'`.
- Actualizar memoria existente `mem://logic/health/repair-progress-attach` (referencia al nuevo flujo singular).
- Doc: añadir sección "Mantener · Resolver canónico" a `docs/contracts/poi-identity-root-status-contract.md`.

### Fuera de alcance

- No tocar `mode='all'` (Explorar) — ahí Exportar SÍ es primary legítimo (es tu petición original asunto 2).
- No tocar `mode='unenriched'` — primary sigue siendo "Enriquecer IA".
- No tocar el partitioner ni el contrato A/B/C/D.
- No tocar capabilities ni RLS.

## Pregunta de confirmación

Sobre el caso **1 POI seleccionado**: ¿quieres que el panel `Buscar y Filtrar` se **cierre** al abrir el popup (mi propuesta), o que se quede abierto colapsado a la izquierda para volver al listado sin perder contexto?
