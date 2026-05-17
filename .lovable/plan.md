# P-POPUP-11 — Footer normalization + secondary data de-emphasis

Cambio puramente visual/estructural del popup enriquecido. No toca composer 7A.3, ratings, hero chrome, breadcrumb, metadata line, taxonomy, handlers, schema, marker grammar, F2 ni PopupShell.

## Estado actual relevante (`src/components/map/map-popups.ts`)

```
contenedor flex column, max-height, overflow hidden
├── statusBar
├── HERO (flex-shrink: 0)               ← persistente
└── popup-scroll-body (flex:1, overflow-y:auto)
    └── padding 16/16/8/16
        ├── título + ownership badge
        ├── breadcrumb territorial
        ├── metadata line
        ├── add-to-collection (followed)
        ├── composer canónico (desc → rating → obs → secundarios)
        │     ├─ Datos geográficos   ← wrapCollapsibleSection
        │     ├─ Datos clave         ← wrapCollapsibleSection
        │     └─ Fuentes             ← wrapCollapsibleSection
        ├── L1692-1700: “Ficha IA actualizada: <fecha>” (DUPLICADO)
        └── actionButtonsHtml         ← dentro del scroll
              ├─ pill verde “Enriquecido <fecha>”
              ├─ Re-enriquecer (gradiente violeta llamativo)
              ├─ Notas
              └─ Borrar
```

Problemas confirmados: el bloque “Ficha IA actualizada” (L1693-1700) y el pill “Enriquecido <fecha>” (L1206-1211) comunican lo mismo. `actionButtonsHtml` vive dentro del scroll, no es footer real. Los tres acordeones secundarios usan los mismos tokens de borde/padding que cualquier sección principal (`SECTION_HEADER.padding`, `border 1px ${COLOR.border}`, `borderRadius CARD.sectionRadius`) → se leen como bloques principales.

## Cambios

### A. Eliminar duplicidad estado IA
- Borrar el bloque `Ficha IA actualizada …` (L1692-1700 en `map-popups.ts`). El estado IA queda únicamente en el footer (mismo pill verde “Enriquecido <fecha>” actual).
- Sin cambios en `formatRegistrationDate` ni en `locationUpdatedAt`.

### B. Reducir protagonismo de los acordeones secundarios
Tocar sólo `wrapCollapsibleSection` (L247-273) y, sólo si hace falta, los `headerHtml` de los tres casos (L1557-1619). NO se cambian handlers, contenido, ni la API `(sectionKey, headerHtml, bodyHtml, cardCfg)`.

- Wrapper:
  - `border 1px ${COLOR.border}` → `border: none` con un `border-top: 1px solid ${COLOR.border} / 0.6` (separador discreto entre secundarios consecutivos).
  - `borderRadius` → 0.
  - `margin-bottom`: usar la mitad de `CARD.sectionGap` (gap más compacto entre secundarios).
- Summary/header:
  - `background: ${SECTION_HEADER.bgColor}` → `transparent`.
  - `padding: ${SECTION_HEADER.padding}` → padding vertical reducido (≈ 4px 0).
  - Mantener `font-size`, `text-transform`, `letter-spacing`, `font-weight` ya existentes (son los del SECTION_HEADER, ya discretos).
- Body:
  - Conservar el contenido; quitar `border-top` (queda implícito por el summary compacto).
- Indicador de expansión: mantener `▶` actual; sin cambios.

Resultado: los tres bloques pasan de “tarjeta con chrome” a “fila de información adicional expandible”, sin perder semantics ni la lógica `collapsible_sections` del `cardCfg`.

### C. Footer persistente

Reestructurar el shell del popup enriquecido (L1311-1707) para que `actionButtonsHtml` salga del scroll y se convierta en sibling del hero:

```
contenedor flex column, max-height, overflow hidden
├── statusBar
├── HERO (flex-shrink: 0)
├── popup-scroll-body (flex:1, overflow-y:auto)
│     [título … composer … secundarios discretos]
│     [ya NO contiene actionButtons ni “Ficha IA actualizada”]
└── FOOTER (flex-shrink: 0)                ← NUEVO sibling, persistente
      progressBarHtml
      adminEditWarning (si aplica)
      fila acciones (mismo HTML que actionButtonsHtml hoy)
```

- Mover el `${actionButtonsHtml}` actual (L1703) fuera del cierre del `popup-scroll-body`, como hermano del hero. El cierre `</div>` del scroll-body se reordena para que el footer quede dentro del contenedor flex pero fuera del área scrollable. La estructura `flex column + max-height + hero/footer flex-shrink:0` ya garantiza “sticky” natural sin position:sticky.
- Padding del scroll-body: mantener `16px 16px 8px 16px` (sin doble padding inferior porque ya no hay botones dentro).
- Footer wrapper nuevo: `flex-shrink:0; border-top: 1px solid ${COLOR.border}; background: hsl(var(--muted) / 0.4); padding: 8px 12px;` — chrome discreto, no tipo dashboard.

### D. Jerarquía visual del footer

- Mantener el pill verde “Enriquecido <fecha>” como elemento informativo (lo que ya existe en L1205-1211).
- Re-enriquecer: bajar protagonismo del gradiente violeta agresivo (L1216-1218): pasar a fondo `hsl(var(--primary) / 0.12)` + texto `hsl(var(--primary))`, sin gradiente, sin sombra; hover sube a `/0.2`. Sigue siendo la acción principal visualmente, pero no compite con el body editorial.
- Notas: sin cambios (ya es secundaria, fondo muted).
- Borrar: sin cambios (ya es discreta destructiva); confirmar que tono rojo es suave (ya lo es: `#fef2f2/#dc2626`).
- Curator branch (`isCuratorPoint`, L1193-1200): se mantiene tal cual dentro del nuevo footer.

### E. Tests

- Actualizar `src/test/popup-editorial-style.test.ts` y/o añadir un nuevo `src/test/popup-footer-persistent.test.ts` para validar:
  - el HTML NO contiene `"Ficha IA actualizada"`.
  - sigue conteniendo `"Enriquecido"` (footer) una sola vez por popup.
  - existe un nodo footer hermano del scroll-body con los data-action `enrich`, `add-notes`, `delete-location`.
  - los headers de `Datos geográficos / Datos clave / Fuentes` ya no aplican `SECTION_HEADER.bgColor` ni `border 1px` completo en el wrapper.
- Revisar `popup-collection-metadata-line.test.ts` por si asserta sobre la línea “Ficha IA actualizada” (no debería).

### F. Documentación / memoria

- `docs/popups/p-popup-10-validation.md`: añadir sección breve “P-POPUP-11 footer + dedupe IA”.
- `mem://style/popup/editorial-reading-style`: registrar la nueva forma canónica `hero → body editorial → secundarios discretos → footer persistente` y la regla de “estado IA único en el footer”.
- `mem://index.md`: una sola línea actualizada referenciando la nueva regla (sin re-añadir memorias innecesarias).

## Restricciones reiteradas
No se tocan: composer 7A.3, ratings, hero chrome, breadcrumb territorial, metadata line, handlers (`data-action="enrich" | "add-notes" | "delete-location" | "add-to-collection"`), schema, taxonomy, marker grammar, F2, PopupShell, lógica de visited/pending, ni la API de `wrapCollapsibleSection`/`cardCfg`.

## Criterio visual de aceptación
1. El popup se lee como: hero → artículo editorial → bloque “más información” discreto → footer técnico persistente.
2. El estado IA aparece una sola vez (footer).
3. Los tres acordeones secundarios ya no parecen tarjetas-CTA: se sienten como filas expandibles.
4. Si el body hace scroll, el footer permanece visible junto con el hero.
5. Re-enriquecer sigue siendo la acción dominante del footer, pero sin gradiente agresivo.
