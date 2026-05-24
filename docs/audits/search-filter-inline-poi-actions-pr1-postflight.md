# Postflight — PR-INLINE-1: POI row inline en Mantener → Con deuda

> **Plan**: `docs/audits/search-filter-inline-poi-actions-plan.md`
> **Decisión**: APROBADO
> **Versión**: sin bump (bump diferido al cierre del paquete inline, según política).

## 1. Alcance entregado

- Renderizado de filas POI bajo nodos hoja del árbol `GeographyTree` **sólo** cuando el universo activo es `debt` (`Mantener → Con deuda`).
- Cada fila POI muestra:
  - badge `rootStatus` (A/B/C/D) con clase semántica por letra.
  - `ringHint` (primer ring activo del POI: `partial`/`chain`/`review`/`error`) cuando hay rings; oculto si no.
  - nombre del POI (truncado).
  - breadcrumb territorial corto (md+).
  - botón mínimo de mapa (`MapPin`).
- Click en la fila POI:
  - llama `useLocationsStore.getState().setFocusedLocation(id)` → abre el popup del POI.
  - llama `requestSubsetFit([id], { mode: 'always', reason: 'tree-row-focus' })`.
  - mantiene abierto Buscar y Filtrar (no cierra panel ni cambia subtab).
- Botón mapa por fila:
  - llama `requestSubsetFit([id], { mode: 'always', reason: 'tree-row-map-button' })`.
  - usa `event.stopPropagation()` para no disparar también el click de fila.

## 2. Fuera de alcance (confirmado)

Nada de lo siguiente se ha tocado:

- checkbox por POI.
- selección de grupo / tri-state nuevo en filas POI.
- footer inline nuevo.
- Geo Maintenance desde inline.
- Repair desde inline.
- Eliminación de `DebtResolutionPanel`.
- Schema, datos, backend, RLS, edge functions, Nominatim.
- Marker fill, POI-N, health rings, PR-EXPORT-2 core.

## 3. Archivos modificados

- **Creado**: `src/components/filters/TreePoiRow.tsx` — helper central (regla multiusuario) para fila POI inline. Encapsula classifier, rings, breadcrumb, focus y subset-fit.
- **Editado**: `src/components/filters/GeographyTree.tsx`:
  - Importa `useUniverseBase` y `TreePoiRow`.
  - `inlinePoisEnabled = universeCtx?.mode === 'debt'` activa el modo inline.
  - Indexa `locationsById` (O(1)) para resolver POIs por id de hoja.
  - `renderNode` calcula `showInlinePois` (leaf + ids > 0 + modo `debt`) y trata el nodo como expandible.
  - Al expandir, renderiza `TreePoiRow` por id heredando la sangría.
- **Creado**: `src/test/tree-poi-row-pr-inline-1.test.tsx` — 5 contract tests.
- **Creado**: este postflight.

No se ha modificado ningún archivo de schema, store o backend.

## 4. Tests

`bunx vitest run src/test/tree-poi-row-pr-inline-1.test.tsx`

```
Test Files  1 passed (1)
     Tests  5 passed (5)
```

Cubren:

1. Fila renderiza root status, ring hint y nombre — sin llamar a Supabase ni a `requestSubsetFit`/`setFocusedLocation` al montar.
2. Ring hint oculto cuando no hay rings.
3. Click en fila → `setFocusedLocation(id)` + `requestSubsetFit([id], 'tree-row-focus')`.
4. Botón mapa → `requestSubsetFit([id], 'tree-row-map-button')` y **no** `setFocusedLocation`.
5. Botón mapa hace `stopPropagation` — no se dispara también el click de fila.

Adicional (cubierto por construcción / inspección):

- `rootStatusFilter` recorta filas porque `node.ids` proviene de `filteredLocations`, que aplica `matchesLocationFilters` (incluye eje `rootStatus`).
- Las filas POI sólo aparecen cuando `universeCtx?.mode === 'debt'`. En `Explorar` / `Sin enriquecer`, el árbol mantiene comportamiento legacy (sin expansión inline, sin filas POI).
- Abrir el panel `Con deuda` no llama RPC: ninguna ruta nueva añade `supabase.rpc` / `supabase.functions.invoke`.

## 5. Garantías verificadas

| Garantía                                                       | Estado |
|----------------------------------------------------------------|--------|
| POIs aparecen bajo nodo hoja en `Con deuda`                    | OK     |
| Click fila llama `setFocusedLocation` / abre popup             | OK     |
| Botón mapa llama `requestSubsetFit` con `[id]`                 | OK     |
| Click botón mapa **no** dispara click fila                     | OK     |
| `rootStatusFilter` recorta filas visibles                      | OK (vía `node.ids` derivado de `filteredLocations`) |
| Abrir fila / panel no llama RPC ni edge functions              | OK     |
| Árbol Geo legacy (Explorar / Sin enriquecer) intacto           | OK (gated por `mode === 'debt'`) |
| Sin escritura en BD                                            | OK     |
| Sin checkbox por POI ni selección de grupo nueva               | OK (fuera de alcance) |

## 6. Riesgos y mitigaciones

- **Volumen de filas**: nodos hoja con muchos POIs podrían añadir cost de render. Mitigación: visible sólo al expandir manualmente (estado `expandedNodes`), sin auto-expandir leaves. Virtualización opcional en PR siguiente si surge.
- **Coherencia con otros árboles** (`ClassificationTree`, `TagsTree`, `PlaceTypeFilter`): PR-INLINE-1 cubre sólo `GeographyTree`. El helper `TreePoiRow` es central y reutilizable; los otros 3 árboles entrarán en PR-INLINE-2.
- **Doble click** sobre la fila: el handler es idempotente para `setFocusedLocation`; `requestSubsetFit` ya tiene cooldown manual (4s) según el contrato del listener.

## 7. Próximos PRs (no implementados aquí)

- **PR-INLINE-2**: cablear `TreePoiRow` en `ClassificationTree`, `TagsTree`, `PlaceTypeFilter`.
- **PR-INLINE-3**: checkbox por POI + tri-state por nodo + selección local.
- **PR-INLINE-4**: footer contextual sobre subset (selección o `treeSelection ∩ rootStatusFilter`).
- **PR-INLINE-5**: degradar `DebtResolutionPanel` a `Más acciones → Ver desglose`.
- Bump de versión al cierre del paquete.

## 8. Decisión

APROBADO. Cumple criterios:

- POIs visibles bajo nodos hoja en `Con deuda`.
- Click en fila abre popup.
- No hay escritura.
- Tests pasan (5/5).
- Postflight creado.
