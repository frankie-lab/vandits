## Qué arreglo

1. **Cuadros de color que salen vacíos** en algunas filas (acento de marca, texto sobre acento, etc.).
2. **El modal del Back Office se mete debajo de la barra inferior** de progreso (la del enriquecimiento por lotes).

## Cómo lo arreglo

### 1. Cuadros de color vacíos

Ahora mismo, en cada fila, el fondo de la columna Claro/Oscuro intenta ser "el sitio donde ese color se usa de verdad" — y en muchos casos ese sitio **es el propio color**, así que la muestra desaparece (color encima de color = no ves nada).

Cambio:
- **Fondo de la columna = siempre el fondo de la app** (blanco hueso en Claro, casi negro en Oscuro). Sin excepciones, salvo que el token sea literalmente "fondo de página".
- **La muestra del color va dentro**, como cuadrado relleno o como texto (si es un token de tipografía).
- **El badge de contraste (WCAG)** sigue calculándose contra el sitio real donde se usa el color — el badge no miente, sólo cambia dónde dibujamos la muestra.

Resultado: en TODAS las filas verás el cuadrado del color claramente, sobre fondo claro u oscuro.

### 2. Modal pisando la barra inferior

El sistema ya tiene una regla global que dice "todos los modales se encogen cuando aparece la barra inferior". Pero este modal tiene una altura fija a pelo (`h-[92vh]`) que se salta esa regla.

Cambio:
- Quito la altura fija. El modal pasa a obedecer la regla global.
- Cuando enciendes un batch de enriquecimiento → la barra aparece, el modal se encoge solo y queda un poco de aire entre los dos.
- Cuando termina → la barra desaparece, el modal se expande otra vez.

## Archivos que toco (3, mínimos)

- `src/components/admin/design-system/TokenRow.tsx` — el fondo de las columnas.
- `src/components/AdminPanel.tsx` — quitar `h-[92vh]` y `h-[90vh]`.
- `src/components/BottomProgressBar.tsx` — publicar un margen un poco mayor cuando la barra está activa.

## Lo que NO toco

- La lógica de vincular Claro↔Oscuro (sigue igual).
- El editor de color (sigue igual).
- Cómo se calculan los contrastes (sigue igual).
- Los demás modales (heredan la regla automáticamente).

## Comprobación final

- Abrir Design System → todas las filas muestran los cuadros de color visibles en Claro y Oscuro.
- Lanzar un batch → la barra inferior aparece, el modal se ajusta solo.
- Cerrar el batch → el modal vuelve a su tamaño.
