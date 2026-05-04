# Unificación transversal: Catálogo vs Mesa de trabajo

## Problema

Hay tres componentes contando "Catálogo" con criterios distintos:

- **FloatingToolbar** cuenta puntos cuyo `documents.status = 'published'` (da 2959 falsos)
- **FilterBar / TagsTree / GeoTree** cuentan por `location.isApproved` (da 508 reales)
- **LocationMap** asigna capa `catalog` vs `workspace` por `documents.status`, no por el flag del punto

Resultado: el contador del top-bar no coincide con los marcadores azules del mapa ni con los filtros.

## Solución: Single Source of Truth

`location.isApproved` es el ÚNICO decisor de Catálogo. `documents.status` queda como metadato editorial sin efecto en mapa ni contadores (ya consolidado en `mem://logic/map/visibility-rule-rls-only`).

### Matriz canónica de buckets

Cada punto visible cae en exactamente uno de estos 4:

| Bucket             | Dueño   | is_approved |
|--------------------|---------|-------------|
| `myCatalog`        | yo      | true        |
| `myWorkspace`      | yo      | false       |
| `followedCatalog`  | seguido | true        |
| `followedWorkspace`| seguido | false       |

## Cambios

### 1. Nuevo helper `src/domains/content/lib/location-bucket.ts`

```ts
export type LocationBucket = 'myCatalog' | 'myWorkspace' | 'followedCatalog' | 'followedWorkspace';

export function getLocationBucket(loc, currentUserId): LocationBucket {
  const isOwn = !!currentUserId &&
    (loc.ownerUserId === currentUserId || loc._docUserId === currentUserId);
  return isOwn
    ? (loc.isApproved ? 'myCatalog' : 'myWorkspace')
    : (loc.isApproved ? 'followedCatalog' : 'followedWorkspace');
}

export function getBucketStats(locs, currentUserId) {
  // devuelve { myCatalog, myWorkspace, followedCatalog, followedWorkspace,
  //           catalogTotal, workspaceTotal, total }
}
```

### 2. `src/components/LocationMap.tsx`

Reemplazar la asignación de `_layerType` para que dependa del punto, no del documento:

```ts
layerType = location.isApproved ? 'catalog' : 'workspace';
```

Eliminar la rama que mira `document.status === 'published'`.

### 3. `src/components/FloatingToolbar.tsx`

- Verde = `myCatalog` (mis puntos curados)
- Azul = `catalogTotal` (myCatalog + followedCatalog)
- Quitar el cálculo basado en `documents.status`.

### 4. `src/components/FilterBar.tsx`

Bajo el total visible (3116) añadir desglose:
`508 catálogo · 2608 mesa · N seguidos`

usando `getBucketStats` sobre las locations ya filtradas.

### 5. Memoria

Actualizar `mem://index.md` Core: la regla del top-bar pasa a apuntar a `getLocationBucket` como única fuente; añadir entrada `mem://logic/content/location-bucket-matrix`.

## Resultado esperado

- FilterBar: `3116 visibles — 508 catálogo · 2608 mesa · X seguidos`
- Top bar: `508 / 508` (mis curados / catálogo total accesible)
- Mapa: 508 marcadores en capa Catálogo, 2608 en Mesa, coherentes con TagsTree, GeoTree y la paleta verde/gris/naranja.
- `documents.status` deja de afectar a contadores y capas en cualquier vista.
