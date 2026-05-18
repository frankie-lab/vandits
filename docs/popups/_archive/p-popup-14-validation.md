# P-POPUP-14 + 14.1 + 14.2 — Validation

> Bloque unificado de ratings: dos filas (enrichmentRating + personalRatingState)
> en un único contenedor visual editorial.

## Resumen

`buildEnrichmentRatingBlock` (helper único, slot `enrichmentRating` del
composer canónico) emite siempre un bloque con:

- **Row 1 — Rating del POI**: lee `enriched.indice_interes`, read-only.
- **Row 2 — Personal rating state**: siempre presente salvo curator/nearby.

`buildPersonalStateBlock` queda reducido al toggle de visitado y al badge
verified — el rating personal ya NO vive ahí.

## Estados de Row 2

| Estado          | Condición                                      | Label                       | Stars                | Palette | Interacción                                |
|-----------------|------------------------------------------------|-----------------------------|----------------------|---------|--------------------------------------------|
| `not-visited`   | `customData.visited !== 'true'`                | `Pendiente`                 | `☆☆☆☆☆` disabled     | gris    | read-only, `aria-disabled="true"`, sin handlers |
| `visited-empty` | `visited==='true'` && `user_rating===0`        | `Pendiente de valoración`   | `☆☆☆☆☆` interactivas | verde   | 5× `data-action="set-rating"` `data-rating="1..5"` |
| `visited-rated` | `visited==='true'` && `user_rating>0`          | `Tu valoración`             | `★…☆` + `✕` clear    | verde   | `set-rating` + `data-action="clear-rating"` |

Contenedor de estrellas: `<span data-personal-rating-state="<estado>">…</span>`.
Bloque externo: `<div data-popup-ratings-block="v1" data-popup-enrichment-rating="<id>">…</div>`.

## QA esperado (visual)

```text
No visitado
────────────────────────────────
Rating del POI ……………… ★★★★☆
Pendiente …………………… ☆☆☆☆☆       (gris, no clicable)

Visitado sin rating
────────────────────────────────
Rating del POI ……………… ★★★★☆
Pendiente de valoración … ☆☆☆☆☆  (verde, clicable)

Visitado con rating
────────────────────────────────
Rating del POI ……………… ★★★★☆
Tu valoración ……………… ★★★★☆ ✕    (verde, clicable + clear)
```

## Restricciones confirmadas

- No tocar: schema, handlers (`set-rating`/`clear-rating`/`toggle-visited`),
  composer slots, hero, footer, taxonomy, metadata, breadcrumb, marker grammar.
- `buildPersonalStateBlock` NO contiene `data-action="set-rating"` ni
  `clear-rating` (test estructural).
- No existe link/barra colapsada "Valorar" en ningún estado.

## Tests ejecutados

`src/test/popup-personal-state-hierarchy.test.ts` — **16/16 passed**.
Cobertura:

1. P-POPUP-14.2: Row 2 siempre existe (non-curator/non-nearby).
2. Estado `not-visited` — label `Pendiente`, gris, disabled, sin `set-rating`.
3. Estado `visited-empty` — label `Pendiente de valoración`, verde, 5 botones
   `set-rating`.
4. Estado `visited-rated` — label `Tu valoración`, estrellas activas + clear.
5. Row 2 ausente si curator point (incluso visitado con rating).
6. Row 2 ausente en contexto nearby popup.
7. Curator point conserva `weighted-rating-container` + `data-ai-rating`.
8. Layout label↔stars: ambas filas usan `justify-content: space-between`.
9. Composer pasa `isOwn` + `canEditLocation` a `buildEnrichmentRatingBlock`.
10. `buildPersonalStateBlock` no contiene handlers de rating.

Suite popup completa: **201/201 passed**.

## Referencias

- `docs/contracts/popup-contract.md` § "Ratings del popup"
- `mem://logic/popup/rating-taxonomy`
- `mem://style/popup/editorial-reading-style`
- Helper: `src/components/map/map-popups.ts` → `buildEnrichmentRatingBlock`
