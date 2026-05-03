## Objetivo
Añadir un selector de **agrupación** en la cabecera de las listas de puntos para que el usuario pueda alternar entre tres modos:

- **Geografía** (default actual): jerarquía continent → country → region → … → street.
- **Categoría**: tipo del punto (`enrichedData.clasificacion.categoria_principal` con fallback a `place_type`).
- **Estado**: enriquecido (verde) / importado (gris) / vacío (naranja), usando `getPointVisualState`.

La elección se persiste por usuario (Nivel A, scope `user`) para que se recuerde entre sesiones y dispositivos.

## Alcance UI

1. **Lista general de puntos** (panel de catálogo / `DiscoveryOrchestrator` resultados).
2. **Vista de documento** — `DocumentWaypointsTabs.tsx`: el selector se aplica **dentro de cada pestaña** (Importados / Vacíos / Enriquecidos / Rutas) sin alterar las pestañas.

No se toca FloatingToolbar ni menú lateral global.

## Cambios técnicos

### 1. Helper central — `src/shared/geography/hierarchy.ts` (extender)
Añadir agrupadores genéricos paralelos a `groupLocationsByHierarchy`:

```ts
export type GroupingMode = 'geography' | 'category' | 'status';

export interface FlatGroup<T> {
  key: string;        // valor crudo
  label: string;      // texto a mostrar
  count: number;
  locations: T[];
}

export function groupLocationsBy(
  locations: GeoLocation[],
  mode: GroupingMode,
): HierarchyGroupNode[] | FlatGroup<GeoLocation>[];

export function groupLocationsByCategory(locs: GeoLocation[]): FlatGroup<GeoLocation>[];
export function groupLocationsByStatus(locs: GeoLocation[]): FlatGroup<GeoLocation>[];
```

- `category`: lee `enrichedData.clasificacion.categoria_principal`; fallback `place_type`; `__unclassified__` cuando falta.
- `status`: usa `getPointVisualState(loc)` → `enriched | imported | empty`. Etiquetas: "Enriquecidos", "Importados", "Vacíos".
- Orden interno alfabético por `name`. Grupos `unclassified` siempre al final.

### 2. Persistencia (Nivel A)
Reutilizar el sistema de preferencias existente (`shared/preferences/`):

- key: `content.list_grouping`
- valor: `'geography' | 'category' | 'status'`
- scope: `user`
- default: `'geography'`

Hook nuevo: `src/shared/preferences/use-list-grouping.ts` que devuelve `[mode, setMode]`.

### 3. Tipos — `src/types/location.ts`
Extender el ya existente `sortMode` para no duplicar conceptos: añadir tres nuevos modos `'category' | 'status'` a `sortMode` o, mejor, mantenerlos separados como `groupMode` para no romper consumidores. Plan: **separados** (`groupMode`) porque `sortMode` ya gestiona alfabético/fecha que pueden coexistir con cualquier agrupación.

```ts
groupMode?: 'geography' | 'category' | 'status'; // default 'geography'
```

### 4. Store — `src/domains/content/store/locations-store.ts`
- `getFilteredLocations()` sigue devolviendo lista plana ordenada por `sortMode`.
- Nuevo selector `getGroupedLocations()` que delega en `groupLocationsBy(filtered, filters.groupMode ?? 'geography')`.

### 5. Componente compartido — `src/shared/components/ListGroupingSelect.tsx`
Pequeño `<Select>` (shadcn) con icono Lucide `Layers`, tres opciones, `h-8`. Usado por:
- Cabecera de la lista general.
- Cabecera dentro de `DocumentWaypointsTabs` (justo encima de las `TabsContent`, fuera de `TabsList`).

### 6. Render
Ambas listas pasan a iterar grupos:
- Modo Geografía: árbol colapsable como ya existe (si la lista general usa árbol) o headers planos del primer nivel + breadcrumb.
- Modo Categoría / Estado: headers planos `<h3>` con `count` + items dentro.
- Virtualización: mantener `useVirtualizer` en `DocumentWaypointsTabs` con un único array intercalado `[header, ...items, header, ...items]` y `estimateSize` por tipo.

## Diagrama de cabecera de pestaña

```text
[ Tabs: Importados | Vacíos | Enriquecidos | Rutas ]
[ Buscar...                       Agrupar por: [v] ]
[ ── Categoría: Castillos (12) ── ]
  · Punto A
  · Punto B
[ ── Categoría: Playas (4) ── ]
  · Punto C
```

## Archivos afectados
- `src/shared/geography/hierarchy.ts` (extender)
- `src/shared/preferences/use-list-grouping.ts` (nuevo)
- `src/shared/components/ListGroupingSelect.tsx` (nuevo)
- `src/types/location.ts` (añadir `groupMode`)
- `src/domains/content/store/locations-store.ts` (nuevo selector)
- `src/domains/content/components/DocumentWaypointsTabs.tsx` (integrar selector + render por grupos)
- Lista general del catálogo: el componente concreto se identifica al implementar (consumidor de `getFilteredLocations`).
- `mem://index.md` + nueva memoria `mem://ui/list-grouping-selector` documentando la regla.

## Reglas que respeta
- Cambio transversal: helper central único en `shared/geography`.
- Sin emojis, iconos Lucide.
- Sin ruptura de `compareLocationsHierarchical` ni del orden por defecto.
- No toca palette de marcadores (solo lee `getPointVisualState` en modo Estado).
