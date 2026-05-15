## Objetivo

Reducir cada resultado de la lista "Contexto cercano" (popup INLINE del POI) a un bloque compacto de **2 líneas máximo**, eliminando ruido visual y enlaces no funcionales.

## Cambios

Archivo único: `src/domains/content/components/PointContextActions.tsx` — componente `NearbyPointCard` (líneas 172–244) y wrapper de cada resultado en la lista (líneas 844–865).

### Nueva estructura de cada resultado (2 líneas)

**Línea 1** (una sola fila, sin wrap):
- Nombre del punto propuesto (`point.name`), `truncate`, `flex-1`.
- A la derecha, **botón "Enriquecer aquí"** (icono `Sparkles` + texto, o `Loader2` cuando `adoptingId === p.id`). Sustituye al botón actual que vivía en su propia fila aparte (líneas 852–865 actuales).

**Línea 2** (texto pequeño, muted, una sola fila truncada):
- Distancia al POI origen (`{point.distance_m}m`) — **siempre visible**.
- Coordenadas formateadas (`{lat.toFixed(4)}, {lng.toFixed(4)}`) — **OBLIGATORIO**.
- Separador `·` entre ambos.

### Elementos eliminados de la tarjeta

- Icono lupa/Search/MapPin/Users a la izquierda (líneas 177–183, 188).
- Botón cuadrado de la derecha con flecha externa (`ExternalLink` hacia `point.osm_link`, líneas 198–202).
- Enlace "Ver en Google Maps" inferior (líneas 231–241).
- Badges secundarias (`source_label`, `place_type`, `country`, `Sparkles` enriched marker, `tags`, `document_name`, `description`) — todo eliminado para mantener 2 líneas.

### Limpieza derivada

- La fila independiente actual con el botón "Enriquecer aquí" debajo de cada `NearbyPointCard` (líneas 852–865) se elimina, porque el botón pasa a la línea 1 de la tarjeta. Se sigue propagando `adoptingId`, `handleAdoptNearby` y `e.stopPropagation()` igual que ahora.
- El bloque expandido al seleccionar (`selectedPointId === p.id`, líneas 866–925) con "Reemplazar importado / Punto personal" se conserva tal cual — sigue apareciendo bajo la tarjeta al hacer click.
- En modo `mergeMode` (líneas 818–832) no se toca: ya es compacto.

### Sin cambios

- Lógica de búsqueda, ordenación, agrupación por categoría, slider de radio, header, current-point card, mismatch banner, footer.
- `LocationMap.tsx`, `map-popups.ts`, `popup-recovery-mount.ts`, dimensiones/scroll del popup.
- Variante `card` (sidebar): se reutiliza el mismo `NearbyPointCard`, así que también queda compacta de forma transversal (consistente con la regla "cambios transversales").

## Resultado esperado

Cada resultado ocupa ~2 líneas (≈ 44–52px) en lugar de los ~150px actuales, con la acción de enriquecer al alcance directo y la distancia + coordenadas siempre visibles.
