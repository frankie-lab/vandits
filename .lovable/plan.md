## Problema

El adaptador de Atlas Obscura en `scrape-tick` está iterando sobre la **portada del país** (`/things-to-do/italy`) en vez del **catálogo paginado real** (`/things-to-do/italy/places?page=N`). El hub solo expone ~14 destacados curados; el catálogo real tiene 1.101 puntos en ~69 páginas de 16. Como `?page=N` sobre el hub no pagina, el scraper relee siempre lo mismo y solo acumula 14 URLs únicas.

## Cambios

### 1. `supabase/functions/scrape-tick/index.ts` — adaptador Atlas Obscura

**a) Normalizar la URL de listado.** Antes de paginar, si la URL es `/things-to-do/{slug}` (hub) o `/things-to-do/{slug}/` (sin sufijo `/places`), redirigirla a `/things-to-do/{slug}/places`. Esa es la única ruta que pagina realmente con 16 ítems/página.

**b) Restringir la regex a la zona del listado.** Acotar la extracción de enlaces `/places/...` al bloque del listado (evitar contar enlaces de "Related" / "Nearby" / footer). Mantener filtro `m[1] !== 'new'`.

**c) `hasMore` realista.** Considerar que hay más páginas solo si la página actual devolvió ≥ 12 ítems únicos (cerca del tamaño normal de 16). Si devuelve 0–11, asumir última página y parar el avance — ya no más bucles infinitos sobre el hub.

**d) Tope de paginación.** Subir el cap interno (hoy 50) a 100 para cubrir holgadamente los ~69 páginas de Italia y otros países grandes (ES, FR ronda los 60–80). Sigue siendo finito.

### 2. Backfill puntual del job actual de Italia

Como el job actual ya tiene 17 páginas inútiles encoladas apuntando al hub, una vez deployado el fix:

- Marcar como `status='done'` las páginas existentes del job de Italia que no apunten a `/places`.
- Insertar una nueva entrada `scrape_job_pages` con `url=https://www.atlasobscura.com/things-to-do/italy/places` y `page_number=1` para que el scraper recomience desde el catálogo real.
- Las URLs ya descubiertas (14) se mantienen en cola; el scraper irá añadiendo el resto a medida que pagine.

Esto se hace con una migración SQL puntual (sólo afecta a los jobs en curso de `atlas_obscura`).

### 3. Reglas transversales (memoria)

Añadir nota a memoria del proyecto: **Atlas Obscura listing canonical** — toda URL `/things-to-do/{slug}` debe normalizarse a `/things-to-do/{slug}/places` antes de paginar. Esto vale también para futuras semillas (España, Francia, etc.).

## Resultado esperado

- El job de Italia pasa de descubrir 14 URLs únicas a descubrir las 1.101 reales (a razón de 16/página × ~69 páginas).
- La fase A (Find) y B (Import) que ya funcionan no cambian: solo se alimentan correctamente.
- El backfill del job actual evita tener que borrarlo y relanzarlo.

## Validación

Tras aplicar:
1. Consultar `scrape_job_pages` del job de Italia: debería empezar a verse `page_number` creciendo (1, 2, 3, …) sobre URL `…/places?page=N`.
2. Consultar `scrape_job_items` count: subir desde 14 hacia ~1.101 a lo largo de los siguientes ciclos.
3. Logs de `scrape-tick`: verificar que las URLs de listado contienen `/places`.
