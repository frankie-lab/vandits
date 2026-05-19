# PR-BACKOFFICE-DISCOVERY-DOSSIER-1 — Discovery sistémico definitivo (revisado)

**Propósito**: producir un dossier maestro + diagramas que modelen el BackOffice en 19 ejes, basados en **evidencia trazable del código**. Sin rediseño, sin runtime, sin RLS, sin schema, sin capabilities, sin migraciones. Las recomendaciones son **diagnóstico**, no autorización de cambios.

## Cambios incorporados respecto a la versión previa

1. Sección de inventario renombrada a **"Inventario inicial verificable"**. Toda surface descubierta durante la lectura se marca `discovered_during_audit: true`.
2. Cada surface lleva **bloque de evidencia obligatorio**.
3. Baseline de 24 surfaces se **valida contra código** (no se asume cerrado).
4. Vocabulario permitido para campos sin evidencia: `unknown` | `inferred` (con justificación). **`TBD` prohibido.**
5. Matriz final añade columnas `evidence_summary` y `reason`.
6. Diagramas se guardan en **`docs/audits/diagrams/*.mmd`** (repo). `/mnt/documents/` solo como copia opcional para preview.
7. Memoria `mem://governance/backoffice-discovery-dossier` es **entregable secundario**, no sustituto del doc en repo.
8. **Profundidad proporcional**: audit completo para tabs complejos y operaciones; audit resumido para confirms y wrappers simples. Todos aparecen en inventario y matriz.
9. Recomendaciones son **diagnóstico**. Set permitido: `KEEP | SPLIT | DOWNGRADE | MOVE | REMOVE | DEBUG_ONLY | MERGE | NEEDS_DECISION`. Ninguna implica ejecución.

## Bloque de evidencia obligatorio (por surface)

```text
evidence:
  file:           src/...           # ruta exacta verificada
  route:          /admin/<key>      # o "embedded in <parent>" | "none"
  component:      <ExportedName>
  capability:     <cap | none | inferred:<cap>>
  imports:        [hook/service/store relevantes]
  reads:          [tablas, edge fns, stores]
  writes:         [tablas, RPCs, edge fns, stores]
  source_of_truth: <tabla|app_settings|store|edge fn|unknown>
  anchor:         <ref a memoria/contrato existente | none>
  discovered_during_audit: <true|false>
```

Campos sin evidencia directa → `unknown` o `inferred:<motivo corto>`. Nunca `TBD`.

## Baseline de surfaces (24 — a validar contra código)

Fuente verificada: `src/components/admin/admin-tabs.tsx` (12 tabs), `src/pages/admin/AdminShell.tsx`, `src/pages/admin/AdminRoutePage.tsx`, `src/components/AdminPanel.tsx`. Si la lectura descubre más, se añaden con `discovered_during_audit: true`.

**Principales (12 tabs)**: users, permissions, markers, routes, icons, enrichment, sources, geography, image-recovery, audit, design-system, internal-tools.

**Secundarias/chrome (9 candidatas)**: `AdminShell`, `AdminShellIndex`, `AdminGate`/`AdminGateDenied`, `AdminBrokenUsersList`, `PanelEffectHeader` + `EffectBadgeRow`, `OperationStatusCard`, `EditModeBar` (design-system), `RouteSettingsPanel` modal-wrapper legacy, `CameraFitQaGate` (overlay `?qa=1` relacionado con `view_audit_log`).

**Confirms (3 dialogs)**: purge-user, permissions-toggle, geo-canonicalize.

Total baseline: **24**. Final puede crecer.

## Profundidad por categoría

| Categoría | Profundidad |
|---|---|
| Tabs complejos (geography, image-recovery, enrichment, permissions, design-system, users) | **Audit completo** (19 secciones aplicables, ASCII anatomy, journeys) |
| Tabs medios (sources, routes, markers, icons, audit, internal-tools) | **Audit completo** sin ASCII denso; journeys cortos |
| Chrome (AdminShell, AdminShellIndex, AdminGate, PanelEffectHeader, OperationStatusCard, EffectBadgeRow) | **Audit resumido**: rol estructural, no operacional |
| Wrappers/embebidos (AdminBrokenUsersList, RouteSettingsPanel modal-wrapper, EditModeBar, CameraFitQaGate) | **Audit resumido** |
| Confirms (3) | **Audit resumido**: typed-token, scope, irreversibilidad |

Todas aparecen en inventario y en la matriz final, completas o resumidas.

## Entregable principal — documento maestro

`docs/audits/backoffice-discovery-dossier.md` con las 19 secciones del brief en orden:

1. Inventario inicial verificable (tabla con bloque de evidencia por surface)
2. Functional surface audit (CONFIG/OPERATION/DATA/OBSERVABILITY/INSPECTOR/DEBUG/CONFIRM/HYBRID)
3. Visual anatomy (ASCII + conteos: cards/CTAs/badges/toggles/tablas/collapsibles/inputs/scrolls)
4. Operational usage (`unknown` permitido si no hay telemetría)
5. User journeys por rol (master/admin/moderator/editor)
6. Action hierarchy
7. Error / failure states
8. Empty / loading states
9. Dependency / causality map
10. Ownership / authority map
11. Permission visibility (matriz rol×surface)
12. Design system compliance
13. Telemetry / auditability
14. Responsive / viewport
15. Copy / terminology
16. Growth / lifecycle canon
17. Family system (7 familias × estructura/layout/density/scroll/footer/header/action/responsive)
18. **Matriz final** con columnas: `surface | family | ownership | runtime | risk | frequency | complexity | recommendation | evidence_summary | reason`
19. Restricciones (eco literal del brief)

## Diagramas (en repo)

`docs/audits/diagrams/`:
- `backoffice-family-system.mmd`
- `backoffice-ownership-map.mmd`
- `backoffice-dependency-graph.mmd`
- `backoffice-navigation-graph.mmd`
- `backoffice-lifecycle.mmd`
- `backoffice-causality-cascades.mmd`

Copia opcional en `/mnt/documents/` solo para que el usuario pueda abrirlos como artifacts en la preview (no es la ubicación primaria).

## Entregables secundarios

- `mem://governance/backoffice-discovery-dossier` — puntero al doc + regla: *"Toda surface nueva del BackOffice debe declarar `family`, `ownership_domain`, `runtime_semantics` e `interaction_type` y registrar evidencia ANTES de diseñar layout."*
- Añadir línea en `mem://index.md` (Memorias, no Core), sin tocar el resto del archivo.

## Método de trabajo

1. **Lectura verificadora** (sólo `code--view`/`rg`): admin-tabs, AdminShell, AdminRoutePage, AdminPanel, 12 panels, 3 confirms, chrome candidato. Cada lectura confirma o descubre surfaces.
2. **Rellenar evidencia** por surface antes de juzgar interacción/familia.
3. **Generar 6 diagramas** en `docs/audits/diagrams/`.
4. **Compilar** `docs/audits/backoffice-discovery-dossier.md` en una pasada.
5. **Crear memoria secundaria** y actualizar `mem://index.md`.

## Criterio de aceptación

- 100% de surfaces del baseline + descubiertas presentes en inventario y matriz.
- Bloque de evidencia completo para cada una; sin `TBD`.
- 19 secciones presentes; cada celda sin datos marcada `unknown` o `inferred:<motivo>`.
- 6 diagramas `.mmd` versionados en `docs/audits/diagrams/`.
- Matriz final con `evidence_summary` y `reason` para cada surface.
- Recomendaciones diagnósticas en el set permitido; ninguna acción ejecutada.

## Fuera de alcance (explícito)

- No rediseño, no nuevos componentes, no nuevos tamaños/cards/layouts.
- No runtime, RLS, schema, capabilities, migraciones, refactors visuales grandes.
- Las recomendaciones **no abren PRs** ni autorizan cambios. Sirven como backlog priorizable posterior.

¿Apruebas para redactar?
