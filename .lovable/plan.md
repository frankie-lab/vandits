

# Plan: Refundar el sistema de preferencias UX con 5 capas

## Diagnostico del estado actual

Lo que existe hoy en `shared/preferences/`:
- `types.ts`: scopes limitados a `system | domain | user | entity | session` (faltan `role` y `device`)
- `PreferenceField` no tiene `group` ni `editableScopes` — no distingue quién puede editar qué
- `ManageableUnit` usa `domain` como agrupador pero no `group` por familia UX
- Las unidades registradas en `discovery/preferences/` mezclan concerns: `marker_sizes` y `marker_state_rules` son semántica del mapa congelada en V2, no preferencias UX editables por usuario
- `use-map-theme.ts` y `use-sound-preferences.ts` siguen con localStorage directo, fuera del sistema
- No existe tabla DB dedicada para preferencias — se usa `app_settings` como key-value genérico

## Cambios necesarios

### 1. Ampliar tipos core (`shared/preferences/types.ts`)

**Scopes**: Agregar `role` y `device` a `PreferenceScope`:
```
system < role < domain < user < device < session
```

**PreferenceField**: Agregar:
- `group: 'appearance' | 'layout' | 'icons' | 'map' | 'accessibility' | 'experimental'`
- `editableScopes: PreferenceScope[]` — qué scopes pueden escribir este campo
- `protected?: boolean` — si true, solo editable en scope system/role (semántica congelada)

**PreferenceUnit** (renombrar `ManageableUnit`):
- `key` en lugar de `id` (namespace: `ux.appearance`, `ux.map.chrome`)
- `scopeDefaults` en lugar de `supportedScopes`

### 2. Reclasificar unidades existentes

Las 3 unidades actuales de Discovery necesitan reclasificarse:

| Unidad actual | Destino |
|---|---|
| `layer_visibility` | Se mantiene como `ux.map.visibility` — campos de toggle son preferencia personal (Nivel A) |
| `marker_sizes` | Sale del sistema de preferencias UX. Es configuración admin (Nivel B), se queda en `app_settings` con panel admin |
| `marker_state_rules` | Igual que sizes — es semántica V2 congelada, no preferencia de usuario |

### 3. Registrar unidades UX iniciales (Capa 1 y 2)

**`ux.appearance`** — Tema, accent, contraste, radio, sombras, motion
- theme: enum (light/dark/auto) — absorbe `use-map-theme.ts`
- accentColor: color
- contrast: enum (normal/high)
- radius: enum (none/sm/md/lg)
- motionLevel: enum (full/reduced/none)

**`ux.layout`** — Grid, densidad, compact mode, sidebar persistence
- density: enum (compact/comfortable/spacious)
- gridColumns: number (2-6)
- cardDensity: enum (compact/default/expanded)
- sidebarPersist: boolean
- floatingPanelMode: enum (floating/docked)

**`ux.map.chrome`** — UI del mapa que no es semántica
- showScale: boolean
- showMiniLegend: boolean
- toolbarPosition: enum (top/bottom)

**`ux.map.interaction`** — Comportamiento de interacción
- hoverPreview: boolean
- clickBehavior: enum (popup/sidebar)

**`ux.map.visibility`** — Migración de layer_visibility actual

**`ux.accessibility`** — Reduce motion, targets, atajos
- reduceMotion: boolean (sincronizado con motionLevel)
- largeTargets: boolean
- showKeyboardShortcuts: boolean

**`ux.audio`** — Absorbe `use-sound-preferences.ts`
- globalEnabled: boolean
- enrichmentSound: boolean
- importSound: boolean

### 4. Migración de DB

Crear tabla `preference_values`:
```sql
create table preference_values (
  id uuid primary key default gen_random_uuid(),
  unit_key text not null,
  scope_type text not null, -- 'system'|'role'|'domain'|'user'|'device'|'session'
  scope_id text, -- user_id, role name, device fingerprint, null for system
  values jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique(unit_key, scope_type, scope_id)
);
```

RLS: usuarios leen/escriben sus propias filas (`scope_type='user' AND scope_id=auth.uid()`), masters gestionan system/role/domain.

Actualizar `storage.ts` para usar `preference_values` en lugar de `app_settings`.

### 5. Actualizar resolver

El resolver actual ya funciona bien. Solo necesita:
- Agregar `role` y `device` al orden de precedencia
- Respetar `editableScopes` en validación de escritura
- Respetar `protected` para bloquear escritura en scopes no autorizados

### 6. Absorber hooks sueltos

- `use-map-theme.ts` pasa a leer/escribir `ux.appearance.theme` via `usePreferences`
- `use-sound-preferences.ts` pasa a leer/escribir `ux.audio.*`
- `use-layer-visibility.ts` ya apunta al sistema; actualizar el `unitId` a `ux.map.visibility`

### 7. Paneles UI

Crear paneles agrupados por familia (no por componente):

- **Apariencia** (`ux.appearance`) — tema, accent, contraste, radio, motion
- **Layout** (`ux.layout`) — grid, densidad, compact mode
- **Mapa** (`ux.map.chrome` + `ux.map.interaction` + `ux.map.visibility`) — chrome, interacción, capas
- **Audio** (`ux.audio`)
- **Accesibilidad** (`ux.accessibility`)

Accesibles desde un nuevo panel "Preferencias" en el menú de usuario.

### 8. Frontera Nivel A / Nivel B

Documentar explícitamente:

**Nivel A (preferencia personal, scope user/device/session):**
- Tema, accent, densidad, grid, audio, motion, visibilidad de capas, chrome del mapa

**Nivel B (configuración admin, scope system/role, panel Back Office):**
- marker_sizes, marker_state_rules, colores semánticos de ownership, formas V2
- Estos NO pasan por el sistema de preferencias UX, siguen en `app_settings` + panel admin

### 9. Actualizar ADR y memoria

- Actualizar `docs/adr/001-manageable-unit.md` con las 5 capas, scopes ampliados y frontera A/B
- Actualizar `mem://index.md` con la nueva regla core

## Archivos afectados

| Accion | Archivo |
|---|---|
| Reescribir | `src/shared/preferences/types.ts` |
| Editar | `src/shared/preferences/resolver.ts` (agregar role, device) |
| Editar | `src/shared/preferences/storage.ts` (usar preference_values) |
| Editar | `src/shared/preferences/usePreferences.ts` (nuevos scopes) |
| Reescribir | `src/domains/discovery/preferences/index.ts` (solo visibility) |
| Crear | `src/shared/preferences/units/ux-appearance.ts` |
| Crear | `src/shared/preferences/units/ux-layout.ts` |
| Crear | `src/shared/preferences/units/ux-map-chrome.ts` |
| Crear | `src/shared/preferences/units/ux-map-interaction.ts` |
| Crear | `src/shared/preferences/units/ux-audio.ts` |
| Crear | `src/shared/preferences/units/ux-accessibility.ts` |
| Crear | `src/shared/preferences/components/PreferencesPage.tsx` |
| Migrar | `src/hooks/use-map-theme.ts` (wrapper sobre usePreferences) |
| Migrar | `src/hooks/use-sound-preferences.ts` (wrapper sobre usePreferences) |
| Editar | `src/hooks/use-layer-visibility.ts` (unit key rename) |
| DB | Nueva tabla `preference_values` + RLS |
| Editar | `docs/adr/001-manageable-unit.md` |
| Editar | `mem://index.md` |

## Orden de ejecucion

1. DB: crear `preference_values` con RLS
2. Tipos + resolver + storage (ampliar scopes, tabla nueva)
3. Definir unidades UX (appearance, layout, map, audio, accessibility)
4. Reclasificar discovery/preferences (sacar sizes/rules, dejar solo visibility)
5. Absorber use-map-theme y use-sound-preferences
6. Panel de preferencias accesible desde menú usuario
7. Actualizar ADR y memoria

