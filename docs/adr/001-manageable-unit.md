# ADR-001: Preference System — 5-Layer Architecture

**Status:** Accepted (v2)  
**Date:** 2026-04-16 (updated)  
**Context:** The codebase had multiple independent preference systems with different storage, resolution logic and UI. V2 introduced a frozen visual grammar for markers. The system needed clear separation between user UX preferences (Nivel A) and semantic domain configuration (Nivel B).

## Decision

We use a **PreferenceUnit** abstraction with 5 conceptual layers and a strict boundary between personal preferences and semantic configuration.

### Core Concepts

| Concept | Definition |
|---------|-----------|
| **PreferenceUnit** | A named group of related preference fields (e.g. `ux.appearance`). Declares fields, defaults, supported scopes and group. |
| **PreferenceScope** | The level at which a value can be set. Precedence: `system < role < domain < user < device < entity < session`. |
| **PreferenceField** | A single configurable value. Has key, type, default, group, editableScopes and optional `protected` flag. |
| **PreferenceGroup** | UX family: `appearance`, `layout`, `icons`, `map`, `accessibility`, `experimental`. |

### 5 Layers

| Layer | What it covers |
|-------|---------------|
| **1. Base tokens** | Theme, accent, typography scale, density, radius, shadows, motion — affects shell and product components, NOT map semantics |
| **2. UX by area** | Per-context preferences: `shell.*`, `map.chrome.*`, `map.interaction.*`, `content.layout.*`, `accessibility.*` |
| **3. Semantic (protected)** | Layer visibility, heatmap thresholds, entity toggles — exist in the system but may be partially protected |
| **4. Scopes** | `system < role < domain < user < device < entity < session` — each scope overrides the previous |
| **5. Panels** | Grouped by family (Appearance, Layout, Map, Accessibility), not by component |

### Nivel A vs Nivel B

| Level | What | Who edits | Where stored |
|-------|------|-----------|-------------|
| **A — Personal** | Theme, accent, density, grid, audio, motion, layer visibility, map chrome | User (scope `user`/`device`/`session`) | `preference_values` table |
| **B — Semantic/Admin** | Marker shapes, sizes, state rules, ownership colors, V2 visual contracts | Admin/Master (scope `system`/`role`) | `app_settings` + Back Office |

**Critical boundary**: V2 marker grammar (shapes, colors, decorations expressing business state) is NEVER exposed as user preference. It stays in `app_settings` managed by admin panels.

### Scope Precedence

```
system (lowest) → role → domain → user → device → entity → session (highest)
```

### Storage

| Scope | Storage |
|-------|---------|
| `session`, `device` | localStorage |
| `user`, `domain`, `role`, `system` | `preference_values` table (Supabase) |
| `entity` | `preference_values` with entity ID |

### Registered UX Units

| Unit Key | Group | Description |
|----------|-------|-------------|
| `ux.appearance` | appearance | Theme, accent, contrast, radius, motion |
| `ux.layout` | layout | Density, grid columns, card density, sidebar persistence |
| `ux.map.chrome` | map | Scale bar, mini legend, toolbar position |
| `ux.map.interaction` | map | Hover preview, click behavior |
| `ux.map.visibility` | map | Layer toggles (migrated from discovery) |
| `ux.audio` | appearance | Global sound toggle + per-action sounds |
| `ux.accessibility` | accessibility | Reduce motion, large targets, keyboard shortcuts |

### NOT in the preference system

- `marker_size_config` — admin-managed in `app_settings`
- `marker_state_rules` — admin-managed in `app_settings`
- V2 visual grammar contracts — frozen, code-defined
- Validation rules — domain logic, not preferences

## Consequences

- New UX features register a `PreferenceUnit` and get storage + UI for free
- The `PreferencesPage` panel renders all units grouped by family
- No more direct `localStorage.getItem` or raw `app_settings` fetches for UX preferences
- Semantic V2 contracts remain protected from user manipulation
