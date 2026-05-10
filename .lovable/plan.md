## Objetivo
Hacer que el comportamiento sea transversal y persistente en todo el mapa:
- Los POIs con error de enriquecimiento muestran en el popup las opciones de recuperación.
- Los POIs con error muestran el contorno rojo de 5px.
- Cuando un POI se enriquece con éxito, desaparece el rojo y recupera su contorno normal o el de su colección visible.
- Sin hardcodes por caso concreto: todo pasa por helpers centrales.

## Qué voy a cambiar

### 1) Montar el bloque de recuperación dentro del popup del mapa
**Archivos:** `src/components/map/map-popups.ts`, `src/components/LocationMap.tsx`

- Añadir un mount point estable dentro de `createPopupContent()` para POIs no enriquecidos.
- Al abrir/actualizar el popup, hidratar ahí el componente único `UnenrichedRecoveryBlock`.
- Reutilizar el mismo flujo ya usado en ficha completa/listas: `useEnrichmentFailure`, `triggerEnrichLocation`, `open-nearby-context`, renombrado.
- Mantener la regla central: si el punto ya está enriquecido, el bloque no aparece.

**Resultado:** el popup del mapa mostrará exactamente las mismas opciones de recuperación que el resto de superficies, sin duplicar lógica.

### 2) Corregir la fuente de verdad del error reciente para que sea estable y persistente
**Archivo:** `src/domains/content/hooks/use-enrichment-failure.ts`

- Sustituir la invalidación global del cache en cada `UPDATE` realtime de `enrichment_jobs` por una resincronización central desde jobs recientes.
- Mantener invalidación puntual por `location:enriched` para el id concreto.
- Exponer una API explícita de revalidación del store para que el mapa siempre pinte el estado actual real, no estados fantasma o perdidos.

**Problema que resuelve:** ahora mismo los ticks del job pueden vaciar o descoordinar el cache y eso hace que el contorno rojo aparezca/desaparezca mal según el orden de eventos.

### 3) Hacer que el mapa refresque iconos también en vista global
**Archivo:** `src/components/LocationMap.tsx`

- Corregir `enrichmentKey` para que, cuando no hay documento seleccionado, también firme los `allLocations` y no solo `forceUpdateCount`.
- Así cualquier cambio real en `enrichedData` obliga a recomponer popup + icono del POI afectado.

**Problema que resuelve:** en vista global, un punto puede quedarse visualmente con el icono anterior aunque ya se haya enriquecido bien.

### 4) Restaurar el contorno correcto mediante helpers ya existentes
**Archivos:** `src/components/map/map-icons.ts`, `src/components/LocationMap.tsx`

- Mantener `createCustomIcon()` como render único del marcador.
- Seguir usando:
  - `hasEnrichmentFailure(location)` para decidir el anillo rojo.
  - `getTintForLocation(locationId)` para el contorno de colección.
- Asegurar que, tras éxito de enriquecimiento:
  - `hasEnrichmentFailure()` pasa a `false`.
  - el icono se recompone y se vuelve a pintar solo con la paleta canónica + el tint de colección si aplica.

**Importante:** no voy a meter colores inline por caso. La restauración sale del flujo central de iconos y de la visibilidad de colecciones ya persistida.

## Persistencia
- El estado de error seguirá viniendo de backend (`enrichment_jobs.error_ids/error_messages`), no de flags efímeros del cliente.
- El contorno de colección seguirá viniendo del helper central `getTintForLocation`, basado en la visibilidad persistida en sesión.
- No se añade estado duplicado ni listas hardcodeadas en el mapa.

## Validación
Voy a dejar validado este comportamiento:
- POI con error no enriquecido: popup con bloque de recuperación + contorno rojo 5px.
- Reintento fallido: se mantiene popup de recuperación + rojo.
- Reintento exitoso: desaparece rojo y reaparece el contorno normal o el de la colección visible.
- POIs ya enriquecidos nunca muestran rojo.
- El comportamiento se mantiene al refrescar/volver a abrir el mapa porque se reconstruye desde estado persistente real.

## Detalles técnicos
```text
createPopupContent()
  -> render HTML base
  -> placeholder recovery-root si no está enriquecido
LocationMap popup open/update
  -> monta UnenrichedRecoveryBlock en recovery-root

Realtime enrichment_jobs UPDATE
  -> store revalida jobs recientes
  -> subscribeFailureChange()
  -> marker.setIcon(createCustomIcon(... getTintForLocation ...))

location:enriched
  -> limpia fallo del id
  -> enrichmentKey cambia también en vista global
  -> popup + icono se recomponen
```

## Fuera de alcance
- Cambios del contador de progreso.
- Cambios de estilo fuera del bloque de recuperación y del anillo de error.
- Nuevos estados visuales de marcador distintos de la gramática ya definida.