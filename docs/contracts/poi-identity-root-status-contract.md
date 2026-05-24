# POI Identity Root Status — Contract (A/B/C/D)

Status: **ACTIVE — runtime materializado** (desde v1.4.6, PR-IDENTITY-ROOT-DOC-1).

Histórico: nació como DRAFT conceptual; entre v1.3.x y v1.4.5 se materializó
end-to-end (Deno SoT + cliente espejo + fixtures + parity test + filtro UI +
partición de reparación). Este documento ya **NO es aspiracional**: refleja el
canon vivo. La única pieza pendiente es la persistencia en columna
`locations.identity_root_status` (ver §9).

## 1. Purpose

Clasificación raíz O(1) por POI que responde:

> ¿Quién es responsable de mover este POI hacia adelante: el **usuario**, el
> **sistema/canon/backfill**, o el **enriquecimiento automático**?

Eje **ortogonal** al canónico de madurez visual `POI-0..POI-10` (ver
`docs/contracts/poi-curation-levels.md`). No reemplaza fill, no altera
`computePoiMaturity`, no introduce nuevos gates de visibilidad.

## 2. Los cuatro estados

| Root | Nombre | Color aux. | Causa | Owner |
|------|--------|-----------|-------|-------|
| **A** | Incompleto real | rojo | Falta nombre útil, coords válidas o identidad mínima | **Usuario** |
| **B** | Canon/backfill pendiente | amarillo | POI válido pero falta canon territorial / FK / `country_id` / `geo_health='partial'` | **Sistema** |
| **C** | Identidad incoherente | naranja | `geo_health ∈ {broken, stale_name, empty, hard_error}` | **Usuario** (revisión) |
| **D** | Identidad confirmada | verde | Nombre + coords coherentes, `geo_health='ok'` | **Auto** (enriquecimiento) |

Color auxiliar = badges, filtros, tooltip, panel admin. **NO** sustituye el fill
canónico POI-N del marker propio.

## 3. Single Source of Truth

| Capa | Archivo | Rol |
|------|---------|-----|
| **Edge SoT** | `supabase/functions/_shared/poi-identity-root-status.ts` | Clasificador canónico. Server-side gate de enrichment, image-recovery, batch IA. |
| **Cliente espejo** | `src/domains/content/lib/poi-identity-root-status-client.ts` | Port 1:1. Consumido por matcher, filtros, partición salud. |
| **Fixtures compartidas** | `src/test/fixtures/poi-identity-root-status.fixtures.json` | Casos canónicos para ambos lados. |
| **Contract test paridad** | `src/test/poi-identity-root-status-client-parity.test.ts` | Falla el build si Deno y cliente divergen sobre las fixtures. |

**Regla dura**: cualquier cambio de heurística DEBE tocar Deno + cliente +
fixtures en el mismo PR. PR que toque sólo un lado se rechaza.

## 4. Orden de decisión (idéntico Deno ↔ cliente)

```
1.  deleted_at IS NOT NULL                    → A / skip 'deleted'
2.  is_approved = false                       → A / skip 'not_approved'
3.  isFixture(loc)                            → D / skip 'fixture'
4.  metadata.under_review = true              → D / skip 'under_review'
5.  enrichment_status = 'in_progress'         → D / skip 'in_progress'
6.  enrichment_status = 'unresolved'          → D / skip 'unresolved_flag'
7.  !inspectWgs84Coord(lat,lng).valid         → A / skip 'invalid_coordinates'
8.  trim(name) vacío                          → A / skip 'root_a_missing_identity'
9.  geo_health ∈ {broken,stale_name,empty}    → C / skip 'root_c_incoherent_identity'
10. geo_health ∈ {hard_error,harderror}       → C / skip 'geo_hard_error'
11. !isCanonCountry(country_code)             → B / skip 'canon_gap'
12. geo_health = 'partial'                    → B / skip 'root_b_unresolved' (geo_partial)
13. country_id IS NULL                        → B / skip 'root_b_unresolved' (country_id_null)
14. geo_health no vacío y ≠ 'ok'              → B / skip 'root_b_unresolved' (geo_health=...)
15. enriched_data.descripcion presente        → D / skip 'already_enriched'
16. default                                   → D / eligibleForAutoEnrich = true
```

`SkipReason` es enum cerrado. Lista completa en
`src/domains/content/lib/poi-identity-root-status-client.ts` (tipo `SkipReason`).

## 5. Reglas duras (vigentes)

### 5.1 No enriquecer A ni C
Server-side: el clasificador NUNCA devuelve `eligibleForAutoEnrich=true` para
A o C. Batch IA, image-recovery, semantic-search re-index DEBEN filtrar por
`eligibleForAutoEnrich`, no por root.

### 5.2 No penalizar al usuario por B
B es deuda del sistema. UI no muestra mensajes de error orientados al usuario
para B (chip amarillo informativo, sí; CTA "arregla esto", no). Cola la procesa
job `backfill-admin-fks` / canonicalize.

### 5.3 D ≠ "ya enriquecido"
D es **elegible**. Un POI ya enriquecido es D con `skipReason='already_enriched'`.
Sólo D + sin skipReason entra a auto-enrich.

### 5.4 Sandbox = D-fixture forzado
`owner_user_id = SANDBOX_OWNER_UID` (`f04b3b95-...`) o `metadata.synthetic=true`
o id que contiene `e2e` o nombre `beta-chain-*` → D + skip `fixture`. NUNCA
entra al pipeline real. Coherente con `mem://governance/rollout-policy`.

### 5.5 No sustituye marker fill POI-N
Fill rige por `mem://style/map/poi-visual-grammar-composition`. A/B/C/D vive
SÓLO como capa auxiliar (badge, filtro, partición).

## 6. Consumidores cableados (UI runtime)

| Consumidor | Archivo | Uso |
|------------|---------|-----|
| Filtro raíz | `src/components/discovery/RootStatusChipRow.tsx` + `FilterBar.tsx` | Chips A/B/C/D en modo Mantener. |
| Matcher | `src/domains/content/lib/location-filtering.ts` | Eje `rootStatus` en `matchesLocationFilters`. |
| Partición salud | `src/components/discovery/health-repair-partition.ts` | Segrega cola de reparación por root antes de despachar a job. |
| Diálogo triage | `src/components/discovery/health-repair-triage-dialog` | Muestra root + skipReason por POI seleccionado. |
| Footer acción efectiva | `src/components/.../effective-action-footer` | CTA depende de root + owner. |
| Tipo `GeoLocation` | `src/types/location.ts` | Campo `rootStatus?: IdentityRoot`. |

## 7. Postcondiciones de cualquier PR que toque este canon

1. `poi-identity-root-status-client-parity.test.ts` verde.
2. Fixtures actualizadas con caso nuevo si se añade rama de decisión.
3. Este doc actualizado en el mismo PR (sección §4 si cambia orden, §5 si
   cambia regla dura).
4. Memoria `mem://logic/poi/identity-root-status-canon` sincronizada.
5. `APP_VERSION` bumpeado (patch si sólo doc/memoria; minor si cambia
   heurística; major si cambia enum `IdentityRoot` o `SkipReason`).

Incumplir cualquier punto → PR rechazable o corregible (regla NASA-grade, ver
`docs/governance/engineering-discipline.md`).

## 8. Restricciones explícitas (lo que este contrato NO hace HOY)

- No toca `computePoiMaturity` ni el orden POI-0..10.
- No toca marker fill ni health rings.
- No crea columna en `locations` (ver §9, follow-up).
- No re-enrich automático.
- No migra datos.
- No introduce gates de visibilidad ni de export (export sigue regido por
  `evaluatePoiExport`).
- No cambia RLS.

## 9. Follow-up planeado: persistencia (PR-IDENTITY-ROOT-PERSIST-1)

Pendiente de aprobación explícita. Cuando se materialice:

```sql
ALTER TABLE locations
  ADD COLUMN identity_root_status text
  CHECK (identity_root_status IN ('A','B','C','D'));

ALTER TABLE locations
  ADD COLUMN identity_skip_reason text;  -- enum SkipReason

CREATE INDEX locations_root_pending_idx
  ON locations (identity_root_status)
  WHERE identity_root_status IN ('A','B','C');
```

- Trigger `recompute_identity_root` en INSERT/UPDATE de campos relevantes
  (`name`, `latitude`, `longitude`, `country_code`, `country_id`, `geo_health`,
  `enrichment_status`, `enriched_data`, `is_approved`, `deleted_at`,
  `metadata`).
- Backfill one-shot con paginación 1k.
- Cliente sigue calculando en runtime como fallback (no se quita); columna es
  optimización para queries server-side e índice de cola.
- Requiere flight readiness review (trigger sobre `locations` = sistema crítico).

## 10. Referencias

- `docs/contracts/poi-curation-levels.md`
- `docs/contracts/enrichment-coord-coherence-contract.md`
- `docs/contracts/geo-resolution-flags-contract.md`
- `docs/audits/poi-identity-root-status-dry-run.md` (heurística origen)
- `docs/audits/search-filter-root-status-filter-plan.md` (wiring UI)
- `mem://logic/poi/identity-root-status-canon` (memoria viva)
- `mem://governance/engineering-discipline`
- `mem://governance/rollout-policy`
