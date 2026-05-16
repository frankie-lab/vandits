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
