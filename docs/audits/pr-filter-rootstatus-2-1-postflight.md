# PR-FILTER-ROOTSTATUS-2.1 — Postflight

**Estado:** ✅ Cerrado en verde (incluye hotfix PR-FILTER-ROOTSTATUS-2.0.1).
**Fecha:** 2026-05-24
**Alcance:** Gating de "Resolver deuda" por Root Status A/B/C/D + restauración de paridad cliente↔Deno.

---

## 1. Causa raíz (PR-FILTER-ROOTSTATUS-2.0.1)

El test de paridad `B · canon_gap` fallaba porque la fixture usaba
`country_code: "JP"` asumiendo que estaba fuera del canon territorial.
JP **sí está incluido** en `TERRITORIAL_CANON` en ambos lados:

- Cliente: `src/shared/geography/territorial-canon.ts:86`
- Deno:    `supabase/functions/_shared/territorial-canon.ts:81`

Ambos clasificadores devolvían `D` correctamente. **No había drift
cliente↔Deno**: el bug vivía en la fixture, no en la lógica.

## 2. Fix aplicado

`src/test/fixtures/poi-identity-root-status.fixtures.json` — caso
`B · canon_gap` actualizado:

- `country_code`: `"JP"` → `"XX"` (ISO-3166-1 alpha-2 no asignado,
  garantizado fuera de canon en ambos lados, presente y futuro).
- `_note` añadida explicando por qué JP no sirve como contraejemplo.

Sin cambios en clasificadores, contrato A/B/C/D, datos, schema ni backend.

## 3. Tests

| Suite | Resultado |
|---|---|
| `src/test/poi-identity-root-status-client-parity.test.ts` | ✅ 23/23 |
| `src/test/health-repair-partition.test.ts` | ✅ 10/10 |

## 4. Confirmaciones

- ✅ **Paridad cliente↔Deno 100%** sobre fixtures compartidas (≥21 casos).
- ✅ **Gating Resolver deuda** validado: `enqueue_health_repair` SOLO recibe
  `repairableIds` (D ∩ {partial, chain}). A/B/C/nonRepairable jamás llegan
  al RPC. Si `repairableCount === 0`, el botón de confirmación queda
  deshabilitado con copy explícito.
- ✅ Partición sin solapes (5 grupos, suma == `scope.total`).
- ✅ Marker fill no afectado. POI-N no afectado.

## 5. Riesgos residuales

- Ninguno bloqueante. La fixture `XX` es estable frente a futuras
  expansiones de `TERRITORIAL_CANON` (códigos no asignados ISO).
- El filtrado server-side defensivo de `enqueue_health_repair` sigue
  siendo SoT — el gating cliente es defensa en profundidad, no sustituto.

## 6. Siguiente paso (opcional, pendiente de aprobación)

**PR-FILTER-ROOTSTATUS-2.2 — 5ª tab Identity global** en el árbol de
"Buscar y Filtrar":

- Tab Identity visible en todos los universos (no sólo Mantener → Con
  deuda).
- Reutiliza `rootStatus` ya en `FilterCriteria` + `matchesLocationFilters`.
- Chips A/B/C/D con counts derivados de `universeBase(activeUniverse)`.
- Sin cambios de schema/backend/datos.

**No iniciar sin OK explícito.**
