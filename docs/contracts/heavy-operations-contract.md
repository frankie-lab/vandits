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

## Referencias
- ADR-0006
- mem://logic/operations/heavy-operations-feedback
- Código: `src/shared/operations/heavy-operations-store.ts`
