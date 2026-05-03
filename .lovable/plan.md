# Limpieza popup de puntos importados + Enriquecer inteligente

## Contexto

Hoy, en `src/components/map/map-popups.ts` (líneas 1019–1079) **todo punto propio editable** muestra una rejilla 2×2 con: `Contexto cercano`, `Duplicar`, `Fusionar`, `Reclasificar`. Esto aparece tanto en waypoints de rutas como en puntos importados sueltos, y satura la ficha.

Además, el botón `Enriquecer` (líneas 462–493) llama directamente a `triggerEnrichLocation` aunque el punto no tenga nombre ni descripción — situación habitual en archivos KML/GPX importados — produciendo fichas IA pobres o erróneas.

## Cambios propuestos

### 1. Ocultar la rejilla de 4 botones en puntos importados

**Archivo:** `src/components/map/map-popups.ts`

Detectar si el punto es waypoint de ruta:

```ts
const isRouteWaypoint =
  location.placeType === 'route_waypoint' ||
  (location.placeType ?? '').startsWith('route_') ||
  location.customData?.is_route_waypoint === 'true';
```

Envolver el bloque de la rejilla (1019–1079) con `${(isOwn && canEditLocation && isRouteWaypoint) ? ` ... `: ''}`.

Resultado:
- **Punto importado normal** → ficha limpia, sólo `Enriquecer` + `Notas` + acciones de imagen/visitado.
- **Waypoint de ruta** → mantiene la rejilla de 4 acciones (es donde aplica).

### 2. "Enriquecer" inteligente cuando faltan nombre/descripción

Un punto importado sin texto útil no debe llamar a la IA a ciegas; en su lugar, abrir el panel "Contexto cercano" (`NearbyPanel`), que ya muestra:
- Puntos OSM y propios cercanos sobre el mapa.
- Menú derecho con tarjeta por opción (nombre, distancia, tipo, descripción mínima, badges).
- Selección que **actualiza la identidad** del waypoint sin crear duplicados (regla ya en memoria `proximity-context-no-duplicates`).

**Archivo:** `src/domains/content/lib/enrich-location.ts`

Al inicio de `triggerEnrichLocation`, antes del `supabase.functions.invoke`:

```ts
const nameMissing = !location.name || /^(unnamed|sin nombre|punto|waypoint)/i.test(location.name.trim());
const descMissing = !location.description || location.description.trim().length < 8;

if (nameMissing && descMissing) {
  toast.dismiss(toastId);
  window.dispatchEvent(new CustomEvent('open-nearby-context', {
    detail: { locationId, location, reason: 'enrich-needs-identity' },
  }));
  return { success: true };
}
```

`DocumentFocusView.tsx` ya escucha `open-nearby-context` (línea 459) y abre el `NearbyPanel`, así que la integración es automática en la vista de documento.

**En la vista global** (mapa principal sin documento abierto), añadir un listener equivalente en `src/pages/Index.tsx` que abra el mismo panel en el sidebar derecho, para que la lógica funcione también desde el mapa general.

### 3. Tras seleccionar un punto del contexto cercano

Cuando el usuario elige una sugerencia, `NearbyPanel` ya hace UPDATE del waypoint (nombre, coords ajustadas, place_type, country/region). A continuación:
- Si la opción venía de OSM → encadenar `triggerEnrichLocation` automáticamente (ahora sí con nombre válido).
- Si venía de un punto propio/seguido ya enriquecido → no enriquecer, simplemente refrescar.

Esto se hace dentro del handler `handleReplaceWithPoint` existente en `PointContextActions.tsx`, añadiendo al final una llamada condicional `await triggerEnrichLocation(location.id)` cuando `point.source === 'osm'`.

## Detalles técnicos

```text
popup imported point (hoy)            popup imported point (después)
┌────────────────────────────┐        ┌────────────────────────────┐
│ Imagen / hero              │        │ Imagen / hero              │
│ Nombre + meta              │        │ Nombre + meta              │
│ Descripción                │        │ Descripción                │
│ Coords + custom data       │        │ Coords + custom data       │
│ ┌──────────┬─────────┐     │        │                            │
│ │ Contexto │ Duplicar│     │ ◀──    │  (rejilla eliminada)       │
│ │ Fusionar │Reclasif.│     │        │                            │
│ └──────────┴─────────┘     │        │                            │
│ [Enriquecer] [Notas]       │        │ [Enriquecer*] [Notas]      │
└────────────────────────────┘        └────────────────────────────┘
                                       * abre Contexto cercano si
                                         falta nombre/descripción
```

## Archivos a tocar

- `src/components/map/map-popups.ts` — gate `isRouteWaypoint` para la rejilla 2×2.
- `src/domains/content/lib/enrich-location.ts` — desviar a `open-nearby-context` cuando falten identificadores.
- `src/pages/Index.tsx` — listener global de `open-nearby-context` para mapa sin documento.
- `src/domains/content/components/PointContextActions.tsx` — encadenar enriquecimiento tras seleccionar opción OSM.

## Fuera de alcance

- No se cambia la lógica de detección de waypoints en otras vistas (lista de documento, etc.).
- No se modifica el motor de enriquecimiento ni el `NearbyPanel` existente.
