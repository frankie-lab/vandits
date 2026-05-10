Tienes razón — quedó pendiente. Hoy los puntos con error de enriquecimiento solo se muestran como ámbar/rojo dentro del bloque de recovery (panel y ficha), pero el marcador en el mapa sigue pintándose con su paleta base (verde / gris / naranja) sin ninguna señal visual que diga "este falló". El plan añade ese contorno rojo de 5px de forma transversal.

## Estado actual

- `getPointVisualState(loc)` decide la paleta sólo entre los 3 estados canónicos (enriched / imported / empty). No sabe nada de errores.
- `useEnrichmentFailure(locationId)` + `enrichmentFailureStore` ya tienen el motivo del fallo (lookup al job más reciente), pero hoy sólo lo consume `UnenrichedRecoveryBlock` (ficha y fila de doc).
- `map-icons.ts::createCustomIcon` pinta círculo o pin con borde blanco. No hay un anillo extra de error.

## Cambios propuestos

### 1. Nuevo helper único `hasEnrichmentFailure(locationId)`
Archivo: `src/domains/content/lib/enrichment-failure-state.ts`

- Lee del singleton `enrichmentFailureStore` (ya existe). Devuelve `boolean` síncrono.
- Sólo cuenta como "con error" si:
  - El punto **no** está enriquecido (regla "los verdes no marcan error" — si después se enriqueció, el fallo se considera resuelto).
  - Tiene una entrada en el store con `kind` ≠ `null`.
- Expone también `subscribeFailureChange(cb)` (delgado wrapper sobre el evento existente) para forzar re-render de marcadores.

### 2. Pre-warm de fallos al cargar el mapa
Archivo: `src/components/LocationMap.tsx` (o el hook que carga ubicaciones)

- Una sola query a `enrichment_jobs` (último N=20 jobs del usuario) extrayendo `error_messages` y `error_ids`, y poblando el store de un golpe.
- Con esto, `hasEnrichmentFailure(id)` es síncrono y consistente para los 4.000+ marcadores sin N consultas.
- También se invalida ante el evento existente `location:enriched` (se quita el rojo cuando se reenriquece con éxito).

### 3. Render del anillo rojo en `map-icons.ts`
Archivo: `src/components/map/map-icons.ts`

- Añadir parámetro nuevo `hasFailure: boolean` a `createCustomIcon`.
- Si `hasFailure`:
  - **Círculo (los 3 estados canónicos):** añadir un segundo `<circle>` exterior con `fill="none"`, `stroke="hsl(var(--destructive))"`, `stroke-width="5"`, `r` ligeramente mayor que el original. El icono SVG se amplía (size + 10) y `iconAnchor` se ajusta para mantenerlo centrado.
  - **Pin (teardrop):** duplicar el path con `fill="none"`, mismo trazo rojo de 5px envolviendo la silueta.
- Mantiene la paleta base (verde/gris/naranja) — el rojo es un **modificador** encima, no sustituye al estado.
- Compatible con `collectionTint` (el tint queda dentro, el ring rojo fuera).

### 4. Llamada desde `LocationMap` al crear cada marcador
Pasar `hasEnrichmentFailure(loc.id)` a `createCustomIcon(...)`. El re-render por cambio de fallo se engancha al mismo flujo que ya usamos para `location:enriched` (evita full reloads).

### 5. Memoria / regla transversal
Añadir `mem://style/map/error-outline-rule.md`:

> Los puntos con error de enriquecimiento (registrado en el store de fallos, sin enriched_data.descripcion) reciben un contorno rojo de 5px **encima** de su paleta canónica (verde/gris/naranja). El rojo desaparece automáticamente al enriquecer con éxito (regla "verde nunca marca error"). Helper único: `hasEnrichmentFailure(id)`. Render único: `createCustomIcon` en `map-icons.ts`.

Y actualizar el Core de `mem://index.md` para mencionarlo junto a la regla de paleta.

## Detalles técnicos

```text
Marcador círculo con error:

   ┌───── stroke rojo 5px ─────┐
   │                            │
   │   ●  paleta canónica       │  ← verde / gris / naranja sin cambios
   │      (12px por defecto)    │
   │                            │
   └────────────────────────────┘
   tamaño total = base + 10px
```

- El "tamaño" en `marker_size_config` no se altera. El anillo rojo es un overlay SVG.
- El re-cluster se respeta: como el SVG sigue dentro del mismo `divIcon`, `markercluster` agrupa igual.

## Fuera de alcance

- **No** se reintroduce el azul cielo ni se añaden nuevos estados a `marker_size_config`. El rojo es un **flag binario** sobre los 3 estados existentes.
- **No** se cambia `getPointVisualState` (sigue siendo la única fuente de paleta).
- **No** se toca el popup ni la ficha (eso ya lo cubre `UnenrichedRecoveryBlock`).
