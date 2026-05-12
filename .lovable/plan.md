# Mover Localizarme + Tema al centro absoluto del mapa

## Qué son

Dos botones flotantes definidos en `src/components/LocationMap.tsx:2175`:

- **Localizarme** (`LocateFixed`): centra el mapa en la ubicación del navegador. Cuando ya tiene tu ubicación, el icono se pone en color `text-primary` (azul) — eso es el "algo azul" que se asomaba detrás de la search bar.
- **MapThemeToggle**: cambia el estilo del tile (claro/oscuro).

Hoy viven en `top-4 right-4 z-[999]`, justo donde está la search bar (`z-[1000]`), por eso quedaban tapados y sin clicks.

## Cambio

Reposicionar el contenedor al **centro absoluto del mapa**, manteniéndolos juntos en una pill horizontal y respetando el sidebar-aware layout (sidebar izquierdo `200px` + panel derecho `340px`).

`src/components/LocationMap.tsx:2175`

```diff
- <div className="absolute top-4 right-4 z-[999] flex items-center gap-2">
+ <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[999] flex items-center gap-2 pointer-events-none">
+   {/* hijos con pointer-events-auto */}
```

Cada botón hijo lleva `pointer-events-auto` para que el wrapper no bloquee el drag/zoom del mapa por debajo.

## Notas

- z-index 999 sigue por debajo de popups y de la search bar; correcto.
- No toca: search bar, FloatingToolbar central, leyenda inferior, controles de zoom Leaflet.
- Tooltip "Localizarme" pasa a `side="top"` para no quedar fuera de pantalla en el centro.

## Verificación

1. En `/`, los dos botones aparecen flotando en el centro del mapa.
2. Click en cada uno funciona; el resto del mapa sigue siendo arrastrable alrededor.
3. La esquina superior derecha queda limpia (solo search bar).
