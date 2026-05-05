
# Scraping en background con cron lento y pausas anti-detección

Objetivo: encolar URLs de **Atlas Obscura u otras fuentes** y dejar que un worker las recorra en segundo plano, ficha a ficha, con ritmo variable y pausas para parecer tráfico humano y evitar bloqueos.

## Arquitectura

```text
[UI WebImportPanel]
      │  encola job
      ▼
scrape_jobs (tabla)        ← estado persistente + planning del próximo tick
scrape_job_pages           ← cola de páginas índice pendientes
scrape_job_items           ← cola de fichas pendientes
      ▲
      │ pg_cron cada 1 min (fijo)
[edge function `scrape-tick`]
      ├─ ¿es hora del job? (next_tick_at <= now)
      ├─ ¿está en pausa larga? (paused_until <= now)
      ├─ procesa N items
      ├─ programa next_tick_at = now + random(60s..180s)
      └─ si llegó al umbral random(25..75), entra en pausa long random(N min)
```

## Multi-fuente

Adapter pattern. Cada fuente implementa la misma interfaz en `supabase/functions/_shared/scrapers/`:

```ts
interface ScraperAdapter {
  source: string;                            // 'atlas_obscura', 'wikivoyage', etc.
  detectKind(url: URL): 'list' | 'item' | null;
  fetchListPage(url: URL, page: number): Promise<{ itemUrls: string[]; hasMore: boolean }>;
  fetchItem(url: URL): Promise<ScrapedPlace | null>;
}
```

- **`atlas_obscura.ts`** — extrae código actual de `scrape-atlas-obscura/index.ts`.
- **`generic_jsonld.ts`** — fallback: cualquier URL con `application/ld+json` `Place`/`TouristAttraction` (cubre muchas guías).
- Hueco preparado para añadir Wikivoyage, Komoot, etc. sin tocar el worker.

El registry detecta el adapter por hostname; si no hay match específico, prueba `generic_jsonld`.

## Tablas nuevas

**`scrape_jobs`**
- `id`, `user_id`, `source` (text), `seed_url`, `document_id`
- `status` (`queued`/`running`/`paused`/`done`/`error`/`cancelled`)
- `max_items` (null = sin tope), `rate_per_tick` (default 3)
- `min_tick_seconds` (default 60), `max_tick_seconds` (default 180)
- `pause_after_min` (default 25), `pause_after_max` (default 75)
- `pause_duration_min_minutes` (default 5), `pause_duration_max_minutes` (default 20)
- `items_until_pause` (counter que decrementa cada item; al llegar a 0 → pausa larga y se reseteado a random(min..max))
- `next_tick_at`, `paused_until`
- `pages_seen`, `items_found`, `items_imported`, `items_skipped`
- `last_tick_at`, `created_at`, `updated_at`, `error_message`

**`scrape_job_pages`** — `id`, `job_id`, `url`, `page_number`, `status`, `processed_at`

**`scrape_job_items`** — `id`, `job_id`, `url`, `status`, `location_id`, `error`, `processed_at`, UNIQUE(job_id, url)

RLS: cada usuario solo ve/gestiona sus jobs. Master ve todo.

## Worker `scrape-tick` — lógica del tick

`pg_cron` lo invoca **cada 60 s fijo**. Dentro:

1. `SELECT job FROM scrape_jobs WHERE status='running' AND next_tick_at <= now() AND (paused_until IS NULL OR paused_until <= now()) ORDER BY next_tick_at LIMIT 5`.
2. Para cada job (en serie, no paralelo entre jobs):
   - Si quedan páginas índice → procesa **1 página**, siembra items.
   - Si no, coge `rate_per_tick` items pendientes y los scrapea **secuencialmente con jitter 800–2500 ms** entre fetchs (más humano que paralelo).
   - Por cada item importado → `items_until_pause -= 1`.
   - Si `items_until_pause <= 0`:
     - `paused_until = now() + random(pause_duration_min..max) min`
     - `items_until_pause = random(pause_after_min..pause_after_max)`
     - log "pausa anti-rate-limit hasta X".
   - Si la web devuelve 429/403 → backoff exponencial: `paused_until = now() + 30 min` y log error.
   - `next_tick_at = now() + random(min_tick_seconds..max_tick_seconds)`.
3. Si no quedan ni páginas ni items → `status='done'`.

Presupuesto duro por tick: 50 s. Si se agota, cierra limpio y deja el resto al siguiente.

## Cifras por defecto (config visible en UI)

- Tick: cada 1–3 min aleatorio.
- 3 items por tick (fetch secuencial con jitter ~1.5 s entre cada uno).
- Pausa larga cada 25–75 items, durando 5–20 min aleatorios.
- Resultado: ~60–120 items/hora, ~1.000–2.500/día por job. Italy entera (~1.500) en 1–3 días sin levantar sospechas.

Configurable por job desde el modal: presets **Lento / Normal / Rápido** + "Avanzado" para tocar los rangos.

## Cron único

```sql
select cron.schedule('scrape-tick', '* * * * *', $$
  select net.http_post(
    url:='https://<project>.supabase.co/functions/v1/scrape-tick',
    headers:='{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
    body:='{}'::jsonb
  );
$$);
```

Un único cron fijo cada 60 s. La aleatoriedad del 1–3 min y de las pausas se implementa **dentro** del worker mediante `next_tick_at` y `paused_until`, no en el cron.

## UI — `WebImportPanel`

Dos modos en el modal:

- **Inmediato** (existente): 1 llamada, hasta 200 puntos.
- **Background** (nuevo):
  - Input URL (cualquier hostname).
  - Detección de fuente automática + badge ("Atlas Obscura" / "Genérico JSON-LD").
  - Preset de ritmo: Lento / Normal / Rápido.
  - `max_items` opcional (vacío = todo).
  - Botón "Encolar".

Sección **Jobs** debajo:
- Lista de jobs del usuario (realtime sobre `scrape_jobs`).
- Cada fila: fuente, URL, progreso (barra `items_imported / items_found`), estado (`Procesando` / `Pausado hasta HH:MM` / `Próximo tick en Xs` / `Completado`), botones Pausar/Reanudar/Cancelar/Abrir documento.
- ETA estimado según ritmo configurado.

## Reuso

- Persistencia de puntos: mismo helper que el flujo síncrono (documento `web_import`, `customData.source_url`, `is_approved=false`, `resolveAllFks`, dedupe 250m).
- Aprobación masiva: ya implementada en Contenido → Documentos → [doc].
- Adapter `atlas_obscura.ts` extrae el código existente sin cambios funcionales.

## Lo que NO hace

- No corre dos jobs del **mismo usuario sobre la misma fuente** en paralelo (FIFO por fuente para no doblar el rate).
- No reintenta indefinidamente: 3 errores en una URL → marca `error` y sigue.
- No enriquece con IA durante el scraping; eso queda para el job de enriquecimiento ya existente, opt-in tras revisar.
- No respeta `robots.txt` por ahora (Atlas Obscura lo permite para crawlers identificados; si añadimos fuentes hostiles, evaluar).

## Plan de implementación

1. Migración: 3 tablas + RLS + índices (`status`, `next_tick_at`).
2. `_shared/scrapers/`: extraer adapter de Atlas + adapter genérico JSON-LD.
3. Edge function `scrape-tick` con la lógica de planificación y pausa.
4. Activar `pg_cron`/`pg_net` y registrar el cron.
5. Extender `WebImportPanel`: modo background + lista de jobs realtime.
6. Memoria nueva: `mem://features/import/background-scraping-jobs`.

¿Apruebas y lo implemento?
