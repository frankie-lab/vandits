## Objetivo

Cuando el worker `scrape-tick` importa un punto desde Atlas Obscura, el punto debe nacer ya **listo para verse**: imagen como Hero, jerarquía geográfica resuelta a UUIDs, y `enriched_data` poblado para que el marcador salga verde sin volver a llamar a la IA.

Único archivo afectado: `supabase/functions/scrape-tick/index.ts` (función `persistPlace`). Sin cambios de schema.

## Cambios en `persistPlace`

### 1. Hero automático
Mapear `place.image` también a la columna `user_image_url` (además de seguir guardándolo en `custom_data.image` para trazabilidad). `user_image_visibility = 'private'`. Resultado: el popup y la ficha usan la imagen como cabecera sin pasos manuales.

### 2. Resolver FKs geográficas (Italia → Lazio → Roma → UUIDs)
Llamar al edge function `resolve-admin-area` (mismo que usa `resolveAllFks` en cliente) con los strings que vienen del JSON-LD (`country`, `region`, `locality`). Escribir los IDs devueltos (`country_id`, `region_id`, `locality_id`, …). Los strings se mantienen y el trigger `locations_sync_admin_cache` los reconcilia. Si falla la resolución, se inserta solo strings (comportamiento actual).

### 3. Marcador verde directo (enriched)
Si el scrape trajo descripción razonable (>= 200 chars) o imagen + tags, construir `enriched_data` con la forma estándar de la app:
```
{
  descripcion: place.description,
  datos_clave: { web_referencia: place.url, tipo: null },
  clasificacion: { categoria_principal: null },
  tags: place.tags ?? [],
  fuente: 'atlas_obscura',
  source_url: place.url
}
```
Y fijar `enrichment_status = 'enriched'`. El botón Sparkles sigue disponible para ampliar más tarde con IA.
Si no hay datos suficientes → se deja sin `enriched_data` y el marcador queda gris (comportamiento actual).

### 4. Sin tag sintético de fuente
La fuente queda en `enriched_data.fuente` y `custom_data.source`. No se añade un tag tipo `#AtlasObscura`. Si el adapter lo introdujera, se filtra antes de persistir.

## Payload final del insert

```text
locations.insert({
  document_id, owner_user_id,
  name, description,
  latitude, longitude,
  country, region, locality (strings, ya venían),
  country_id, region_id, locality_id, …       (NUEVO)
  user_image_url: place.image,                 (NUEVO)
  user_image_visibility: 'private',            (NUEVO)
  is_approved: false,                          (igual)
  visibility: job.default_visibility,
  enriched_data: { … },                        (NUEVO si hay datos)
  enrichment_status: 'enriched' | null,        (NUEVO)
  custom_data: { source, source_url, image, tags, locality, auto_enrich }
})
```

## Comportamiento UX resultante

- Marcador: verde directo gracias a `enriched_data.descripcion` (regla `getPointVisualState`).
- Popup/ficha: imagen Hero + descripción en párrafos + link "Ver en Atlas Obscura".
- Árbol geográfico: el punto cuenta para Italia → Lazio → Roma sin esperar al backfill.
- `is_approved=false` se mantiene → el punto sigue confinado al documento hasta que lo apruebes.
- Sparkles sigue disponible para ampliar con IA cuando quieras.

## Memoria a actualizar tras aplicar

Crear `mem://logic/import/scrape-direct-enrichment` y referenciarlo desde el índice: "scrape-tick mapea image→user_image_url, resuelve FKs geo vía resolve-admin-area y siembra enriched_data desde JSON-LD; sin tag sintético de fuente".

## Fuera de alcance

- No se cambian `scrape-enqueue`, ni la UI `BackgroundScrapeJobs`, ni el schema.
- No se altera el flujo de aprobación ni la visibilidad global.
- No se reenriquece automáticamente con IA.
