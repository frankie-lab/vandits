# Execution Plan — POI Identity Root Status (A/B/C/D)

Status: **PLAN read-only**. Sin ejecución de datos. Sin IA. Sin UPDATE. Sin
cambios en `computePoiMaturity`. Sin tocar marker fill. Sin bump.

Referencias:
- Contrato: `docs/contracts/poi-identity-root-status-contract.md`
- Dry-run: `docs/audits/poi-identity-root-status-dry-run.md`
- Canon mundial: `docs/audits/t-global-canon-world-docx-coverage-audit.md`
- Canon TS: `src/shared/geography/territorial-canon.ts` (v1.3.18, 49 países)

Universo auditado: **5.100 POIs** (`deleted_at IS NULL AND is_approved=true`).

---

## 0. Orden operativo

Reordenado para no bloquear nunca el avance del sistema por una cola humana
de 5 POIs:

```text
P1 → Sistema / canon / backfill  (97 B)            ← arranca ya
P2 → Auto-enrich sobre D pendientes (1.271 D)      ← arranca ya, en paralelo
P0 → Revisión humana mínima (1 A + 4 C reales)     ← cola separada, no bloquea
```

**Reglas duras del orden:**
- P1 y P2 avanzan **sin esperar acción humana**.
- P0 vive como cola humana separada; **no bloquea** P1 ni P2.
- A/C **excluidos siempre** de la cola de enrich (filtro duro en P2).
- B no resueltos **excluidos** de la cola de enrich hasta que P1 los cierre.
- No se cambia `computePoiMaturity`.
- No se cambia marker fill ni paleta.

---

## 1. Tabla A/B/C/D (resumen)

| Root | Count | %      | Color    | Owner  | Apto enrich | Fase | Bloquea otras fases |
|------|------:|-------:|----------|--------|:-----------:|------|---------------------|
| B    |    97 | 1,90 % | amarillo | system | NO          | **P1** | — |
| D    | 4.994 | 97,92 %| verde    | auto   | SÍ (1.271)  | **P2** | — |
| A    |     1 | 0,02 % | rojo     | user   | NO          | **P0** | NO |
| C    |     8 | 0,16 % | naranja  | user   | NO          | **P0** | NO |
| Total| 5.100 | 100 %  | —        | —      | —           | —    | — |

Cola operativa total = 106 POIs (2,08 %). Acción humana real = **5 POIs**.

---

## 2. P1 — Sistema / canon / backfill (arranca ya)

Objetivo: cerrar los 97 POIs B sin pedir nada al usuario. Deuda del sistema.
**No degradar POI-N visualmente** (regla §5.3 contrato).

### 2.1 Breakdown B por causa

| Subcola | Count | Resolución | Conecta con |
|---------|------:|-----------|-------------|
| `canon-gap` (país fuera de TERRITORIAL_CANON) | 86 | Patches canon Wave A/B/C | World Canon Coverage P1/P2 |
| `geo-partial` (FK resoluble) | 7 | `backfill-admin-fks` | infra geo |
| `country-id-null` | 3 | `backfill-admin-fks` | infra geo |
| `enriched-no-region` (`region_id` NULL pese a enriched) | 1 | `backfill-admin-fks` | infra geo |
| **Total B** | **97** | 100 % automatizable | — |

### 2.2 Waves dentro de P1

| Wave | Tipo | Contenido | POIs B cerrados | Acumulado |
|------|------|-----------|----------------:|----------:|
| **P1-w1 canon-gap A** | canon | EE(9), LT(8), KE(8), ET(5), LV(4), GE(4), DK(4) | 42 | 43 % |
| **P1-w2 backfill FKs** | infra | `geo-partial` (7) + `country-id-null` (3) + `enriched-no-region` (1) → admin_area/FK + region placeholders + zone indebida | 11 | 55 % |
| **P1-w3 canon-gap B** | canon | ME(3), CU(3), BA(3), MD(3), FO(3), CR(2), SG(2), TZ(2) | 21 | 76 % |
| **P1-w4 canon-gap C (long-tail)** | canon | AL, BY, CD, CY, EC, GL, IL, JO, KG, KY, MG, MN, MR, MT, PE, SD, SM, TD, TM, YE (1 c/u) | 20 | 97 % |
| **P1-w5 anexo XK** | canon | Kosovo (3) — requiere decisión política/ISO previa | 3 | 100 % |

Sub-buckets nombrados explícitamente (alineados con el enunciado del ticket):
- **canon_gap** → Waves w1, w3, w4, w5.
- **admin_area / FK backfill** → Wave w2 (`country-id-null`).
- **region placeholders** → Wave w2 (`enriched-no-region`).
- **zone indebida** → Wave w2 (`geo-partial` con zone fuera de canon).

### 2.3 Restricciones P1

- No tocar A ni C.
- No re-enrich.
- No tocar `enriched_data`.
- No tocar `name`, `coords`, `description`, `enrichment_status`.
- Patches canon = aditivos (mismo patrón validado en P0 World Canon Coverage).
- `backfill-admin-fks` se ejecuta primero en dry-run.

### 2.4 Criterio de cierre P1

- POI sale de B cuando `country_id IS NOT NULL`, `country_code ∈ TERRITORIAL_CANON`
  y `geo_health != 'partial'`.
- Al salir de B, el POI pasa a D y entra automáticamente a la cola P2.

---

## 3. P2 — Auto-enrich sobre D pendientes (arranca ya, en paralelo a P1)

Objetivo: alimentar enrich automático SOLO con D pendientes. Independiente
de P1 — no se espera a cerrar B para enriquecer D.

### 3.1 Cola D

| Sub-bucket D | Count |
|--------------|------:|
| Ya enriquecidos (`enriched_data.descripcion` no vacío) | 3.723 |
| **Pendientes de enrichment (cola candidata)** | **1.271** |
| Total D | 4.994 |

Cola candidata = `root='D' AND has_descripcion=false` → **1.271 POIs**.

### 3.2 Exclusiones explícitas (filtro duro)

Skip silencioso si:
- `root = 'A'` (1 POI).
- `root = 'B'` no resuelto todavía (97 POIs en este momento, decrecerá con P1).
- `root = 'C'` (8 POIs).
- POI marcado como **fixture** (E2E / `beta-chain-*` / sintéticos).
- POI marcado con **flag de revisión** (lista P0 manual o cualquier flag
  `synthetic=true` / `under-review=true`).
- `enrichment_status = 'unresolved'` (2 POIs ya en D).
- `is_approved = false` o `deleted_at IS NOT NULL`.

**Solo D puede entrar a enrich.** Cualquier otra raíz se descarta antes de
encolar.

### 3.3 Entregables P2

- Pre-filtro de cola IA documentado (sin cablear todavía).
- Distribución por país-top-D para batching futuro: ES, FR, IT, GB, US, PT
  lideran (sin desglose cuantitativo en este plan).
- No tocar `enrich-location` aún; sólo dejar el contrato del filtro.

### 3.4 Restricciones P2

- No mover POI-N manualmente.
- No tocar `computePoiMaturity`.
- No tocar marker fill ni paleta.
- No llamar IA en este plan; sólo preparar la cola.

---

## 4. P0 — Revisión humana mínima (cola separada, no bloquea)

Objetivo: mantener visible la deuda real de identidad sin frenar P1/P2.

### 4.1 Lista A (1)

| id | name | cc | motivo | acción sugerida |
|----|------|----|--------|-----------------|
| `89867d20-bc1e-4a12-82fa-ba4820a5cdab` | Antarctica Roundabout | ES | coords-zero | usuario: corregir coords o descartar |

### 4.2 Lista C real (4)

Excluye 4 fixtures E2E (`f04b…e2e000000001`, `…000000002`, `2bb2d2e6-…
beta-chain-1`, `435a2dcf-… beta-chain-2`).

| id | name | cc | geo_health | motivo | acción sugerida |
|----|------|----|-----------|--------|-----------------|
| `2b81c378-b3d5-4a80-b26a-fa82569d14ef` | Castillo de Malbork | PL | broken | nombre vs coords incoherente | revisión humana: recolocar coords / renombrar |
| `f9d5f63d-1759-4eeb-bbcb-84c4d54e9f83` | Cârlibaba | RO | broken | idem | idem |
| `2584a104-8fbe-495f-be3b-c52793579796` | Șirnea | RO | broken | idem | idem |
| `47c49cf2-50f1-4a03-8c8f-c98dffbf968b` | Biertan | RO | broken | idem | idem |

### 4.3 Reglas P0

- A/C **no entran nunca** a la cola de enrich (excluidos por P2 §3.2).
- A/C **siguen visibles** como tarea humana (panel admin / export CSV manual).
- A/C **no bloquean** ningún wave de P1 ni la cola D de P2.
- Fixtures: marcar `synthetic=true` y excluir de cualquier panel humano.

### 4.4 Criterio de cierre P0

- A: `latitude!=0 OR longitude!=0` y dentro de rango válido.
- C: `geo_health` deja `broken|stale_name|empty`.
- Al cerrar, el POI pasa a D y entra automáticamente a la cola P2.

---

## 5. Orden recomendado de ejecución (paralelizable)

```text
[Hilo sistema — secuencial]
  P1-w1 canon Wave A (EE, LT, KE, ET, LV, GE, DK)
  P1-w2 backfill-admin-fks (11 POIs: FK + region placeholders + zone indebida)
  P1-w3 canon Wave B (ME, CU, BA, MD, FO, CR, SG, TZ)
  P1-w4 canon Wave C long-tail (20 ISO2)
  P1-w5 decisión + patch anexo XK (si procede)

[Hilo enrich — en paralelo desde día 1]
  P2 cola D pendiente (1.271 POIs), filtro duro §3.2
       └─ se realimenta sola con POIs que salen de B (vía P1) o de A/C (vía P0)

[Hilo humano — asíncrono, no bloquea]
  P0 revisión 5 POIs (1 A + 4 C real)
```

Cada hilo es independiente y reversible.

---

## 6. Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Falsos C por nombre/coords legítimos | P0 es revisión humana, no UPDATE automático. |
| Patches canon rompen tests | Cada wave sigue el patrón validado (P0 World Canon Coverage); tests TS/Deno parity obligatorios. |
| Backfill FKs sobrescribe datos buenos | `resolveAllFks` con defensa en profundidad; primera corrida en dry-run + snapshot de `region_id/zone_id/admin3_id/locality_id`. |
| P2 encola un POI no-D por carrera con P1 | Filtro duro §3.2 se evalúa en el momento del encolado, no en planning. |
| Cola IA filtra de más | Pre-filtro documentado pero no cableado en este plan; activar tras 7 días de validación heurística. |
| XK (Kosovo) genera incidencia política | Mantener en B con flag `annex-pending` hasta decisión explícita. |
| Heurística A/B/C/D diverge de POI-N | A/B/C/D es ortogonal; no toca `computePoiMaturity` ni marker fill (regla dura contrato §5.1–5.2). |

---

## 7. Rollback

- **P1-w1 / w3 / w4 / w5 (patches canon)**: revertir PR del wave; cambio
  aditivo en `TERRITORIAL_CANON` (TS + Deno), no toca datos. POIs vuelven a `B`.
- **P1-w2 (backfill FKs)**: dry-run primero; si la corrida real genera
  regresión, restaurar `region_id/zone_id/admin3_id/locality_id` desde el
  snapshot capturado antes de la corrida.
- **P2 (cola enrich)**: no hay rollback porque este plan **no cabla** el
  filtro; sólo lo documenta. Si en el futuro se cabla, basta con desactivar
  el guard.
- **P0**: no hay rollback. Es revisión humana sobre 5 IDs; sin escritura.
- **Datos históricos, `locations`, `admin_areas`, `enriched_data`,
  `computePoiMaturity`, marker fill, paleta, POI-N**: NO se tocan en
  ninguna fase → no requieren rollback.

---

## 8. Lo que este plan NO hace

- No ejecuta UPDATE / INSERT / DELETE.
- No llama Nominatim ni IA ni re-enrich.
- No materializa `identity_root_status` / `identity_action_owner` /
  `identity_reason`.
- No toca `computePoiMaturity`.
- No toca marker fill ni paleta.
- No sube versión.
- No modifica `TERRITORIAL_CANON` (los patches son fases posteriores).
- No cabla pre-filtro en `enrich-location`.

---

## 9. Decisiones pendientes (post-plan)

1. ¿Aprobar P1-w1 (canon Wave A, 7 países) como siguiente patch?
2. ¿Aprobar P1-w2 (`backfill-admin-fks` sobre los 11 POIs B no-canon-gap)?
3. ¿Cablear el pre-filtro `root='D'` en `enrich-location` ya, o tras
   materializar el campo derivado?
4. ¿Quién revisa los 5 POIs P0 (A + C real)?
5. ¿Decisión política sobre XK (Kosovo)?
