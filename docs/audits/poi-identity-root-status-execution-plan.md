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

## 1. Tabla A/B/C/D (resumen)

| Root | Count | %      | Color  | Owner  | Apto enrich | Prioridad ejecución |
|------|------:|-------:|--------|--------|:-----------:|---------------------|
| A    |     1 | 0,02 % | rojo   | user   | NO          | **P0**              |
| B    |    97 | 1,90 % | amarillo | system | NO        | **P1**              |
| C    |     8 | 0,16 % | naranja| user   | NO          | **P0**              |
| D    | 4.994 | 97,92 %| verde  | auto   | SÍ          | **P2**              |
| Total| 5.100 | 100 %  | —      | —      | —           | —                   |

Cola operativa (A+B+C) = **106 POIs** (2,08 %).
Acción humana real (A + C real, sin fixtures) = **5 POIs**.

---

## 2. P0 — Acción humana mínima

Objetivo: cerrar identidad rota o incoherente. **No auto-enrich.** No tocar
`computePoiMaturity`. No cambiar marker fill.

### 2.1 Lista A (1)

| id | name | cc | motivo | acción sugerida |
|----|------|----|--------|-----------------|
| `89867d20-bc1e-4a12-82fa-ba4820a5cdab` | Antarctica Roundabout | ES | coords-zero | usuario: corregir coords o descartar |

### 2.2 Lista C real (4)

Excluye 4 fixtures E2E (`f04b…e2e000000001`, `…000000002`, `2bb2d2e6-…
beta-chain-1`, `435a2dcf-… beta-chain-2`).

| id | name | cc | geo_health | motivo | acción sugerida |
|----|------|----|-----------|--------|-----------------|
| `2b81c378-b3d5-4a80-b26a-fa82569d14ef` | Castillo de Malbork | PL | broken | nombre vs coords incoherente | revisión humana: recolocar coords / renombrar |
| `f9d5f63d-1759-4eeb-bbcb-84c4d54e9f83` | Cârlibaba | RO | broken | idem | idem |
| `2584a104-8fbe-495f-be3b-c52793579796` | Șirnea | RO | broken | idem | idem |
| `47c49cf2-50f1-4a03-8c8f-c98dffbf968b` | Biertan | RO | broken | idem | idem |

### 2.3 Entregables P0

- Tabla anterior usada como **lista de revisión humana** (panel admin o
  export CSV manual). No materializar todavía.
- Excluir estos 5 IDs de cualquier cola IA hasta resolución.
- Fixtures E2E: marcar `synthetic=true` (sin acción).

### 2.4 Criterio de cierre P0

- A: `latitude!=0 OR longitude!=0` y dentro de rango válido.
- C: `geo_health` deja `broken|stale_name|empty`.

---

## 3. P1 — Acción sistema/canon

Objetivo: cerrar los 97 POIs B sin pedir nada al usuario. **No degradar
POI-N visualmente** (regla §5.3 contrato: B no penaliza al usuario).

### 3.1 Breakdown B por causa

| Subcola | Count | Resolución | Conecta con |
|---------|------:|-----------|-------------|
| `canon-gap` (país fuera de TERRITORIAL_CANON) | 86 | Wave P1+ canon mundial | World Canon Coverage P1/P2 |
| `geo-partial` (FK resoluble) | 7 | `backfill-admin-fks` | infra geo |
| `country-id-null` | 3 | `backfill-admin-fks` | infra geo |
| `enriched-no-region` (`region_id` NULL pese a enriched) | 1 | `backfill-admin-fks` | infra geo |
| **Total B** | **97** | 100 % automatizable | — |

### 3.2 Breakdown `canon-gap` por país (38 ISO2 distintos)

Orden recomendado por volumen → mayor reducción de B con menor patch:

| Wave | ISO2 (count) | POIs B cubiertos | Reducción acumulada |
|------|--------------|-----------------:|--------------------:|
| **P1-canon Wave A** | EE(9), LT(8), KE(8), ET(5), LV(4), GE(4), DK(4) | 42 | −43 % |
| **P1-canon Wave B** | ME(3), CU(3), BA(3), MD(3), FO(3), CR(2), SG(2), TZ(2) | 21 | −65 % |
| **P1-canon Wave C** | AL, BY, CD, CY, EC, GL, IL, JO, KG, KY, MG, MN, MR, MT, PE, SD, SM, TD, TM, YE (1 c/u) | 20 | −86 % |
| **P1-canon anexo** | XK (3) Kosovo | 3 | −89 % (requiere decisión política/ISO) |
| **P1-backfill FKs** | geo-partial + country-id-null + enriched-no-region | 11 | −100 % |

> Wave A y B cierran el 65 % del bucket B con sólo 15 países nuevos en el
> canon. Wave C es long-tail y puede agruparse en un único patch.

### 3.3 Entregables P1

- Patch canon Wave A (7 países, +42 POIs B cerrados).
- Patch canon Wave B (8 países, +21 POIs B cerrados).
- Patch canon Wave C (20 países long-tail, +20 POIs B cerrados).
- Decisión XK (Kosovo) explícita antes del patch anexo.
- Ejecución `backfill-admin-fks` sobre los 11 POIs con motivo
  `geo-partial / country-id-null / enriched-no-region`.

### 3.4 Restricciones P1

- No tocar datos del POI (nombre, coords, descripción).
- No tocar `enriched_data`.
- No re-enrich.
- Patches de canon = aditivos (mismo patrón que P0 World Canon Coverage).

---

## 4. P2 — Auto-enrich (cola D)

Objetivo: alimentar enrich automático SOLO con D pendientes.

### 4.1 Cola D

| Sub-bucket D | Count |
|--------------|------:|
| Ya enriquecidos (`enriched_data.descripcion` no vacío) | 3.723 |
| **Pendientes de enrichment (cola candidata)** | **1.271** |
| Total D | 4.994 |

Cola candidata = `root='D' AND has_descripcion=false` → **1.271 POIs**.

### 4.2 Criterios de exclusión (filtro duro de la cola)

Skip silencioso si:
- `root ∈ {A, B, C}` (incluye fixtures).
- `enrichment_status = 'unresolved'` (2 POIs en D).
- `is_approved = false` o `deleted_at IS NOT NULL`.
- POI en lista P0 manual de revisión humana.

### 4.3 Entregables P2

- Pre-filtro de cola IA documentado (sin cablear todavía).
- Distribución por país-top-D para batching futuro: ES, FR, IT, GB, US, PT
  lideran (sin desglose cuantitativo en este plan).
- No tocar `enrich-location` aún. Sólo dejar el contrato del filtro.

### 4.4 Restricciones P2

- No mover POI-N manualmente.
- No tocar `computePoiMaturity`.
- No tocar marker fill ni paleta.
- No llamar IA en este plan; sólo preparar la cola.

---

## 5. Orden recomendado de ejecución

```text
1. P0  → Revisar 5 POIs (A=1, C real=4). Sin escritura masiva.
2. P1a → Patch canon Wave A (EE, LT, KE, ET, LV, GE, DK).
3. P1b → backfill-admin-fks sobre los 11 POIs B no-canon-gap.
4. P1c → Patch canon Wave B (ME, CU, BA, MD, FO, CR, SG, TZ).
5. P1d → Patch canon Wave C long-tail (20 ISO2).
6. P1e → Decisión + patch anexo XK (si procede).
7. P2  → Cablear pre-filtro `root='D' AND !has_descripcion` en cola enrich.
8. P3  → (opcional, fuera de este plan) materializar identity_root_status.
```

Cada paso es independiente y reversible.

---

## 6. Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Falsos C por nombre/coords legítimos | P0 es revisión humana, no UPDATE automático. |
| Patches canon rompen tests | Cada wave sigue el patrón validado (P0 World Canon Coverage); tests TS/Deno parity obligatorios. |
| Backfill FKs sobrescribe datos buenos | `backfill-admin-fks` ya tiene defensa en profundidad (`resolveAllFks`); ejecutar primero en modo dry-run. |
| Cola IA filtra de más | Pre-filtro documentado pero no cableado en este plan; activar tras 7 días de validación heurística. |
| XK (Kosovo) genera incidencia política | Mantener en B con flag `annex-pending` hasta decisión explícita. |
| Heurística A/B/C/D diverge de POI-N | A/B/C/D es ortogonal; no toca `computePoiMaturity` ni marker fill (regla dura contrato §5.1–5.2). |

---

## 7. Rollback

- **P0**: no hay rollback. Es revisión humana sobre 5 IDs; sin escritura.
- **P1a/c/d (patches canon)**: revertir PR del wave; cambio aditivo en
  `TERRITORIAL_CANON` (TS + Deno), no toca datos. POIs vuelven a `B`.
- **P1b (backfill FKs)**: ejecutar en modo dry-run primero; si la corrida
  real genera regresión, revertir vía `resolveAllFks` rerun con snapshot
  previo de `region_id/zone_id/admin3_id/locality_id` (capturar snapshot
  antes de ejecutar).
- **P1e (XK)**: revertir patch anexo igual que P1a.
- **P2 (cola enrich)**: no hay rollback porque este plan **no cabla** el
  filtro; sólo lo documenta. Si en el futuro se cabla, basta con desactivar
  el guard y la cola vuelve al comportamiento previo.
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

1. ¿Aprobar Wave A del canon (7 países) como siguiente patch?
2. ¿Aprobar `backfill-admin-fks` sobre los 11 POIs B no-canon-gap?
3. ¿Quién revisa los 5 POIs P0 (A + C real)?
4. ¿Se cabla el pre-filtro `root='D'` en `enrich-location` ya o tras
   materializar el campo derivado?
5. ¿Decisión política sobre XK (Kosovo)?
