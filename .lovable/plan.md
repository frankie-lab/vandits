# Fase DS-UX1A — Popup Matrix + Skeleton System + Panel Loading (final)

Bloque coherente: espera, carga y preview estructural. Sin tocar Leaflet adapter, sin Fase 4B, sin endurecer ESLint, sin Empty States ni Hover Tooltip (esos van a DS-UX1B).

Ejecutable como **3 PRs independientes**, cada uno reversible sin afectar a los otros.

---

## A.1 — Popup Matrix (PR-1)

Renderer no-Leaflet en Storybook que captura los estados canónicos del popup del mapa.

Archivos nuevos:

```text
src/design-system/map/__stories__/
├── PopupPreview.tsx               (renderer token-driven, sin Leaflet)
├── PopupMatrix.stories.tsx
├── PopupResponsive.stories.tsx
└── PopupFocused.stories.tsx
```

**Matriz principal (5×3):**

```text
                       Mío         Seguido     Servicio
  Importado           [gris]       [gris]      [sky]
  Vacío               [naranja]    [naranja]   [sky]
  Loading enrichment  [skeleton]   [skeleton]  [skeleton]
  Enriquecido         [verde]      [verde]     [sky]
  Con error           [+rojo]      [+rojo]     [+rojo]
```

Cada celda: header (nombre + tipo) → hero (imagen, placeholder SVG, o `HeroImageSkeleton`) → cuerpo (descripción / skeleton / empty CTA / recovery block) → footer (collection chips + acciones).

**Stories adicionales:**
- `PopupResponsive` — el mismo popup a 320 / 375 / 414 / 768 px (clamp del wrapper interno).
- `PopupFocused` — popup en estado `selected/focused` (POI seleccionado desde búsqueda o ruta). Validación visual aislada, fuera de la matriz principal.

**Tokens — `src/design-system/tokens/source/popup.json` (valores actuales exactos, sin rediseño):**
- `header.height`, `body.padding`, `hero.ratio`, `actionRow.height`, `maxWidth`, `maxHeight`
- Regenerar con `npm run tokens:build`. **No** se toca `buildPopupHtml` ni el adapter Leaflet.

Memoria nueva: `mem://style/popup/matrix-rule` — 5 estados × 3 orígenes + variante focused.

---

## A.2 — Skeleton System (PR-2)

`AppSkeleton` ya existe. Convertirlo en patrones nombrados que vivan **dentro del DS**, con re-export legacy desde `src/shared/...`.

Archivos nuevos:

```text
src/design-system/patterns/Skeletons/
├── PoiCardSkeleton.tsx
├── PoiPopupSkeleton.tsx
├── PanelListSkeleton.tsx          (props: rows: number)
├── HeroImageSkeleton.tsx          (props: ratio: "16/9" | "4/3" | "1/1")
├── BadgeRowSkeleton.tsx           (props: count: number)
└── index.ts

src/shared/components/ui/skeletons/index.ts   (re-export legacy)

src/design-system/patterns/__stories__/Skeletons.stories.tsx
```

**Regla de "cero hardcoded sizes" — matizada:**
- **Permitido**: props funcionales (`rows`, `count`, `ratio`).
- **Prohibido**: valores absolutos en px/rem para alturas base, radios, gaps, paddings → siempre desde density/radius/spacing tokens (`h-control-md`, `rounded-token-sm`, `gap-2`).

Story: grid con los 5 patrones individuales + densidad alta (10× `PoiCardSkeleton`) para validar ritmo visual.

**Cableado mínimo (lo que el usuario percibe ya):**
- `DocumentWaypointsTabs` → `PoiCardSkeleton × N` mientras fetch
- `GalleryView` → `HeroImageSkeleton ratio="16/9"` antes de cargar imagen
- `NearbyPanel` (recovery) → `PanelListSkeleton rows={6}`

NO tocar mapa ni clusters. Resto de `animate-pulse` quedan como follow-up.

Memoria nueva: `mem://ui/skeleton-patterns` — catálogo, props permitidos, reglas de uso.

---

## A.3 — Panel Loading (PR-3)

Nivel intermedio entre `GlobalLoadingBar` (top) y la barra inferior multi-lane: panel concreto cargando.

**API de `PanelShell` (ampliada, sin breaking changes):**

```tsx
<PanelShell
  loading={isLoading}
  loadingFallback={<PanelListSkeleton rows={6} />}
  hasContent={items.length > 0}
>
  {/* contenido normal */}
</PanelShell>
```

**Contrato explícito de loading (clave del ajuste pedido):**

| Caso | hasContent | loading | Render |
|------|------------|---------|--------|
| Fetch inicial | `false` | `true` | `loadingFallback` reemplaza children + spinner en header |
| Refresh parcial | `true` | `true` | **Children intactos** + spinner en header (no parpadea) |
| Vacío real | `false` | `false` | Children (empty state lo maneja DS-UX1B) |
| Normal | `true` | `false` | Children |

Reglas:
- `loading` siempre activa el `AppSpinner` xs a la derecha del título.
- `loadingFallback` sólo reemplaza children cuando `hasContent === false`.
- Sin `loadingFallback` y sin contenido → fallback por defecto = `PanelListSkeleton rows={4}`.
- El usuario sigue pudiendo interactuar con header, tabs y footer mientras `loading`.
- Ningún estado activa `body.is-blocking-load`.

**Cableado mínimo:**
- `ImportedContentPanel` (`useDocuments`)
- `CollectionsPanel`
- `NearbyPanel`

Story: `src/design-system/patterns/__stories__/PanelShellLoading.stories.tsx` con 4 escenarios (fetch inicial / refresh parcial / vacío / normal) y las 3 variantes form/library/workflow.

Memoria nueva: `mem://ui/panel-loading-pattern` — contrato `hasContent`/`loading`/`loadingFallback` y ejemplos.

---

## Verificación (condición de cierre)

Antes de cerrar DS-UX1A:

1. `npm run tokens:build` — emite `popup.json` sin errores
2. `npm run build-storybook` — todas las stories nuevas compilan
3. `npm run lint` — cero nuevos warnings
4. **Smoke visual y de interacción** en `/`:
   - Mapa sigue clicable mientras un panel está en `loading`
   - Refresh parcial no parpadea (mismos items visibles, solo spinner en header)
   - Ningún loading local activa `body.is-blocking-load`
   - Popup abre con estado correcto, incluido `loading enrichment` cuando hay enrich en curso

---

## PR layout

```text
PR-1  DS-UX1A·Popup    → popup.json + PopupPreview + 3 stories + memoria
PR-2  DS-UX1A·Skeleton → 5 patterns + re-export legacy + story + cableado mínimo
PR-3  DS-UX1A·Panel    → PanelShell(loading/hasContent/loadingFallback) + cableado + story + memoria
```

---

## Memorias a crear/actualizar

- `mem://style/popup/matrix-rule` (nuevo)
- `mem://ui/skeleton-patterns` (nuevo)
- `mem://ui/panel-loading-pattern` (nuevo)
- `mem://architecture/design-system-phase-4a` (referencia a DS-UX1A)
- `mem://ui/shared-primitives` (anotar ubicación canónica en `design-system/patterns/Skeletons/` + re-export legacy)

---

## Fuera de alcance (DS-UX1B, siguiente iteración)

- Empty States canónicos (`AppEmptyState` + catálogo de presets)
- Hover Preview tooltip (story + tokens de timing)

---

## Riesgos

- **Tokens de popup**: valores iniciales = exactos a los actuales. Rediseño visual del popup, si llega, va en otra iteración.
- **Skeleton overreach**: limitar cableado a los 3 puntos listados; resto como follow-up.
- **PanelShell breaking**: `loading`, `loadingFallback` y `hasContent` son opcionales. Sin ellos, `PanelShell` se comporta exactamente igual que hoy.
