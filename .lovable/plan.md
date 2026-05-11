
# Nivel 2 — Editor de tokens del Design System

Convertir el DS Inspector en un **editor global** del tema. Master/Admin pueden editar cualquier token (color, tipografía, densidad, radius, motion, popup, poi), ver el resultado en vivo en toda la app, y al guardar el cambio se aplica para todos los usuarios.

## Decisiones cerradas

- **Alcance**: todos los tokens del DS (los 8 JSON de `src/design-system/tokens/source/`).
- **Persistencia**: global en BD (`app_settings.key = 'design_system_overrides'`). Afecta a todos los usuarios al recargar y en vivo vía realtime.
- **UX**: inline en cada fila + toggle global "Editar tema" con preview live de toda la app.
- **Permisos**: solo `master` / `admin` (mismo gating que ya tiene el panel).

## Arquitectura

```text
src/design-system/tokens/source/*.json   (base, NUNCA se modifica desde UI)
            │
            ▼
   buildEffectiveTokens(base, overrides)  ←─ overrides desde BD
            │
            ▼
   inyecta CSS vars en :root + .dark      ←─ <DesignSystemThemeProvider>
            │
            ▼
   toda la app usa las vars normalmente
```

- **Base inmutable**: los JSON del repo siguen siendo la "verdad de fábrica".
- **Overrides en BD**: solo se guardan los tokens que difieren de la base (diff mínimo).
- **Aplicación**: un `<DesignSystemThemeProvider>` montado en `App.tsx` lee overrides + escucha realtime y reescribe las CSS vars en `:root` y `.dark` en caliente.
- **Modo edición**: cambios en memoria (no se guardan hasta pulsar "Publicar"). El toggle global activa el "modo edición" en cualquier punto de la app y muestra una barra flotante con `Descartar` / `Publicar`.

## Modelo de datos

Una sola fila en `app_settings`:

```text
key   = 'design_system_overrides'
value = {
  "color.primary.light": "210 80% 55%",
  "typography.fontFamily.body": "Inter, sans-serif",
  "density.control.lg": "44px",
  ...
}
```

Solo guardamos los tokens cambiados respecto a base. Borrar una clave = volver a la base.

RLS: lectura pública, escritura solo `master`/`admin` (ya cubierto por `app_settings`).

## UI del editor

### 1. Toggle global "Editar tema"
- Botón en la cabecera del DS Inspector + atajo en `UserMenu` (solo admin/master).
- Al activarlo:
  - Aparece **barra flotante inferior** persistente en TODA la app con: estado ("3 cambios sin publicar"), botones `Descartar` y `Publicar`.
  - Los cambios se aplican en vivo a las CSS vars pero NO se guardan en BD.
  - Se puede navegar por la app entera viendo el efecto real.

### 2. Edición inline en cada fila del Inspector
Cada `TokenRow` añade un icono `Pencil` a la derecha. Al pulsarlo abre un popover con el editor adecuado al **tipo de token**:

| Tipo de token | Editor |
|---|---|
| color | `react-colorful` HslColorPicker + input HSL "H S% L%" + swatch live + botón "Resetear" |
| fontFamily | Select con fuentes seguras + custom string |
| fontSize / fontWeight / lineHeight | Number input + slider + unidad (px/rem) |
| density (h, padding, gap) | Number input en px |
| radius | Number input en px |
| motion duration | Number input en ms |
| motion easing | Select de presets + custom cubic-bezier() |
| z-index | Number input |
| shadow | Textarea con preview live |
| popup.* / poi.* (numéricos) | Number input con unidad |

Cada editor:
- Muestra **valor base** y **valor override** lado a lado.
- Botón "Volver a la base" elimina el override de esa key.
- Aplica el cambio a CSS vars al instante.

### 3. Detección automática de tipo
Helper `inferTokenType(path, value)` decide qué editor renderizar mirando la ruta (`color.*`, `typography.*`, `motion.duration.*`, etc.) y el formato del valor.

### 4. Indicador visual de overrides
- Fila con override activo: badge "Modificado" + valor base tachado a la izquierda del valor actual.
- Sidebar muestra contador "(N)" por sección con overrides.

## Realtime
Canal `app_settings` filtrado por `key=design_system_overrides`. Al publicar un admin, el resto de sesiones abiertas (no en modo edición) reciben el evento y el `ThemeProvider` re-inyecta las vars. Si una sesión está en modo edición, aparece un toast "Otro admin ha publicado cambios" con botón "Actualizar".

## Seguridad y salvaguardas

- **Solo lectura para no admin**: el endpoint de write valida rol via `has_role(auth.uid(), 'admin'|'master')` (RLS).
- **Histórico**: cada `Publicar` guarda una fila en una nueva tabla `design_system_history` (`id, value jsonb, published_by, published_at`). Pestaña "Historial" con botón "Restaurar versión".
- **Reset total**: botón "Restaurar valores de fábrica" vacía los overrides.
- **Validación**: cada editor valida formato (HSL, número, cubic-bezier...). Si un valor es inválido, no se aplica y se marca rojo.

## Archivos nuevos

```text
src/design-system/runtime/
  theme-provider.tsx          # Carga overrides + realtime + inyección CSS vars
  apply-overrides.ts          # buildEffectiveTokens + writeCssVars
  edit-mode-store.ts          # Zustand: editMode on/off, draftOverrides, publish/discard
  token-types.ts              # inferTokenType + metadata por categoría

src/components/admin/design-system/editors/
  ColorEditor.tsx
  FontFamilyEditor.tsx
  NumberEditor.tsx            # px/rem/ms/unitless
  EasingEditor.tsx
  ShadowEditor.tsx
  TokenEditorPopover.tsx      # dispatcher por tipo

src/components/admin/design-system/
  EditModeBar.tsx             # Barra flotante con Descartar/Publicar
  OverrideBadge.tsx
  HistoryTab.tsx              # Lista versiones + restaurar
```

## Archivos editados

```text
src/App.tsx                                    # Monta <DesignSystemThemeProvider>
src/components/admin/DesignSystemPanel.tsx     # Añade toggle + tab Historial
src/components/admin/design-system/TokenRow.tsx # Botón Pencil + popover
src/components/admin/design-system/token-grouping.ts # Marcar filas con override
src/components/UserMenu.tsx                    # Atajo "Editar tema" (admin)
```

## Migraciones BD

```sql
-- 1. Crear tabla de historial
create table public.design_system_history (
  id uuid primary key default gen_random_uuid(),
  value jsonb not null,
  published_by uuid references auth.users(id),
  published_at timestamptz not null default now(),
  note text
);
alter table public.design_system_history enable row level security;
create policy "DS history readable by all"
  on public.design_system_history for select using (true);
create policy "DS history writable by admin/master"
  on public.design_system_history for insert
  with check (public._is_admin_or_master(auth.uid()));

-- 2. Asegurar key inicial en app_settings (vacío)
insert into public.app_settings (key, value)
values ('design_system_overrides', '{}'::jsonb)
on conflict (key) do nothing;

-- 3. Habilitar realtime
alter publication supabase_realtime add table public.app_settings;
```

## Plan de entrega (1 PR)

1. ThemeProvider + apply-overrides + carga inicial sin UI (verificable: vars cambian si edito BD a mano).
2. Editor inline de **color** (caso más complejo) + edit-mode-store + EditModeBar + Publicar/Descartar.
3. Resto de editores (Number, FontFamily, Easing, Shadow).
4. Pestaña Historial + restaurar versiones.
5. Realtime + toast de cambios externos.

## Fuera de alcance (futuro)

- Editar tokens de **dominio** (`poi.json`, `popup.json`) con preview visual usando los componentes `PoiPreview`/`PopupPreview` que ya existen — se puede añadir en una iteración posterior reutilizando esos renderers como preview en el popover.
- Editar markdown del glosario (`token-glossary.ts`) desde la UI.
- Exportar overrides como JSON para commitearlos al repo como nueva base.
