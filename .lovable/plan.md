
# P-POPUP-12 — Canon de taxonomía editorial estructurada

Sustituir la "tag cloud" actual del popup por **un bloque taxonómico editorial** con 4 familias claramente diferenciadas, sin overflow visual.

## Estado actual

- `case 'etiquetas'` (map-popups.ts L1464-1542) renderiza 3 familias (taxonomy / semantic / user) con chip `+N más` cuando se excede `POPUP_TAG_CAPS = { taxonomy:3, semantic:5, user:4 }`.
- `case 'clasificacion'` (L1418-1432) renderiza el `cultural_context` como un chip suelto, en un slot independiente.
- Sin separadores entre familias, sin alineado centrado canónico, sin color diferencial estricto (solo el variant del chip).
- Colecciones y geografía ya están fuera del bloque (viven en metadata line / breadcrumb territorial) — eso se respeta tal cual.

## Canon nuevo

Cuatro familias renderizables, **siempre 5 max cada una, sin `+N`, sin truncado visual**:

| Familia          | Fuente                                       | Color (token semántico)          |
| ---------------- | -------------------------------------------- | -------------------------------- |
| taxonomy         | `getCanonicalPopupTags(...).taxonomy`        | `--primary` (azul editorial)     |
| semantic         | `getCanonicalPopupTags(...).semantic`        | `--accent` (ámbar/temático)      |
| personal / user  | `getCanonicalPopupTags(...).user`            | `--ring` o token "personal"      |
| cultural context | `enriched.cultural_context.type_label`       | violeta Wikidata (heredado 270°) |

Render:

```
┌─────────────────────────────────────────┐
│   #Arquitectura  #Castillos  #Medieval  │   ← taxonomy (centrado)
├─────────────────────────────────────────┤
│      #piedra  #fortaleza  #siglo-xii    │   ← semantic
├─────────────────────────────────────────┤
│           #favorito  #revisitar          │   ← personal
├─────────────────────────────────────────┤
│              Castillo medieval           │   ← cultural context
└─────────────────────────────────────────┘
```

- Todas las familias visibles dentro del límite (≤5).
- Separadas por línea divisoria horizontal de 1px (`hsl(var(--border)/0.6)`).
- Cada familia tiene color propio (variant del chip).
- Alineado centrado (`justify-content: center`).
- Sin `+N`, sin `<details>`, sin truncado.
- Familias vacías se omiten **junto con su divisor** (no líneas huérfanas).
- Si el bloque entero queda vacío, no se renderiza contenedor.

## Cambios

### 1. `src/shared/popup/tags.ts`

- `POPUP_TAG_CAPS` → `{ taxonomy:5, semantic:5, user:5, cultural:5 }`. Mantener `collections:4` (lo consume otro helper, fuera de scope).
- Comentario de cabecera: actualizar para reflejar que ya no hay overflow visual.

### 2. `src/components/map/map-popups.ts`

**A. `case 'clasificacion'` (L1418-1432):** dejar `return ''`. El cultural_context se traslada al bloque taxonómico para que las 4 familias vivan en un único slot editorial coherente.

**B. `case 'etiquetas'` (L1464-1542):**
- Borrar todo el path legacy (L1509-1541) — el flag `isPopupGeoCanonicalV1On()` ya es default ON en canon.
- Reescribir el path canónico:
  - `renderBucket(items, family)`:
    - `slice(0, 5)` directo, sin cálculo de `overflow`.
    - Quitar `overflowChip` completamente.
    - Wrapper: `display:flex; flex-wrap:wrap; justify-content:center; gap:6px; padding:8px 4px;`.
    - Variant de color por familia (taxonomy/semantic/personal/cultural) pasado a `inlineTagBadge`.
  - Componer en orden: taxonomy → semantic → user → cultural.
  - Entre familias renderizadas: `<div style="border-top:1px solid hsl(var(--border)/0.6); margin:0 8px;"></div>`.
  - Cultural se compone como chip único con su color violeta (heredado del slot `clasificacion` actual).
  - Si `parts.length === 0` → return `''`.
- Contenedor exterior: `margin-bottom: ${CARD.sectionGap}px; text-align:center;`.

**C. `inlineTagBadge` (verificar):** asegurar que el variant `'personal'` existe y que `'classification'` mapea a un color azul `--primary`. Si falta el variant cultural, añadirlo respetando el mismo violeta del chip Wikidata actual (`hsl(270 60% 95%)` bg / `hsl(270 70% 35%)` fg).

### 3. Tests

- `src/test/popup-tags-canonical.test.ts`: actualizar el caso de `POPUP_TAG_CAPS` a `{ taxonomy:5, semantic:5, user:5, cultural:5, collections:4 }`.
- `src/test/popup-taxonomy-canon-chips.test.ts`: el case `'clasificacion'` ahora devuelve `''` siempre; ajustar la aserción "still renders cultural_context.type_label" para verificar que el chip cultural aparece dentro del bloque del case `'etiquetas'`.
- Nuevo `src/test/popup-taxonomy-structured.test.ts`:
  - Renderiza un popup con 6 taxonomy + 7 semantic + 6 user + cultural y verifica:
    - No aparece `+` ni `más` ni `+N` en el HTML del bloque.
    - Máximo 5 chips por familia (cuenta `inline-tag-badge` por bucket).
    - Hay exactamente N-1 separadores `border-top` entre las N familias renderizadas.
    - Cada familia tiene su color/variant distinguible.
    - `justify-content: center` presente.
  - Caso "todas vacías": el bloque no se renderiza.
  - Caso "solo cultural": no aparece separador.

### 4. Documentación / memoria

- `docs/contracts/popup-contract.md`: sección "Taxonomía editorial estructurada (P-POPUP-12)" describiendo las 4 familias, el límite duro de 5, ausencia de `+N` y la responsabilidad del enrichment/normalizador de recortar antes del render.
- `docs/popups/p-popup-10-validation.md` (o nuevo `p-popup-12-validation.md`): registrar la migración.
- `mem://style/popup/canonical-body-composer`: actualizar para incluir el slot "taxonomía editorial 4×5" canon.
- `mem://logic/popup/provenance-vs-collection-vs-tag`: ratificar que `cultural_context` vive como 4ª familia del bloque taxonómico (no en slot independiente).

## Fuera de scope (no tocar)

composer 7A.3, ratings logic, handlers, schema, hero chrome, breadcrumb territorial, metadata line, taxonomy/visibility upstream, marker grammar, PopupShell, F2, footer P-POPUP-11.1, visited/pending, secondary accordions, dedupe `dedupePopupTagBuckets` (la lógica de deduplicación inter-familia ya es correcta).

## Responsabilidad del enrichment

Si una familia llega con >5 entradas (caso raro hoy: taxonomy max real = 3 niveles; semantic puede excederlo), el **render simplemente corta a 5**. La regla "el enriquecimiento debería priorizar antes" se documenta como contrato (no se implementa en este pase): el render no muestra `+N` ni avisa.

## Criterio de aceptación visual

- Las 4 familias se leen como bloques separados y centrados.
- No aparece `+N` en ningún caso.
- El color permite identificar a qué familia pertenece cada chip sin leer.
- Colecciones siguen viviendo en metadata line; geografía sigue en breadcrumb.
