## Icono visible en filas con color claro

### Problema
El chip del icono usa `bg = collection.color` con `text-white` fijo. Si el color es blanco/claro (ej. FullTrips #ffffff), el icono Lucide blanco desaparece sobre el fondo blanco.

### Solución
Calcular contraste y elegir color de icono dinámicamente. Añadir un borde sutil al chip para que también se distinga del fondo de la fila cuando el color es claro.

### Helper único
Nuevo `src/shared/lib/color-contrast.ts`:
- `getReadableForeground(hex: string): '#ffffff' | '#1f2937'` — usa luminancia relativa (WCAG); umbral 0.6 → texto oscuro, si no blanco.
- `isLightColor(hex: string): boolean` — true si luminancia > 0.85 (para decidir si añadir borde).

### Aplicación
En `CollectionsListPanel.tsx` (chip del icono, ambos modos rename y normal):
```tsx
<span
  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border"
  style={{
    backgroundColor: tint,
    borderColor: isLightColor(tint) ? 'hsl(var(--border))' : 'transparent',
  }}
>
  <Icon className="w-3.5 h-3.5" style={{ color: getReadableForeground(tint) }} />
</span>
```

Quitar `text-white` del Icon.

### Otros sitios que pintan el chip de colección con `text-white`
Buscar y aplicar el mismo helper para mantenerlo transversal:
- `CollectionFocusView.tsx` (header)
- Cualquier diálogo de apariencia que muestre preview

### Archivos
- `src/shared/lib/color-contrast.ts` (nuevo)
- `src/components/CollectionsListPanel.tsx`
- Otros consumidores del chip de colección detectados durante implementación.
