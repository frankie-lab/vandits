## Objetivo

1. Ampliar las fuentes de imagen "sin API key (gratis)" disponibles tanto en **Configuración de fichas** como en el diálogo **"Buscar fotos del lugar"**.
2. Aplicar una lógica común de filtrado para priorizar **fotografías horizontales de lugares geográficos** y descartar resultados no relevantes (personas, libros, escudos, mapas, logos, retratos).

## Fuentes a añadir (todas sin API key)

| Key | Fuente | Cómo busca | Notas |
|---|---|---|---|
| `wikimedia_commons` (ya existe) | Wikimedia Commons | búsqueda por nombre + geosearch por coordenadas | mejorada con filtro landscape |
| `wikipedia` (ya existe) | Wikipedia | imagen principal del artículo | — |
| `wikimedia_geosearch` (NUEVO) | Wikimedia Commons GeoSearch | `list=geosearch` con lat/lng radio 1km, namespace 6 | foto cercana georreferenciada |
| `wikidata_image` (NUEVO) | Wikidata | SPARQL: entidad cercana (`wdt:P625`) → imagen `wdt:P18` | foto oficial enlazada al lugar |
| `openverse` (NUEVO) | Openverse (api.openverse.engineering) | búsqueda CC/dominio público (Flickr CC, museos, etc.) | sin key, rate-limited |
| `osm_image_tag` (NUEVO) | OpenStreetMap (Overpass) | POI cercano con tag `image=` | URL directa de foto |
| `user_uploaded` (ya existe) | Foto del usuario | manual upload | — |

Todas se exponen en Configuración de fichas como toggles individuales, agrupadas bajo el rótulo **"Fuentes sin API key (libres)"**.

## Filtro común "lugar geográfico" (landscape filter)

Se centraliza en un nuevo helper `src/shared/enrichment/image-filters.ts` reutilizado por:
- el diálogo manual `LocationPhotoSearch.tsx`
- la edge function `enrich-location` (vía copia espejo en `supabase/functions/_shared/image-filters.ts`)

Reglas (excluye si):
- Título / descripción contiene: `flag, bandera, coat of arms, escudo, logo, icon, map, mapa, plan, diagram, chart, portrait, retrato, person, statue bust, book cover, libro, álbum, poster, signature, firma, document, document scan, painting of a person`.
- Mimetype no es imagen raster (svg → fuera).
- Aspect ratio: preferir horizontal (`width/height ≥ 1.2`); verticales aceptados solo si título contiene tipologías geográficas (`mountain, lake, river, coast, valley, peak, cascada, falls, tower, torre, lighthouse, faro, monument, monumento, building, edificio`).
- Tamaño mínimo: 600×400.
- Score: +1 por keyword geográfica en título, +1 por horizontal, +1 por presencia de coordenadas en metadatos. Resultados se ordenan por score desc.

## Cambios concretos

### Frontend
- `src/domains/content/components/EnrichmentCardConfig.tsx`
  - Ampliar `IMAGE_SOURCES` con las 4 nuevas claves.
  - Añadir título de sección "Fuentes sin API key (libres)" agrupando todas excepto `user_uploaded`.
  - Default: las 6 fuentes externas activadas.
- `src/components/LocationPhotoSearch.tsx`
  - Leer `image_sources` activas desde la card config (igual que hace la enrich function).
  - Reemplazar `searchWikimedia` único por un orquestador `searchAllSources(query, coords, activeSources)` que dispara las búsquedas en paralelo, deduplica por URL y aplica el filtro landscape.
  - Mostrar el origen de cada miniatura (badge: Commons / Wikipedia / Openverse / Wikidata / OSM).
  - Indicador de fuente cambia de "Fuente: Wikimedia Commons" a lista de fuentes activas con contador por fuente.
- Nuevo helper `src/shared/enrichment/image-search-providers.ts` con una función por proveedor (todas con el mismo shape `Promise<NormalizedImage[]>`).
- Nuevo helper `src/shared/enrichment/image-filters.ts` con `isPlacePhoto(img)` y `scorePlacePhoto(img)`.

### Backend (edge function)
- `supabase/functions/enrich-location/index.ts`
  - Extender `searchImageFromSources` con los 4 nuevos providers (mismas funciones que el front, duplicadas en `supabase/functions/_shared/`).
  - Aplicar el filtro landscape antes de devolver la imagen.
- `supabase/functions/_shared/image-filters.ts` (copia espejo del helper).
- `supabase/functions/_shared/card-schema.ts`: ampliar default `image_sources`.

## Detalles técnicos por fuente

```text
wikimedia_geosearch:
  GET commons.wikimedia.org/w/api.php
    ?action=query&generator=geosearch&ggsnamespace=6
    &ggscoord=lat|lng&ggsradius=1000&ggslimit=20
    &prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=400

wikidata_image:
  POST query.wikidata.org/sparql (Accept: application/sparql-results+json)
    SELECT ?item ?image WHERE {
      SERVICE wikibase:around { ?item wdt:P625 ?loc.
        bd:serviceParam wikibase:center "Point(lng lat)"^^geo:wktLiteral.
        bd:serviceParam wikibase:radius "1". }
      ?item wdt:P18 ?image.
    } LIMIT 5
  → URL = https://commons.wikimedia.org/wiki/Special:FilePath/<filename>?width=800

openverse:
  GET api.openverse.engineering/v1/images/?q=<query>&license_type=all-cc&page_size=20

osm_image_tag:
  POST overpass-api.de/api/interpreter
    [out:json][timeout:10];
    nwr(around:500, lat, lng)[image];
    out tags 10;
  → tag.image (URL directa)
```

## Riesgos / mitigación
- CORS: Wikimedia/Wikidata/Openverse/Overpass tienen CORS abierto; OSM `image=` puede ser host arbitrario → usar como `<img src>` (sin fetch) y `referrerPolicy="no-referrer"`.
- Rate limit Openverse: capturar 429 y degradar silenciosamente.
- Wikidata SPARQL: timeout 5s, fallback silencioso.

## Out of scope
Fuentes con API key (Unsplash, Pexels, Pixabay, Flickr, Mapillary, Google Places). Se dejan listadas en código comentado para futuro.
