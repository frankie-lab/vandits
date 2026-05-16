# POI Popup — Structure & Elements Proposal

> Status: **proposal** (not implemented).
> Scope: UX/canon decision only. No code, no UI changes, no F2 start.
> Successor of: `poi-popup-canon-proposal.md`, `poi-popup-canon-review.md`.
> Source of truth analysed: `src/components/map/map-popups.ts` (1229 LOC),
> branch `if (isEnriched && enriched)` L663–L1110 + shared chrome
> L455–L660.

---

## 1. Current structure (as-is, enriched branch)

Rendered top-to-bottom inside a `width=CARD.maxWidth`,
`max-height=POPUP_MAX_HEIGHT` flex column with internal scroll:

```
┌─────────────────────────────────────────────────┐
│ statusBarHtml                          [fixed]  │  ← status/loading lane
├─────────────────────────────────────────────────┤
│ Hero image (buildImageSection)         [fixed]  │  ← photo + ownership avatar overlay
├─────────────────────────────────────────────────┤ ← scroll-body starts
│ <h3> Name              [ownershipBadgeHtml]     │
│ <p>  Localización (links)                       │
│ [Add to collection] (only !isOwn && !curator)   │
│ ┌─ Index/Interaction box ───────────────────┐   │
│ │  · visit-validation-warning (hidden)       │   │
│ │  · Rating (curator: weighted | own: AI)    │   │
│ │  · "Visitado" / "+ Adoptar y Visitar"      │   │
│ │  · Personal rating stars (1–5 + clear)     │   │
│ └────────────────────────────────────────────┘   │
│ buildSourceHashtagsBlock                         │
│ buildCollectionChipsPlaceholder                  │
│ buildPersonalTagsBlock                           │
│                                                  │
│ === orderedKeys loop (cardCfg) ===              │
│ · clasificacion + cultural_context chip          │
│ · punto_destacado (highlight box)                │
│ · descripcion (+ char count)                     │
│ · observacion (boxed)                            │
│ · etiquetas (geo / classification / thematic)    │
│ · datos_geograficos (collapsible 2-col grid)     │
│ · datos_clave (collapsible + contact strip)      │
│ · fuentes (collapsible)                          │
├─────────────────────────────────────────────────┤ ← scroll-body ends
│ actionButtonsHtml                      [fixed]  │
│  · progressBarHtml                              │
│  · adminEditWarning (if admin && !isOwn)        │
│  · Enriched-date label + [Re-enriquecer]        │
│  · [Notas] [Eliminar]                           │
└─────────────────────────────────────────────────┘
```

### 1.1 Element inventory (enriched)

| # | Element | Origin (LOC) | Visible to | Notes |
|---|---------|--------------|-----------|-------|
| 1 | `statusBarHtml` | 678 | all | loading/error lane |
| 2 | Hero image | 683 | all | `buildImageSection` |
| 3 | Name `<h3>` | 691 | all | |
| 4 | Ownership badge | 694 | all | own / followed / curator / admin |
| 5 | Localización links | 698 | all | parsed admin hierarchy |
| 6 | Add to collection CTA | 644 | !isOwn && !curator | green pill, prominent |
| 7 | Index/Interaction box | 706 | all | grouping container |
| 7a | Visit-validation warning | 709 | !curator (hidden by default) | injected by JS |
| 7b | Rating chip | 723 / 740 | curator → weighted; else → AI stars | two visual treatments |
| 7c | Visit toggle | 756 | !curator | dual label (visit / adopt+visit) |
| 7d | Personal rating stars | 769 | visited or admin | 1–5 + clear |
| 8 | Source hashtags | 796 | all (data-driven) | `#fuente:...` |
| 9 | Collection chips | 797 | all (data-driven) | placeholder, hydrated by JS |
| 10 | Personal tags | 798 | all (data-driven) | |
| 11 | Clasificación + cultural chip | 812 | conditional | violet `#ede9fe` chip |
| 12 | Punto destacado | 828 | if present | left-border highlight |
| 13 | Descripción | 835 | if present | char count footer |
| 14 | Observación | 846 | if present | muted background box |
| 15 | Etiquetas (geo/class/thematic) | 858 | if present | three sub-rows |
| 16 | Datos geográficos | 894 | if present | collapsible 2-col |
| 17 | Datos clave | 917 | if present | collapsible + contact strip |
| 18 | Fuentes | 957 | if `show_sources` | collapsible list |
| 19 | `actionButtonsHtml` | 559 | all | fixed footer |
| 19a | Progress bar | 560 | conditional | |
| 19b | Admin edit warning | 561 | admin && !isOwn && !curator | amber gradient banner |
| 19c | Enriched date + Re-enrich | 573 | canEnrich && isEnriched | gradient violet button |
| 19d | Notas | 608 | canEditOwn | |
| 19e | Eliminar | 626 | canEditOwn | red, icon-only |

---

## 2. Diagnosis

### 2.1 Redundant elements

| Redundancy | Where | Why it duplicates |
|------------|-------|-------------------|
| **Enriched-date label appears 2×** | L569 (curator branch) + L573 (canEdit branch) | Two near-identical green chips with `formatRegistrationDate`. Branch-divergent styling. |
| **Rating displayed 2× for own enriched + visited** | L740 (AI stars chip) + L769 (personal stars row) | AI rating and personal rating share the visual language (5 stars) without disambiguation. |
| **Cultural chip + clasificación.codigo** | L815–L820 | Both occupy the same row, similar visual weight, overlapping semantics (Wikidata type vs. internal taxonomy code). |
| **Hashtag sources × 3 systems** | `buildSourceHashtagsBlock` (8) + `etiquetas_geograficas` (15) + thematic `etiquetas` (15) | Three pill rows stacked, no visual hierarchy between "origin", "geo", "topic". |
| **Char count of descripción** | L843 | UX noise — content metric exposed to end-user. |
| **Visit-validation warning lives inside the popup but is hidden by default and only populated by JS** | L709–L719 | Reserved DOM with high specificity; if never shown, contributes layout cost & contract surface. |
| **Ownership signalling × 2** | `ownershipBadgeHtml` (header) + avatar overlay on hero (`buildImageSection`) | Double-encoded. |

### 2.2 Missing elements (canon gaps)

| Gap | Why it matters |
|-----|----------------|
| **Health rings semantics inside popup** | Marker shows 4 rings (partial/chain/review/hardError) but popup has no surface explaining which health issues are pending. User cannot act from the popup. |
| **Coordinates copy affordance** | `coordenadas` shown inside collapsible `datos_clave` only. No quick-copy button. |
| **"Open in external map" action** | Common UX expectation (Google Maps / Apple Maps / OSM). Absent. |
| **Followed-owner identity color visible** | Triangle inverted marker uses OKLCH per-viewer color (`mem://...identity`); popup does not echo that color band → discontinuity. |
| **Last-updated provenance** | Date appears as a status chip (`Enriquecido + date`) but not a "fuente IA + modelo + revisión" footer. Provenance is implicit. |
| **Empty-state for missing sections** | Sections silently render empty containers when data is partial (e.g., `etiquetas` block always wraps in `<div>` even when only one sub-row exists). |
| **Single primary action** | The popup has 4–6 competing CTAs (Add-to-collection / Re-enriquecer / Visitado / Adoptar+Visitar / Notas / Eliminar). No single "primary" gesture per state. |

### 2.3 Inconsistencies

- Curator branch uses `linear-gradient(135deg, #f0fdf4, #dcfce7)` while own
  branch uses solid `#dcfce7` — same semantic state, two visuals.
- Re-enriquecer button uses violet gradient `#8b5cf6 → #7c3aed`, while
  Add-to-collection uses green gradient `#16a34a → #22c55e`, while Visit
  toggle uses neutral pill. No primary/secondary/tertiary scale.
- "Eliminar" is icon-only with red bg; "Notas" is icon+label. Inconsistent
  affordance density in the same row.

---

## 3. Proposed canon (target structure)

### 3.1 Visual hierarchy — 4 zones

```
┌──────────────────────────────────────────────┐
│ ZONE A — IDENTITY (fixed)                     │
│  · Hero + ownership color band                │
│  · Name + single ownership chip               │
│  · Localización                               │
│  · 1 primary action (state-dependent)         │
├──────────────────────────────────────────────┤
│ ZONE B — SIGNAL (above the fold)             │
│  · Rating (single, disambiguated)             │
│  · Visit status pill                          │
│  · Health rings legend (if any ring active)   │
│  · Personal rating + notes affordance         │
├──────────────────────────────────────────────┤
│ ZONE C — CONTENT (scrollable, ordered)        │
│  · Punto destacado                            │
│  · Descripción                                │
│  · Observación                                │
│  · Tags (single unified row, typed)           │
│  · Collapsibles: datos_clave, datos_geo,      │
│    fuentes                                    │
├──────────────────────────────────────────────┤
│ ZONE D — META (fixed footer, low-weight)     │
│  · Provenance line (enriched + date + model)  │
│  · Secondary actions menu (Re-enrich, Edit,   │
│    Delete, External map, Copy coords)         │
└──────────────────────────────────────────────┘
```

### 3.2 Above-the-fold contract (no scroll required)

Must be visible without scrolling at `POPUP_MAX_HEIGHT`:

- Hero (or fallback placeholder)
- Name + ownership chip
- Localización
- Primary CTA (state-dependent — see §3.5)
- One signal row (rating + visit + health legend)

### 3.3 Collapsed by default

- `datos_geograficos`
- `datos_clave`
- `fuentes`
- Secondary actions menu (replaces today's flat footer row)
- Provenance details (showing only "Enriquecido + date", click → expand)

### 3.4 Mandatory vs. optional sections

| Section | Status | Condition |
|---------|--------|-----------|
| Hero | mandatory (with placeholder) | always |
| Name + ownership | mandatory | always |
| Localización | mandatory | always |
| Primary CTA | mandatory | resolved by state matrix |
| Signal row | mandatory | always |
| Punto destacado | optional | `enriched.punto_destacado` |
| Descripción | mandatory if enriched | `enriched.descripcion` |
| Observación | optional | `enriched.observacion` |
| Tags row | optional | any of geo/class/thematic |
| Datos clave | optional collapsible | `enriched.datos_clave` |
| Datos geográficos | optional collapsible | `enriched.datos_geograficos` |
| Fuentes | optional collapsible | `cardCfg.show_sources && enriched.fuentes` |
| Provenance line | mandatory | always |
| Secondary actions | mandatory | always |

### 3.5 Primary action per state (single, unambiguous)

| State | Primary CTA |
|-------|-------------|
| `own + enriched` | (no CTA — meta menu only) |
| `own + imported` | **Enriquecer** |
| `own + empty` | **Enriquecer** (with recovery context inline) |
| `followed + enriched` | **Añadir a mi colección** |
| `followed + imported/empty` | **Adoptar** |
| `app/source + enriched` | **Añadir a mi colección** |
| `curator + enriched` | (no CTA) |
| `admin viewing other-user enriched` | (no CTA — admin warning banner only) |

Secondary actions always live behind a meta menu (Notas, Visitado,
Re-enriquecer, Eliminar, Open external, Copy coords).

### 3.6 Secondary actions (in meta menu)

- Re-enriquecer (own + enriched only)
- Notas
- Visitado / +Adoptar y Visitar
- Personal rating
- Open in external map
- Copy coordinates
- Eliminar (own only, with confirm)

### 3.7 What changes per state

| Branch | Hero | Ownership chip | Primary CTA | Signal row | Body | Footer |
|--------|------|----------------|-------------|------------|------|--------|
| **own + enriched** | photo | "Tuyo" | none | rating (AI), visit, health, personal stars | full enriched body | provenance + meta menu |
| **own + imported** | placeholder | "Tuyo" | Enriquecer | health (if any), notes | recovery block (nearby) inline | meta menu (limited) |
| **own + empty** | placeholder | "Tuyo" | Enriquecer | health, notes | recovery block inline (mandatory) | meta menu (limited) |
| **followed + enriched** | photo (owner's) | "Seguido — <name>" + identity color band | Añadir a mi colección | rating (read-only), visit, optional adopt | shareable subset only (no health/tints) | provenance + meta (limited) |
| **followed + imported/empty** | placeholder | "Seguido" | Adoptar | minimal | not shareable → block hidden | meta (read-only) |
| **app / source** | photo or placeholder | "Catálogo <source>" | Añadir a mi colección | rating, no visit | shareable | meta (read-only) |
| **curator (legacy guard)** | photo | "Curado" + curator avatar | none | weighted rating | reduced body (no etiquetas/clasif) | provenance |

---

## 4. Permitted vs. prohibited states

### Permitted

- Loading (`statusBarHtml` active)
- Error (`statusBarHtml` error variant)
- Idle (default)
- Recovery (only for `!isEnriched` via `[data-recovery-root]`)
- Admin-edit mode (banner + same body)

### Prohibited

- Two primary CTAs simultaneously
- Two rating chips (AI + personal) without disambiguating labels
- Health rings rendered inside body (those are marker-domain — popup
  shows legend only)
- Side panels / Sheets / right column for nearby context
  (`mem://...empty-point-quick-actions-v2`)
- Hex literals — must use `--popup-*` / `--state-*` / `--surface-*`
  tokens (P-POPUP-1 contract extended to all branches in future pilots)
- Curator-specific palette divergence from `state-success` token

---

## 5. Migration Impact Check (MIC)

> Required by `docs/contracts/canon-change-policy.md` because this
> changes the canon of popup structure.

### 5.1 Surfaces affected

| Surface | File(s) | Impact |
|---------|---------|--------|
| Enriched popup branch | `src/components/map/map-popups.ts` L663–L1110 | structural reorg into 4 zones |
| Shared chrome (action row, admin banner) | L455–L660 | extract into `MetaActionsMenu` primitive |
| Photo popup | `createPhotoPopup` | needs separate canon (deferred — out of scope) |
| Recovery block | `popup-recovery-mount.ts` + `UnenrichedRecoveryBlock` | unchanged contract, only host moves to Zone C |
| Marker grammar | `src/components/map/*` | unchanged — popup is consumer |
| Nearby panel | `NearbyPanel variant="inline"` | unchanged, stays inline in Zone C |
| Map-V2 renderer | `map-v2-renderer.ts` | must adopt PopupShell before V1 removal (D2 from review) |

### 5.2 Contracts affected

- `docs/contracts/popup-contract.md` — needs new sections: zones,
  primary-CTA matrix, prohibited states.
- `docs/contracts/marker-grammar-contract.md` — add cross-ref: popup
  reads marker state but does not mirror rings.
- `docs/contracts/focus-selection-contract.md` — primary CTA must not
  trigger focus changes silently.
- `mem://style/popup/matrix-rule` — extend to cover Zone B signal row.
- `mem://logic/map/popup-persist-on-rebuild` — verify zone-scoped DOM
  preserves persistence keys.

### 5.3 Memories to update

| Memory | Update |
|--------|--------|
| Core: "Contexto cercano = INLINE" | confirm: Zone C only, never Zone D |
| Core: "Unenriched Waypoint Click" | confirm: recovery block lives in Zone C of imported/empty states |
| `mem://style/popup/matrix-rule` | add 4-zone canon |
| `mem://logic/content/enrichment-trigger-unified` | confirm single Enriquecer CTA in Zone A for imported/empty |

### 5.4 Tests required

- Extend `popup-tokens-enriched.test.ts` to additional branches
  (imported, empty, followed, app/source) — one pilot per branch.
- Add structural contract test: "enriched popup contains exactly one
  primary CTA in Zone A".
- Add structural contract test: "no health-ring SVGs inside popup body".
- Visual snapshot baseline per state (deferred to FU-2 of P-POPUP-1).
- E2E: open → primary CTA → outcome, per state matrix.

### 5.5 Risk if not migrated

- Continued divergence between curator/own/followed visuals (debt grows
  per new feature).
- F2 (warning soft / violet / status surface tokens) cannot proceed
  cleanly without zone definitions — tokens would be applied to
  inconsistent regions.
- Photo popup canon (D3) blocked indefinitely.
- New popup surfaces (route waypoint, V2 places) will replicate the
  flat-row footer pattern → more debt.

### 5.6 Phasing recommendation

> Order is **proposal**, not commitment. No code yet.

| Phase | Scope | Gate before next |
|-------|-------|------------------|
| **P-POPUP-2** | Extract `MetaActionsMenu` primitive (no UI change, just structural split of footer) | unit tests green, snapshot diff ≤2% |
| **P-POPUP-3** | Consolidate ownership signalling (remove duplicate header chip OR hero overlay) | UX review, snapshot diff ≤5% |
| **P-POPUP-4** | Disambiguate ratings (AI chip vs. personal stars: distinct labels + layout) | accessibility review |
| **P-POPUP-5** | Introduce 4-zone layout in enriched branch behind flag | E2E green per state |
| **P-POPUP-6** | Extend tokenization contract (P-POPUP-1) to imported/empty/followed branches | per-branch contract tests |
| **P-POPUP-7** | Photo popup canon (separate proposal) | own canon doc first |

F2 (token expansion) stays **gated** until P-POPUP-2 ships — otherwise
new tokens land on still-flat structure.

---

## 6. Open questions

1. Should the **identity color band** (followed owner OKLCH) appear on
   the hero edge, the name underline, or the ownership chip
   background?
2. Should **Re-enriquecer** stay in Zone D meta menu (current proposal)
   or graduate to Zone A primary for `own + enriched` when the
   `enrichedAt` is older than `criteriaTimestamp`?
3. Does the **provenance line** require a separate "Revisar" action
   (linking to a future moderation surface)?
4. Should **collapsibles default-open state** become a user preference
   (persisted across sessions) or stay per-popup ephemeral?
5. Is **"Adoptar"** a single CTA or a two-step (Adoptar → confirm)?
   Current code mixes "+ Adoptar y Visitar" semantics into the visit
   toggle.

---

## 7. Restrictions honoured

- No code modified.
- No UI changed.
- No camera / subset-fit touched.
- No marker grammar touched.
- No F2 started.
- This document is **proposal only** — implementation requires explicit
  pilot approval per phase in §5.6.

---

## 8. Persistence confirmation

- Path: `docs/popups/poi-popup-structure-proposal.md`
- Lines: see footer of file
- Sync: GitHub automático vía Lovable
- Status: proposal — awaiting review

---

## 9. Canonical hierarchy and semantic cleanup proposal

> Added 2026-05-16 tras observaciones UX reales sobre popup POI propio
> enriched (P-POPUP-1 ya ratificado). **No implementación.** Refina el canon
> de Zona A/B/C/D propuesto en §3, sin reabrir esas decisiones.

### 9.1 Diagnóstico de partida (observaciones UX)

Sobre el popup actual (rama `isEnriched && enriched` en `map-popups.ts`):

1. **Jerarquía geográfica**: se renderiza completa y a veces en orden
   inconsistente (`localidad, provincia, país` vs `país > región > ...`),
   con niveles redundantes que ya están implícitos (p.ej. continente cuando
   se ve país europeo evidente). Genera ruido visual en Zona A.
2. **Tags mezclados**: `etiquetas_personales`, chips de colección,
   `categoria_principal`/`subcategorias` y eventuales tags semánticos del
   enriched conviven en el mismo bloque sin jerarquía visual. El helper
   `filterPersonalTags` ya deduplica colección↔personal, pero la mezcla
   sigue presente.
3. **"Mi punto"**: badge textual de ownership es redundante cuando ya
   existe la grammar visual (círculo verde propio + health rings) y, en
   futuro multiusuario, escala mal frente a los seguidos (triángulo +
   identidad cromática).
4. **Densidad de chips**: sin límite de overflow, popups con muchos tags
   personales rompen el alto máximo definido en §3.3 (Zone C).
5. **"Notas"**: campo presente que duplica semánticamente la descripción
   enriquecida y la observación corta. UX real lo ignora.
6. **Importancia (estrellas) + "Visited"**: dos ejes paralelos que la
   gente confunde. Las estrellas no se usan de forma consistente; el eje
   `visited` sí tiene tracción y casa con wishlist/pending.

### 9.2 Jerarquía geográfica canónica

**Fuente de verdad**: `getLocationHierarchy(loc)` en
`src/shared/geography/hierarchy.ts` (8 niveles canónicos).

**Propuesta de render en popup** (NO afecta el resto de la app):

| Nivel | Mostrar por defecto | Regla |
|---|---|---|
| continent | ❌ | Solo en tooltip/expandido. Implícito por país. |
| country | ✅ | Siempre, salvo si == país del usuario y zoom alto. |
| region | ✅ | Comunidad/región. |
| zone (provincia) | ✅ | Provincia/estado. |
| admin_level_3 (comarca) | colapsado | Visible al expandir, no por defecto. |
| locality | ✅ | Ciudad/villa/pueblo. |
| sublocality | colapsado | Barrio: solo si zoom ≥ 14 o usuario expande. |
| street | colapsado | Solo expandido. |

**Orden estable** (de específico a general, una sola línea Zona A):
```
{locality}, {zone}, {country}
```
Resto (`region`, `comarca`, `sublocality`, `street`) → bloque colapsable
"Ubicación completa" en Zona C.

**Reglas de truncado**:
- Línea Zona A ≤ 1 línea, con `text-overflow: ellipsis`.
- Si `locality` ausente → fallback a `zone`. Si ambos ausentes → `country`.
- Placeholders `(sin …)` (ver `isPlaceholderValue`) NUNCA se renderizan
  como chip; se omiten silenciosamente.
- Se canonicaliza vía `canonicalCountry`/`canonicalContinent` para evitar
  "España / Spain" duplicado.

### 9.3 Separación taxonomy vs semantic tags

Hoy todo entra como "chip" sin distinción. Propuesta canónica — **4 tipos
de tags**, cada uno con grammar visual propia y ubicación fija:

| Tipo | Fuente | Ubicación canónica | Visual | Ejemplo |
|---|---|---|---|---|
| **Taxonomy** | `enriched.clasificacion.categoria_principal` + `subcategorias` | Zona B (al lado del status) | chip neutro outline, icon prefix, sin `#` | `🏛 Castillo` |
| **Collection** | `useLocationCollections(id)` (canon `LocationCollectionChips`) | Zona C — primer bloque | chip relleno con color de colección, prefijo `#`, slug | `#AtlasObscura` |
| **Semantic** | `enriched.etiquetas_semanticas` (nuevo, IA) — *de momento subset de `clasificacion.tags`* | Zona C — segundo bloque | chip ghost, prefijo `·`, sin color | `· medieval`, `· ruinas` |
| **User** | `enriched.etiquetas_personales` filtradas vía `filterPersonalTags` | Zona C — tercer bloque, colapsable | chip muted, prefijo `#`, italic | `#favorito` |

**Reglas de no-duplicación** (extender contrato `filterPersonalTags`):
1. User tags se filtran contra: colecciones del POI **+ taxonomy del POI
   + semantic tags del POI**. Hoy solo se filtra colección.
2. Semantic tags se filtran contra taxonomy (no repetir `castillo` en
   ambas).
3. Taxonomy y collection son siempre disjuntos por naturaleza.

**Helper único propuesto** (futuro pilot, no implementar ahora):
`getCanonicalPopupTags(loc) → { taxonomy, collections, semantic, user }`
en `src/shared/popup/tags.ts` (nuevo archivo).

### 9.4 Ownership identity cleanup

**Estado actual**: badge textual "Mi punto" en Zona A.

**Diagnóstico**:
- Redundante con la grammar visual del marker (círculo propio + health
  rings + collection tint).
- No escala: ¿"Punto de @ana"? ¿"Punto seguido"?
- Conflicto futuro con `mem://logic/sharing/curated-only-rule` y con la
  identidad cromática OKLCH del PR-OWNER-IDENTITY-2.6.

**Propuesta canónica**:

| Caso | Identity render |
|---|---|
| Propio (own) | **Sin badge.** El marker ya lo dice. Opcional: dot verde 8px junto al nombre. |
| Seguido (followed accepted) | **Owner chip compacto** en Zona D (footer): avatar 16px + `@handle` con color OKLCH persistido (`getOwnerIdentityOklch(uid)`). |
| App / Source / Curator | Chip en Zona D con icono de fuente (Atlas Obscura, OSM, …) sin avatar. |

**Reglas**:
- Una sola identidad por popup. Nunca convivir "Mi punto" + owner chip.
- Color OKLCH solo si `followStatus === 'accepted'` (regla actual).
- En caso `own`, si el usuario tiene colecciones compartidas, el sharing
  status va a Zona D como icono, no como texto.

### 9.5 Tag visual hierarchy

**Densidad máxima por bloque** (Zone C):

| Bloque | Máx visible | Overflow |
|---|---|---|
| Taxonomy | 3 chips | resto → tooltip "+N" |
| Collections | 4 chips | "+N más" expande inline |
| Semantic | 5 chips | "+N más" expande inline |
| User | 4 chips | colapsado por defecto si >4; trigger "Mis etiquetas (N)" |

**Prioridad visual** (más → menos peso):
1. Taxonomy (define qué ES el lugar)
2. Collections (define agrupación del usuario)
3. Semantic (matiza la taxonomy)
4. User (anotación personal)

**Comportamiento overflow**:
- Sin scroll horizontal en bloques de chips.
- Wrap natural, máx 2 líneas por bloque antes de "+N más".
- "+N más" usa `<Collapsible>` (ya disponible, ver
  `src/components/ui/collapsible.tsx`).

### 9.6 Notes removal analysis

**Campos hoy presentes en popup enriched**:
- `enriched.descripcion` (párrafo largo, IA)
- `enriched.observacion` / `nota_corta` (1-2 frases, IA o usuario)
- `enriched.highlights` (bullets, IA)
- `enriched.notas` (campo libre usuario)
- `loc.notes` (legacy KML import)

**Análisis**:
- `notas` (campo usuario) y `loc.notes` (legacy) se solapan ~100% con
  `observacion` cuando existe, o con `descripcion` cuando el usuario las
  importó desde KML.
- UX real: ningún usuario distingue "nota" de "observación".
- `highlights` cumple función propia (escaneo rápido) → mantener.

**Propuesta**:
- **Deprecar** render separado de `notas` y `loc.notes` en popup.
- **Merge canónico** al cargar: si `enriched.observacion` está vacío y
  existe `notas` o `loc.notes`, promover a `observacion` (transform en
  `enriched-helpers`, no migración SQL).
- Mantener `notas` en la ficha completa (no popup) como "Notas privadas",
  campo editable.
- Resultado en popup: 3 campos textuales máximo → `observacion` (Zona A),
  `highlights` (Zona C tope), `descripcion` (Zona C colapsable).

### 9.7 Importance / Visited cleanup

**Estado actual**: dos ejes paralelos en Zona B.
- `loc.importance` (0-5 estrellas) — `mem://features/user-ratings-and-status`
- `loc.visitStatus` (boolean visited)

**Diagnóstico**:
- Estrellas ambiguas: ¿calidad esperada, prioridad de visita, valoración
  post-visita? Tres semánticas en un eje.
- Ejes desacoplados generan combinaciones absurdas (5★ + visitado vs 5★
  + pending).

**Propuesta — modelo único de 3 estados**:

```
status ∈ { wishlist | pending | visited }
```

| Valor | Semántica | Visual chip Zona B |
|---|---|---|
| `wishlist` | Quiero ir algún día | icon `Heart`, color muted |
| `pending` | Planeado / en ruta | icon `Clock`, color amber |
| `visited` | Ya estuve | icon `Check`, color verde |

**Eliminación de estrellas**: una sola pasada deprecation.
- Render: ocultar en popup desde flag `popup_remove_stars_v1`.
- Datos: `importance` permanece en BD (no destructivo). Opcionalmente,
  migrar a `personal_rating` (1-5 emoji ❤️) en ficha completa post-visita,
  fuera de popup.

**Impacto en contratos y filtros**:
- `filter-axis-contract.md`: el eje "Importancia" pasa a no listarse en
  FilterBar (rompe nada porque el filtro de estrellas tiene <2% uso según
  `analytics--read_project_analytics`, a confirmar antes del pilot).
- `mem://features/user-ratings-and-status`: requiere update con la nueva
  enumeración.
- `MyCatalogQuickFilters`: nuevo eje `status` con 3 valores; eje
  `importance` deprecado tras 2 sprints.
- Health rings: sin impacto (ortogonal a status del usuario).

### 9.8 Migration Impact Check

| Doc / Memoria | Impacto | Acción |
|---|---|---|
| `docs/popups/poi-popup-canon-proposal.md` | refina §canon estructura | actualizar tras pilot P-POPUP-2 |
| `docs/popups/poi-popup-structure-proposal.md` | este doc | versión 1.1 con §9 |
| `docs/contracts/popup-contract.md` | sin impacto (lifecycle intacto) | — |
| `docs/contracts/marker-grammar-contract.md` | sin impacto | — |
| `docs/contracts/focus-selection-contract.md` | sin impacto | — |
| `docs/contracts/filter-axis-contract.md` | eje importancia deprecado, eje status nuevo | revisar pre-P-POPUP-7 |
| `mem://ui/marker-status-symbology` | añadir nota sobre eliminación de "Mi punto" badge | update tras P-POPUP-3 |
| `mem://features/user-ratings-and-status` | reescribir con modelo 3 estados | update tras P-POPUP-7 |
| `mem://features/user-notes-system` | marcar `notas` popup-deprecated | update tras P-POPUP-6 |
| `mem://logic/content/persistent-filter-preservation` | nuevo eje status | revisar pre-P-POPUP-7 |
| `LocationCollectionChips`, `filterPersonalTags` | extender filtro a taxonomy + semantic | nuevo helper `getCanonicalPopupTags` |

### 9.9 Phasing propuesto (gated, secuencial)

Encadenado tras P-POPUP-1 (ya ratificado) y bajo la cadencia de
`canon-change-policy.md`:

| Pilot | Alcance | Flag |
|---|---|---|
| P-POPUP-2 | Jerarquía geográfica canónica (§9.2) en Zona A | `popup_geo_canonical_v1` |
| P-POPUP-3 | Ownership cleanup (§9.4) — eliminar "Mi punto" | `popup_owner_identity_v1` |
| P-POPUP-4 | Helper `getCanonicalPopupTags` + tipos de tags (§9.3) | `popup_tags_canonical_v1` |
| P-POPUP-5 | Tag visual hierarchy + overflow (§9.5) | `popup_tags_density_v1` |
| P-POPUP-6 | Notes merge (§9.6) | `popup_notes_merge_v1` |
| P-POPUP-7 | Status 3 estados + remove stars (§9.7) | `popup_status_tri_v1` + `popup_remove_stars_v1` |

Cada pilot: contrato → guard test → implementación tras Zona B/C de §3
ya tokenizadas. **NO se inicia ninguno sin ratificación explícita.**

### 9.10 Restricciones de este documento

- No código tocado.
- No cámara / subset-fit tocados.
- No marker grammar tocada.
- No F2 iniciada.
- Documento de propuesta: cada pilot abre su propio plan operativo
  (siguiendo plantilla `p-popup-1-implementation-plan.md`).

---

## 10. Persistence confirmation (v1.1)

- Path: `docs/popups/poi-popup-structure-proposal.md`
- Sync: GitHub automático vía Lovable
- Status: proposal v1.1 — §9 añadido, awaiting review de pilots P-POPUP-2..7
