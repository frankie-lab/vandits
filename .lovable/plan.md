## P-POPUP-14 fix — Fila "Tu valoración" depende SOLO de visited

### Diagnóstico

En `buildEnrichmentRatingBlock` (`src/components/map/map-popups.ts`, líneas 465–568) la Row 2 ya está condicionada a `isVisited`, pero tiene dos desviaciones respecto al canon:

1. **Gating extra `canRate`** (línea 486): exige `visitRelevance || canEditLocation || userRating>0`. Esto puede ocultar la fila aunque el POI esté visitado, o degradarla a `—`. El canon dice: visitado ⇒ siempre ofrecer valoración personal.
2. **Affordance "Valorar" colapsada** (líneas 542–552): cuando visited && userRating===0 se renderiza un link textual `Valorar` que expande las 5★ vía JS inline. El canon pide mostrar **directamente 5 estrellas vacías interactivas** (`☆☆☆☆☆`), sin botón intermedio.

La Row 1 ("Rating del POI") es correcta y no se toca.

### Cambios

Archivo único: `src/components/map/map-popups.ts`, función `buildEnrichmentRatingBlock`.

1. Eliminar la variable `canRate` y su rama "silent dash". `showUserRow` queda como única condición (`!isCurator && !isNearby && isVisited`).
2. Refactor de Row 2:
   - `userRating > 0` → mantiene tal cual (5★ interactivas con activas + botón `clear-rating`).
   - `userRating === 0` → renderizar **directamente** 5 `<button data-action="set-rating">☆</button>` interactivas alineadas a la derecha. Sin wrapper colapsado, sin link "Valorar", sin `data-personal-rating-state`, sin `onclick` inline.
3. No tocar: handlers (`set-rating`/`clear-rating`/`toggle-visited`), Row 1, contenedor exterior, `data-popup-ratings-block`, marker grammar, composer, hero, footer, taxonomy, breadcrumb, schema.

### Tests a actualizar

`src/test/popup-personal-state-hierarchy.test.ts`:

- Test *"Row 2 aparece como affordance 'Valorar' inline si visited && sin user_rating"* → reescribir: ahora debe assertar 5 botones `data-action="set-rating"` con `data-rating="1..5"` y caracter `☆`, **sin** `>Valorar<` ni `data-personal-rating-state`.
- Resto de tests del bloque siguen válidos (curator, nearby, visited+rating, no-visited).

### Criterios de aceptación

- POI no visitado: solo Row 1.
- POI visitado sin rating: Row 1 + Row 2 con 5 estrellas vacías interactivas (`☆☆☆☆☆`).
- POI visitado con rating: Row 1 + Row 2 con estrellas activas + `✕` clear.
- Curator / nearby: sin Row 2.
- Ningún render emite el link "Valorar" ni barra ancha.
