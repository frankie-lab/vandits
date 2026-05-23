## Objetivo

Eliminar la asimetría visual y semántica entre el contador "sin selección" y "con selección" del `FilterBar`. Las dos vistas hablan del mismo universo de POIs y deben usar el mismo formato y vocabulario.

## Estado actual (problema)

```
Sin selección:   4739 de 5095 ubicaciones
                 4739 catálogo · 0 mesa

Con selección:   1 / 4739 seleccionado
                 1 / 4739 Míos · 0 / 0 Seguidos
```

Tres incoherencias:
- Formato distinto: `X de Y` vs `X / Y`.
- Vocabularios distintos: `catálogo / mesa` vs `Míos / Seguidos`.
- Denominador del bucket "Seguidos" siempre era `0` porque usaba `bucketStats.followedTotal` calculado sobre el subset filtrado.

## Estado objetivo

Formato único en ambas vistas: `X / Y etiqueta`.

```
Sin selección:   0 / 4739 seleccionados
                 0 / 4739 Míos · 0 / 5095 Seguidos

Con selección:   4247 / 4739 seleccionados
                 4247 / 4739 Míos · 0 / 5095 Seguidos
```

### Definición de cada par X/Y

| Bucket | X (numerador) | Y (denominador) |
|---|---|---|
| Seleccionados | `selectedCount` | `filteredCount` (universo filtrado del usuario, p. ej. 4739) |
| Míos | `ownershipRatios.Xm` | `filteredCount` (mismo universo filtrado) |
| Seguidos | `ownershipRatios.Xs` | `stats.total` (universo absoluto del usuario, p. ej. 5095) |

Reglas:
- Cuando `selectedCount === 0`, numerador = 0 (no cambia el formato).
- Etiquetas siempre `seleccionados` (plural, también con 1 y con 0; el plural en castellano no rompe nada y mantiene consistencia).
- El denominador de "Seguidos" usa `stats.total` (total absoluto del universo del usuario, lo que hoy se muestra como "de 5095 ubicaciones"). Eso explica por qué `Seguidos` puede ser `0 / 5095` aunque "Míos" sea `4247 / 4739`: ejes ortogonales (origen vs propiedad).
- Mismo tamaño tipográfico para X e Y. Color numerador = `text-primary`. Color denominador = `text-muted-foreground`. Etiquetas (`seleccionados` / `Míos` / `Seguidos`) en sus colores actuales.

### Lo que se elimina

- La rama "sin selección" con `4739 de 5095 ubicaciones` desaparece.
- El desglose `catálogo · mesa · seguidos` desaparece de esta línea (sigue existiendo en otros sitios del producto si los hubiera; no se tocan).

## Archivos a modificar

- `src/components/FilterBar.tsx` — colapsar las dos ramas (`selectedCount > 0` / `else`) en una sola estructura, con numeradores que valgan 0 cuando no haya selección. Líneas afectadas aproximadas: 234-285.
- `src/test/selection-counter-ratios.test.ts` — añadir asserts del estado "sin selección" (numeradores en 0, denominadores correctos) y confirmar que `Seguidos` usa `stats.total` como denominador, no `bucketStats.followedTotal`.

## Detalles técnicos

- `filteredCount`: ya disponible en FilterBar; es el subset filtrado del universo del usuario.
- `stats.total`: viene de `useEnrichedStats()`; es el universo absoluto (la fuente del 5095).
- `ownershipRatios.{Xm,Xs}`: ya calculados sobre el universo independiente de selección (PR previo). No se tocan.
- No se cambia `getFilteredLocations()`, ni el cálculo de selección, ni `bucketStats`, ni `ExportPanel`, ni PR-EXPORT-2.
- Sin cambios de schema, datos, backend, ni bump.

## Verificación

1. `selection-counter-ratios.test.ts` debe seguir en 21/21 PASS más los asserts añadidos del estado sin selección.
2. Inspección visual en `/` con y sin selección: los tres ratios deben renderizarse con mismo tamaño y formato `X / Y etiqueta`.
3. Comprobar que al seleccionar/deseleccionar todo, sólo cambian los numeradores, nunca los denominadores ni las etiquetas.

## Fuera de alcance

- Renombrar "catálogo / mesa" en otros lugares del producto.
- Tocar `getBucketStats`, `getFilteredLocations`, ExportPanel, PR-EXPORT-2.
- Cualquier cambio en la línea de "Filtros activos" inferior (línea 315).
