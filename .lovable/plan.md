# P-POPUP-11.1 — Footer action hierarchy refinement

Cambio quirúrgico sobre el bloque `actionButtonsHtml` en `src/components/map/map-popups.ts` (L1194–1277). El footer persistente `data-popup-footer="v1"` (L1702) NO se toca: sigue siendo el contenedor sticky. Solo cambia su contenido interno.

## Estructura final del footer (caso `isEnriched && canEditLocation && canEditOwn`)

```text
┌──────────────────────────────────────────────┐
│ [spacer 32px] [Re-enriquecer] [Notas] [🗑] │  ← fila de acciones, grupo central
│        Enriquecido · 17/05/2026              │  ← pie informativo, centrado, muted
└──────────────────────────────────────────────┘
```

Grid de 3 columnas en la fila de acciones: `grid-template-columns: 32px 1fr 32px`. La columna izquierda es un spacer invisible del mismo ancho óptico que el icono de borrar derecho, para que el par `[Re-enriquecer][Notas]` quede centrado respecto al popup.

## Cambios concretos

### A. Mover el pill "Enriquecido" fuera de la fila de acciones
- Eliminar el `<div>` verde `#f0fdf4 / #166534` que envuelve la fecha (L1210–1216).
- Renderizar `Enriquecido · ${formatRegistrationDate(updatedAt)}` como segunda línea bajo la fila de botones:
  - `text-align: center`
  - `font-size: 10px`
  - `color: hsl(var(--muted-foreground))`
  - `margin-top: 6px`
  - sin background, sin border, sin icono check.
- Aplica al rama "enriched normal". El caso `isCuratorPoint` (L1198–1205) recibe el mismo tratamiento: pill verde fuera, línea muted dentro.

### B. Acciones principales equilibradas (Re-enriquecer + Notas)
- Mismo tamaño/altura/padding/radius/font-size/font-weight.
- Mismo estilo estructural (mismo `padding: 6px 12px`, `border-radius: 6px`, `font-size: 11px`, `font-weight: 600`, `height` implícita idéntica, `gap: 6px` interno).
- Ambos dentro de un wrapper flex `gap: 8px; justify-content: center` ocupando la columna central del grid.
- Mismo `<svg width="12" height="12">` para uniformidad de iconos.

### C. Re-enriquecer — semántica utilitaria, no warning
- Ya usa `hsl(var(--primary) / 0.12)` + `hsl(var(--primary))` (P-POPUP-11). Confirmar/normalizar:
  - background: `hsl(var(--primary) / 0.10)`
  - color: `hsl(var(--primary))`
  - hover: `hsl(var(--primary) / 0.18)`
  - sin gradiente, sin box-shadow, sin transform.
- Eliminar cualquier residuo naranja/warning si estuviera presente en variantes.

### D. Notas — secundaria privada (no disabled)
- Reemplazar la paleta actual (`#fef3c7/#92400e` con notas, `#f3f4f6/#374151` sin notas) por:
  - background: `hsl(var(--muted))`
  - color: `hsl(var(--foreground))`
  - hover: `hsl(var(--muted) / 0.7)` (o equivalente token) — sin `translateY`.
- Si `hasNotes`, añadir indicador discreto: un punto `4px` ámbar (`hsl(var(--primary) / 0.6)` o token equivalente) junto al label, sin invadir la paleta del botón.
- Mismo tamaño que Re-enriquecer (regla B).

### E. Borrar — icon-only discreto
- Eliminar background `#fef2f2`.
- `background: transparent; border: none; padding: 6px; border-radius: 6px;`
- color icono: `hsl(var(--destructive) / 0.7)`
- hover: `background: hsl(var(--destructive) / 0.10); color: hsl(var(--destructive))` — sin `translateY`.
- Eliminar el texto/label si lo hubiera; solo el `<svg>` papelera 14×14.
- Ancho óptico ≈ 32px → coincide con el spacer izquierdo.

### F. Centrado óptico via grid de 3 columnas
- Fila de acciones:
  ```text
  display: grid;
  grid-template-columns: 32px 1fr 32px;
  align-items: center;
  gap: 8px;
  ```
- Col 1: `<div aria-hidden="true">` vacío (spacer).
- Col 2: wrapper flex con Re-enriquecer + Notas centrados (`justify-content: center; gap: 8px`).
- Col 3: botón borrar icon-only.
- Cuando falte alguna acción (sin `canEditLocation`, sin `canEditOwn`, etc.), las celdas vacías mantienen su ancho para no romper el centrado óptico.

### G. Pie informativo "Enriquecido · fecha"
- Renderizado siempre que `isEnriched || isCuratorPoint` y haya `updatedAt`.
- `<div style="text-align:center; font-size:10px; color:hsl(var(--muted-foreground)); margin-top:6px; letter-spacing:0.01em;">Enriquecido · ${fecha}</div>`
- Sin icono, sin pill, sin border.

## Fuera de scope (no se toca)

- `data-action` valores y handlers (`enrich`, `add-notes`, `delete-location`, `add-to-collection`).
- Wrapper `data-popup-footer="v1"` (L1702) — sigue siendo sticky, mismo padding/border-top/background.
- `progressBarHtml`, `adminEditWarning`, `addToCollectionBtnHtml`.
- Composer 7A.3, hero chrome, breadcrumb, metadata line, ratings, taxonomy, schema, marker grammar, PopupShell, F2, visited/pending.
- `wrapCollapsibleSection` y secundarios discretos (ya canonizados en P-POPUP-11).

## Tests

Actualizar `src/test/popup-footer-persistent.test.ts`:
- Mantener: no "Ficha IA actualizada", `data-popup-footer="v1"` presente, Re-enriquecer sin gradiente violeta.
- Añadir:
  - El bloque que contiene `data-action="enrich"` NO contiene `background: #f0fdf4` (pill verde fuera de la fila).
  - El bloque que contiene `data-action="delete-location"` usa `background: transparent` (no `#fef2f2`) y no contiene texto visible (solo `<svg>`).
  - El HTML del footer contiene la cadena `Enriquecido ·` con `color: hsl(var(--muted-foreground))` y `text-align: center`.
  - El bloque de acciones usa `display: grid` con `grid-template-columns` que incluye `32px` (spacer + icon column).
  - El bloque `data-action="add-notes"` ya no usa `#fef3c7`/`#92400e` ni `translateY`.

## Documentación

- Actualizar `docs/popups/p-popup-10-validation.md` con sección P-POPUP-11.1 (jerarquía footer + grid de 3 columnas + pie informativo).
- Actualizar `mem://style/popup/editorial-reading-style` con el canon final del footer: fila de acciones (grid 32/1fr/32) + pie muted centrado; Re-enriquecer primary suave; Notas muted neutro; Borrar icon-only destructive transparent.
- No requiere nueva entrada en `mem://index.md` (ya hay referencia al editorial-reading-style).

## Criterio de aceptación visual

- El par `[Re-enriquecer][Notas]` se percibe ópticamente centrado respecto al ancho del popup.
- Re-enriquecer ya no parece warning/alerta; lee como acción utilitaria disponible.
- Notas no parece disabled; lee como acción secundaria privada con el mismo peso estructural que Re-enriquecer.
- Borrar es claramente secundario/destructivo, sin caja.
- "Enriquecido · 17/05/2026" lee como pie técnico, no como CTA ni como pill verde.
