

El usuario quiere que el dot a la izquierda de cada nombre en la lista refleje **el color real con el que ese marcador se pinta en el mapa**, no un color genérico por estado.

## Norma propuesta

Dot del item = mismo color que el marcador en el mapa. Alineado con `mem://style/map/marker-classification-v3` y `mem://ui/marker-status-symbology`.

| Tipo de punto | Marcador en mapa | Dot en lista |
|---|---|---|
| Workspace `unknown` | Círculo gris | Dot gris |
| Workspace `new` | Círculo naranja | Dot naranja |
| Enriquecido workspace | Teardrop con color de categoría | Dot con color de categoría |
| Catálogo (`is_approved=true`) | Pin azul cielo | Dot azul cielo |
| Ruta | Polilínea con color | Dot del color de la polilínea |

Fuente única de color: la misma lógica que ya resuelve el color en `map-icons.ts` / `map-v2-renderer`. Reutilizar, no duplicar.

## Implementación

**Helper transversal nuevo** `src/domains/content/lib/waypoint-color.ts`:

- `getWaypointDotColor(loc)` → catálogo / categoría enriquecida / gris unknown / naranja new.
- `getRouteDotColor(route)` → lee el mismo `marker_size_config` que ya alimenta la sincronización de color de polilíneas.

**Aplicar en** `DocumentWaypointsTabs.tsx`: el dot estático (clases `bg-gray-400`/`bg-orange-500`/…) se reemplaza por `<span style={{ background: getWaypointDotColor(loc), borderColor: ... }} />`. Mismo tamaño/forma que ahora — solo cambia el color.

**Dot del trigger de pestaña** se mantiene (gris/naranja/verde/azul) porque representa el filtro del grupo, no un punto individual.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/domains/content/lib/waypoint-color.ts` | nuevo helper transversal |
| `src/domains/content/components/DocumentWaypointsTabs.tsx` | dots de items usan el helper |
| `mem://ui/document-view-tabs` | añadir norma "dot de item = color del marcador en mapa" |

## Verificación

1. Tab Importados → dots grises iguales al círculo del mapa.
2. Tab Vacíos → dots naranjas.
3. Tab Enriquecidos → dot del color de la categoría de cada punto (no verde plano).
4. Tab Rutas → dot del color de la polilínea de cada ruta.
5. Trigger de pestaña conserva su dot de grupo.

## Pregunta abierta

Tu mensaje termina en "y...". Cuando aprueb es el plan, dime qué falta (¿icono de acción a la derecha también coloreado? ¿reemplazar dot por mini-marcador real con la forma del mapa? ¿algo más?) y lo añado antes de implementar.

