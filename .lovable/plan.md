## Objetivo

Eliminar las dos pestañas (Inmediato / Background) y dejar **un único panel "Importar desde web"** que:

1. Acepta cualquier URL (Atlas Obscura u otras webs con JSON-LD).
2. Hace un único Test → muestra la cuenta y la calidad de los datos.
3. Tras el test, deja elegir entre **dos botones de acción**: "Importar ahora" (rápido, hasta 200) o "Encolar en background" (lento, sin límite, anti-bloqueo).

## Estructura propuesta del panel

```text
┌───────────────────────────────────────────┐
│ [globe] Importar desde web                │
│ Atlas Obscura, Wikivoyage y otras páginas │
│ con JSON-LD. Pega una URL para empezar.   │
│                                           │
│ URL                                       │
│ [link] https://...           [Probar]     │
│   └─ chip: Atlas Obscura · listado        │
│      ó    Web genérica · ficha            │
│      ó    No reconocida — solo background │
│                                           │
│ ── tras Probar ──                         │
│                                           │
│ Muestra: 20 puntos · 3 ya existentes      │
│   Saltar duplicados [switch]              │
│   [scroll lista miniaturas]               │
│                                           │
│ Visibilidad   [Público][Seguidores][Privado]│
│ Enriquecer con IA tras importar [switch]  │
│                                           │
│ ┌─ Modo de importación ─────────────────┐ │
│ │ ( ) Importar ahora (≤200, ~30s)       │ │
│ │ (•) Encolar en background (sin tope)  │ │
│ │     └─ Ritmo: [Lento][Normal][Rápido] │ │
│ │     └─ Tope (opcional): [____]        │ │
│ │     └─ Leyenda dinámica del preset    │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ [ Ejecutar ]                              │
└───────────────────────────────────────────┘

Jobs en curso (si hay)
├─ scrape_job 1 · 234/1000 · Procesando · [pausar][cancelar][abrir doc]
└─ scrape_job 2 · 12/—   · Pausa anti-bloqueo 14 min · ...
```

## Cambios técnicos

### 1. `WebImportPanel.tsx` — refactor mayor

- Eliminar `<Tabs>` y `<TabsList>`. Una sola tarjeta.
- Detectar tipo de fuente al teclear URL:
  - `atlasobscura.com/places/...` → "Atlas Obscura · ficha"
  - `atlasobscura.com/things-to-do/...` → "Atlas Obscura · listado"
  - URL válida con otro host → "Web genérica · solo background" (deshabilita "Importar ahora")
  - URL inválida → no se puede probar
- Botón **Probar** llama a `scrape-atlas-obscura` cuando es Atlas, o a `scrape-enqueue` con `mode: 'count'` (ver punto 3) cuando es genérica.
- Tras Probar, mostrar bloque de muestra (20 fichas como ya hace hoy) y a continuación selector **Modo**: radio `now` / `background`.
  - `now` solo disponible si la fuente es Atlas y el listado tiene ≤ 200.
  - `background` disponible siempre.
- Botón **Ejecutar** ejecuta el modo elegido reusando el código actual:
  - `now` → `handleImport()` actual.
  - `background` → `supabase.functions.invoke('scrape-enqueue', { url, preset, maxItems, autoEnrich, visibility })` (ver 2).
- Visibilidad y Enriquecer con IA se aplican a ambos modos.
- Render de jobs en curso al final del panel: extraer la lista de `BackgroundScrapeJobs.tsx` a un sub-componente `<ScrapeJobsList />` y montarlo siempre debajo (no solo en background tab).

### 2. `BackgroundScrapeJobs.tsx` — desmontar

- Partir el componente en dos:
  - `ScrapeJobsList` (solo el listado y los controles pause/resume/cancel/open).
  - El formulario desaparece — su contenido (preset, maxItems, leyendas) se mueve dentro de `WebImportPanel`.
- `BackgroundScrapeJobs` se elimina (queda como wrapper deprecado o se borra del import en `WebImportPanel`).

### 3. `scrape-enqueue` — extender

- Aceptar nuevos campos opcionales en el body:
  - `autoEnrich: boolean` (default `false`)
  - `visibility: 'public'|'followers'|'private'` (default `followers`)
- Persistirlos como columnas nuevas en `scrape_jobs` (`auto_enrich bool`, `default_visibility text`) — migración pequeña.
- `scrape-tick` los lee al insertar cada `location` y dispara el enriquecimiento si `auto_enrich = true`.

### 4. `scrape-atlas-obscura` — añadir modo "count"

- Aceptar `mode: 'count' | 'sample' | undefined` (default `sample`, comportamiento actual).
- Si `mode === 'count'`: solo paginar el listado leyendo `extractPlaceLinks` sin abrir cada ficha. Devuelve `{ ok, totalLinks, pages }`. Coste: 1–10 requests, ~3–8 s.
- En modo genérico (no Atlas), exponer en `scrape-enqueue` un `mode: 'count'` que haga lo mismo con JSON-LD genérico (1 fetch al índice).

### 5. UX detalles

- Chip de detección bajo la URL (verde si reconocida, ámbar si solo background).
- Leyenda dinámica del preset (ya implementada) se mueve al sub-bloque de modo background.
- Si el modo es `now` y el conteo previo > 200, mostrar aviso "Demasiados puntos para Inmediato — usa Background" y forzar el radio a `background`.

## Archivos afectados

- `src/domains/content/components/WebImportPanel.tsx` — refactor principal.
- `src/domains/content/components/BackgroundScrapeJobs.tsx` — partir en `ScrapeJobsList` + eliminar formulario.
- `supabase/functions/scrape-enqueue/index.ts` — aceptar `autoEnrich`, `visibility`.
- `supabase/functions/scrape-tick/index.ts` — propagar `auto_enrich` / `visibility` a las locations creadas.
- `supabase/functions/scrape-atlas-obscura/index.ts` — añadir `mode: 'count'`.
- Migración: añadir `auto_enrich bool default false`, `default_visibility text default 'followers'` a `scrape_jobs`.

## Comportamiento resultante

- Una única caja para todo. Mismo flujo: pegar URL → Probar → revisar muestra → elegir Inmediato o Background → Ejecutar.
- Sirve para Atlas Obscura y para webs genéricas (estas últimas solo via background).
- Visibilidad y enriquecer con IA se respetan en ambos modos.
- Los jobs en curso se ven siempre debajo, sin tener que cambiar de pestaña.
