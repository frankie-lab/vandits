# Limpiar leyenda del mapa

## Cambio

En `src/components/LocationMap.tsx` (líneas 2646–2652), eliminar el bloque del item **"Pendiente"** (pin azul `#3b82f6`).

La leyenda queda alineada con la regla canónica "Marker palette — 3 estados únicos":

- **Final** (verde `#22c55e`) → enriched
- **Importado** (gris `#9ca3af`) → imported
- **Vacío** (naranja `#f97316`) → empty

## Notas

- Cambio puramente cosmético, una sola edición.
- No se toca el contador `N / total` ni el botón zoom-to-fit.
- No se toca `getPointVisualState` ni `createCustomIcon` — ya respetaban la regla; la leyenda era el único punto inconsistente.
- Sin cambios de tokens ni de paleta global.
