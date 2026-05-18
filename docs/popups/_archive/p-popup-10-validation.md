# P-POPUP-10 — Editorial reading style (validation)

Estado: **ratificado**. Cambios sólo de estilo; orden canónico y lógica intactos.

## Canon visual editorial v1

El cuerpo del popup se lee como una ficha editorial de viaje:

```
hero
título            (line-height 1.2, letter-spacing -0.01em, margin-bottom 10px)
breadcrumb        (link textual muted, border-bottom transparente, separador › opacity 0.45)
byline metadata   (Añadido dd/mm/yyyy italic · colección · vía source, SIN icono reloj, SIN bookmark)
extracto          (punto_destacado italic, line-height 1.6, padding 12×16)
descripción       (sin eyebrow uppercase, sin contador, line-height 1.7, párrafos 12px gap)
enrichmentRating  (composer 7A.3)
userPersonalState (composer 7A.3)
observación       (sin eyebrow, prefijo italic "Nota:", line-height 1.65)
```

## Reglas inmutables

- Byline: sin iconos. Cualquier ficha "ya añadido" o "vía" se renderiza como texto muted.
- Descripción: sin eyebrows uppercase, sin contador "N caracteres". El cuerpo es el cuerpo.
- Observación: prefijo inline "Nota:" en italic muted, nunca eyebrow superior.
- Breadcrumb: link textual con `border-bottom` (transparente → muted/40 en hover). Prohibido `text-decoration: underline` plano.
- Colección en byline: mismo registro link textual; sin pill, sin hashtag, sin icono.
- Punto destacado: italic, conserva el borde lateral (HIGHLIGHT.borderColor).

## Tests

- `src/test/popup-editorial-style.test.ts` — 7 guardrails para descripción, observación, byline, breadcrumb y punto destacado.
- `src/test/popup-collection-metadata-line.test.ts` — confirma ausencia de bookmark y color muted.
- `src/test/popup-territorial-breadcrumb.test.ts` — confirma estilo discreto.

## Out of scope (P-POPUP-10.1+)

- Refactor visual de `buildSourceChipSpan` si los chips de provenance siguen pareciendo pills dentro de la byline.
- Migrar título a `--font-display`.

## P-POPUP-11 — Footer persistente + dedupe estado IA

Cambios visuales/estructurales (sin tocar composer 7A.3, ratings, hero chrome,
breadcrumb, metadata, handlers, schema, taxonomy, marker grammar, F2 ni
PopupShell):

1. **Dedupe estado IA**: eliminado el bloque inferior "Ficha IA actualizada"
   del body. El estado IA vive exclusivamente en el pill verde
   `Enriquecido <fecha>` del footer.
2. **Footer persistente** (`data-popup-footer="v1"`): el bloque
   `actionButtonsHtml` se mueve fuera del scroll body y se renderiza como
   sibling del hero. Wrapper: `flex-shrink:0`,
   `border-top 1px hsl(var(--border))`, `background hsl(var(--muted)/0.4)`,
   `padding 8px 12px`. Siempre visible aunque el body haga scroll.
3. **Re-enriquecer suavizado**: gradiente violeta agresivo sustituido por
   `bg hsl(var(--primary)/0.12)` + `text hsl(var(--primary))` (hover `/0.2`).
4. **Secundarios discretos** (`wrapCollapsibleSection`): sin tarjeta, sin
   border completo, sin border-radius, sin `SECTION_HEADER.bgColor`. Sólo un
   `border-top 1px hsl(var(--border)/0.6)` como separador entre secundarios y
   `padding 6px 0`. Mantiene API, handlers y lógica `collapsible_sections`.

Tests: `src/test/popup-footer-persistent.test.ts` (7) +
`src/test/popup-editorial-style.test.ts` mantienen invariantes.
