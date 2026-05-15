# Contract — Focus & Selection

## Propósito
Modelar dos conceptos ortogonales:
- **Focus**: el POI bajo atención visual del usuario (cero o uno).
- **Selección múltiple**: conjunto operativo para acciones masivas.

## Variables canónicas
| Variable | Tipo | Default |
|---|---|---|
| `focusedLocationId` | `string \| null` | `null` |
| `selectedLocations` | `Set<string>` | `new Set()` |

## Ownership
- Store: `src/domains/content/store/locations-store.ts`.
- Único escritor permitido: setters del propio store (`setFocusedLocationId`, `toggleSelection`, `selectAll`, `clearSelection`, `setSelectedLocations`).
- Reset transversal: cambio de `viewMode` o `documentId` → ambos a vacío (líneas ~224, ~241-254 del store).

## Source of truth
`useLocationsStore` (zustand). El renderer (`LocationMap`) SOLO lee.

## Eventos canónicos
| Acción | Mutación | Side-effect aceptado |
|---|---|---|
| Click en marker | `setFocusedLocationId(id)` | apertura de popup vía `marker.openPopup()` |
| Click en checkbox / shift-click | `toggleSelection(id)` | ninguno |
| Selección N→0 | `clearSelection()` | ninguno |
| Selección 0→N | `setSelectedLocations(ids)` | `requestSubsetFit(ids, { mode: 'if-outside', reason: 'selection-start' })` con debounce 250ms |
| `popupclose` | `setFocusedLocationId(null)` si el id coincide | ninguno |

## Forbidden writes
- Mutar `selectedLocations` desde `LocationMap`, `FilterBar` o popovers (deben llamar setters del store).
- Persistir `focusedLocationId` cross-session.
- Asumir que `focusedLocationId ∈ selectedLocations` (son ortogonales).

## Invariantes
1. `focusedLocationId` y `selectedLocations` son independientes.
2. Cambiar `viewMode` los resetea atómicamente.
3. El marker focused renderiza con `renderMode='rich'` y tamaño aumentado (`createCustomIcon`).

## Ejemplos válidos
- Selección masiva sin focus: posible (Set lleno, `focusedLocationId=null`).
- Focus sin selección: caso típico de exploración.

## Anti-patrones detectados
- Stale closures sobre `focusedLocationId` en handlers per-marker (ver ADR-0001 y popup-contract).
- Reset de selección desde fuera del store (no detectado actualmente — vigilar).

## Validation Notes (revisión manual contra código real)

| Inv. | Estado | Archivo | Símbolo | Evidencia | Backlog |
|---|---|---|---|---|---|
| 1 (focus y selection ortogonales) | **validated** | `src/domains/content/store/locations-store.ts` | tipos L.47-48 | `selectedLocations: Set<string>` y `focusedLocationId: string\|null` declarados independientes; setters separados (L.286-307, L.322) | — |
| 2 (cambio de viewMode/documentId los resetea) | **validated** | `src/domains/content/store/locations-store.ts` | reset L.241-254 | Ambos campos vuelven a vacío atómicamente | — |
| Único escritor permitido (setters del store) | **validated** | `src/domains/content/store/locations-store.ts` | `clearSelection` L.296, `toggleSelection` L.286-289, `setFocusedLocation` L.322 | rg de `selectedLocations:` fuera del store no devuelve writes en componentes UI | — |
| Reset por unmount de location eliminada | **validated** | `src/domains/content/store/locations-store.ts` | L.196-205 | Limpia ids de `selectedLocations` cuando `removedLocationIds` no es vacío | — |
| Selección 0→N dispara `requestSubsetFit('if-outside','selection-start')` | **validated** | `src/components/discovery/use-selection-fit-on-start.ts` | hook | Cableado en `LocationMap` con debounce 250ms (ver subset-fit-contract) | — |
| `popupclose` limpia focus si coincide id | **validated** | `src/components/LocationMap.tsx` | handler L.1436-1446 | Lee `useLocationsStore.getState()` (no closure); aplica deselect canónico | BL-001 |
| 3 (focused renderiza `rich`) | **unclear** | `src/components/markers/createCustomIcon.ts` (no inspeccionado en esta pasada) | — | Documentado en marker-grammar; sin verificar evidencia directa en esta sesión | BL-007 |

## Referencias
- ADR-0001
- Código: `src/domains/content/store/locations-store.ts` líneas 47-352
- `src/components/discovery/use-selection-fit-on-start.ts`
