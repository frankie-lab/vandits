# Problema

En la **Paleta primitiva** las dos columnas pintan el cuadrado entero con el color del primitivo. No hay fondo claro vs fondo oscuro, así que no se ve el efecto del color en cada modo. Neutral 0 (#FFFFFF) sale como dos columnas blancas idénticas; un gris medio sale como dos rectángulos iguales.

# Lo que quieres ver

Cada primitivo en **su contexto real**:
- Columna **Claro** = fondo claro real de la app (el surface del modo claro). Encima, el color del primitivo como muestra.
- Columna **Oscuro** = fondo oscuro real de la app (el surface del modo oscuro). Encima, el color del primitivo como muestra.

Así de un vistazo ves si el primitivo "se come" o "destaca" sobre cada fondo.

# Solución

En `src/components/admin/design-system/TokenRow.tsx`, rama de primitivos:

1. **Lienzo de la columna** = `color.{mode}.surface.background`  
   → Claro pinta fondo claro, Oscuro pinta fondo oscuro. Siempre, sin excepción.
2. **Muestra del primitivo** = chip rectangular grande centrado, relleno con el color del primitivo, con borde sutil `border-border/40` para que no desaparezca cuando primitivo ≈ lienzo (Neutral 0 sobre blanco).
3. **HEX** dentro del chip si hay contraste suficiente, o debajo del chip sobre el lienzo si no.
4. **Label "CLARO" / "OSCURO"** arriba, color contrastado contra el **lienzo** (no contra el chip).
5. Si el primitivo es casi igual al lienzo (diferencia de luminancia < 6%), pintar un patrón ajedrezado micro detrás del chip para que siempre se vea el borde de la muestra.

Semánticos: sin cambios.

# Fichero

- `src/components/admin/design-system/TokenRow.tsx` — solo la rama `isPrimitive` dentro de `ColorSwatchColumn`.

# Riesgo

Bajo. Cambio visual local a una sola rama de un componente. No afecta a tokens semánticos, ni a edición, ni al vínculo claro↔oscuro.
