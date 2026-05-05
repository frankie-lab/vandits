# Importar desde Atlas Obscura

## Qué soportamos

URL pegada de Atlas Obscura, dos formatos:

1. **Página de listado por país/región/ciudad**
   `https://www.atlasobscura.com/things-to-do/australia`
   `https://www.atlasobscura.com/things-to-do/sydney-australia`
   → extrae todos los lugares listados (con paginación).
2. **Página individual de un lugar**
   `https://www.atlasobscura.com/places/<slug>`
   → extrae ese único punto con todos los detalles.

Detectamos el tipo por la URL (`/things-to-do/...` vs `/places/...`).

## Qué se extrae de cada lugar

De la ficha individual (`/places/<slug>`), parseando el JSON-LD `Place` + HTML:

- `name`
- `latitude`, `longitude` (de `geo` en JSON-LD; exactos)
- `country`, `region`, `locality` (cuando están)
- `description` (resumen + cuerpo)
- `tags` (categorías Atlas Obscura → `personal_tags`)
- foto de portada → `enriched_data.media.imagen_principal`
- "Know Before You Go" → `enriched_data.datos_clave`
- URL fuente → `enriched_data.fuentes`

En el listado solo extraemos slugs/URLs de cada place card; el detalle se obtiene visitando la ficha de cada uno.

## Flujo UX

1. En **Contenido → Fuentes** añadimos un botón nuevo: **"Importar desde web"** (junto a Subir / OneDrive).
2. Modal mínimo:
   - Input URL.
   - Detección automática listado vs ficha.
   - Para listados: campo opcional **"Máximo de puntos"** (default 30, máx. 200) para no agotar tiempo/créditos.
   - Botón **"Extraer"**.
3. Edge function devuelve un `ParsedGeoContent` (mismo contrato que KML/GPX).
4. Se abre el **diálogo de import unificado existente**: preview en mapa, dedup 250m con badges "Ya existe", confirmación, categorías personales, toggle de enriquecimiento IA.
5. Al confirmar, se crea un `document` (tipo `web_import`, source URL guardada) y los `locations` con `is_approved=false` (workspace), igual que cualquier import.

Esto reutiliza todo lo que ya tenemos (preview, dedup, aprobación, geocodificación, marker palette).

## Implementación técnica

### Edge function `scrape-atlas-obscura`
- Input: `{ url: string, maxItems?: number }`.
- Validación con Zod, CORS estándar.
- Si URL es `/places/<slug>`: fetch + parseo de un solo place.
- Si URL es `/things-to-do/<slug>`:
  1. Fetch página, extraer enlaces `a[href^="/places/"]` únicos.
  2. Seguir paginación (`?page=2`...) hasta agotar o `maxItems`.
  3. Para cada place URL, fetch en paralelo con `Promise.allSettled` y concurrencia limitada (8 a la vez).
  4. Parsear cada ficha:
     - Buscar `<script type="application/ld+json">` con `@type: Place`.
     - Coordenadas de `geo.latitude` / `geo.longitude`.
     - Fallback regex sobre HTML si no hay JSON-LD.
     - Tags de `<a class="...tag...">` o de `itemListElement`.
- Output: `ParsedGeoContent` con `locations[]`, `documentName` derivado del título de la página, `sourceUrl`.
- Control de errores: si una ficha falla, se omite y se continúa; se devuelve `skipped: number`.
- User-Agent identificable, timeout 15s por ficha, 60s total.
- Sin login ni cookies; Atlas Obscura sirve SSR público.

### Frontend
- Nuevo componente `WebImportDialog` en `src/domains/content/components/import/`.
- Botón en `ImportedContentPanel` (sección Fuentes) con icono `Globe` (Lucide).
- Llama a la edge function, recibe `ParsedGeoContent`, y pasa el resultado al **diálogo de import unificado existente** sin duplicar lógica de preview/dedup.

### Persistencia
- Documento con `metadata.source = 'atlas-obscura'`, `metadata.sourceUrl`, `metadata.scrapedAt`.
- Cada location guarda `enriched_data.fuentes = [{ name: 'Atlas Obscura', url }]` para que la atribución viaje siempre con el punto.

## Limitaciones honestas

- Atlas Obscura puede cambiar el HTML; el JSON-LD es estable y nuestro principal anclaje.
- Si bloquean por User-Agent, añadimos rotación o pasamos a Firecrawl como fallback (no en esta primera versión).
- Listados muy grandes (>200): el usuario los importa por trozos paginados manualmente.

## Fuera de alcance (por ahora)

- Otros sitios (TripAdvisor, Komoot, blogs genéricos).
- Crawl recursivo de dominios.
- Refresco automático de fichas ya importadas.
