# ADR-0002 — Separación visibilidad vs gramática

## Problema
La decisión de "qué mostrar" y "cómo mostrarlo" estaban mezcladas en el renderer. Resultados:
- Cambiar zoom gates obligaba a tocar lógica de color.
- Forma del marker dependía de filtros activos.
- Imposible auditar visibilidad de forma independiente.

## Decisión
Establecer un pipeline canónico estricto:

```text
resolvePoiSource          (clasificación lógica)
  → resolveShareability   (puede entrar al mapa cross-user?)
  → filterBySource        (filtro por capa)
  → resolveMarkerGrammar  (forma + color + rings)
  → resolveLayerGroupKey  (capa física: own/followed/app/source)
  → applyLayerVisibility  (zoom gates + entityHidden + minVisibilityZooms)
  → createCustomIcon      (renderer puro)
```

- Clasificación física (`resolveLayerGroupKey`) y visibilidad (`resolveLayerVisibility` + zoom gates) **separadas**.
- `createCustomIcon` SOLO lee `MarkerGrammar`. No decide.

## Consecuencias
- Un POI puede cambiar de capa sin cambiar de aspecto y viceversa.
- `bypassZoomGates` puede activarse condicionalmente (caso `filterByUserId`) sin tocar grammar.
- Los renderers no son stateful.

## Tradeoffs
- Más pasos en el pipeline; mayor verbosidad.
- Cualquier nueva feature visual debe encajar en `MarkerGrammar` o ampliarlo formalmente.

## Archivos afectados
- `src/components/map/map-layer-groups.ts`
- `src/hooks/use-layer-visibility.ts`
- `src/design-system/map/rules/poi-visual-rules.ts`
- `src/components/LocationMap.tsx` (factories de markers)
