## Cambio único

`src/index.css` líneas 317-331 — reemplazar `.collection-tint-ring`:

```css
/* Collection visibility tint: thin colored profile hugging the marker dot. */
.collection-tint-ring {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  border: 2px solid var(--collection-tint, #6b7280);
  pointer-events: none;
}
```

## Qué se elimina
- `inset: -6px` (separación del dot)
- `box-shadow` (halo blanco + glow exterior)
- `animation: collection-tint-pulse` + el `@keyframes`

## Resultado
El color asignado en el editor de colección se convierte en un perfil delgado de 2px **pegado al dot**, sin halo ni pulse. Respeta el tamaño del marcador y la paleta de estado (verde/gris/naranja) por debajo.

Cambio transversal — afecta a todos los markers de colección por ser CSS centralizado.
