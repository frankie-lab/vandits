
# Lógica de Colecciones — Unificada

## Modelo conceptual

Una colección agrupa puntos/rutas. Tiene un atributo nuevo `in_catalog` que define si sus miembros forman parte del catálogo general visible por defecto.

```text
Origen importación        →  in_catalog
─────────────────────────────────────────
Web/Atlas (scrape)        →  true
Archivo KML/GPX/CSV       →  true   (si el flujo importa con "aprobar")
                          →  false  (si el flujo importa sin aprobar)
OneDrive (foto→punto)     →  false
Manual (creada vacía)     →  false  (default)
```

`in_catalog` se decide al crear la colección, según el flujo de origen, y queda editable manualmente desde el diálogo de apariencia (toggle "Añadir al catálogo general").

## Reglas de visibilidad

### Por defecto (al iniciar sesión)
- Colecciones con `in_catalog = true` → **visibles** (sus puntos se muestran junto al catálogo general).
- Colecciones con `in_catalog = false` → **ocultas** (sus puntos no aparecen en el mapa general).

### Acción del ojo en la lista
- Click en ojo → invierte el estado **solo durante la sesión**.
- Al recargar/login, todo vuelve al estado por defecto (derivado de `in_catalog`).
- Un punto que pertenece a varias colecciones es visible si **al menos una** de ellas está visible.

### Persistencia
- `in_catalog` → DB (`collections.in_catalog boolean default false`).
- Estado de visibilidad de sesión → solo en memoria (singleton ya existente `collection-visibility.ts`), nunca persistido.

## Estilo visual del marcador

```text
┌─────────────────────────┐
│   Anillo exterior       │  ← color de la colección (si visible)
│  ┌───────────────────┐  │
│  │ Centro del punto  │  │  ← paleta de estado (verde/gris/naranja)
│  │ + icono de estado │  │     (NUNCA se sobrescribe)
│  └───────────────────┘  │
└─────────────────────────┘
```

- El icono y color de la colección **solo afectan al anillo exterior** del marcador en el mapa.
- El centro mantiene la paleta única de estado (`getPointVisualState`).
- Si un punto pertenece a varias colecciones visibles → se aplica el anillo de la primera (orden alfabético, igual que hoy).
- En la fila de la lista de colecciones, el icono de colección sí es el icono visible (sin cambios).

## Cambios técnicos

### Base de datos
- Migración: `ALTER TABLE collections ADD COLUMN in_catalog boolean NOT NULL DEFAULT false;`
- Backfill por origen (script único): poner `true` en colecciones creadas por flujos Web/Atlas y archivos aprobados; `false` en OneDrive y manuales.

### Helper central (`collection-visibility.ts`)
- Inicialización de la sesión: cargar todas las colecciones del usuario y sembrar el estado `visible` con las que tengan `in_catalog = true`.
- API existente (`toggleCollectionVisibility`, `getTintForLocation`) sin cambios de firma.
- Nueva utilidad `isPointVisibleViaCollections(locId)` para que el filtro de mapa pueda mostrar puntos de colecciones `in_catalog=false` cuando el ojo esté activo.

### Filtro de visibilidad en el mapa
- Regla actual: `isLocationVisibleInGlobalMap(loc)` muestra solo `is_approved=true`.
- Nueva regla compuesta:
  ```text
  visible = isLocationVisibleInGlobalMap(loc)
         OR isPointVisibleViaCollections(loc.id)
  ```
- Esto permite que puntos no aprobados (p.ej. OneDrive) aparezcan cuando el usuario active el ojo de su colección.

### Renderer del marcador (`map-v2-renderer.ts`)
- Si `getTintForLocation(id)` devuelve color → añadir un `<div>` overlay como anillo exterior (~3px) con ese color, **sin tocar** `fillColor` del centro.
- Para rutas: el tinte de colección sustituye al color base de la polilínea (comportamiento actual conservado).

### UI (`CollectionsListPanel` + `CollectionAppearanceDialog`)
- Añadir badge "En catálogo" / "Privada" en cada fila según `in_catalog`.
- En el diálogo de apariencia, nuevo toggle "Añadir al catálogo general" que escribe `in_catalog`.
- Tooltip del ojo se actualiza:
  - Colección `in_catalog=true` visible → "Ocultar de mapa (solo esta sesión)".
  - Colección `in_catalog=true` oculta → "Mostrar de nuevo".
  - Colección `in_catalog=false` oculta → "Mostrar en mapa (solo esta sesión)".
  - Colección `in_catalog=false` visible → "Ocultar".

### Memoria a registrar
Nueva entrada `mem://logic/collections/visibility-rules` documentando:
- `in_catalog` derivado del origen al crear, editable manualmente.
- Default visible si `in_catalog=true`, oculta si `false`.
- Ojo = override de sesión, nunca persistido.
- Anillo exterior = color colección; centro = paleta de estado.

## Fuera de alcance
- No se modifica el comportamiento de aprobación masiva (`is_approved`).
- No se introduce edición compartida de colecciones (visibility de DB sigue siendo `private`/`public`).
- No se cambia la lógica de borrado ni el `auto-delete` cuando queda vacía.
