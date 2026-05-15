# Contract — Heavy Operations

## Propósito
Feedback transversal de operaciones pesadas en cliente (filtros, fits, render). Sin acoplar UI a la naturaleza de la operación.

## Variables canónicas
| Variable | Tipo |
|---|---|
| `HeavyOpStatus` | `'pending' \| 'running' \| 'done' \| 'error'` |
| `HeavyOpSource` | `'filter' \| 'subset-fit' \| 'enrichment' \| 'import' \| 'geocoding' \| 'render'` |
| `operationId` | `string` (estable, reproducible) |
| `indeterminate` | `boolean` (default `true`) |
| `progress` / `etaMs` | solo definidos cuando indeterminate=false |

## Ownership
- Store único: `useHeavyOpsStore` (zustand, `src/shared/operations/heavy-operations-store.ts`).
- API: `startOperation`, `markRunning`, `setProgress`, `finishOperation`, `failOperation`.
- Selector hook: `useActiveHeavyOperations` (memoiza el array).

## Lifecycle
```text
startOperation → pending
   ↓ markRunning?           ↓ setProgress (flips to running, indeterminate=false)
running
   ↓ finishOperation         ↓ failOperation
done (purge 1.5s)            error (purge 4s)
```

## Watchdog
| Source | safetyTimeoutMs default |
|---|---|
| filter | 10000 |
| subset-fit | 10000 |
| render | 15000 |
| enrichment / import / geocoding | 0 (sin watchdog — tienen sus propios sistemas) |

Si `pending|running` al expirar → `failOperation('Tiempo agotado…')`.

## Forbidden writes
- Mutar `useHeavyOpsStore.setState` directamente desde fuera del store.
- Inferir ETA (NUNCA. Solo se expone si el caller la provee vía `setProgress`).
- Reusar un `operationId` mientras la previa esté `pending|running` con `blockReentry: true` (la API devuelve `false`).

## Invariantes
1. `operationId` es la única clave; mismo id = misma operación.
2. `progress` y `etaMs` son `null` mientras `indeterminate=true`.
3. Auto-purge: done 1.5s, error 4s.
4. `blockReentry` protege contra doble click.
5. El watchdog garantiza que ninguna op queda colgada.

## Ejemplos válidos
- Popover Mis POI click "Enriquecidos":
  - `startOperation({ operationId: 'my-catalog-popover:visual:enriched', label: 'Filtrando…', source: 'filter', indeterminate: true, blockReentry: true, safetyTimeoutMs: 10000 })`
  - tras matcher: `finishOperation(opId, { resultLabel: 'Filtro aplicado' })`
  - subset vacío: `finishOperation(opId, { resultLabel: 'Sin resultados' })`

## Anti-patrones detectados
- Phase 1: SOLO `MyCatalogQuickFilters` está cableado. `enrichment/import/geocoding` mantienen sus lanes históricos.
- (Vigilar) Calleres que llaman `finishOperation` antes de que el efecto real haya terminado — el `resultLabel` `'Filtro aplicado'` significa "lanzado", no "fit completado".

## Validation Notes (revisión manual contra código real)

| Inv. | Estado | Archivo | Símbolo | Evidencia | Backlog |
|---|---|---|---|---|---|
| 1 (`operationId` clave única) | **validated** | `src/shared/operations/heavy-operations-store.ts` | `startOperation` L.97-117 | Lee `existing` por id; `blockReentry && isAlive(existing) → return false` (L.103) | — |
| 2 (`progress`/`etaMs` null mientras indeterminate) | **validated** | `src/shared/operations/heavy-operations-store.ts` | `setProgress` L.155 | `setProgress` flips a determinate y solo entonces expone progress | — |
| 3 (auto-purge done 1.5s, error 4s) | **validated** | `src/shared/operations/heavy-operations-store.ts` | `finishOperation` L.179, `failOperation` L.209 | Implementación de purge presente en ambas funciones | — |
| 4 (`blockReentry` protege doble click) | **validated** | `src/shared/operations/heavy-operations-store.ts` | L.100-103 | Default `false`; cuando `true`, segundo `startOperation` con id vivo retorna `false` | — |
| 5 (watchdog garantiza no-hang) | **validated** | `src/shared/operations/heavy-operations-store.ts` | L.122-130 | `timeoutMs = input.safetyTimeoutMs ?? DEFAULT_TIMEOUT[source]`; si vivo al expirar → `failOperation('Tiempo agotado…')` | BL-005 |
| ETA nunca inferida | **validated** | `src/shared/operations/heavy-operations-store.ts` | comentario header + ausencia de cálculos de ETA en el store | Solo se expone si caller la pasa explícitamente vía `setProgress` | — |
| Phase 1 cobertura limitada | **validated** (deuda declarada) | callers actuales | Solo `MyCatalogQuickFilters` cableado | `enrichment/import/geocoding` mantienen lanes propios | BL-006 |
| `finishOperation('Filtro aplicado')` significa "lanzado" no "fit completado" | **mismatch semántico** (vigilar) | `src/components/toolbar/MyCatalogQuickFilters.tsx` (uso) | label de cierre | El usuario puede creer que el fit ya terminó cuando solo se ha despachado el evento | BL-006 |

## Referencias
- ADR-0006
- mem://logic/operations/heavy-operations-feedback
- Código: `src/shared/operations/heavy-operations-store.ts` L.9-220
