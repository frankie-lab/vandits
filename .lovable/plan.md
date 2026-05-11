## Objetivo

Convertir el DS Inspector actual (técnico, lleno de tripletes HSL y nombres como `color · light · popoverForeground`) en un panel comprensible para alguien no técnico, sin perder la información para quien sí lo es.

Tres problemas a resolver:
1. **Incomprensible**: nombres crudos, valores HSL sin contexto, sin descripción.
2. **Colores repetidos**: muchos blancos/casi-blancos visualmente idénticos (background, card, popover, primaryForeground…) que parecen errores.
3. **Sin contexto de uso**: el gestor no sabe *dónde* impacta cada token ni *qué pasa* si cambia.

---

## Cambios por sección

### A. Vista de Tokens — nuevo layout

Reemplazar la lista actual de filas planas por una tabla de tres columnas:

```text
┌─ Swatch ─┬─ Identidad ──────────────────┬─ Dónde se usa ──────────────┐
│ █ █      │ Color de marca               │ Botones principales,        │
│ light    │ primary                       │ anillo de foco, enlaces     │
│ dark     │ Naranja cálido (24·75·50)    │ activos.                    │
└──────────┴──────────────────────────────┴─────────────────────────────┘
```

- **Swatch doble**: para tokens de color que existen en light y dark, mostrar las dos muestras juntas (mini etiqueta "L" / "D"). Para los demás, una sola muestra.
- **Identidad**: línea 1 = nombre humano en español; línea 2 = nombre técnico (`primary`, `--popover-foreground`) en monospace pequeño; línea 3 = descripción breve del valor (formato + tono dominante).
- **Dónde se usa**: 1–2 frases curadas por token. Para los principales (primary, secondary, accent, destructive, muted, foreground, background, card, popover, border, ring, sidebar-*) escribiremos a mano la descripción. Para el resto, fallback genérico.

### B. Diccionario de etiquetas + usos

Crear `src/components/admin/design-system/token-glossary.ts`:

```ts
// Estructura:
{
  "color.primary":            { label: "Color de marca",          usage: "Botones primarios, anillo de foco, enlaces activos" },
  "color.primaryForeground":  { label: "Texto sobre marca",       usage: "Color del texto dentro de botones primarios" },
  "color.muted":              { label: "Fondo sutil",             usage: "Filas alternas, separadores suaves, chips inactivos" },
  "color.border":             { label: "Borde estándar",          usage: "Tarjetas, inputs, separadores de paneles" },
  // … cubrir los ~25 tokens semánticos principales
  "poi.state.enriched":       { label: "Punto enriquecido",       usage: "Marcador verde del POI con descripción IA" },
  "poi.ring.error":           { label: "Anillo de error",         usage: "Halo rojo alrededor de POIs fallidos" },
  "popup.maxWidth":           { label: "Ancho máximo del popup",  usage: "Limita el ancho de la ficha que abre el mapa" },
  // …
}
```

Si una clave no está en el diccionario, mostrar "—" en lugar del nombre técnico desnudo.

### C. Dedupe de valores idénticos

Antes de renderizar, agrupar tokens de color con **el mismo HSL** en una sola fila "alias":

```text
█ #FFFFFF — Blanco puro
   Usado como: card · popover · primaryForeground · secondaryForeground
```

Esto elimina el ruido visual de 5 swatches blancos seguidos. La fila desplegable permite ver cada alias y su CSS var.

### D. Light vs Dark emparejado

Hoy el panel lista `color · light · *` y luego `color · dark · *` como si fueran tokens distintos. Cambio: una fila por nombre semántico (`primary`, `background`, …) con **dos muestras** dentro (L y D). Eso refleja la realidad — son el mismo token con dos valores según tema — y reduce la lista a la mitad.

### E. Previsualización en vivo (expandible)

Cada fila de token se puede expandir (click) y muestra un mini-ejemplo real:

| Token                | Mini-ejemplo en vivo                                      |
|----------------------|-----------------------------------------------------------|
| `primary`            | Un botón "Guardar" + un chip activo                       |
| `card` / `border`    | Una mini-tarjeta con título + texto                       |
| `muted`              | Tres filas alternas                                        |
| `destructive`        | Botón "Eliminar"                                           |
| `popup.maxWidth`     | Caja con regla milimétrica indicando el ancho             |
| `poi.state.*`        | Renderiza un marker SVG con ese color (reusa PoiPreview)  |
| `motion.*`           | Animación bucle de un cuadrado moviéndose con ese easing  |
| `radius.*`           | Cuadrado con ese radio                                    |
| `z-index.*`          | Diagrama de capas mostrando la posición                   |

Todo se construye con primitives existentes — sin tocar el catálogo.

### F. Reorganización de grupos

La sidebar pasa de 10 grupos planos a **2 niveles**:

```text
Esenciales
  Color
  Tipografía
  Densidad
  Radius
  Motion

Dominio
  POI (marcadores)
  Popup (fichas)
  Map (capas/zoom)

Avanzado
  Z-index
  Elevation
```

"Avanzado" colapsado por defecto. El gestor entra y ve solo lo que reconoce.

### G. Tipografía — preview real

Reemplazar el valor crudo (`16px / 1.4 / 500`) por una línea con esa tipografía aplicada:

```text
Encabezado H3
text-h3 · 18px / 1.3 / 600 · usado en títulos de panel y diálogos
```

### H. Motion — preview con easing real

Cada token de duración/easing renderiza un cuadrado que se anima en bucle con esos valores. Hover pausa para inspeccionar.

---

## Lo que NO cambia

- Sigue siendo **read-only**. Nivel 2 (overrides en sesión) se queda como estaba previsto, en una iteración aparte.
- Las stories de Storybook no se tocan.
- Los archivos `tokens/source/*.json` no se tocan: el diccionario de etiquetas vive aparte y no es la verdad de los tokens; solo los anota.

---

## Detalle técnico

Archivos a tocar:

1. `src/components/admin/design-system/token-glossary.ts` *(nuevo)* — diccionario label + usage.
2. `src/components/admin/design-system/token-row.tsx` *(nuevo)* — fila con swatch doble, descripción y zona expandible.
3. `src/components/admin/design-system/token-previews/` *(nuevo)* — un componente de preview por tipo (color, radius, motion, z-index, popup, poi).
4. `src/components/admin/design-system/token-grouping.ts` *(nuevo)* — helpers `pairLightDark()`, `dedupeByValue()`, `groupBySection()`.
5. `src/components/admin/DesignSystemPanel.tsx` — refactor de la pestaña Tokens; el resto (Primitives / Patterns / Memorias) no cambia.

Reglas que se respetan:
- Cero hex hardcoded ni clases `bg-gray-*` (los swatches reciben el color como `style={{ background: 'hsl(...)' }}` a partir del valor del propio token — eso es dato, no estilo).
- Uso de `@/design-system/primitives/*` en todas las piezas nuevas.
- Sin emojis; iconos Lucide.
- Sin tocar el resto del AdminPanel.

---

## Criterio de cierre

- Un usuario no técnico abre Tokens → Color y ve una lista corta, con nombres en castellano y descripción de uso.
- No hay 5 swatches blancos seguidos.
- Light y dark conviven en una sola fila.
- Click en `primary` muestra un botón real usando ese color.
- "POI" y "Popup" tienen previews coherentes con lo que se ve en el mapa.
- Z-index y Elevation siguen accesibles pero detrás del bloque "Avanzado".

¿Tiramos con esto, o quieres que añada/quite alguna de las secciones (por ejemplo, "Dónde se usa" como búsqueda real en código en vez de curado a mano)?
