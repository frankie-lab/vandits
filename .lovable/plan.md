## Objetivo

Reescribir la barra de progreso de los jobs de scraping para que represente honestamente el universo descubierto (`items_found`) y desglose visualmente importados, omitidos, perdidos y pendientes. Detectar inconsistencias en jobs terminados.

## Cambios

### 1. Migración DB — `scrape_jobs`

Añadir columna para contabilizar el desfase en jobs terminados:

- `items_lost int not null default 0` — candidatos descubiertos que no acabaron ni en `imported` ni en `skipped` al cerrar el job (errores no contabilizados, excepciones silenciosas).

### 2. Edge function — `scrape-tick`

Al cerrar un job (transición a `status='done'`), calcular y persistir:

```
items_lost = max(0, items_found - items_imported - items_skipped)
```

No tocar el cálculo en estados `running`/`paused` (el desfase ahí es "pendientes", no "perdidos"). En `error`/`cancelled`, también persistir el `lost` para diagnóstico.

### 3. UI — `BackgroundScrapeJobs.tsx`

Sustituir el `<Progress>` actual por una **barra segmentada propia** con cuatro tramos sobre un track gris:

```
[verde imported | ámbar skipped | rojo lost | track pendiente]
```

- Denominador: `items_found` (no `max_items`).
- Verde: `items_imported / items_found`
- Ámbar: `items_skipped / items_found`
- Rojo: `items_lost / items_found` (solo visible si > 0)
- Pendiente: resto del track, solo en jobs activos.

Implementación: un `div` flex con 3-4 spans coloreados de width %, sin librería extra. Tokens semánticos (`bg-emerald-500`, `bg-amber-500`, `bg-destructive`, `bg-muted`) — no colores hardcoded.

Tooltip por tramo mostrando el valor absoluto y el % exacto.

### 4. Texto de contadores

Línea inferior actualizada según estado:

- **Activo (`running`/`paused`)**: `N encontrados · X importados · Y omitidos · Z pendientes`
- **Terminado (`done`)**: `N encontrados · X importados · Y omitidos` y, si `items_lost > 0`, añadir badge rojo `· W perdidos` con tooltip "Diferencia no contabilizada — posible error en el procesamiento".

### 5. Mientras el listing aún paginación

Mientras el job sigue descubriendo URLs (`items_found` creciendo), la barra puede "encogerse" en %. Para evitar la sensación de retroceso, añadir junto al porcentaje un microtexto `descubriendo…` cuando `items_found` haya cambiado en los últimos N segundos (detectable comparando con valor previo en estado local).

## Detalles técnicos

- La columna `items_lost` se rellena solo desde `scrape-tick` al cerrar el job; no se toca desde cliente.
- La UI usa el helper inline (no extraer a otro archivo) porque es un componente único y específico de esta vista.
- No se cambia la lógica de `max_items` ni la del resto de jobs activos.
- `useScrapeJobs` (o donde esté el realtime de `scrape_jobs`) ya recibe la columna nueva al ser `select *`.

## Verificación

1. Crear un job nuevo y observar la barra durante el run: tramo pendiente decrece, tramo verde/ámbar crece.
2. Job completado limpio: barra 100% sin tramo rojo.
3. Job antiguo (sin `items_lost` calculado): muestra 0 perdidos (default).
