# PR-FILTER-ROOTSTATUS-2.2 — Postflight (opción C, fila compacta)

**Estado:** ✅ Implementado y verde.
**Fecha:** 2026-05-24
**Decisión:** Opción C — fila compacta de chips A/B/C/D sobre el árbol, sin
5ª tab Identity.

---

## 1. Alcance

A/B/C/D deja de estar confinado al subtab **Mantener · Con deuda** y pasa a
exponerse como **fila compacta de chips** sobre el árbol Geo/Tipo/Tags/Legacy
en todos los universos relevantes:

- **Explorar** → universo = catálogo completo visible.
- **Mantener · Con deuda** → universo = `universeBase('debt')`.
- **Mantener · Sin enriquecer** → universo = `universeBase('unenriched')`.
- **Selección activa** → universo intersectado con `selectedLocations`.

Sin tab nueva. Sin schema. Sin backend. Sin cambios en marker fill ni POI-N.

## 2. Cambios

- **Componente nuevo** `src/components/discovery/RootStatusChipRow.tsx`
  - Counts derivados del `scopeLocations` recibido (única fuente).
  - Toggle del eje `filters.rootStatus`; `length === 0` ⇒ delete (no array
    vacío que confunda al matcher).
  - `data-testid`, `data-scope-total`, `data-selection-active` para QA.
- **`FilterBar.tsx`**:
  - Eliminado el bloque inline debt-only de chips (lines 510–548 originales).
  - Añadido `<RootStatusChipRow>` arriba del árbol dentro de
    `UniverseBaseProvider`, con scope `universeBaseLocations` o
    `universeBaseLocations ∩ selectedLocations` cuando hay selección.
  - `scopeLabel` refleja el modo activo (Explorar / Con deuda / Sin enriquecer).
  - `debtRootStatusCounts` conservado como alias para invariante I2 (no roto).
- **Test nuevo** `src/test/root-status-chip-row.test.tsx` — 5/5 PASS.

## 3. Invariantes verificadas

- `A + B + C + D === scopeLocations.length` (cubre todos los universos).
- I2 cliente: con scope = `universeBase('debt')`, A+B+C+D = subtab `Con deuda`.
- Toggle no muta otros ejes (`healthFilter`, `search`, etc.).
- Gating de "Resolver deuda" intacto (PR-FILTER-ROOTSTATUS-2.1 no afectado).
- Propagación a `effectiveActionSet`, `SelectionActions`, `ExportPanel` sin
  cambios — sigue leyendo `filters.rootStatus` vía `matchesLocationFilters`.

## 4. Tests

| Suite | Resultado |
|---|---|
| `src/test/root-status-chip-row.test.tsx` | ✅ 5/5 |
| `src/test/health-repair-partition.test.ts` | ✅ 10/10 |
| `src/test/poi-identity-root-status-client-parity.test.ts` | ✅ 23/23 |

## 5. Riesgos residuales

- Ninguno bloqueante. El row es puramente presentación + toggle de un eje ya
  existente.
- Coste de cómputo: una pasada `O(n)` adicional por render sobre
  `universeBaseLocations`; mitigado con `useMemo`. En catálogos grandes
  (>50k) puede revisarse memoización por `signature` si emerge presión.

## 6. Fuera de alcance (no implementado)

- 5ª tab Identity global (opción A) — descartada.
- Cambios en marker fill / POI-N — explícitamente excluidos.
- Cambios backend / schema / datos — explícitamente excluidos.
