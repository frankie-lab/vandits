## Objetivo

Equilibrar visualmente el marcador y el anillo de colección para que ninguno domine al otro.

## Cambios

### 1. Borde blanco del marcador → 1 px
Archivo: `src/components/map/map-icons.ts`
- Cambiar `stroke-width="${borderWidth}"` (que hoy resuelve a 2) a un valor fijo de **1** en las dos formas:
  - Pin/gota (línea ~76)
  - Círculo (línea ~99)
- Si `borderWidth` viene de `marker_size_config` en BD, ajustamos el valor por defecto a `1` en el helper que lo calcula (no parchamos en el componente). Verificar en `src/components/map/map-icons.ts` de dónde llega y bajar el default ahí.

Archivo: `src/components/map/map-v2-renderer.ts`
- `stroke="${border}" stroke-width="2"` → `stroke-width="1"` (línea ~51).

### 2. Anillo de colección → 1 px @ 80% opacidad
Archivo: `src/index.css` (`.collection-tint-ring`, línea 318)

```css
.collection-tint-ring {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  border: 1px solid var(--collection-tint, #6b7280);
  opacity: 0.8;
  pointer-events: none;
  box-sizing: border-box;
}
```

## Fuera de alcance
- No se tocan iconos internos Lucide (`stroke-width="2.5"`), ni iconos del popup, ni rutas.
- No se cambia la lógica de visibilidad ni el helper `getPointVisualState`.

## Memoria
Actualizar `mem://logic/collections/visibility-and-styling` para registrar los nuevos grosores (1/1 px) y opacidad 0.8 del anillo.
