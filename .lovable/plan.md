# Cierre PR-3B · Validación seguridad + QA (v3)

Refinamientos v3 aceptados:
1. Audit SIEMPRE persiste cuando el input es válido (incluido `no_eligible`).
2. `partial_skip` se calcula contra el **input válido tras cap/ownership/salud/dedup**, no contra el raw input. Así no mezclamos "basura enviada por el cliente" con "descarte operativo legítimo".
3. Taxonomía de respuesta clara y exclusiva.

## 0. Taxonomía de respuesta de la RPC

| Caso | Resultado |
|---|---|
| **Errores de contrato** (auth, action inválida, scope inválido, `_location_ids` vacío/NULL) | `RAISE EXCEPTION` — sin audit, sin job |
| **Input válido pero 0 elegibles** tras filtrar (ownership + no borrados + salud + dedup contra job activo) | Audit `status='no_eligible'`, `location_ids=[]`, `location_count=0`, `job_id=NULL`, `enqueued_count=0` |
| **Input válido, parte encolada** (`_enq < _eligible_count`) | Audit `status='partial_skip'`, `location_ids = IDs encolados`, `location_count = _enq`, `job_id`, `enqueued_count = _enq` |
| **Input válido, todo encolado** (`_enq = _eligible_count`) | Audit `status='enqueued'`, `location_ids = IDs encolados`, `location_count = _enq`, `job_id`, `enqueued_count = _enq` |

Donde `_eligible_count = |IDs propios ∧ no borrados ∧ salud coincide con _action|`. El cap defensivo (5000) y la dedup contra el job activo se aplican **después** de calcular `_eligible_count`, así que reducen `_enq` pero no `_eligible_count`. Resultado: si el cliente manda 10k IDs sanos bajo `partial`, NO es `partial_skip` — es `no_eligible` (los 10k cayeron por salud, ninguno era elegible). Si manda 100 con salud `partial` y 50 ya están en cola, es `partial_skip` (50 elegibles, 50 encolados).

## 1. Auditoría servidor — qué ya está bien

Inspeccionado `enqueue_health_repair` desplegada + tabla `health_repair_actions`:

| Requisito | Estado |
|---|---|
| Sólo POIs propios | OK (`WHERE l.owner_user_id = _caller`) |
| `action ∈ {partial, chain}` | OK |
| `scope_mode ∈ {filtered, selection, viewport}` | OK |
| IDs existen y no borrados | OK |
| Cap máximo IDs | OK (`_cap = 5000`) |
| Rechaza `hardError` / `review` | OK |
| RLS audit (sólo dueño + admin) | OK |
| Ownership independiente del frontend | OK |

## 2. Cambios servidor (mini-migración única)

### 2a. Columna `status`

```sql
ALTER TABLE public.health_repair_actions
  ADD COLUMN status text NOT NULL DEFAULT 'enqueued'
    CHECK (status IN ('enqueued', 'partial_skip', 'no_eligible'));
```

### 2b. Filtro de salud server-side (defensa en profundidad)

En el JOIN inicial:

```sql
AND public._compute_location_geo_health_lookup(
      l.latitude, l.longitude,
      l.continent_id, l.country_id, l.region_id, l.zone_id,
      l.country, l.region, l.zone, l.country_code
    ) = ANY (
      CASE _action
        WHEN 'partial' THEN ARRAY['partial']
        WHEN 'chain'   THEN ARRAY['broken', 'stale_name']
      END
    )
```

### 2c. Reescritura del flujo (audit siempre + status correcto)

```text
1. Validar contrato → EXCEPTION si falla
   - _caller IS NULL              → 'auth required'
   - _action ∉ {partial, chain}   → 'invalid action'
   - _scope_mode inválido         → 'invalid scope_mode'
   - _location_ids vacío/NULL     → 'empty location_ids'

2. _eligible_ids := IDs ∩ (own ∧ !deleted ∧ salud_coincide(_action))
   _eligible_count := |_eligible_ids|

3. Si _eligible_count = 0:
   INSERT audit (status='no_eligible', location_ids=[], location_count=0, job_id=NULL)
   RETURN (NULL, audit_id, 0)
   ← NO crea ni toca geocoding_jobs

4. Buscar job 'running' del usuario.
   Si existe:
     _new_ids := _eligible_ids \ existing_ids
     Aplicar cap: _new_ids := _new_ids[1:(cap - |existing_ids|)]
   Si no:
     _new_ids := _eligible_ids[1:cap]
     Crear job nuevo

   _enq := |_new_ids|
   UPDATE/INSERT geocoding_jobs

5. status := CASE
     WHEN _enq = _eligible_count THEN 'enqueued'
     WHEN _enq < _eligible_count THEN 'partial_skip'
   END
   -- nota: _enq nunca > _eligible_count

6. INSERT audit (status, location_ids=_new_ids, location_count=_enq, job_id)
   RETURN (job_id, audit_id, _enq)
```

Si `_enq = 0` por dedup completa pero `_eligible_count > 0` (todo lo elegible ya estaba en el job activo), `status = 'partial_skip'`, `enqueued_count = 0`. El cliente tratará este caso como "ya está todo en cola" sin cerrar el modal de forma confusa.

## 3. Cambios cliente (acotado a `handleConfirm`)

`HealthRepairPreviewDialog.handleConfirm`:

```text
try {
  const { data, error } = await supabase.rpc('enqueue_health_repair', { ... });
  if (error) throw error;

  if (data.enqueued_count > 0) {
    toast.success(`Encolados ${data.enqueued_count}`);
    onClose();
  } else {
    // _eligible_count = 0 (no_eligible) o todo ya en cola (partial_skip con 0)
    toast.info('Sin nuevos puntos elegibles. Acción auditada.');
    setLastResult({ enqueued: 0, message: 'Ya no quedan puntos elegibles ahora mismo.' });
    // NO cerrar
  }
} catch (err) {
  toast.error(err.message);
}
```

Render: si `lastResult.enqueued === 0`, mostrar línea informativa dentro del modal antes del footer; el botón `Confirmar` queda deshabilitado tras una respuesta `0` (consistente con la regla "no llamar Confirmar a algo deshabilitado" → cambia su label a `Sin acciones disponibles` o se oculta dejando solo `Cerrar`).

## 4. QA funcional

| # | Caso | Esperado |
|---|---|---|
| 1 | filtro `partial` real → confirmar | toast `Encolados N`, audit `enqueued`, job `running`, lane Geo |
| 2 | filtro `chain` real → confirmar | igual al 1 |
| 3 | confirmar dos veces el mismo subset | 2ª = audit `partial_skip` con `enqueued=0`; modal NO cierra |
| 4 | filtro `review` → modal sin botón confirmar | sólo `Cerrar`, sin audit |
| 5 | filtro `hardError` → modal sin botón confirmar | sólo `Cerrar`, sin audit |
| 6 | selección forzada de 3 puntos sanos → confirmar | audit `no_eligible`, sin job nuevo |
| 7 | "Sólo visibles" + viewport pequeño | `mode='viewport'` en audit |
| 8 | esperar fin de job | rings del subset desaparecen vía realtime |

## 5. QA seguridad (psql)

| Ataque | Esperado |
|---|---|
| `_action='hardError'` | EXCEPTION `invalid action` |
| `_action='delete_all'` | EXCEPTION |
| `_scope_mode='admin'` | EXCEPTION `invalid scope_mode` |
| `_location_ids=[]` o NULL | EXCEPTION `empty location_ids` |
| Llamada anónima | EXCEPTION `auth required` |
| IDs de OTRO usuario | audit `no_eligible`, sin job |
| 10 000 IDs todos sanos bajo `partial` | audit `no_eligible` (no `partial_skip`) |
| 10 000 IDs con 6 000 elegibles | audit `partial_skip`, `enqueued=5000` (cap), `eligible_count=6000` no se persiste explícitamente pero `location_count=5000` |
| 100 IDs elegibles, 50 ya en job | audit `partial_skip`, `enqueued=50` |

Verificación: `SELECT status, location_count, job_id, array_length(location_ids,1) FROM health_repair_actions WHERE user_id = … ORDER BY created_at DESC LIMIT 10`.

## 6. QA feedback UI

- `enqueued > 0` → toast OK + cerrar + lane Geo + rings actualizan al terminar.
- `enqueued = 0` (`no_eligible` o `partial_skip` con 0) → toast info + modal abierto + mensaje claro + CTA cambia a deshabilitado/Cerrar.
- error RPC → `toast.error(err.message)`.

## 7. Memoria

- `mem://logic/health/workflow-split` — NUEVO. División Mapa CTA (partial/chain con preview + audit) vs Back Office (admin profundo).
- `mem://logic/discovery/health-filter-axis` — actualizar:
  - filtro server-side de salud,
  - audit con 3 estados (`enqueued` / `partial_skip` / `no_eligible`),
  - regla: `partial_skip` se calcula vs input válido, no vs raw,
  - persistencia incluso cuando 0 elegibles.

## 8. NO hacer

- PR-3C (renombrar Back Office) — pendiente.
- hardError masivo — aplazado.
- Edge functions, markers, popups — sin cambios.

## Orden de ejecución

1. Migración (2a + 2b + 2c) en una sola llamada `supabase--migration`.
2. Ajuste cliente del modal (`handleConfirm` + render del estado `0`).
3. Tests SQL de seguridad.
4. QA manual.
5. Memoria.
6. Cierre PR-3B.

¿Aplico?
