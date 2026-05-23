# P2 Dev Runner — Plan (frozen)

**UTC:** 2026-05-23T15:35:00Z
**Status:** approved + addendum applied (naturaleza temporal / no UX).
**Scope:** una herramienta CLI interna y temporal para drenar la cola
histórica de POIs D pendientes de auto-enrich (P2) sin depender del
chat/sandbox. Reutiliza el orquestador server-side ya validado
(`enrich-batch-orchestrator`). No crea edge functions nuevas, no crea
tablas nuevas, no toca UI, no toca canon, no toca marker fill, no
toca `computePoiMaturity`, no toca FKs/admin geography, no llama a
Nominatim, no incluye P1-w2, no incrementa la versión.

---

## Naturaleza temporal / no UX

Esta herramienta es **interna**, **temporal** y de **mantenimiento**.

Objetivo:

Cerrar la cola histórica P2 actual de POIs D pendientes de
auto-enrich sin depender del chat/sandbox.

**No es:**

- un panel UX;
- una funcionalidad para usuarios;
- un flujo permanente de producto;
- una sustitución del pipeline normal de enrichment.

**Una vez vaciada la cola P2:**

- generar reporte final de cierre;
- dejar la herramienta marcada como dev-only / maintenance-only;
- no exponerla en UI;
- no convertirla en flujo de usuario;
- conservarla solo para contingencias controladas.

**Regla del flujo normal futuro:**

```
nuevo POI → clasificación A/B/C/D → si D, enrichment normal.
```

**No batch manual recurrente.**

---

## 1. Entregables

```
scripts/p2/
  dev-run-poi-identity-p2.ts          # CLI entrypoint (Deno)
  lib/
    state.ts                          # status() — read-only
    seed.ts                           # construye lote D válido
    gates.ts                          # invariantes y stop conditions
    report.ts                         # genera markdown en docs/audits
    pilot100-gate.ts                  # exige Pilot-100 PASS para size>100
    http.ts                           # cliente HTTP al orquestador
    env.ts                            # resolución de SUPABASE_URL + SERVICE_ROLE
  README.md                           # uso operativo + naturaleza temporal
  __tests__/
    dev-runner.test.ts                # tests mínimos (Deno)
docs/audits/
  poi-identity-p2-dev-runner-plan.md  # este documento, congelado
```

Ejecutable:

```
deno run -A scripts/p2/dev-run-poi-identity-p2.ts <command> [flags]
```

Requiere `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en el entorno.
Sin estas variables, exit 1 con mensaje claro. No expone endpoint web
nuevo. No hay UI. No se montará en `src/` ni en ninguna ruta.

---

## 2. Comandos

| Comando        | Side-effects                                                                                                                       | Confirmación                                  |
|----------------|------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------|
| `status`       | NINGUNO (read-only: `read_query` + GET `/status`)                                                                                  | no                                            |
| `report`       | escribe `docs/audits/poi-identity-p2-<label>-<UTC>.md`                                                                             | no                                            |
| `close-current`| read-only salvo: si stuck → 1 `/watchdog`; si success-sin-persistencia → marca run como `aborted` con reason (UPDATE directo)      | sí                                            |
| `pause`        | POST `/pause` al run activo                                                                                                        | sí                                            |
| `resume`       | POST `/start` (background) al run pausado tras revalidar salud                                                                     | sí                                            |
| `abort`        | UPDATE directo `enrichment_batch_runs SET status='aborted', abort_reason=<reason>` (el orquestador no expone `/abort`)             | sí + `--reason "<texto>"` obligatorio         |
| `next-batch`   | seed + POST `/start` (background); aplica filtro D estricto + Pilot-100 gate                                                       | sí; `--size > 100` exige `--confirm` Y gate    |

En esta entrega sólo se ejecutarán `status` (una vez) y los tests. El
resto queda implementado pero **no se invoca** hasta aprobación
explícita posterior.

---

## 3. Reglas duras

### Pre-seed (filtros sobre `locations`)

- `geo_health = 'ok'`
- `is_approved = true`
- `country_code IN TERRITORIAL_CANON`
- `enriched_data ->> 'descripcion' IS NULL OR length(trim(...)) = 0`
- `enrichment_status IS DISTINCT FROM 'in_progress'`
- `deleted_at IS NULL`
- `owner_user_id IS DISTINCT FROM SANDBOX_OWNER_UID`
- Exclusión nominal de IDs históricos: Tolar Grande, Eisriesenwelt,
  Burg Hochosterwitz, Mattsee.
- Doble validación: cada candidato pasa por
  `classifyPoiIdentityRootStatus` (SoT compartida) y se descarta si
  `root !== 'D'` o `eligibleForAutoEnrich === false`. Esto cubre A,
  B-no-resuelto, C, hardError, under_review, unresolved_flag,
  invalid_coordinates, fixtures y canon_gap.

### Pre-start (sobre el run nuevo)

- `max_ai_calls` obligatorio (= `batch_size`).
- `max_runtime_minutes` obligatorio (default 60).
- `max_error_rate_pct` obligatorio (default 5).
- `chunk_size = 1` (modo estable validado en Pilots).
- `confirm_full_run = true` cuando `batch_size > 50` (ya soportado por
  `budget.validateSeedConfig`; cap 250 ya desplegado).

### Stop conditions

Chequeadas por `close-current` y antes de `next-batch`:

- `error_rate > 5%` con ≥ 50 finalizados ⇒ abort + report + BLOQUEA
  `next-batch`.
- Cualquier `success` cuyo `locations.enriched_data ->> 'descripcion'`
  esté vacío ⇒ abort inmediato.
- `in_flight` con `claimed_at < now() - interval '5 min'` y
  `attempts >= 3` ⇒ huérfano no recuperable ⇒ abort.
- Cualquier UPDATE sobre `locations` fuera de
  `{enriched_data, enrichment_status, updated_at}` por este run ⇒ el
  trigger DB ya existente lo marca `fail`; la CLI sólo cuenta error_rate.
- Mención literal `nominatim` en `metrics.last_errors` o en
  `enrichment_batch_items.fail_reason` ⇒ abort.

### Pilot-100 PASS gate (`lib/pilot100-gate.ts`)

- Consulta el último run con `label ILIKE 'pilot100-%'`.
- **PASS** ⇔ `status IN ('completed','paused')` AND `metrics.fail = 0`
  AND `success / (success + fail + skip) >= 0.40` AND no stop
  condition AND ≥ 1 snapshot por success.
- Si NO PASS ⇒ `next-batch --size > 100` rechazado con exit 2.

---

## 4. `status` — salida

Stdout (`--json` opcional):

```
P2 STATUS @ 2026-05-23T15:30:00Z
─────────────────────────────────────────────
Active run     d0af8fe1…  pilot100-postpilot25  running
  ai_calls     12 / 100
  success      11    skip 4    fail 0    noop 0
  in_flight    1     pending 84
  error_rate   0.0%
  last update  8s ago
  stop cond.   none
Last terminal  6b44e704…  pilot25-v3  aborted (snapshot_failure)
D remaining    1,283
Pilot-100 gate PENDING (active run not terminal yet)
Next batch     blocked — wait for active run to reach terminal state
```

---

## 5. `report` — formato

Markdown en `docs/audits/poi-identity-p2-<label>-<UTC>.md` con:

- `run_id`, `label`, `scope_count`, limits
- Estado final + reason
- Métricas
- Evidencia de persistencia por success (sample 5 IDs con longitud
  `descripcion`)
- Snapshots count + idempotency check
- Skips por reason
- Failures con `fail_reason`
- Invariantes (lista fija ✅/❌)
- D restantes en cola
- Recomendación: repetir / siguiente batch / detener

---

## 6. Tests mínimos (Deno, mocks de Supabase + fetch)

1. `status() no muta` — no llama a `.insert/.update/.upsert/.delete`
   ni a `/start /pause /watchdog`.
2. `nextBatch()` bloquea si el run anterior no está terminal.
3. `nextBatch({size: 250})` bloquea si Pilot-100 gate NO PASS.
4. `batch_size > 100` requiere `--confirm`.
5. `buildSeedCandidates()` excluye canon_gap, A, B-no-resuelto, C,
   hardError, fixture, in_progress y enriched.
6. `writeReport()` genera markdown con todas las secciones obligatorias.

---

## 7. Seguridad y operación

- No nueva edge function; no nueva tabla; no nueva ruta; no UI.
- Idempotente: dos `status` consecutivos producen mismo output; dos
  `report` sobre el mismo run sobrescriben el mismo archivo (path
  determinista por `run_id + created_at`).
- Cada acción no-read se loguea como JSON estructurado a stdout y se
  recoge al final del reporte correspondiente.
- Auth: requiere `SUPABASE_SERVICE_ROLE_KEY` (master-equivalente).
  Sin esa variable, exit 1.
- README documenta prerequisitos, comandos, árbol de decisión
  (Pilot-100 → tandas de 250 hasta vaciar D), troubleshooting.

---

## 8. No-bump

Cambios: scripts dev + tests Deno + 2 archivos `docs/`. No toca código
cliente, ni edge functions, ni canon, ni P1-w2. **No bump.**

---

## 9. Fuera de scope explícito

- No ejecuta `next-batch`, `resume`, `abort`, `pause`, `close-current`
  durante esta entrega.
- No modifica el orquestador.
- No cambia el cap (sigue en 250).
- No toca Phase C, P1-w2, marker fill, computePoiMaturity, Nominatim,
  FKs, allowlist.

---

## 10. Order of operations en esta entrega

1. Escribir este plan (congelado).
2. Crear `scripts/p2/lib/*` + entrypoint + `README.md`.
3. Crear los 6 tests Deno.
4. Ejecutar tests (`deno test scripts/p2/__tests__/`) — esperar PASS.
5. Ejecutar UNA sola vez `status` contra el run actual
   `d0af8fe1-7b3b-4120-87fc-5c9915a20941`.
6. NO ejecutar ningún comando mutativo.
