## Auto-foco del mapa al cambiar colecciones

Centralizar el "fit bounds" para que el mapa reaccione a cualquier cambio de visibilidad o membresía de colecciones, no sólo al toggle ON.

### Helper central

Nuevo en `src/domains/content/lib/collection-visibility.ts`:

- `requestCollectionFit(collectionId, mode?)` con `mode: 'always' | 'if-outside'` (default `'if-outside'`).
- Emite `COLLECTION_FIT_BOUNDS_EVENT` con `{ collectionId, mode }`.
- `mutateCollectionMembership(collectionId, fn)` wrapper que tras añadir/quitar puntos:
  1. dispara broadcast de visibilidad (para refrescar anillos/contadores),
  2. llama `requestCollectionFit(collectionId, 'if-outside')` si la colección está visible.

### Handler en `LocationMap.tsx`

Reemplazar el listener actual:

- Resolver puntos de la colección desde el store (filtrando los visibles en mapa global).
- 0 puntos → no-op.
- 1 punto → `flyTo([lat,lng], 14, { duration: 0.6 })`.
- ≥2 puntos → `fitBounds(bounds, { padding: [60,60], maxZoom: 14, duration: 0.6 })`.
- Si `mode === 'if-outside'`: calcular qué porcentaje de los puntos cae dentro del viewport actual; sólo mover si <30% están dentro. Si `mode === 'always'`: mover siempre.

### Triggers a conectar

1. **Toggle ON** de colección (ya existe) → `'if-outside'`.
2. **Añadir punto** a colección visible → `'if-outside'`.
3. **Quitar punto** de colección visible → `'if-outside'`.
4. **Borrar colección** visible → fit a los puntos restantes del catálogo o no-op si vacío.
5. **Realtime** (`collection_members` INSERT/DELETE/UPDATE) sobre colección visible → `'if-outside'`.

### Archivos a tocar

- `src/domains/content/lib/collection-visibility.ts` — añadir `requestCollectionFit` + `mutateCollectionMembership`.
- `src/components/LocationMap.tsx` — reemplazar handler del evento por la lógica unificada (1 punto vs N, modo always/if-outside).
- Hooks/servicios que mutan membresía de colecciones (add/remove/delete) — usar el wrapper en lugar de llamar al repo directamente.
- Hook de realtime de colecciones — disparar `requestCollectionFit` tras aplicar el cambio.

### Detalles técnicos

- Umbral "fuera de pantalla": `<30%` de puntos dentro del `map.getBounds()` actual.
- Padding `[60,60]` y `maxZoom: 14` para no acercar excesivamente colecciones pequeñas.
- Duración 0.6s para ser perceptible sin marear.
- Broadcast de visibilidad debe ir **antes** del fit, para que los anillos ya estén actualizados cuando termine la animación.
