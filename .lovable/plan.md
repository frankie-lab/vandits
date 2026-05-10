# Unificar la experiencia de carga inicial

Hoy, al abrir la app, conviven cuatro indicadores simultáneos:

1. Tarjeta de bienvenida ("Hola, Frankie ... Ir a mi catálogo") aparece en cuanto llega la primera página de datos, **antes** de terminar el catálogo.
2. `CatalogLoadingCard` (tarjeta centrada "Cargando catálogo").
3. `GlobalLoadingBar` (línea fina arriba + chip "Cargando catálogo" arriba a la derecha).
4. Cursor `progress` global (bola girando) por `body.is-blocking-load`.

Resultado: ruido visual, mensajes duplicados y la bienvenida invita a actuar sobre un mapa todavía vacío. Plan: **un único loader durante la carga inicial** y la bienvenida sólo cuando todo está listo.

## Cambios

### 1. `src/components/LocationMap.tsx` — bloquear bienvenida durante `db-sync`

Importar `useActiveLoadings` y derivar `isCatalogLoading = tasks.some(t => t.id === 'db-sync')`. Sumarlo a la condición:

```ts
const showOnboardingCard = dataReady && !isCatalogLoading && welcomeMode === 'onboarding' && !welcomeDismissed;
const showSummaryCard    = dataReady && !isCatalogLoading && welcomeMode === 'summary'   && !welcomeDismissed && !summaryShown;
```

Así la tarjeta de bienvenida sólo aparece cuando el catálogo terminó de cargarse.

### 2. `src/shared/loading/GlobalLoadingBar.tsx` — no duplicar `db-sync`

Filtrar fuera la tarea `db-sync` (ya se representa con la tarjeta central):

```ts
const tasks = useActiveLoadings().filter(t => t.id !== 'db-sync');
if (tasks.length === 0) return null;
```

Para otras cargas (toggles de colección, etc.) la barra superior y el chip siguen funcionando como hoy.

### 3. `src/index.css` — quitar el cursor "bola girando" global

Eliminar la regla `body.is-blocking-load, body.is-blocking-load * { cursor: progress !important; }`. Mantener únicamente el bloqueo de interacciones sobre `.leaflet-container` (que sigue impidiendo pan/zoom/click sobre el mapa vacío). El cursor en el resto de la UI vuelve al normal, y los botones del propio loader / header siguen siendo clicables como ya hacen.

### 4. Reposicionar `CatalogLoadingCard` (opcional, mismo archivo)

Hoy está en `bottom-24` (estaba pensado para coincidir con el slot de la welcome card). Moverlo a centrado vertical real (`top-1/2 -translate-y-1/2`) para que sea el único protagonista durante la carga y se distinga claramente de cualquier otro overlay.

## Resultado esperado

Durante la carga inicial: sólo la tarjeta central "Cargando catálogo · 432 / 5 073 · ≈ 12 s", mapa no interactivo, cursor normal, sin chip arriba a la derecha, sin bienvenida.
Al terminar: tarjeta desaparece y aparece la bienvenida con los contadores ya completos.

## Validación

Recargar `/` con sesión activa: verificar que sólo se ve la tarjeta central durante la sincronización, que el chip superior derecho no aparece, que el cursor es normal y que la bienvenida emerge sólo cuando termina.
