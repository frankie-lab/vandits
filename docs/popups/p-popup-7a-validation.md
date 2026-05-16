# P-POPUP-7A — Interaction / personal-state hierarchy

## Resumen

El bloque de estado personal del usuario (visited + rating) se reposiciona
desde el above-the-fold del popup a una posición secundaria **debajo de
`descripcion`**, y se compacta visualmente para no competir con los CTAs
principales ni con la identidad del POI.

Decisiones canónicas (A + variante D, aprobado):

- Mover bloque personal debajo de `descripcion`.
- NO crear sección "Mi estado" todavía.
- Mantener Visitado visible.
- Mantener rating curator/IA (`isCuratorPoint`) en su slot superior.
- Eliminar las 5 estrellas vacías por defecto.
- Sustituirlas por affordance compacto "Valorar" (texto subrayado discreto).
- Expandir control 5★ sólo al interactuar (inline JS, sin React).
- Migrar 📷/📍 a iconos Lucide (`camera` / `map-pin`).
- Mantener `customData.*` intacto (sin migración de schema).
- Helper único `buildPersonalStateBlock` — evita drift entre rama enriched
  y rama legacy.

## Cambios técnicos

### `src/components/map/map-popups.ts`

- **Nuevo helper `buildPersonalStateBlock(location, ctx)`** — única fuente de
  verdad para el render del bloque. Devuelve `''` para:
  - `isCuratorPoint` (puntos de catálogo curado).
  - Popups en contexto `nearby` (`isNearbyPopupContext`).
- **Visited toggle**: siempre presente cuando aplica. Badge de verificación
  inline con iconos Lucide (`camera` cuando hay
  `oldest_geotagged_photo_date`, `map-pin` cuando hay
  `visited_verified_at` reciente).
- **Rating**:
  - `canRate = !!visitRelevance || canEditLocation || userRating > 0`
    (incluir `userRating > 0` garantiza que un POI ya valorado siempre
    pueda re-valorarse aunque pierda relevancia de visita).
  - Si `userRating === 0` y `canRate`: render colapsado — affordance
    `<button>Valorar</button>` + control 5★ oculto con
    `data-personal-rating-state="expanded"` `display: none`. Click expande
    vía inline JS, sin recarga.
  - Si `userRating > 0`: render expandido — 5★ (★ llenas + ☆ vacías) +
    botón clear `✕`.
- **Reposicionamiento**: el bloque ya NO aparece en la sección superior de
  interacción de la rama `if (isEnriched && enriched)`. Se monta vía
  `personalStateOnce()` inmediatamente después del `case 'descripcion'`
  (con fallback al final del body si no hay descripción).
- **Emojis eliminados**: 📷 y 📍 sustituidos por SVG Lucide inline en todo
  `map-popups.ts`. Cumple la regla global "No Emojis".

### `src/test/popup-personal-state-hierarchy.test.ts`

11 tests cubren:

- Helper devuelve `''` para curator y nearby.
- Visited toggle siempre presente.
- Sin 5 estrellas vacías por defecto; affordance "Valorar" y control oculto.
- `user_rating > 0` → expandido + clear button + ★/☆ correctos.
- `canRate=false` y `userRating=0` → sólo visited, sin rating.
- Verification badge usa SVG Lucide, sin emojis.
- Static scan: rama enriched superior NO contiene `toggle-visited` ni
  `set-rating`; `personalStateOnce()` aparece tras `case 'descripcion'`.
- `map-popups.ts` no contiene `📷` ni `📍`.

## QA preview — checklist

- [x] Above-the-fold sin estrellas vacías ni bloque "Mi estado" dominante.
- [x] Bloque Visited/Valorar aparece debajo de `descripcion`.
- [x] "Valorar" es texto subrayado discreto, no compite con CTAs primarios
      ("Añadir a mi colección", "Contexto cercano").
- [x] Click en "Valorar" expande control 5★ sin recargar popup.
- [x] Visitado sigue accesible con un click.
- [x] Badges de verificación muestran SVG Lucide (camera / map-pin); sin
      emojis 📷/📍.
- [x] Curator/IA rating sigue en su slot superior (POI metadata).

## Tests

```
src/test/popup-personal-state-hierarchy.test.ts   11/11 ✓
src/test/popup-collection-metadata-line.test.ts   10/10 ✓
src/test/popup-taxonomy-canon-chips.test.ts        8/8  ✓
```

Suite global: las 5 fallas restantes (`index-composition.test.tsx`,
`enrichment-helpers.test.ts`) son **pre-existentes y no relacionadas** con
P-POPUP-7A.

## Migration impact

- **Schema**: cero cambios. `customData.user_rating`, `customData.visited`,
  `visited_verified_at`, `oldest_geotagged_photo_date` intactos.
- **Eventos UI**: `data-action="toggle-visited"`, `set-rating`,
  `clear-rating` mantienen handlers existentes en `LocationMap`.
- **CSS tokens**: `hsl(var(--text-secondary))` para el affordance, sin
  nuevos tokens.

## Rollback

Revertir helper `buildPersonalStateBlock` y volver a inlinear el bloque
visited/rating en la sección superior de cada rama (enriched y legacy).
Los iconos Lucide pueden quedarse (no rompen nada). Total: revertir
`src/components/map/map-popups.ts` al commit previo.

## Scope NO tocado

taxonomy · collections · provenance · geo hierarchy · lifecycle · F2 ·
React migration · PopupShell · wishlist/pending · notas · stars curator/IA
(slot superior) · cultural_context · `customData` schema.
