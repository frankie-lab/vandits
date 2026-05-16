# P-POPUP-4A — Source / Provenance cleanup (rama A enriched)

Status: **INERTE EN PRODUCCIÓN — premisa revisada 2026-05-16**. El
código y los tests del pilot v1 + fix 4A.1 quedan en árbol como base
correcta para el día en que exista provenance estructurada en BD, pero
NO resuelven el chip `#AtlasObscura_España` reportado por QA. Cleanup
real reasignada a P-POPUP-4B (collection dedup) y P-POPUP-4C
(import-origin demote).
Companion plan: [`./p-popup-4a-source-provenance-cleanup-plan.md`](./p-popup-4a-source-provenance-cleanup-plan.md) (REESCRITO).
Memoria ontológica: [`mem://logic/popup/provenance-vs-collection-vs-tag`](mem://logic/popup/provenance-vs-collection-vs-tag).
Rollout governance: [`../governance/rollout-policy.md`](../governance/rollout-policy.md).

---

## 0.bis Premisa revisada (2026-05-16)

Auditoría de datos sobre 5447 `locations`:

- 1757 POIs tienen `custom_data.source = atlas_obscura`.
- 1703 POIs llevan `#AtlasObscura` en `custom_data.tags` (inyectado por
  `scrape-tick`).
- 23 POIs llevan literal "atlas obscura" en
  `enriched_data.etiquetas_personales`.
- 9 colecciones contienen "atlas" en el nombre.
- **0 filas** tienen columnas `source_kind`/`source_id`/`group_id`
  pobladas → `readPoiProvenance` retorna `null` siempre →
  `buildOwnEnrichedMetadataLineHtml` degrada a `buildOwnAddedLineHtml`.

Conclusión: el chip que el usuario ve no proviene de
`buildSourceHashtagsBlock`, viene de `LocationCollectionChips`
(colección curada por el usuario) y/o `buildPersonalTagsBlock`
(personal tag legacy). Ver ontología canónica en
[`mem://logic/popup/provenance-vs-collection-vs-tag`](mem://logic/popup/provenance-vs-collection-vs-tag).

El flag `POPUP_SOURCE_METADATA_V1_DEFAULT = true` permanece ON. El
kill-switch global sigue disponible. Sin revert.

---

## 0. Fix 4A.1 — Ownership y provenance NO son excluyentes (HISTÓRICO — sin efecto visible)

**Regresión detectada en QA**: en POIs `own enriched` adoptados desde una
fuente externa (Atlas Obscura, OSM…), el dispatch tomaba la rama
`buildOwnAddedLineHtml` (sólo fecha) y dejaba el chip `#AtlasObscura_España`
intacto en otro slot, resultado:

```
Añadido 07/05/2026
#AtlasObscura_España
```

**Causa raíz**: `resolvePoiSource` clasifica por prioridad `sourceKind > owner`,
lo que enmascara la coexistencia ownership + provenance. El pilot 4A
inicial sólo activaba la línea metadata cuando `type === 'source' | 'app'`.

**Fix canónico**: ownership y provenance son **dimensiones independientes**.
Para own:

- Se mantiene ownership implícito (sin literal "Mi punto").
- Se mantiene la fecha (`Añadido dd/mm/yyyy`).
- Si existe provenance real (marker `sourceKind` external/app + `sourceId`),
  se fusiona en la misma línea: `Añadido dd/mm/yyyy · vía <chip>`.
- El chip preserva `.source-filter-chip` + datasets canónicos
  (`data-source-type=source|app`, `data-source-id`, `data-source-label`).
- Lectura de provenance vía nuevo helper `readPoiProvenance(loc)` que LEE
  markers crudos del POI bypassando `resolvePoiSource` (independiente del
  tipo resuelto).

Helper público nuevo: `buildOwnEnrichedMetadataLineHtml(location)`.
- Sin provenance → degrada a línea sólo-fecha (paridad 3A).
- Con provenance → línea fusionada.

Dispatch own actualizado:

```ts
if (isOwn && isPopupOwnershipStripV1On()) {
  if (isPopupSourceMetadataV1On()) return buildOwnEnrichedMetadataLineHtml(location);
  return buildOwnAddedLineHtml(location);
}
```

Resultado esperado para el caso reportado:

```
Añadido 07/05/2026 · vía Atlas Obscura · España
```

(Sin chip `#AtlasObscura_España` separado.)

---

---

## 1. Scope

Solo popup enriched (rama A) en `src/components/map/map-popups.ts`. Solo
POIs cuyo `resolvePoiSource(...)` devuelve `type === 'source'` o
`type === 'app'`.

Fuera de scope (no tocados):

- `own` (gestionado por P-POPUP-3A — ownership strip).
- `followed` (pendiente P-POPUP-3B / 4C).
- Rama B (popup no-enriched) — sigue emitiendo `buildSourceHashtagsBlock`
  legacy sin gating.
- `SourceHashtag.tsx` (cards/listas React).
- `SourceFilterBridge.tsx` y contrato de evento `lovable:apply-source-filter`.
- Geo hierarchy, ownership, notes, stars/visited, lifecycle, taxonomy,
  cámara/subset-fit, F2, React migration, PopupShell.

## 2. Canon visual

Antes (chip estilo hashtag, indistinguible de tags):

```
#AtlasObscura_España
```

Después (línea metadata compacta, muted, debajo del header):

```
Añadido 03/05/2026 · vía Atlas Obscura · España
```

- `vía` literal aprobado.
- Label se obtiene de `prettifySourceId(sourceId)`: split CamelCase,
  `_` → ` · `, `-` → espacio, acrónimos cortos all-lowercase → upper.
- El label es clicable (subrayado muted) y dispara el mismo filtro que el
  chip legacy. Para `app` con `groupId` se emiten DOS chips separados por
  `·` (uno por filtro, paridad funcional con el chip legacy).

## 3. Cambios de código

### 3.1 Flag + helper de detección

`src/components/map/map-popups.ts`:

```ts
const POPUP_SOURCE_METADATA_V1_DEFAULT = true;
export function isPopupSourceMetadataV1On(): boolean { /* kill-switch global */ }
```

Default ON global conforme `rollout-policy.md`. Cero gating por uid /
email / role / cohort.

### 3.2 Helpers nuevos (exports)

- `prettifySourceId(raw)` — formatter conservador. Fallback al string
  crudo si no aplica nada.
- `buildSourceMetadataLineHtml(location, ownership)` — emite la línea
  completa. Retorna `''` si flag OFF, tipo no es `source|app`, o no hay
  hashtags ni fecha.

### 3.3 Dispatch en rama A

Reemplazado el ternario directo por un selector explícito por tipo:

```ts
${(() => {
  if (isOwn && isPopupOwnershipStripV1On()) return buildOwnAddedLineHtml(location);
  if (isPopupSourceMetadataV1On()) {
    const src = resolvePoiSource(viewerUid, location, { usernameLookup });
    if (src.type === 'source' || src.type === 'app') {
      const html = buildSourceMetadataLineHtml(location, ownership);
      if (html) return html;
    }
  }
  return buildSourceHashtagsBlock(location, ownership, { suppressOwn: false });
})()}
```

## 4. Contrato funcional preservado

Cada chip emitido por `buildSourceMetadataLineHtml` mantiene:

- clase `.source-filter-chip`.
- `data-source-type` (`source` | `app`).
- `data-source-id` (sourceId o groupId, mismo valor que el chip legacy).
- `data-source-label` (label legible — usado por SourceFilterBridge).

Como consecuencia, el listener delegado en `SourceFilterBridge.tsx`
(`document.click` sobre `.source-filter-chip`) sigue disparando
`lovable:apply-source-filter` con los mismos `{type, id, label}`. Cero
cambios en el bridge, en el store, ni en `requestSubsetFit`.

## 5. Flag y rollback

| Nivel | Mecanismo |
|---|---|
| Runtime (instant, sin redeploy) | `window.__POPUP_SOURCE_METADATA_V1__ = false` antes de abrir popup |
| Code (1 línea) | `POPUP_SOURCE_METADATA_V1_DEFAULT = false` |
| Path legacy | `buildSourceHashtagsBlock(location, ownership, { suppressOwn: false })` permanece intacto y se activa automáticamente cuando el flag está OFF o el helper devuelve `''` |

Conforme `rollout-policy.md`, el kill-switch global es la herramienta
canónica de rollback/debug. Sin segmentación por usuario.

## 6. Tests

`src/test/popup-source-metadata.test.ts` — 17 casos cubriendo:

- `prettifySourceId` (CamelCase, snake_case, hyphen, acrónimos, null).
- Scope helper: source emite línea, app emite 2 chips, own/followed
  devuelven `''`, sin createdAt → solo `vía`, sin `#` en el label.
- Token `--muted-foreground` sin hex hardcoded.
- Flag default true + kill-switch runtime.
- Static guards de la rama A: dispatch correcto, fallback legacy
  preservado, P-POPUP-3A intacto, rama B intacta.

Tests previos relevantes (deben seguir verdes):

- `src/test/popup-ownership-strip.test.ts` (P-POPUP-3A).
- `src/test/popup-tags-canonical.test.ts` (P-POPUP-2).
- `src/test/popup-geo-header.test.ts`, `popup-tokens-enriched.test.ts`.
- `src/test/poi-source.test.ts`, `poi-filter-source.test.ts`.

## 7. Checklist de validación visual (preview)

- [ ] POI `source` (Atlas Obscura) en mapa enriched muestra
      `Añadido dd/mm/yyyy · vía Atlas Obscura · España` debajo del header
      geo, sin chip `#AtlasObscura_España`.
- [ ] Click en el label dispara `filterBySource` (subset-fit recorta
      mapa al subconjunto source).
- [ ] Re-click toggle off (filtro limpio, sin mover cámara).
- [ ] POI `app` (vandits-app + groupId) muestra dos labels clicables
      separados por `·`, cada uno filtra independientemente.
- [ ] POI propio (own) sigue mostrando solo `Añadido dd/mm/yyyy`
      (P-POPUP-3A intacto, sin "Mi punto" ni `#username`).
- [ ] POI followed sigue mostrando chip `#username` legacy
      (out of scope 4A).
- [ ] Rama B (popup no-enriched) sigue mostrando chips legacy.
- [ ] Kill-switch global: `window.__POPUP_SOURCE_METADATA_V1__ = false`
      revierte instantáneamente al render legacy.

## 8. Verificación de rollout-policy

| Check | Resultado |
|---|---|
| `_DEFAULT = true` literal, sin `=== sandboxUid` | OK |
| `isPopupSourceMetadataV1On()` no consulta `auth` / `profiles` / email | OK |
| Kill-switch runtime es `window.__POPUP_SOURCE_METADATA_V1__` (global) | OK |
| Sin badges/diagnostics gated por uid | OK |
| `rg "sandbox\|vandits.test\|uid ===\|email ===" src/components/map/map-popups.ts` no muestra gating de canon | Pendiente confirmar en preview |

## 9. Migration Impact

- Archivos modificados: `src/components/map/map-popups.ts`.
- Archivos creados: `src/test/popup-source-metadata.test.ts`,
  `docs/popups/p-popup-4a-validation.md` (este).
- Sin cambios en: `SourceHashtag.tsx`, `SourceFilterBridge.tsx`,
  `poi-source.ts`, `poi-shareability.ts`, `poi-layer.ts`,
  `poi-marker-grammar.ts`, store, bridges, eventos.
- Riesgos detectados:
  - `prettifySourceId` puede malformar `sourceId` muy exóticos →
    fallback al string crudo + label visible en preview QA.
  - Rama B sigue emitiendo chip legacy → deuda explícita P-POPUP-4B.

## 10. Decisiones abiertas

- Badge dev `P-POPUP-4 ON` — **NO añadido** en esta iteración (el badge
  de P-POPUP-2 sigue cubriendo la deployment-signal global). Reconsiderar
  si la ratificación visual requiere señal específica.
- `prettifySourceId` para `followed` username → deferido a P-POPUP-3B/4C.

## 11. Ratification log

_Pendiente — completar tras QA visual con default ON global en preview._
