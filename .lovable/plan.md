## Problema

En `NearbyPointCard` (`src/domains/content/components/PointContextActions.tsx`, líneas 172-215) la fila está dividida en dos bloques apilados verticalmente:

- Línea 1 = `flex` con nombre + botón Enriquecer
- Línea 2 = `flex` con `110m` + coordenadas (debajo)

Eso hace que:
1. El botón Enriquecer quede pegado a la línea del nombre y NO centrado respecto a las dos líneas.
2. La línea de datos (debajo) no comparte caja con el nombre, así que parecen desalineados.
3. La pastilla `110m` y el texto de coordenadas tienen alturas distintas y no quedan centrados entre sí.

## Cambio

Reestructurar `NearbyPointCard` a un layout de dos columnas:

```text
┌──────────────────────────────────────────────┐
│ Nombre del punto                       [✦]  │
│ 110m   40.9115, 8.7184                      │
└──────────────────────────────────────────────┘
```

- Contenedor raíz: `flex items-center gap-2` (centra el botón verticalmente respecto a la columna de texto completa).
- Columna izquierda: `flex-1 min-w-0` con dos líneas apiladas (`<p>` nombre + `<div>` datos).
- Botón Enriquecer: hermano `shrink-0`, sin `-my-1`, sin `self-start`. Queda centrado por `items-center` del padre.
- Línea de datos: mantener `flex items-center`, asegurar que la pastilla `110m` y las coordenadas comparten línea base centrada (`leading-none` en ambos hijos, `items-center` en el wrapper — ya está; eliminar `py-px` extra de la pastilla y usar `py-0.5` simétrico para que la altura no descentre).

## Archivos afectados

- `src/domains/content/components/PointContextActions.tsx` — solo el JSX de `NearbyPointCard` (líneas 183-214). No cambia lógica ni props.

## Fuera de alcance

- No tocar `NearbyPanel`, header del popup, ni estilos globales.
- No cambiar tamaños de fuente ni colores.