## Problema

Cuando marcas varias casillas en el árbol Geo (p. ej. Andalucía + Cataluña), el store ya filtra correctamente y muestra los puntos de ambas regiones, pero el mapa **no reencuadra** y se queda mostrando solo la primera zona porque el auto-zoom ignora la selección.

## Causa

En `src/components/LocationMap.tsx` (línea ~614) el `filterKey` que dispara el auto-zoom solo incluye breadcrumbs y filtros de búsqueda:

```ts
const filterKey = JSON.stringify({
  continent, country, region, zone,
  tag, placeType, onlyEnriched, searchTerm,
});
```

`selectedLocations` (las casillas marcadas) no está dentro, así que el `useEffect` de auto-zoom (línea ~1027) no se dispara cuando cambias la selección y el mapa no hace `flyToBounds` sobre la nueva combinación de ramas.

Además, cuando hay selección activa los breadcrumbs se limpian (regla transversal), por lo que `filterKey` no cambia entre selecciones distintas.

## Solución (transversal, una sola regla global)

Incluir una huella estable de `selectedLocations` en `filterKey` para que el auto-zoom existente (`zoomToBounds(false, 0)`) reaccione automáticamente a cualquier cambio de selección. El zoom resultante usa los `locations` ya restringidos por el store, por lo que abarcará todas las ramas marcadas a la vez.

### Cambios

**`src/components/LocationMap.tsx`**

1. Añadir al `filterKey` una firma compacta de `selectedLocations`:
   - `selectionSize: selectedLocations.size`
   - `selectionHash`: hash determinista de los ids ordenados (o `Array.from(selectedLocations).sort().join(',')` si el tamaño es razonable; para conjuntos grandes, hash simple por suma de chars).
   
   Esto hace que añadir/quitar Andalucía, Cataluña, etc. cambie `filterKey` y dispare el `useEffect` de auto-zoom existente.

2. No tocar la lógica de `zoomToBounds`: ya hace `flyToBounds` sobre **todos** los `locations` filtrados (que el store ya restringe a la selección). Por tanto, con el `filterKey` corregido, el zoom abarcará automáticamente todas las ramas seleccionadas.

3. Caso especial: si la selección queda vacía (usuario desmarca todo) y tampoco hay breadcrumb, `filterKey` también cambia y el mapa hace fitBounds a todos los puntos visibles. Comportamiento coherente.

### Por qué es transversal

- Una única fuente de verdad: el `useEffect` de auto-zoom ya existente (línea ~1027) seguirá siendo el único punto que reencuadra el mapa por cambios de filtros/selección.
- No se añaden listeners ni eventos nuevos.
- La regla "el mapa enfoca lo visible" se aplica igual para breadcrumbs, búsqueda, tags, y ahora también para selección manual de ramas.

## Archivos a editar

- `src/components/LocationMap.tsx` — extender `filterKey` con la firma de `selectedLocations` y añadir `selectedLocations` al destructuring del store si no está ya disponible en ese scope (ya lo está, línea 532).

## Verificación

1. Marcar Andalucía → mapa hace flyTo sobre Andalucía.
2. Añadir Cataluña → mapa hace flyTo a un bounds que abarca **ambas** regiones.
3. Desmarcar Andalucía → mapa hace flyTo solo sobre Cataluña.
4. Limpiar selección → mapa vuelve al fitBounds de todos los puntos visibles.
