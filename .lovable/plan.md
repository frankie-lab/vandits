## Mejoras al diálogo "Editar colección"

Cambios acotados a UI/presentación en `CollectionAppearanceDialog.tsx` y al token visual del anillo en `index.css`. Sin tocar lógica de visibilidad ni contrato de tinte.

### 1. Paleta ampliada (32 colores)

Reemplazar la paleta actual de 16 swatches por una rejilla de **32 colores** organizada en 4 filas × 8 columnas, cubriendo más tonos y saturaciones (rojos, naranjas, ámbar, lima, verde, esmeralda, teal, cian, azul, índigo, violeta, fucsia, rosa, marrones y grises). Mantener el formato hex actual y el patrón de selección (escala + borde foreground).

```text
fila 1: rojos / naranjas / ámbar / amarillos    (8)
fila 2: limas / verdes / esmeralda / teal       (8)
fila 3: cian / azul / índigo / violeta          (8)
fila 4: fucsia / rosa / marrón / grises         (8)
```

### 2. Anillo más grueso

En `src/index.css`, regla `.collection-tint-ring`:
- `border: 1px` -> `border: 3px`
- `opacity: 0.8` -> `opacity: 0.95`
- Mantener `inset: 0` y `border-radius: 9999px` para no tapar el marker.

Esto aplica de forma transversal a todos los markers (mapa global, vista doc, miniaturas, popup) sin tocar `map-icons.ts`.

### 3. Nota "por defecto blanco"

Añadir una línea de ayuda bajo el bloque Color en el diálogo:

> "Los puntos que no pertenecen a ninguna colección visible no llevan anillo (apariencia por defecto)."

Texto en `text-xs text-muted-foreground`, sin añadir un swatch "blanco" (evitamos colisión con la regla de "sin colección").

### 4. Preview del anillo en el header del diálogo

El círculo de preview actual (48px con icono blanco) gana un anillo exterior con el color seleccionado y el mismo grosor que en el mapa, para que el usuario vea exactamente cómo se verá el marker tintado.

```text
[ring 3px color] -> [círculo color + icono blanco] -> Nombre input
```

### Archivos afectados
- `src/components/CollectionAppearanceDialog.tsx` — paleta 32, nota informativa, preview con anillo.
- `src/index.css` — engrosar `.collection-tint-ring` a 3px / opacity 0.95.

### Fuera de alcance
- Lógica de visibilidad/filtrado (intacta, gobernada por `collection-visibility.ts`).
- `map-icons.ts` y `LocationMap.tsx` (el anillo ya se renderiza vía CSS var, basta cambiar el token).
- Selección de iconos (no se modifica).
