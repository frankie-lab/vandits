# Auditoría front + plan de uniformización VANDITS

## 1. Diagnóstico (lo que he encontrado)

### A. Lo que YA está bien (no tocar)
- Paleta semántica HSL en `index.css` (warm exploration, primary/secondary/muted/accent + dark mode completo).
- Sistema de paneles canónico en `src/shared/components/ui/panel/` (PanelShell + Header/Body/Footer/Tabs/Section/Empty + `tokens.css`) — ADR 003.
- Tokens de panel definidos (`--panel-radius`, `--panel-input-h`, `--panel-cta-h`, etc.).
- `--bottom-progress-h` y `--top-header-h` correctamente publicados como contrato para overlays.
- Reglas críticas ya escritas en memoria (no-emojis, marker palette única, helpers únicos, etc.).

### B. Lo que está roto o inconsistente

**B1. Sistema de paneles a medio migrar**
Solo 5 superficies usan `PanelShell`: `Index.tsx`, `ImportedContentPanel`, `CollectionFocusView`, `OneDrivePhotosPanel`. El resto sigue con el legacy `FloatingPanel` (drawer en móvil, div flotante en desktop) o con `Dialog`/`Sheet` directos:
- `AdminPanel` (573L), `FilterBar` (399L), `SemanticSearch`, `IncompleteLocationsPanel`, `UnresolvedLocationsPanel`, `PersonalCategoriesPanel`, `CollectionsListPanel`, `RoutesListPanel`, `RouteSettingsPanel`, `TrashPanel`, `UserProfileEditor`, `UsersSidebar`, `NotesEditor`, `OneDrivePhotoBrowser`, `LocationPhotoMenu/Search/Upload`.
- Resultado: anchos distintos, padding distinto, headers distintos, footers ausentes, scroll roto en algunos.

**B2. Z-index sin contrato**
20+ valores distintos conviviendo: `z-10`, `z-20`, `z-50`, `z-[100]`, `z-[500]`, `z-[999]`, `z-[1000]`, `z-[1001]`, `z-[1002]`, `z-[1100]`, `z-[1200]`, `z-[2000]`, `z-[2001]`, `z-[2002]`, `z-[2100]`, `z-[2200]`, `z-[9999]`. Ningún tier nombrado. Provoca que photo upload, popups Leaflet, dialogs anidados y barra inferior se pisen entre sí.

**B3. Color hardcodeado masivo**
- 234 hex literales (`#ffffff`, `#1a1a1a`, …) dentro de componentes — viola la regla "no custom color classes".
- 49 usos de `bg-white/bg-black/bg-gray-*/bg-slate-*`.
- 22 `text-white` / `text-black`.
- 16 estilos inline con `color`.
- El incidente del tooltip Polaroid es síntoma directo de esto: cada componente improvisa su propia "tarjeta clara/oscura".

**B4. Tipografía sin escala**
- Se importa DM Sans + Space Grotesk pero NO hay tokens (`--font-display`, `--font-body`, `--text-h1…--text-caption`, line-heights).
- Tamaños sueltos: 11px, 12px, 13px, 14px aparecen como números literales en CSS y `text-xs/sm/base` mezclados sin criterio. Misma jerarquía visual la pinta cada componente a su modo.

**B5. Botones y densidad**
- Alturas mezcladas: `h-8` (mayoritario en filtros y selecciones), `h-10` (toolbar), `h-11` (panel forms), `h-12` puntual. El propio `tokens.css` dice `--panel-input-h: 44px` y `--panel-cta-h: 44px` pero no se respeta fuera del PanelShell.
- 75 `size="sm"` + 30 `size="icon"`, sin variante semántica (CTA, secondary, ghost-toolbar, destructive-confirm…). El `Button` shadcn vive con sus variants por defecto.

**B6. Motion sin presets**
- 29 archivos importan framer-motion + 53 `AnimatePresence`. Cada uno define su propia `transition`, `initial`, `exit`, easing y duración. No hay `motion-presets.ts`.

**B7. Top chrome ambiguo**
- Conviven `Header.tsx` (192L) y `FloatingToolbar.tsx` (801L). El segundo es el activo; el primero parece muerto pero sigue compilando. Confusión para mantenimiento.

**B8. God components**
- `LocationMap.tsx` 2 444 líneas, `FloatingToolbar.tsx` 801 L, `AdminPanel.tsx` 573 L, `Index.tsx` 509 L. Son los que más vibran en cada cambio.

**B9. Tooltip / popover / hover-card sin línea editorial**
- Tres APIs (Radix Tooltip, Radix HoverCard, Leaflet tooltip) con tres looks distintos. El popover del POI, el tooltip del top bar, el hover-card de avatares y el tooltip del mapa no se parecen entre sí ni en tipografía ni en flecha ni en sombra.

**B10. Estados vacíos / loading / error fragmentados**
- `PanelEmptyState` existe pero solo se usa en 4 sitios. El resto pinta `<div>No hay datos</div>` ad hoc. Skeletons inexistentes; spinners mezclan `Loader2`, `RefreshCw` girando y `Progress`.

**B11. Iconografía mezclada de tamaños**
- `h-3 w-3`, `h-4 w-4`, `h-5 w-5` sueltos por todas partes sin token `--icon-sm/md/lg`.

---

## 2. Propuesta — Plan por fases (todo no destructivo; conserva trabajo previo)

### Fase 0 — Cimientos invisibles (1 PR, sin cambio visual)
- Crear `src/shared/styles/tokens/`:
  - `z-index.css` — escala nombrada: `--z-map`, `--z-map-overlay`, `--z-panel`, `--z-toolbar`, `--z-popover`, `--z-modal`, `--z-modal-nested`, `--z-toast`, `--z-progress-bar`. Mapeo 1:1 con los 20 valores actuales (codemod literal → token).
  - `typography.css` — `--font-display: 'Space Grotesk'`, `--font-body: 'DM Sans'`, escala `--text-h1…h4/body/sm/caption` con line-height y letter-spacing.
  - `motion.css` + `motion-presets.ts` — durations (`--dur-fast 120ms`, `--dur-base 200ms`, `--dur-slow 320ms`) y easings (`--ease-out`, `--ease-in-out`) + presets framer (`fadeIn`, `slideRight`, `pop`).
  - `density.css` — `--control-h-sm 32`, `--control-h-md 36`, `--control-h-lg 44`; `--icon-sm 14`, `--icon-md 18`, `--icon-lg 22`.
- Extender `tailwind.config.ts` para exponer estos tokens como utilidades (`text-h1`, `z-modal`, `h-control-md`, etc.).
- Cero migraciones todavía; solo se publican los tokens.

### Fase 1 — Linter / barrera técnica
- Regla ESLint custom (`no-raw-color`): prohíbe `#[0-9a-f]{3,8}` y `bg-(white|black|gray-…)`/`text-(white|black)` en `src/components` y `src/domains` (excluyendo `index.css` y `ui/`).
- Regla `no-raw-zindex`: prohíbe `z-\[\d+\]`.
- Avisos como `warn` al principio, no romper build. Esto evita regresiones mientras se migra.

### Fase 2 — Tooltip / Popover / Empty / Loading unificados
- `<AppTooltip>` único (Radix Tooltip estilado con tokens) — sustituye usos sueltos.
- Tooltip del mapa Leaflet ya está unificado tras el último cambio; trasladar sus colores a vars de tokens (queda alineado con `<AppTooltip>` automáticamente).
- `<AppEmptyState>` (ya existe `PanelEmptyState` — promover a `src/shared/components/ui/empty-state` y enchufar en los 20+ "no hay datos" sueltos).
- `<AppSkeleton>` y `<AppSpinner>` con `Loader2` + `aria-busy`, una sola animación.

### Fase 3 — Migración de paneles legacy a PanelShell
Tabla de migración (16 paneles, 1 por PR pequeño, sin cambios funcionales):

| Panel | Variante | Notas |
|---|---|---|
| FilterBar | library | mover a sheet derecha unificado |
| SemanticSearch | form | input grande + resultados |
| IncompleteLocationsPanel | library | reusar header de Documents |
| UnresolvedLocationsPanel | workflow | con footer-CTA |
| PersonalCategoriesPanel | library | |
| CollectionsListPanel | library | ya parcialmente alineado |
| RoutesListPanel | library | |
| RouteSettingsPanel | form | |
| TrashPanel | library | |
| UserProfileEditor | form + tabs | usar PanelTabs |
| UsersSidebar | library | |
| NotesEditor | form | drawer en móvil |
| OneDrivePhotoBrowser | library | grid + footer |
| LocationPhotoMenu/Search/Upload | form | fusionar los 3 en un wizard 3-pasos |
| AdminPanel | workflow + tabs | el más complejo, último |
| IntermodalSelector | sheet bottom | |

Tras cada migración: borrar restos de estilos locales y dejar que los tokens hagan el trabajo.

### Fase 4 — Color & tipografía pass
- Codemod: barrer `bg-white` → `bg-card`, `bg-black` → `bg-foreground`, `text-white` → `text-primary-foreground`/`text-card-foreground` según contexto, hex literales más comunes → vars HSL existentes.
- Aplicar la escala tipográfica: títulos de panel = `text-h3`, items de lista = `text-body`, contadores = `text-caption`. Sustitución guiada (no automática) en los 20 componentes top.

### Fase 5 — Botones y densidad
- `Button` con variants nuevos: `cta` (h-11, full-rounded panel CTA), `toolbar` (h-9 icon, ghost), `filter-chip` (h-8), `destructive-confirm`. Reemplazos guiados.
- Inputs unificados a `h-control-md` (36) o `h-control-lg` (44) según contexto.

### Fase 6 — Top chrome
- Borrar `Header.tsx` (muerto).
- Partir `FloatingToolbar` (801L) en: `<TopBar>` (logo + búsqueda + contadores), `<TopActions>` (botones), `<TopUserMenu>`. Misma UI, código mantenible.

### Fase 7 — Motion pass
- Sustituir transitions sueltos por presets (`fadeIn`, `slideRight`, `pop`, `panel-enter`). Duraciones consistentes en todos los paneles y popups.

### Fase 8 — God components (opcional, separar del programa de uniformización)
- `LocationMap.tsx` split en `MapShell` + `MarkerLayer` + `PopupLayer` + `ProximityLayer` + `RouteLayer` (ya existen ficheros sueltos en `components/map/`, falta consolidar la entrada).
- `AdminPanel` partir por tabs en lazy chunks.

---

## 3. Entregables y orden

Orden recomendado: **0 → 1 → 2 → 4 → 5 → 3 → 6 → 7**. Razón: publicar tokens y linter primero crea la barrera; tooltip/empty/loading uniformes dan victoria visual inmediata; color/tipografía/botones se aplican en hojas y propagan a todo (incluso a paneles legacy aún sin migrar); con esa base, la migración a PanelShell solo cambia geometría y deja de mover píxeles.

Cada fase entrega un PR independiente, sin tocar lógica de negocio, sin tocar dominios (Identity, Content, Privacy, Social, Routes, Discovery), sin tocar Cloud ni backend, sin tocar reglas de marker palette ni anillos de salud (ya frozen en memoria).

---

## 4. Detalles técnicos por archivo (anexo no exhaustivo)

- Crear: `src/shared/styles/tokens/{z-index,typography,motion,density}.css`, `src/shared/styles/motion-presets.ts`, `src/shared/components/ui/empty-state/`, `src/shared/components/ui/tooltip/AppTooltip.tsx`.
- Editar: `src/index.css` (imports), `tailwind.config.ts` (exposición), `eslint.config.js` (reglas warn).
- Borrar: `src/components/Header.tsx` tras confirmar 0 referencias.
- Memoria a añadir tras Fase 0: `mem://style/tokens/z-index-scale`, `mem://style/tokens/typography-scale`, `mem://style/tokens/motion-presets`, `mem://style/tokens/density-scale`.

---

## 5. Riesgos y mitigaciones

- **Riesgo: cambios visuales no deseados durante codemods.** Mitigación: ESLint en `warn` primero, revisión visual panel por panel, snapshots de Playwright opcionales en superficies críticas (mapa, top bar).
- **Riesgo: romper z-index del popup Leaflet o del progress bar.** Mitigación: la escala de Fase 0 es 1:1 con los valores actuales; ningún cambio funcional.
- **Riesgo: tocar dominios por error.** Mitigación: todas las fases viven en `src/shared/**`, `src/components/**` y `src/components/ui/**`. No se entra a `src/domains/**`.
- **Riesgo: regresión del tooltip recién unificado.** Mitigación: el `<AppTooltip>` reutiliza las mismas vars `--poi-tooltip-bg/fg`.

---

## 6. Pregunta abierta antes de empezar

¿Empezamos por **Fase 0 + Fase 1 + Fase 2** juntas (tokens invisibles + linter + tooltip/empty/loading uniformes) como primer entregable visible? Es el cambio de mayor relación valor/riesgo y deja el terreno preparado para todo lo siguiente.
