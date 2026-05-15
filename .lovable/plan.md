## Objetivo
Eliminar el patrón "fila visible y aparentemente clickable que entra en noop silencioso" en el popover **Mis POI** (y selectores equivalentes), formalizando un contrato de interacción común a TODAS las filas, no una excepción para `empty`.

## Contrato de interacción del selector (regla sistémica)

Toda fila de un selector tipo popover obedece UNA de dos reglas, sin terceros estados:

1. **Interactiva** (visible, no `aria-disabled`, sin estilo disabled):
   - SIEMPRE responde al click.
   - Re-click sobre el item ya activo = reafirmación de intención:
     - re-emite el evento de aplicación del filtro (mismo `axis`/`value`),
     - replayea fit/refocus si el axis lo define como side-effect,
     - cierra el popover,
     - genera traza observable (Camera QA / heavy-ops).
   - Click sobre item inactivo = activación normal.
   - **Prohibido**: silent noop, early return por "ya activo", `blockReentry` que aborte sin feedback.

2. **No interactiva** (disabled):
   - `aria-disabled=true`, `pointer-events: none` o estilo disabled inequívoco,
   - no responde al click,
   - no emite eventos.

No existe estado intermedio "activa pero ignora click".

## Dónde vive la lógica

Se centraliza en el selector, no en cada axis (`visual`/`health`/`all`):

- **`MyCatalogQuickFilters`** deja de ramificar comportamiento por valor (`empty`, `enriched`, etc.). El handler común de cualquier fila ejecuta el contrato anterior.
- Helper único `applyRow({ axis, value })` que:
  - decide `isRecenter` = (mismo axis+value que el activo),
  - garantiza emisión del evento `lovable:my-catalog-popover-applied`,
  - cierra el popover SIEMPRE,
  - sólo evita `setFilters` cuando no hay cambio real de selección (recenter puro),
  - libera/coordina `heavy-operations` sin que `blockReentry` produzca aborto silencioso (si está bloqueado, debe haber feedback observable o ignorarse a nivel UI mostrando estado loading explícito).
- `Row` deja de exponer estado mixto: o es interactiva (y delega 100% al handler común) o se marca disabled.

## Tooling QA alineado al contrato

- Camera QA panel y harness Playwright validan el contrato sobre TODAS las filas:
  - `filter-all`, `filter-enriched`, `filter-imported`, `filter-empty`, y filas de salud,
  - test parametrizado: por cada fila, primer click activa + segundo click replayea (Δ`totalRequests`=2, popover cerrado, trace con dos eventos canónicos).
- Suite falla si cualquier fila interactiva produce `totalRequests` sin incremento esperado o si el popover queda abierto.

## Documentación / contratos

- Actualizar **`docs/contracts/subset-fit-contract.md`** y **ADR-0004 (My POI popover)** con la regla "re-click = reafirmación, nunca noop".
- Añadir nota al contrato `mem://logic/operations/heavy-operations-feedback` aclarando que `blockReentry` no puede traducirse en noop visual; debe verse como estado `pending` o ignorarse en la decisión de UI.

## Restricciones

- **No tocar la lógica de cámara** (`subset-fit`, listener, cooldown, FIT_REASONS).
- **No introducir excepciones por valor** (`empty`, `enriched`...). El fix vive en el selector.
- Cumplir Core: helpers centralizados, sin parches puntuales.

## Resultado esperado

- Cualquier fila visible del popover responde al click; si no debe responder, aparece como disabled.
- Re-click sobre filtro activo (incluido "Vacíos"): cierra popover, re-emite evento, redispara fit, incrementa `totalRequests`, deja traza.
- Cero ramas `if (value === 'empty')` o equivalentes en el código del popover.

## Archivos previstos

- `src/components/toolbar/MyCatalogQuickFilters.tsx` — refactor del handler común y de `Row`.
- `src/shared/operations/heavy-operations-store.ts` — sólo si hace falta exponer un modo "permitir reentrada con feedback" para acciones idempotentes; si no, se ajusta el caller.
- `e2e/camera-qa.spec.ts` — test parametrizado por fila.
- `docs/contracts/subset-fit-contract.md`, `docs/adr/0004-my-poi-popover.md` — documentar contrato.