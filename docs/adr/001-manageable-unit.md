# ADR-001: Manageable Unit — Preference Abstraction

**Status:** Accepted  
**Date:** 2026-04-16  
**Context:** The codebase has multiple independent preference systems (layer visibility via localStorage singleton, marker sizes via app_settings DB, marker state rules via app_settings DB, map theme via localStorage). Each uses different storage, resolution logic and UI. This creates duplication and makes it hard to add new configurable features.

## Decision

We introduce a single abstraction — **ManageableUnit** — to model any configurable feature in the system.

### Core Concepts

| Concept | Definition |
|---------|-----------|
| **ManageableUnit** | A named group of related preference fields (e.g. `discovery.map.layer_visibility`). Declares its fields, defaults and supported scopes. |
| **PreferenceScope** | The level at which a value can be set: `system` → `domain` → `user` → `entity` → `session`. Lower scopes provide defaults; higher scopes override. |
| **PreferenceField** | A single configurable value within a unit. Has a key, type, default value and optional constraints. |
| **ResolvedPreferences** | The final key-value map after applying all scope overrides in precedence order. |

### Separation of Concerns

A ManageableUnit covers **one** concern:
- **Validation** units: data quality rules, thresholds
- **Appearance** units: colors, sizes, shapes, visual states
- **Visibility** units: show/hide toggles, zoom thresholds

These are **never mixed** in a single unit. A domain may register multiple units for different concerns.

### Scope Precedence

```
system (lowest) → domain → user → entity → session (highest)
```

- `system`: hardcoded defaults in code
- `domain`: domain-level overrides (e.g. all Discovery settings)
- `user`: per-user overrides stored in DB (profiles / user_map_preferences)
- `entity`: per-entity overrides (e.g. hide a specific followed user)
- `session`: ephemeral overrides that don't survive reload

### Resolution Algorithm

```
for each field in unit.fields:
  resolved[field.key] = field.defaultValue  // system scope
  for scope in [domain, user, entity, session]:
    if overrides[scope] has field.key:
      resolved[field.key] = overrides[scope][field.key]
```

### Storage

Storage adapters abstract the backing store:
- **LocalStorageAdapter**: for session/quick preferences
- **SupabaseAdapter**: for user/entity preferences persisted to DB

Units declare which scopes they support. The system only loads/saves from adapters matching those scopes.

## Consequences

- New configurable features register a `ManageableUnit` and get storage + UI for free
- Existing systems (layer visibility, marker sizes, marker state rules) will be migrated incrementally
- The generic `PreferencePanelRenderer` can render any unit, with optional custom UI overrides
- No more direct `localStorage.getItem` or raw `app_settings` fetches scattered across hooks
