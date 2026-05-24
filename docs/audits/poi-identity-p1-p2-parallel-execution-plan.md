# P1 + P2 Parallel Execution Plan — POI Identity Root Status

Status: **PLAN read-only**. Sin UPDATE / INSERT / DELETE. Sin IA. Sin
Nominatim. Sin re-enrich. Sin cambios en `computePoiMaturity`. Sin tocar
marker fill. Sin bump.

Referencias:
- Plan operativo: `docs/audits/poi-identity-root-status-execution-plan.md`
- Contrato A/B/C/D: `docs/contracts/poi-identity-root-status-contract.md`
- Dry-run: `docs/audits/poi-identity-root-status-dry-run.md`
- Canon mundial roadmap: `docs/audits/t-global-canon-world-docx-coverage-audit.md`
- Canon TS: `src/shared/geography/territorial-canon.ts` (v1.3.18)
- Canon Deno: `supabase/functions/_shared/territorial-canon.ts`
- FK resolver: `src/shared/geography/resolve-admin-fks.ts`

Universo (snapshot dry-run): **5.100 POIs aprobados**. Cifras de
referencia = dry-run; ligeras derivas en snapshots posteriores (±5 %) son
normales y no invalidan el plan.

---

## 0. Resumen de paralelización

```text
HILO SISTEMA (P1)                          HILO ENRICH (P2)
─────────────────────────                  ─────────────────────────
w1 canon-gap Wave A  (42)                  Cola D pendiente (≈1.271)
w2 backfill-admin-fks (11)        ←→       filtro duro §3.2 evaluado
w3 canon-gap Wave B  (21)                  por POI en el momento del
w4 canon-gap Wave C  (20)                  encolado (no en planning)
w5 anexo XK          (3)
```

Ambos hilos arrancan a la vez. Cada POI que sale de B (vía P1) o de A/C
(vía P0) cae automáticamente en la cola D de P2 en el siguiente tick.

---

# P1 — Sistema / canon / backfill

## 1.1 Distribución de los 97 POIs B (por causa)

| Subcola | Count | Tipo de fix | ¿Toca datos? | Snapshot/rollback |
|---------|------:|-------------|:------------:|:------------------|
| `canon-gap` (país fuera de TERRITORIAL_CANON) | 86 | **CÓDIGO**: ampliar canon TS + Deno | NO | Revertir PR del wave |
| `geo-partial` (FK resoluble) | 7 | **DATA-FIX**: `resolveAllFks` re-run | SÍ | Snapshot 4 FKs antes |
| `country-id-null` | 3 | **DATA-FIX**: `resolveAllFks` re-run | SÍ | Snapshot 4 FKs antes |
| `enriched-no-region` (`region_id` NULL pese a enriched) | 1 | **DATA-FIX**: `resolveAllFks` re-run | SÍ | Snapshot 4 FKs antes |
| **Total B** | **97** | mixto | parcial (11/97) | — |

> **88,7 % de B (86/97) se cierra sin tocar datos** — sólo amplía canon.
> Sólo 11 POIs requieren `backfill-admin-fks` con snapshot/rollback.

## 1.2 Lista canon-gap por país (38 ISO2, 86 POIs)

```
EE(9), LT(8), KE(8), ET(5), LV(4), GE(4), DK(4), ME(3), CU(3), BA(3),
MD(3), FO(3), XK(3), CR(2), SG(2), TZ(2), AL(1), BY(1), CD(1), CY(1),
EC(1), GL(1), IL(1), JO(1), KG(1), KY(1), MG(1), MN(1), MR(1), MT(1),
PE(1), SD(1), SM(1), TD(1), TM(1), YE(1)
```

## 1.3 Waves propuestas (orden y dependencias)

| Wave | Tipo | Contenido | POIs B cerrados | Depende de | Bloqueado por |
|------|------|-----------|----------------:|------------|---------------|
| **P1-w1** | canon (código) | EE, LT, KE, ET, LV, GE, DK | 42 | Ampliar TERRITORIAL_CANON (TS+Deno) + tests parity | — |
| **P1-w2** | data-fix | `backfill-admin-fks` sobre 11 POIs (geo-partial + country-id-null + enriched-no-region) | 11 | `resolveAllFks` ya wired (PR T2A) | — |
| **P1-w3** | canon (código) | ME, CU, BA, MD, FO, CR, SG, TZ | 21 | Ampliar TERRITORIAL_CANON | — |
| **P1-w4** | canon (código) | 20 ISO2 long-tail (AL, BY, CD, CY, EC, GL, IL, JO, KG, KY, MG, MN, MR, MT, PE, SD, SM, TD, TM, YE) | 20 | Ampliar TERRITORIAL_CANON | — |
| **P1-w5** | canon anexo | XK (Kosovo, 3) | 3 | Decisión política/ISO previa | **Bloqueado** hasta decisión |

w1 ↔ w3 ↔ w4 ↔ w5 son independientes entre sí (cada uno toca países
distintos del canon); pueden ejecutarse en cualquier orden o en paralelo
si los PRs no colisionan. w2 es ortogonal y puede correr en paralelo a
cualquiera de las waves de canon.

## 1.4 Mapeo causa → resolución

| Causa B (label del enunciado) | Mapeo dry-run | Wave | Naturaleza |
|--------------------------------|---------------|------|-----------|
| canon_gap | `canon-gap` (86) | w1+w3+w4+w5 | código (canon) |
| admin_area / FK backfill | `country-id-null` (3) | w2 | data-fix |
| region placeholders | `enriched-no-region` (1) | w2 | data-fix |
| zone indebida | `geo-partial` (7, subconjunto con zone fuera de canon) | w2 | data-fix |

> Cualquier POI `geo-partial` cuya `zone` no pertenezca al canon de su
> país entra en "zone indebida". El resolver (`resolveAllFks`) ya tiene la
> defensa en profundidad (PR T2A-wire-regional-exceptions-edge 1.3.17) y
> reemplaza la zone indebida al re-resolver.

## 1.5 Clasificación por naturaleza del fix

### 1.5.1 Resoluble SIN tocar datos (código puro)
- Waves **w1, w3, w4** → 83 POIs. Patches aditivos en
  `TERRITORIAL_CANON` (TS) + espejo Deno + tests parity + tests
  conformance. POIs salen de B sin escritura en `locations`.

### 1.5.2 Requiere data-fix con snapshot/rollback
- Wave **w2** → 11 POIs. `backfill-admin-fks`:
  - dry-run primero (modo `--dry-run`, sólo lee y reporta diffs);
  - snapshot previo de `region_id`, `zone_id`, `admin3_id`, `locality_id`
    (CSV en `/mnt/documents/p1-w2-snapshot-{ts}.csv`);
  - ejecución real con `--limit 11 --ids <lista>`;
  - rollback = restaurar los 4 FKs desde el snapshot.

### 1.5.3 Bloqueado hasta canon mundial / decisión externa
- Wave **w5** (XK Kosovo, 3 POIs). Mantener en B con flag
  `annex-pending` hasta decisión política/ISO documentada en
  `docs/audits/t-global-canon-world-docx-coverage-audit.md`.

## 1.6 Restricciones P1

- No tocar `name`, `coords`, `description`, `enriched_data`,
  `enrichment_status` en ninguna wave.
- No re-enrich.
- No tocar `admin_areas` salvo lo que `resolveAllFks` ya hace
  (FK lookup, no escritura en `admin_areas`).
- No tocar A ni C.
- Patches canon = aditivos. No purgar entradas existentes.

## 1.7 Criterio de cierre P1

POI sale de B cuando se cumplen todos:
- `country_id IS NOT NULL`;
- `country_code ∈ TERRITORIAL_CANON`;
- `geo_health != 'partial'`;
- si tenía `desc_text`, `region_id IS NOT NULL`.

Al cumplirse, el POI cae a D y la cola P2 lo recoge en el siguiente tick.

---

# P2 — Auto-enrich D

## 2.1 Universo D candidato

Cola = `root='D' AND has_descripcion=false AND enrichment_status IS DISTINCT FROM 'unresolved'`.

| Métrica | Count (dry-run) | Snapshot actual |
|---------|----------------:|----------------:|
| D total | 4.994 | ~5.060 |
| D ya enriquecidos (`descripcion` no vacío) | 3.723 | ~3.720 |
| **D pendientes (cola candidata)** | **1.271** | ~1.340 |

## 2.2 Filtros EXACTOS de inclusión (AND lógico)

Un POI entra a la cola sólo si cumple TODOS:

```sql
SELECT id FROM locations
WHERE deleted_at IS NULL
  AND is_approved = true
  AND (enriched_data->>'descripcion') IS NULL
       OR btrim(enriched_data->>'descripcion') = ''
  AND geo_health = 'ok'                       -- excluye partial/broken/stale_name/empty/hardError
  AND country_id IS NOT NULL
  AND country_code IN (SELECT iso2 FROM TERRITORIAL_CANON)
  AND region_id IS NOT NULL OR (enriched_data->>'descripcion') IS NULL  -- sin enriched-no-region
  AND latitude BETWEEN -90 AND 90
  AND longitude BETWEEN -180 AND 180
  AND NOT (latitude = 0 AND longitude = 0)
  AND name IS NOT NULL AND btrim(name) <> ''
  AND enrichment_status IS DISTINCT FROM 'unresolved'
  AND enrichment_status IS DISTINCT FROM 'in_progress'
  AND COALESCE((metadata->>'synthetic')::bool, false) = false
  AND COALESCE((metadata->>'under_review')::bool, false) = false
  AND owner_user_id <> 'f04b3b95-7308-4b74-b3c7-7e819767c5fb'  -- excluir sandbox
ORDER BY country_code, id
LIMIT :batch;
```

## 2.3 Filtros EXACTOS de exclusión (skip silencioso)

Skip sin error, sin reintento, sin contar como fail:

| # | Motivo skip | Predicado | Origen |
|---|-------------|-----------|--------|
| 1 | root=A | identidad mínima rota | dry-run §4.1 |
| 2 | root=C | `geo_health IN ('broken','stale_name','empty')` | dry-run §4.3 |
| 3 | root=B no resuelto | `geo_health='partial'` OR `country_id IS NULL` OR `country_code NOT IN canon` | dry-run §4.2 |
| 4 | **fixtures** | `metadata->>'synthetic'='true'` OR `id LIKE '%e2e%'` OR `name LIKE 'beta-chain-%'` OR `owner_user_id = sandbox_uid` | contrato §rollout |
| 5 | **flag revisión** | `metadata->>'under_review'='true'` OR `id ∈ lista P0 humana` | plan P0 |
| 6 | **geo_health hardError** | `geo_health='hardError'` (subconjunto de A/C) | health rings |
| 7 | **canon_gap** | `country_code NOT IN TERRITORIAL_CANON` | dry-run §6 |
| 8 | Ya enriquecido | `enriched_data->>'descripcion'` no vacío | contrato §re-enrich |
| 9 | En proceso | `enrichment_status='in_progress'` (lock optimista) | concurrencia |
| 10 | Marcado unresolved | `enrichment_status='unresolved'` (2 POIs en D) | dry-run §8 |

Los filtros 1–7 garantizan que **sólo D entra**. Filtros 8–10 evitan
re-enrich y carreras.

## 2.4 Batch size recomendado

| Variable | Valor recomendado | Razón |
|----------|------------------:|------|
| Batch size | **25 POIs por tick** | Bajo riesgo de rate-limit IA gateway; permite cancelar limpio |
| Tick interval | 60 s | Da tiempo a `enriched_data` UPDATE + realtime broadcast |
| Concurrencia por POI | 1 (serial dentro del batch) | Evita races en `enriched_data` |
| Concurrencia entre POIs distintos | hasta 5 paralelas | Throughput aceptable sin saturar |
| Cola total estimada | ~1.271 POIs | ~51 batches → ~51 min en idle path |

## 2.5 Orden de procesamiento

Prioridad por país (basada en cola D pendiente top, snapshot actual):

```
GB (388) → US (329) → IE (53) → FR (50) → DE (46) → RO (44) →
FI (35)  → MA (27)  → NO (27) → PL (24) → HR (24) → IT (22) →
TR (20)  → GR (20)  → HU (14) → AT (13) → UA (13) → SK (13) →
NL (13)  → RS (11)  → BG (10) → CZ (10) → IS (10) → resto
```

Dentro de cada país, orden por `id ASC` para reproducibilidad.

> GB+US suman 717 POIs (≈53 %). Procesarlos primero da máximo impacto.

## 2.6 Campos PERMITIDOS de escritura

`enrich-location` SOLO puede tocar:

| Tabla.columna | Tipo de cambio |
|---------------|---------------|
| `locations.enriched_data` | merge/insert (jsonb) |
| `locations.enrichment_status` | `null → 'in_progress' → 'enriched'` o `'failed'` |
| `locations.enrichment_attempted_at` | timestamp set |
| `locations.enrichment_error` | string (sólo en fail) |

## 2.7 Campos PROHIBIDOS de escritura

`enrich-location` NUNCA toca:

- `name`, `latitude`, `longitude` (identidad inmutable post-import).
- `country_id`, `country_code`, `region_id`, `zone_id`, `admin3_id`,
  `locality_id`, `sublocality_id` (territorial = job dedicado).
- `geo_health`, `raw_geocode` (geocoding job = único responsable).
- `is_approved`, `deleted_at`, `owner_user_id`, `_docUserId`.
- `metadata.synthetic`, `metadata.under_review` (flags humanos).
- Cualquier columna de `admin_areas`, `places`, `waypoints`,
  `user_places`, `collections`, `document_tracks`.
- `user_ratings`, `visited`, `user_notes` (estado personal).

## 2.8 Rollback / auditoría

### 2.8.1 Auditoría por POI
Cada enrich emite log estructurado:
```json
{
  "ts": "2026-05-21T…",
  "op": "p2.enrich",
  "poi_id": "…",
  "country_code": "GB",
  "batch_id": "p2-2026-05-21-001",
  "outcome": "success | fail | noop-skip",
  "skip_reason": "fixture | flag | canon-gap | …" ,
  "fields_written": ["enriched_data","enrichment_status",…],
  "bytes_written": 1234,
  "duration_ms": 8200
}
```

### 2.8.2 Rollback granular
- Por POI: restaurar `enriched_data` previo desde snapshot
  (`/mnt/documents/p2-batch-{id}-pre.csv`, dump JSON antes de cada batch).
- Por batch: revertir los 25 POIs del batch.
- Global: pausar cola; los POIs ya enriched conservan datos hasta
  rollback manual explícito.

### 2.8.3 Snapshot pre-batch (obligatorio)
Antes de cada batch:
```sql
COPY (
  SELECT id, enriched_data, enrichment_status, enrichment_attempted_at,
         enrichment_error
  FROM locations
  WHERE id = ANY($1)
) TO '/mnt/documents/p2-batch-{batch_id}-pre.csv' WITH CSV HEADER;
```

## 2.9 Métricas success / fail / no-op

| Outcome | Predicado | Acción siguiente |
|---------|-----------|------------------|
| **success** | `enriched_data.descripcion` no vacío post-call AND `enrichment_status='enriched'` | siguiente POI |
| **fail** | excepción IA / timeout / payload inválido | `enrichment_status='failed'` + `enrichment_error` + reintento con backoff (máx 3) |
| **noop-skip** | filtro §2.3 detecta cambio de estado entre encolado y ejecución | log skip_reason, no contar como fail |
| **race** | `enrichment_status='in_progress'` en otro worker | abort silencioso, no double-write |

Dashboard mínimo (no construir aún, sólo definir):
- `p2.queue.size` → POIs pendientes.
- `p2.batch.success_rate` → success / (success+fail).
- `p2.batch.noop_rate` → noop-skip / total intentos.
- `p2.batch.duration_p95` → latencia.
- `p2.cost.tokens_total` → consumo IA gateway.

## 2.10 Cómo evitar re-enrich

Tres capas de defensa (cualquier capa suficiente):

1. **Filtro de inclusión §2.2**: `(enriched_data->>'descripcion') IS NULL OR ''`.
2. **Lock optimista**: antes del call IA, `UPDATE locations SET
   enrichment_status='in_progress' WHERE id=$1 AND enrichment_status IS
   DISTINCT FROM 'enriched' RETURNING 1`. Si no devuelve fila, abort.
3. **Post-check**: tras el call, si `enriched_data.descripcion` ya existe
   por otra ruta, **NO sobrescribir**; cerrar como `noop-skip`.

> Regla dura: `skip_already_enriched` (ver
> `mem://logic/enrichment/skip-already-enriched`) no se viola en P2.

---

## 3. Interacción P1 ↔ P2

| Evento | Efecto en la otra cola |
|--------|------------------------|
| P1-w1/w3/w4/w5 publica patch canon | POIs canon-gap pasan a D → cola P2 los recoge en el siguiente tick |
| P1-w2 cierra `geo-partial` / `country-id-null` / `enriched-no-region` | POIs pasan a D → cola P2 los recoge |
| P2 enriquece un POI | No afecta P1 (sin cambios en territorial) |
| P0 cierra un A o C | POI pasa a D → cola P2 lo recoge |

No hay deadlock: P1 nunca lee enrichment, P2 nunca toca territorial.

---

## 4. Riesgos cruzados

| Riesgo | Mitigación |
|--------|-----------|
| P2 encola un POI mientras P1 está en mitad de un backfill | Lock optimista §2.10.2 + filtro re-evaluado por POI |
| Patch canon Wave incluye país sin POIs reales | Tests parity TS↔Deno; conformance contra PDF; sin impacto en P2 |
| `backfill-admin-fks` reasigna FK incorrectamente | Dry-run + snapshot CSV + rollback por POI |
| IA escribe en campo prohibido §2.7 | Edge function `enrich-location` valida whitelist de campos antes de UPDATE |
| Cola P2 procesa fixture (sandbox) | Filtro §2.3.4 excluye `owner_user_id = sandbox_uid` |
| Re-enrich accidental | Tres capas §2.10 |

---

## 5. Rollback consolidado

| Fase | Rollback |
|------|----------|
| P1-w1 / w3 / w4 / w5 | Revertir PR canon; POIs vuelven a B; sin tocar datos |
| P1-w2 | Restaurar 4 FKs desde snapshot CSV pre-corrida |
| P2 batch | Restaurar `enriched_data` + `enrichment_status` desde snapshot pre-batch |
| P2 global | Pausar cola; rollback manual selectivo por batch_id |

Datos históricos, `admin_areas`, `computePoiMaturity`, marker fill,
paleta y POI-N **no se tocan** → no requieren rollback.

---

## 6. Lo que este plan NO hace

- No ejecuta UPDATE / INSERT / DELETE.
- No llama IA ni Nominatim.
- No modifica `TERRITORIAL_CANON` (los patches son fases posteriores).
- No cabla `enrich-location` con el nuevo filtro (sólo lo documenta).
- No materializa `identity_root_status` como columna.
- No cambia `computePoiMaturity`.
- No cambia marker fill ni paleta.
- No sube versión.

---

## 7. Checklist de aprobación previo a ejecutar

- [ ] Aprobar P1-w1 (canon Wave A, 7 países, +42 B cerrados).
- [ ] Aprobar P1-w2 (`backfill-admin-fks` sobre 11 POIs + snapshot CSV).
- [ ] Aprobar P1-w3 (canon Wave B, 8 países, +21 B cerrados).
- [ ] Aprobar P1-w4 (canon Wave C, 20 países, +20 B cerrados).
- [ ] Decisión XK (Kosovo) antes de P1-w5.
- [ ] Aprobar P2 (cablear filtro §2.2 + §2.3 en `enrich-location` o en wrapper de cola).
- [ ] Confirmar batch size 25 / tick 60 s / concurrencia 5.
- [ ] Confirmar ruta snapshot `/mnt/documents/p2-batch-*.csv`.
