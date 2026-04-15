

# Plan revisado: Importacion 3 etapas con separacion clara de capas y persistencia

## Problemas detectados en el plan actual

1. **Sin separacion de capas en modo documento**: Cuando `filterByDocumentId` esta activo (linea 274 del store), se devuelven todos los puntos sin distinguir catalogo vs workspace. Los marcadores no se asignan a sus LayerGroups correspondientes.

2. **Visibilidad dentro de documento no persistida**: Los toggles globales de capas persisten en localStorage, pero no hay estado por-documento (ej: "en este doc quiero ver rutas pero no waypoints").

## Cambios necesarios

### 1. Store: clasificar puntos en modo documento

En `getFilteredLocations`, cuando `filterByDocumentId` esta activo, anotar cada punto con su capa real:
- Puntos del documento con `isApproved=false` -> `_layerType = 'workspace'`
- Puntos coincidentes del catalogo (`isApproved=true`, en `filterByDocumentMatchIds`) -> `_layerType = 'catalog'`

Esto permite que `map-layer-groups.ts` los coloque en el LayerGroup correcto.

**Archivo**: `src/domains/content/store/locations-store.ts` (lineas 274-281)
```typescript
if (filterByDocumentId) {
  const matchSet = state.filters.filterByDocumentMatchIds
    ? new Set(state.filters.filterByDocumentMatchIds)
    : null;
  source = source.filter(loc => {
    if (loc._docId === filterByDocumentId) {
      (loc as any)._layerType = 'workspace';
      return true;
    }
    if (matchSet && matchSet.has(loc.id)) {
      (loc as any)._layerType = 'catalog';
      return true;
    }
    return false;
  });
  return source;
}
```

### 2. Map: usar `_layerType` al crear marcadores

En el codigo que crea marcadores (probablemente `map-icons.ts` o `LocationMap.tsx`), al asignar cada marcador a su LayerGroup, usar `loc._layerType` cuando esta definido, en lugar de inferirlo solo de `_docUserId`.

**Archivo**: donde se llama `getOrCreateGroup()` al crear marcadores

### 3. Visibilidad de capas: sin cambios necesarios

La persistencia actual es correcta para el caso global:
- `localStorage['vandits-layer-visibility']` persiste toggles de catalog, workspace, routes, points, followed, curator, druid
- Sobrevive a refresh y login
- El singleton `sharedLayers` se inicializa desde localStorage

Para el modo documento (mesa de trabajo), la visibilidad se hereda de los toggles globales de las capas. Si el usuario tiene `workspace: visible` y `catalog: visible` globalmente, ambos se veran en la mesa de trabajo. Esto es correcto porque el filtro `filterByDocumentId` ya limita el scope a solo ese documento + sus matches.

**No se necesita persistencia adicional por documento.**

### 4. UploadPreviewDialog: ya implementado

El dialogo unificado ya hace dedup y muestra badges "Catalogo" / "Nuevo" / "Descartado". Sin cambios adicionales.

### 5. DocumentFocusView: badges visuales

Ya muestra badges. Solo asegurar que:
- Badge "Catalogo" (sky blue) para puntos con `isApproved=true`
- Badge "WayPoint" para puntos con `isApproved=false`
- Las rutas respetan el toggle global de la capa `routes`

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `src/domains/content/store/locations-store.ts` | Anotar `_layerType` en modo filterByDocumentId |
| `src/types/location.ts` | Anadir `_layerType?: LayerType` a AnnotatedLocation |
| Archivo de creacion de marcadores en mapa | Usar `_layerType` para asignar a LayerGroup |

## Resumen de persistencia

| Ambito | Persiste? | Mecanismo |
|--------|-----------|-----------|
| Capas globales (catalog, workspace, routes...) | SI | localStorage `vandits-layer-visibility` |
| Entidades ocultas (usuarios, curators, druids) | SI | Mismo localStorage |
| Vista de documento (mesa de trabajo) | Hereda global | Sin persistencia extra necesaria |
| Opciones de importacion (enrich, categoria) | NO persisten | Se eligen en cada importacion |

