# Rediseño de la barra de progreso de enriquecimiento

Objetivo: dar protagonismo a la barra (más ancho, un único riel segmentado con los 4 estados) sin aumentar la altura del contenedor ni perder los controles Pausar / Reanudar / Detener.

## Cambios (un único archivo)

`src/components/BottomProgressBar.tsx`

### 1. Barra segmentada única (centro, ancha)

Sustituir:
- el riel fino superior (`h-1 bg-muted/50`)
- el mini `Progress` central de 192px (`w-48`)

por **una sola barra horizontal de `h-3 rounded-full`** que ocupa todo el ancho disponible entre el bloque de título (izquierda) y los botones (derecha). Usa `flex-1 min-w-0` para crecer.

Segmentos apilados en porcentajes (de izquierda a derecha):
```text
[####### verde enriquecidos ####### | rojo errores duros | ámbar errores blandos | gris en cola ]
```

Implementación: contenedor `bg-muted/40` y 3 divs `absolute` con `left`/`width` calculados:
- `enrichedPct = enriched / total * 100`
- `hardPct = buckets.hard / total * 100`
- `softPct = buckets.soft / total * 100`
- el hueco restante queda como "en cola" (gris translúcido del fondo).

En estado `paused` el segmento verde pasa a ámbar para mantener el código visual actual.

### 2. Etiquetas compactas debajo del riel

Justo bajo la barra (misma fila visual, sin añadir altura porque sustituimos las dos líneas de texto actuales):
```text
Enriqueciendo ubicaciones · 432/583 (74%) · ETA 3 min 12 s
● 427 enriquecidos   ● 1 error   ● 4 sin match   ● 151 en cola
```

- Título a la izquierda con icono Sparkles animado.
- Métricas en una sola línea con `tabular-nums`, separadores `·`.
- Subtítulo "Procesando: {nombre}" se desplaza a la derecha del título en línea, truncado, sólo si hay sitio (`hidden lg:inline`).

### 3. Cálculo de ETA

Nuevo `useRef<{ startedAt: number; startedCompleted: number }>` que se inicializa cuando aparece la primera sesión activa y se resetea al completarse. Tasa = `(completedNow - startedCompleted) / (now - startedAt)`. ETA = `remaining / tasa`. Formato vía helper local `formatEta(ms)` → "1 min 04 s" / "12 s" / "—" si tasa = 0.

Reutilizable con el mismo patrón que `CatalogLoadingCard` (no hace falta extraer).

### 4. Layout final dentro del mismo contenedor

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ ✦ Enriqueciendo... 432/583 · ETA 3:12     [████████░░░░]  74%   ⏸ Pausar  □ │
│   ● 427  ● 1  ● 4  ● 151                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Padding vertical actual `py-3` se conserva.
- Se elimina el `h-1` superior (su función la asume el riel central).
- Altura total ≈ idéntica a la actual (icono + dos líneas de texto ya ocupaban el mismo alto que riel `h-3` + línea de leyenda).

### 5. Conservado intacto

- `aggregateJobs`, polling, `broadcastAction`, handlers de pause/resume/stop/dismiss.
- Botones Pausar / Reanudar / Detener / Cerrar con sus estados de loading.
- Modos `paused` (fondo ámbar) y `completed` (fondo verde + "¡N ubicaciones enriquecidas!").
- Responsive: en `sm` se ocultan los textos de los botones (icon-only), las métricas de leyenda colapsan a sólo los puntos con cantidades.

### Validación

Inspección visual a 1507px (viewport actual) y a `sm` (375px) para confirmar que la barra crece, los botones siguen alcanzables y la altura no aumenta.
