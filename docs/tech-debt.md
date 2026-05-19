# Technical Debt

Estado inicial: 2026-05-19

## Objetivo

Mantener una lista pequeña, accionable y priorizada de deuda técnica de Vandits.

La prioridad debe combinar impacto en producto, riesgo operativo y facilidad de resolución.

## Estado auditado

Última revisión: 2026-05-19

| Ítem | Estado | Tipo | Comentario |
|---|---|---|---|
| 1. Versionado y documentación de estado | Resuelto formalizado | Gobernanza | `package.json`, README, UX y documentación quedan alineados en `1.2.2`. |
| 1.1. Materializar rollback anchors con tags Git | Pendiente operativo | Release management | Rollback anchors documentados; faltan tags Git reales `v1.1.1`, `v1.2.0`, `v1.2.1`, `v1.2.2`, `v1.2.3`, `v1.2.4`, `v1.2.5`, `v1.2.6`, `v1.2.7`. |
| 2. Catálogo de eventos globales | En progreso | Arquitectura | Inventario inicial + helper tipado parcial para eventos de Index/welcome/pending validations; faltan prefijos, catch-alls y cobertura completa. |
| 3. Tests de gramática visual de puntos | Resuelto | Testing | Cubierto por `src/test/point-visual-state.test.ts` (11 casos para `enriched`, `imported`, `empty`). |
| 4. Foto de arquitectura actual | Resuelto | Documentación técnica | Cubierto por `docs/architecture/current-architecture.md`. |
| 5. Reducir responsabilidad de `Index.tsx` | Resuelto (2026-05-19) — tercera extracción incremental completada en v1.2.6 | Refactor | `v1.2.4` extrae `useWelcomeCardEvents`; `v1.2.5` extrae `usePendingValidationEvents`; `v1.2.6` extrae `useIndexGlobalEvents` + `useRoutePanelBridge`. Sin `window.addEventListener` inline en `Index.tsx`; puente routes panel encapsulado. |
| 6. Reducir responsabilidad de `LocationMap.tsx` | Abierto | Refactor alto riesgo | Extraer incrementalmente sin reescritura. |

Criterio de auditoría:

- `Resuelto formalizado`: completado y alineado con documentación/versionado actual.
- `Pendiente operativo`: documentado, pero falta una acción externa o de release.
- `Abierto`: deuda conocida, priorizada y aún no ejecutada.

## Deuda priorizada

### 1. Versionado y documentación de estado

- Severidad: baja
- Facilidad: alta
- Riesgo de cambio: bajo
- Estado: resuelto formalizado (2026-05-19) — `package.json` y README quedan alineados en **1.2.2**. `1.2.0` y `1.2.1` se formalizan desde el histórico reconstruido como anchors estables; `1.2.2` pasa a ser la versión actual. A partir de ahora cada PR debe declarar `Version impact` (none/patch/minor/major) según [`docs/versioning.md`](./versioning.md). Las versiones estables deben poder usarse como rollback anchors mediante tags Git `vX.Y.Z` (ver "Release / rollback anchors" en [`docs/releases/version-history.md`](./releases/version-history.md)).

`package.json`, README y documentación técnica deben contar la misma historia sobre la versión y el estado actual del proyecto.

### 1.1. Materializar rollback anchors con tags Git

- Severidad: media
- Facilidad: alta
- Riesgo de cambio: bajo
- Estado: pendiente operativo (2026-05-19)

La documentación de versionado ya define rollback anchors, pero faltan los tags Git reales:

- `v1.1.1`
- `v1.2.0`
- `v1.2.1`
- `v1.2.2`
- `v1.2.3`
- `v1.2.4`
- `v1.2.5`
- `v1.2.6`
- `v1.2.7`

Hasta crear esos tags, el rollback está definido documentalmente pero no materializado como mecanismo técnico.

No crear los tags desde Lovable si no existe soporte explícito para operaciones Git.

Los documentos pueden definir los anchors, pero el cierre de esta deuda requiere crear los tags reales en GitHub o por git local. No basta con actualizar documentación.

Cierre documental: completo. Cierre operativo: pendiente. La creación de tags Git reales queda fuera de Lovable y debe hacerse desde GitHub o git local.

### 2. Catálogo de eventos globales

- Severidad: media
- Facilidad: media
- Riesgo de cambio: bajo si se empieza documentando
- Estado: en progreso — helper tipado inicial creado (2026-05-19, v1.2.7). Ver [`docs/architecture/global-events.md`](./architecture/global-events.md) sección "Typed helper baseline" y `src/lib/global-events.ts`. Cubre 9 eventos iniciales (subset del catálogo) y los 3 hooks ya extraídos de `Index.tsx` (`useWelcomeCardEvents`, `usePendingValidationEvents`, `useIndexGlobalEvents`). Pendiente: tipado completo (`WindowEventMap` u homólogo), unificación de prefijos, sustitución de catch-alls (`store-updated`, `reload-locations`) y migración del resto del bus.

Vandits usa varios eventos globales vía `window.dispatchEvent` / `window.addEventListener`.

Antes de refactorizarlos, documentar nombre, payload, emisor y consumidor.


### 3. Tests de gramática visual de puntos

- Severidad: media
- Facilidad: alta
- Riesgo de cambio: bajo
- Estado: resuelto (2026-05-19) — cubierto por `src/test/point-visual-state.test.ts`.

Blindar `src/domains/content/lib/point-visual-state.ts` con tests unitarios para los estados `enriched`, `imported` y `empty`.

### 4. Foto de arquitectura actual

- Severidad: media
- Facilidad: media
- Riesgo de cambio: bajo
- Estado: resuelto (2026-05-19) — cubierto por `docs/architecture/current-architecture.md`.

Crear documentación breve de dominios, stores, mapa, popups, Supabase, rutas, colecciones, back office y eventos globales.

### 5. Reducir responsabilidad de `src/pages/Index.tsx`

- Severidad: media
- Facilidad: media
- Riesgo de cambio: medio
- Estado: resuelto (2026-05-19, `v1.2.6`) — tercera extracción incremental completada.

`Index.tsx` actúa ahora como composición/wiring de alto nivel: ya no contiene `window.addEventListener` inline ni puentes manuales triviales hacia `routeOrch`.

Extracciones realizadas:

- `v1.2.4`: `useWelcomeCardEvents` (`src/hooks/use-welcome-card-events.ts`) — listeners de `vandits:open-upload`, `vandits:open-profile`, `admin:open-geography`, `admin:open-data-sources`.
- `v1.2.5`: `usePendingValidationEvents` (`src/hooks/use-pending-validation-events.ts`) — listener `pending-validations-updated` + estado local `pendingValidationsCount` / `pendingValidationNames`.
- `v1.2.6`: `useIndexGlobalEvents` (`src/hooks/use-index-global-events.ts`) — listeners `enrichment-criteria-changed`, `import:open-categories`, `lovable:follow-changed`, `popup-action`. `useRoutePanelBridge` (`src/hooks/use-route-panel-bridge.ts`) — puente `routesPanelOpen` / `routeBuilderOpen` ↔ `routeOrch`.

Cierre: ningún listener global queda inline en `Index.tsx`; cualquier reducción adicional cae ya en refactor estructural (composición de paneles), no en deuda activa de este ítem. Reducciones futuras se trackean como ítems nuevos si aplica.

### 6. Reducir responsabilidad de `src/components/LocationMap.tsx`

- Severidad: alta
- Facilidad: baja
- Riesgo de cambio: alto

`LocationMap.tsx` concentra lifecycle de mapa, markers, clusters, popups, capas, rutas, realtime, geolocalización, cámara y eventos.

No abordar como reescritura. Extraer incrementalmente manteniendo contratos.
