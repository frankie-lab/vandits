# Root Status Resolution Contract — A/B/C/D

Status: NORMATIVE (docs-only). No code, no schema, no data, no bump.

## 1. Propósito y alcance

Define un **patrón operativo único** para tratar POIs por Root Status A/B/C/D
en cualquier superficie de triage o resolución:

- Buscar y Filtrar → Mantener → Con deuda → Resolver deuda.
- Mantenimiento (Geo Maintenance, backfill, canonicalize).
- Futuras colas (revisión, identidad, enrichment scoped).

Este contrato **extiende** `docs/contracts/poi-identity-root-status-contract.md`
(clasificación A/B/C/D) a la **capa operativa** (qué se puede hacer con cada
grupo y bajo qué reglas). Es **ortogonal** a:

- POI-N visual (`docs/contracts/poi-maturity-visual-contract.md`,
  `marker-fill-canon-v3.md`).
- Health rings (`mem://style/map/health-rings-rule`).
- Marker fill canónico.

No los modifica.

## 2. Patrón común de resolución

Toda superficie que presente POIs por Root Status debe ofrecer la misma
secuencia, en este orden:

1. **Clasificar** cada POI en A/B/C/D usando el SoT
   (`classifyPoiRootStatusForLocation` + espejo Deno
   `_shared/poi-identity-root-status.ts`).
2. **Agrupar** por Root Status (4 grupos como máximo).
3. **Explicar** el grupo: por qué está ahí y qué responsabilidad implica.
4. **Listar POIs** del grupo de forma expandible.
5. **Recomendar acción** principal del grupo (puede ser "futura").
6. **Acción por grupo** si existe flujo real y seguro.
7. **Acción por POI** (abrir popup, abrir editor, ver en mapa).
8. **Exportar grupo** (respetando `evaluatePoiExport`).
9. **Abrir grupo en mapa** (vía `requestSubsetFit`).
10. **Confirmar antes de escribir** cualquier mutación.
11. **Auditar / progresar** si el flujo encola un job asíncrono.

Los pasos 1–10 son **obligatorios** para todos los grupos. El paso 11 aplica
sólo a grupos cuya acción real escribe datos.

## 3. Matriz canónica A/B/C/D

| Grupo | Responsable | Acciones permitidas | Acciones prohibidas | Capability | Job/flujo | Rings | POI-N cap |
|-------|-------------|---------------------|---------------------|------------|-----------|-------|-----------|
| **A** Incompleto real | Usuario / owner | Ver, abrir mapa, exportar, abrir editor de identidad (cuando exista), completar datos mínimos | Auto-enrich, health repair masivo, backfill masivo | — (owner) | Editor identidad (futuro inline) | Bloquea rings | POI-0..POI-3 |
| **B** Sistema / canon | Sistema | Ver, abrir mapa, exportar, abrir Geo Maintenance (si capability + nav + scope), encolar backfill/canon **con preview** | Repair desde Resolver deuda, auto-enrich directo, acción sin capability | `view_geo_maintenance`, `run_geo_backfill`, `run_geo_canonicalize` (master) | `GeographyBackfillPanel`, `canonicalize-admin-areas` | Difiere a sistema | POI-4..POI-6 |
| **C** Revisión / incoherencia | Usuario / revisión | Ver, abrir mapa, exportar, abrir cola de revisión (cuando exista), resolver 1 a 1 | Auto-enrich, health repair masivo, backfill ciego | — (owner) | Cola de revisión (futura) | Bloquea rings | POI-3..POI-4 |
| **D** Coherente | Automático (si gates) | Reparar `partial`/`chain` vía `enqueue_health_repair`, enrich automático si no enriquecido y gates OK, exportar, abrir mapa | Saltar evaluate/enrichment gates, reparar `hardError`/`review` automáticamente | — (worker) | `enqueue_health_repair`, `enrich-location` | Habilita rings | POI-4..POI-10 |

**Invariante**: **D es el único estado con escritura automática permitida**.
A, B y C **nunca** entran en `enqueue_health_repair` ni en pipelines IA
automáticos. Cualquier acción que muten datos para A/B/C debe ser explícita
y confirmada por el usuario o el operador con capability adecuada.

## 4. Regla de escritura (DURA)

**Ningún click directo desde una superficie de triage escribe datos.**

Todo flujo que mute datos debe:

1. Abrir **preview** del scope.
2. Mostrar **IDs y counts** exactos.
3. Pedir **confirmación explícita** (typed-token cuando aplique).
4. Operar sobre **allowlist** de columnas/filas (nunca free-write).
5. Escribir **audit log** (`health_repair_actions`, `operation_runs` futuro, etc.).
6. Mostrar **progreso** si el job es asíncrono (lanes del bottom-progress
   `mem://ui/bottom-progress-multi-lane`).

Aplica a A, B, C y D por igual. D no es excepción: el preview existe en
`HealthRepairPreviewDialog` y la confirmación es el botón "Confirmar reparación".

## 5. Regla de UI (DURA)

Cada grupo A/B/C/D mostrado en una superficie de triage debe exponer **como
mínimo**:

- **count** del grupo.
- **explicación** corta (1–2 líneas) de por qué está ahí y quién responde.
- **lista expandible** de POIs.
- **acción recomendada** (string, puede decir "futura").
- **Exportar grupo** (si hay POIs elegibles según `evaluatePoiExport`).
- **Abrir grupo en mapa** (`requestSubsetFit` con `reason` específico).
- **Abrir POI en mapa** (acción por fila).

Si una acción específica del grupo **no existe todavía**:

- **NO** mostrar botón falso.
- Mostrar texto "Acción recomendada: X (futuro)".
- Documentar la entrada en backlog (`docs/audits/...-gaps-audit.md`).

Esto impide la proliferación de botones que abren cosas que no existen,
mezclan grupos, o escriben sin preview.

## 6. Capabilities

Mapeo a capabilities canónicas (SoT cliente
`src/domains/identity/capabilities.ts`, espejo Deno
`supabase/functions/_shared/capabilities.ts`):

| Acción | Capability | Notas |
|--------|------------|-------|
| Ver / abrir mapa / abrir POI | — | Disponible para owner sin gating extra. |
| Exportar grupo | — (gating en `evaluatePoiExport`) | `scope='internal'` exige `ownerUserId === currentUserId`. |
| Abrir Geo Maintenance (grupo B) | `view_geo_maintenance` | admin + master. |
| Encolar backfill scoped (grupo B) | `run_geo_backfill` | admin + master. Preview obligatorio. |
| Canonicalize (grupo B) | `run_geo_canonicalize` | master only. Typed-token `CANONICALIZE`. |
| Reparar deuda (grupo D) | — (owner del scope) | RPC `enqueue_health_repair` con allowlist `repairableIds`. |
| Enrich automático (grupo D) | — (worker) | Gated por `evaluatePoiExport` + coord-coherence. |

Reglas de gating UI:

- Si el usuario **no** tiene la capability → el botón **no se renderiza**
  (no `disabled` opaco). Aplica patrón `useCapability` cliente.
- Si la capability existe pero el flujo destino **no acepta scope por IDs**
  → tratar como "flujo no existe": no botón, texto "futuro".

## 7. Relación con otros contratos

- **POI-N visual** (`poi-maturity-visual-contract.md`,
  `marker-fill-canon-v3.md`): A/B/C/D **no cambia** fill del marker ni
  modifica POI-N. Sólo se usa como capa auxiliar (badge/tooltip/filtro).
- **Health rings** (`mem://style/map/health-rings-rule`): rings = deuda
  **objetiva**. A y C **bloquean** que los rings se actúen (ni repair ni
  enrich). B **difiere** la reparación al canal sistema. D los **habilita**.
- **Export** (`docs/contracts/poi-export-contract.md`): "Exportar grupo"
  respeta `evaluatePoiExport`. A/B/C son típicamente `internal-only` (no
  alcanzan POI-9/10). D enriched puede ser público.
- **Enrichment coord coherence**
  (`docs/contracts/enrichment-coord-coherence-contract.md`): sólo
  `D ∩ eligibleForAutoEnrich` entra al pipeline IA. A/B/C son skip silencioso.
- **Resolver deuda triage** (`docs/audits/health-repair-triage-dialog-plan.md`):
  es el **primer caso de aplicación** de este patrón. Cualquier superficie
  futura debe seguir el mismo contrato.

## 8. Tests futuros (no implementar ahora)

Cuando se materialicen flujos nuevos, los contract tests requeridos son:

- **Partición exhaustiva**: A+B+C+D == scope total, sin solapes
  (ya cubierto por `health-repair-partition.test.ts`).
- **No-RPC-para-A/B/C**: `enqueue_health_repair` jamás recibe IDs de A, B
  o C. La allowlist `repairableIds` SoT.
- **No-botón-fantasma**: si capability ausente o flujo destino inexistente,
  el botón no se renderiza (test de DOM).
- **Preview-antes-de-escribir**: toda acción que mute datos abre dialog
  intermedio; el click directo no dispara mutación.
- **Audit-log-presente**: toda mutación deja fila en su log canónico
  (`health_repair_actions` u homólogo).
- **Scope-por-IDs**: cuando un flujo acepta IDs, el payload contiene
  estrictamente los IDs del grupo, no el universo.

## 9. Restricciones explícitas

Este contrato **no**:

- crea schema, columnas ni enums.
- añade nuevos jobs.
- modifica RPC existentes.
- cambia marker fill ni POI-N.
- cambia health rings.
- introduce nuevos gates de visibilidad ni de export.
- requiere bump.

Su único efecto es **normativo**: cualquier PR futuro que toque triage de
A/B/C/D debe cumplirlo o justificar excepción en su postflight.

## 10. Referencias

- `docs/contracts/poi-identity-root-status-contract.md` — clasificación A/B/C/D.
- `docs/contracts/poi-maturity-visual-contract.md` — POI-N visual.
- `docs/contracts/marker-fill-canon-v3.md` — marker fill.
- `docs/contracts/poi-export-contract.md` — export gating.
- `docs/contracts/enrichment-coord-coherence-contract.md` — gates IA.
- `docs/audits/health-repair-triage-dialog-plan.md` — primer caso aplicado.
- `docs/audits/root-status-resolution-current-gaps-audit.md` — auditoría hoy.
- `mem://style/map/health-rings-rule` — rings.
- `mem://ui/bottom-progress-multi-lane` — lanes de progreso.
- `src/components/discovery/health-repair-partition.ts` — partición canónica.
- `src/domains/identity/capabilities.ts` — SoT cliente capabilities.
- `supabase/functions/_shared/capabilities.ts` — espejo Deno.
