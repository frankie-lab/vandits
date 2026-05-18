# POI Curation Levels — Contrato canónico (P-POI-CURATION-1)

Capa **operacional / lógica** que describe el estado de curación de un POI
y deriva tres consecuencias: **salud**, **compartibilidad** y **acción
principal de curación** del footer del popup. NO es un canon visual.

> **Renderer invariance (regla DURA)** — Los niveles de curación SÓLO
> pueden modificar el atributo `data-curation-action` del botón principal
> dentro del footer canónico (`data-popup-footer="v1"`). NUNCA pueden
> crear variantes del popup, layouts alternativos, shells distintos,
> ramas legacy ni alterar hero / breadcrumb / composer / ratings block /
> taxonomía / PopupShell / marker grammar. Cualquier evolución del
> sistema de curación opera sobre lógica y acciones, nunca creando otra
> UI paralela. El popup sigue siendo **un único renderer + fragments
> condicionales**.

## 1. Niveles canónicos

Sólo existen 6 niveles. **Prohibido inventar POI-2, POI-4, POI-6, POI-7,
POI-8**. Si una combinación de datos no encaja, cae al nivel inmediato
inferior por prioridad descendente `10 → 9 → 5 → 3 → 1 → 0`.

| Level   | Definición operacional                                                          | Health   | Shareability | Primary action       |
|---------|---------------------------------------------------------------------------------|----------|--------------|----------------------|
| POI-0   | Sólo coordenadas; sin nombre validado (vacío o `Sin nombre`)                    | red      | no           | `name`               |
| POI-1   | Coords + nombre; geografía sin validar (`geoHealth ∈ {null, empty, stale_name}`) | red      | no           | `validate-geo`       |
| POI-3   | Conflicto geográfico (`geoHealth = 'broken'`) — **tiene prioridad sobre enriched** | red      | no           | `resolve-conflict`   |
| POI-5   | Enriquecido con **deuda objetiva**: rings activos o `geoHealth ∈ {partial, stale_name, empty}` | yellow   | limited      | `heal`               |
| POI-9   | Enriquecido + sano (rings vacíos, `geoHealth='ok'`); sin valoración final       | green    | yes          | depende de personal (ver §3) |
| POI-10  | Enriquecido + sano + visitado + valorado                                        | green    | yes          | `none` (estado final) |

### Salud objetiva ≠ estado personal (regla DURA)

`visited` y `user_rating` pertenecen al estado personal del viewer y
NUNCA degradan `healthState`/`shareability`. Un POI enriquecido, con
`geoHealth='ok'` y sin rings activos, está sano por definición — esté o
no visitado. "Pendiente de visita" no equivale a "Sanar POI" y no puede
producir `primaryAction='heal'`.

El estado personal sólo modula el `primaryAction` **dentro de POI-9**:

| Personal state                | primaryAction      |
|-------------------------------|--------------------|
| no visitado                   | `none` (sin botón) |
| visitado + sin `user_rating`  | `rate-experience`  |
| visitado + `user_rating > 0`  | (es POI-10 → `none`) |


## 2. Helpers canónicos (no duplicar predicados)

`src/domains/content/lib/poi-curation-level.ts` delega 100% en:

- `isPointEnriched(loc)` — frontera "tiene `enriched_data.descripcion`".
- `getPointHealthRings(loc)` — deuda operativa observable.
- `loc.geoHealth` — `'ok' | 'partial' | 'broken' | 'stale_name' | 'empty' | null`.
- `loc.customData.visited` / `loc.customData.user_rating` — estado personal.

Coherencia con `isShareablePoi`: si el veredicto es `shareability === 'yes'`,
`isShareablePoi(loc)` debe devolver `true`.

API:

```ts
getPoiCurationLevel(loc): PoiCurationVerdict
getPoiPrimaryHealingAction(level): PoiPrimaryAction
isPoiShareable(level): PoiCurationShareability
getPoiCurationHealth(level): PoiCurationHealth
```

## 3. Integración en footer del popup

Dentro del mismo `data-popup-footer="v1"`:

- Se inyecta **un único** botón principal con atributos:
  - `data-action="curation-primary"`
  - `data-curation-action="${primaryAction}"`
  - `data-curation-level="${level}"`
- Etiquetas es-ES: `Nombrar / Validar geografía / Resolver conflicto /
  Sanar POI / Valorar experiencia`.
- `primaryAction === 'none'` (POI-10) → **no se emite botón**.
- Se omite también para curator points y para popups en contexto nearby
  (paridad con la regla del bloque de ratings P-POPUP-14.2).
- Los handlers concretos no se implementan aquí: el botón puede emitir
  `lovable:curation-action { locationId, action }` o, cuando ya exista
  un flujo equivalente (`rate-experience` ↔ `set-rating`), reutilizarlo.

## 4. Renderer invariance — guards obligatorios

Esta sección es **norma de blindaje**. Cualquier PR que afecte
`map-popups.ts` o introduzca un nuevo nivel/acción debe pasar:

- `src/test/popup-golden-poi-contract.test.ts`
  - Bloque `P-POI-CURATION-1 — los niveles de curación NO bifurcan el renderer`.
- `src/test/popup-curation-primary-action.test.ts`
  - Por nivel: el footer contiene exactamente un `data-action="curation-primary"`
    con el `data-curation-action` correcto.
  - POI-10: NO existe `data-action="curation-primary"`.
  - **NO** existen `data-popup-footer="v2+"`, `data-popup-variant`,
    `popup-v2-*`, ni clases `legacy-popup`.
  - Snapshot estructural: la lista de markers `data-popup-*` (excepto
    `data-curation-action` / `data-curation-level`) es idéntica entre
    POI-1 y POI-10.

## 5. Matriz de tests obligatorios

| Test                                                | Cubre                                         |
|-----------------------------------------------------|-----------------------------------------------|
| `poi-curation-level.test.ts`                        | 6 niveles + prioridad + coherencia shareable  |
| `popup-curation-primary-action.test.ts`             | Footer + invariance                           |
| `popup-golden-poi-contract.test.ts` (sección curation) | Golden POI mantiene shell único               |

## 6. Restricciones

- No tocar: composer, hero, ratings (P-POPUP-14.2), taxonomía, breadcrumb,
  PopupShell, F2, marker grammar, schema DB, RLS, sharing pipeline real.
- No crear capas físicas nuevas. Verdict **derivado** — nunca fuente para
  visibilidad de markers, health rings o tints.
- No inventar POI-2/4/6/7/8.

## 7. Memoria asociada

- `mem://logic/poi/curation-levels` — regla operativa + literal de
  renderer invariance.
- Entrada en `mem://index.md` (Core).

---

## P-POI-CURATION-2 — Una sola verdad visible

Amplía P-POI-CURATION-1 sin crear niveles nuevos. Añade el campo
`bodyBlocker` al verdict y subdivide POI-1 (1a/1b) y POI-9 (9a/9b) en
representación. La regla central: **el cuerpo y el footer derivan SIEMPRE
del mismo `getPoiCurationLevel(loc)` en el mismo render pass**.

### Tabla final (representación visible)

| Nivel | Problema actual              | Bloque visible en cuerpo            | Botón | Texto del botón     |
|-------|------------------------------|-------------------------------------|-------|---------------------|
| POI-0 | Sin nombre validado          | Aviso "Sin nombre"                  | Sí    | Nombrar             |
| POI-1a| Geografía sin validar        | Aviso "Sin localización clara"      | Sí    | Validar geografía   |
| POI-1b| Geo OK pero sin enriquecer   | Contexto cercano (recovery inline)  | No    | —                   |
| POI-3 | Conflicto geográfico         | Aviso de conflicto                  | Sí    | Resolver conflicto  |
| POI-5 | Enriquecido con deuda        | Health rings + secciones            | Sí    | Sanar POI           |
| POI-9a| Enriched sano, no visitado   | Rating block (personal = Pendiente) | No    | —                   |
| POI-9b| Visitado sin rating          | Rating block (5 estrellas activas)  | No    | —                   |
| POI-10| Estado final                 | Rating block con estrella marcada   | No    | —                   |

### Reglas R1–R3

- **R1 (una sola verdad)** — `bodyBlocker` es la ÚNICA fuente de verdad
  del bloqueo visible.
- **R2 (body = footer)** — cuerpo y footer derivan del mismo verdict
  consumido una sola vez por `createPopupContent`.
- **R3 (sin redundancia)** — `primaryAction ∈ {bodyBlocker, 'none'}`. Si
  el cuerpo YA es la acción (POI-1b: recovery; POI-9a/9b: estrellas), el
  footer no emite botón.

### Implementación

- `PoiCurationVerdict.bodyBlocker: 'name'|'validate-geo'|'enrich-from-context'|'resolve-conflict'|'heal'|'rate'|'none'`.
- Subestados POI-1 resueltos por `geoHealth` (`ok` ⇒ 1b, resto ⇒ 1a).
- Subestados POI-9 colapsados en `primaryAction='none'` (sin botón
  "Valorar experiencia").
- `createPopupContent` hoistea `const curationVerdict = getPoiCurationLevel(location)`
  ANTES del shell, y lo consume tanto en el footer como en el recovery
  mount.
- Recovery mount gobernado por `curationVerdict.bodyBlocker === 'enrich-from-context'`
  (NO por `!isPointEnriched`).
- Hook verificable: `data-popup-active-blocker="${bodyBlocker}"` +
  `data-popup-curation-level` en el root del popup.

### Invariantes blindadas por tests

- `popup-curation-primary-action.test.ts` → POI-1a emite `validate-geo`
  sin `data-recovery-root`; POI-1b emite `data-recovery-root` sin botón;
  POI-9b sin botón "Valorar experiencia".
- INVARIANTE GLOBAL: ningún nivel coexiste `data-curation-action="validate-geo"`
  con `data-recovery-root`.
- `poi-curation-level.test.ts` → R3 (`primaryAction ∈ {bodyBlocker, 'none'}`)
  para todos los niveles.
- `popup-golden-poi-contract.test.ts` → POI-10 y POI-9b nunca emiten
  `curation-primary`.

### Fuera de alcance

Shell, hero, breadcrumb, ratings block (salvo eliminar redundancia
9b), marker grammar, heal-rings, resolve-conflict real, P-POI-CURATION-3.1.

## P-POI-CURATION-2.1 — Autolaunch POI-1b

Refuerza R3 ("sin redundancia") en POI-1b: si "Contexto cercano" es la
única salida posible, no debe haber botón intermedio y el bloque ES la
acción desde el primer render del popup.

### Canon de comportamiento

- **Autolaunch**: en POI-1b (sin coherence conflict), `UnenrichedRecoveryBlock`
  monta `<NearbyPanel variant="inline">` directamente en su primer render.
  No existe botón intermedio "Contexto cercano".
- **Loading inline**: `NearbyPanel` arranca con `loadingNearby=true` y
  dispara `searchNearby()` una vez en mount. Mientras carga muestra
  "Buscando puntos cercanos…" + spinner en el cuerpo del popup
  (`data-nearby-state="loading"`).
- **Resultados**: render normal de la lista por categoría.
- **Error**: si `searchNearby` lanza, el bloque entra en
  `data-nearby-state="error"` con badge "No se pudo cargar el contexto
  cercano." y botón `[Reintentar]` (`data-nearby-action="retry"`). Cero
  resultados legítimos NO es error — se muestra el empty-state habitual.
- **Anti doble disparo**: `popup-recovery-mount` preserva la identidad
  del root React mientras el host `[data-recovery-root]` no cambie, por
  lo que regeneraciones del popup que no remplazan el host no remontan
  `NearbyPanel` ni re-disparan `searchNearby`. Resultado: una sola
  llamada por apertura real del popup.
- **Hook observable**: el wrapper del autolaunch lleva
  `data-nearby-autofire="1"` para tests/QA.

### Invariantes añadidas

- POI-1b nunca renderiza un botón intermedio "Contexto cercano".
- `NearbyPanel` se monta exactamente una vez por apertura del popup
  POI-1b.
- Estado `error` ⇒ existe `[data-nearby-action="retry"]` visible.

### Fuera de alcance (re-confirmado)

Shell, hero, breadcrumb, ratings block, footer canónico, rama con
conflicto del recovery block, niveles POI, `map-fly-to` ya existente
en NearbyPanel, P-POI-CURATION-3.x.

## P-POI-CURATION-2.2 — Un solo scroll por popup en POI-1b

Refuerza la ergonomía del autolaunch: el contenido de Contexto cercano
debe integrarse en el flujo natural del cuerpo del popup, sin generar
un segundo scroll vertical anidado.

### Canon de comportamiento

- **Único owner de scroll vertical** del popup POI = el propio popup
  (`leaflet-popup-content` con su `max-h` / `overflow-y` canónicos).
- **`NearbyPanel variant="inline"`** NO impone `max-height`, NO usa
  `overflow-hidden` ni `overflow-y-auto`, NO crea contexto flex acotado
  (`flex-1 min-h-0`). Fluye como bloque normal.
- **Variants `sidebar`** (Sheet/DocumentFocusView) conservan su scroll
  propio — fuera de alcance.
- **Lista larga sin scroll anidado**: cap inicial de
  `INLINE_VISIBLE_DEFAULT = 6` candidatos visibles. Si hay más, se
  añade un botón inline `Ver más (N restantes)` / `Ver menos` que
  expande dentro del mismo flujo. El cap se resetea al cambiar de
  POI (`location.id`) o de radio (`radiusMeters`).
- **Lectura natural**: hero → ratings → "Contexto cercano" (header +
  candidatos + acciones) se recorren con un único gesto de scroll
  del popup, sin scroll-trapping del bloque.

### Hooks observables

- `data-nearby-scroll-owner="popup"` en el root inline.
- `data-nearby-scroll-owner="self"` en el root sidebar.
- `data-nearby-results` + `data-nearby-overflow="none" | "auto"` en
  el contenedor de resultados.
- `data-nearby-list` + `data-nearby-visible-count` en la lista por
  categorías; `data-nearby-action="expand" | "collapse"` en el
  botón Ver más / Ver menos.

### Invariantes añadidas

- En `variant="inline"`, el root no contiene `overflow-hidden`,
  `overflow-y-auto` ni `style.maxHeight`.
- En `variant="inline"`, el contenedor `[data-nearby-results]` no
  contiene `overflow-y-auto`, `min-h-0` ni `flex-1`.
- En `variant="sidebar"`, `[data-nearby-results]` mantiene
  `overflow-y-auto`.

### Fuera de alcance (re-confirmado)

Shell del popup, hero, breadcrumb, ratings block, footer canónico,
niveles POI, lógica de curación, marker grammar, heal-rings,
resolve-conflict real, variant `sidebar`, P-POI-CURATION-3.x.

## P-POI-CURATION-2.3 — Legibilidad y ancho útil en POI-1b

### Problema

Las filas de candidatos quedaban encajonadas dentro del popup
(`CARD.maxWidth = 360`) por la suma de `padX=px-1.5` del bloque inline,
`px-3` de cada card, `gap-3` y un botón `h-8 w-8`. Los nombres largos
caían en `truncate` y la metadata de coordenadas crudas competía con el
nombre por la misma fila.

### Reglas canónicas

- **Inline edge-to-edge**: `padX = 'px-0'` en `variant="inline"`.
  Header, current-point card, mismatch banner, results y footer del
  bloque comparten ancho con los bordes internos del
  `leaflet-popup-content`.
- **Densidad compact** en `NearbyResultCard` (prop `density`):
  - `comfortable` (default, **sin cambios** para otros consumidores).
  - `compact`: `px-2`, `gap-2`, `rounded-md`, nombre
    `text-sm font-semibold leading-snug line-clamp-2`, meta
    `text-[10px] text-muted-foreground/80`.
- **Meta sin coordenadas** en `NearbyPointCard`: visible solo
  `distance · place_type`. Las coords completas quedan accesibles vía
  `title`/`aria-label` del row.
- **Acción más ligera**: botón `h-7 w-7` (28×28, sigue cumpliendo
  target táctil), `variant="ghost"` en idle y `variant="default"`
  cuando `enriching`.

### Hooks observables

- `data-density="comfortable" | "compact"` en el root de
  `NearbyResultCard`.
- `title` / `aria-label` del row contienen siempre nombre + distancia
  + coordenadas (regresión-guard para a11y/QA aunque el meta visible
  se simplifique).

### Invariantes añadidas

- En `variant="inline"`, ningún subcontenedor del bloque expone
  `px-1.5` ni `px-3` como padding horizontal raíz.
- En density `compact`, el nombre usa `line-clamp-2`, **nunca**
  `truncate`.
- En `NearbyPointCard`, el meta visible no contiene
  `latitude.toFixed(4)` ni `longitude.toFixed(4)`.

### Fuera de alcance (re-confirmado)

`CARD.maxWidth = 360`, shell del popup, hero, breadcrumb, ratings
block, footer canónico, niveles POI, lógica de curación, marker
grammar, heal-rings, variant `sidebar` (mantiene `comfortable` por
defecto), otros consumidores de `NearbyResultCard`, P-POI-CURATION-3.x.

## P-POI-CURATION-2.5 — Ancho útil en filas compact

Ajuste fino de layout horizontal sobre el primitive
`NearbyResultCard` (modo `density="compact"`) y la celda inline de
acción en `NearbyPointCard`. Mantiene el ritmo vertical y la
materialización borde + sombra suave; solo libera píxeles
horizontales hacia el nombre del candidato.

### Reglas canónicas

- `NearbyResultCard` (`density="compact"`):
  - Padding lateral del card: `px-1.5` (antes `px-2`).
  - Gap entre columna texto y acción: `gap-1.5` (antes `gap-2`).
  - Padding vertical: `py-2` (sin cambios — ritmo intacto).
  - `comfortable` permanece exactamente igual (`px-3 gap-3`).
- `NearbyPointCard` (inline POI-1b):
  - Botón de acción: `h-7 w-6` (antes `h-7 w-7`). Touch target ≥24px.
- `UnenrichedRecoveryBlock` (lista de candidatos de búsqueda):
  - Fila clickable: `px-0` (antes `px-1`). El hover bg se conserva
    vía `rounded` y `hover:bg-muted/40`.

### Hooks de test

- Selector único: `[data-density="compact"]` en `NearbyResultCard`.
- Test de regresión: `src/test/popup-poi-1b-row-width.test.tsx`.

### Invariantes

- `comfortable` intacto → sin regresión para otros consumidores.
- Sin cambios en tipografía, `line-clamp-2`, meta `text-[10px]`,
  border ni shadow del card compact.
- `CARD.maxWidth = 360` sin tocar.
- Sin reintroducir caja exterior alrededor del bloque inline
  (la flat surface de 2.4 se preserva).

### Fuera de alcance (re-confirmado)

Shell, hero, breadcrumb, ratings, footer canónico, niveles POI,
lógica de curación, marker grammar, health rings, variante
`sidebar`/`dialog`/`card`, otros consumidores de
`NearbyResultCard`, P-POI-CURATION-3.x.

## P-POI-CURATION-2.6 — Mount wrapper sin carril editorial

El cuello de botella de ancho útil en POI-1b no estaba en la fila ni
en el card, sino en el wrapper de montaje React dentro del popup HTML.

### Diagnóstico

`src/components/map/map-popups.ts` inyectaba el mount point como:

```html
<div data-recovery-root="..." style="margin: 0 16px 8px 16px;"></div>
```

Esos 16px laterales heredaban el carril editorial del resto del popup
(prosa, ratings, breadcrumb), pero el recovery block es grid
interactivo y el inline `NearbyPanel` ya pide edge-to-edge vía
`padX='px-0'`. Resultado: 32px de ancho útil sacrificados antes de
pintar la lista.

### Cambio canónico

Mount lateral reducido a 4px:

```html
<div data-recovery-root="..." style="margin: 0 4px 8px 4px;"></div>
```

- Libera **24px** de ancho útil real (12px cada lado).
- Mantiene 4px de respiro contra las esquinas redondeadas del popup
  (`border-radius: 12px`).
- Resto de bloques editoriales (prosa, ratings, breadcrumb) conserva
  su carril de 16px porque son contenido de lectura.

### Invariantes

- Solo el mount del recovery block cambia. NO se toca:
  `UnenrichedRecoveryBlock`, `NearbyPanel`, `NearbyResultCard`,
  niveles POI, lógica de curación, shell, hero, breadcrumb, ratings,
  footer canónico, variantes `dialog`/`sidebar`/`card`.
- `.leaflet-popup-content` permanece a `margin: 0` sin padding
  (LocationMap.tsx) — no se añade carril compensatorio en el shell.

### Hook de test

`src/test/popup-poi-1b-recovery-mount-margin.test.ts` verifica el
string canónico del mount y bloquea la regresión a `16px`.

## P-POI-CURATION-2.8 — Buscador inline materializado

Refuerzo de affordance sobre el input introducido en 2.7. El buscador
permanece en el header del `NearbyPanel` inline, pero pasa de underline
minimalista a campo materializado discreto para que se reconozca como
herramienta de refinamiento y no como metadata.

### Reglas canónicas

- Wrapper del input (único en POI-1b con `data-nearby-search-input`):
  - `h-7`, `px-2`, `rounded-md`.
  - `bg-muted/40`, `border border-border/50`.
  - `focus-within:border-primary/60 focus-within:bg-background`.
  - Margins: `mx-1 mt-2.5 mb-1` (separa del slider Radio y de la lista).
- Icono `Search` a `w-3.5 h-3.5 text-muted-foreground` (no `/60`).
- Input: `text-[12px]`, `placeholder:text-muted-foreground/70`,
  `bg-transparent`, sin `border` propio (ya lo aporta el wrapper).
- Placeholder canónico: `"Buscar otro punto cercano…"`.
- Botón clear `×`: `h-5 w-5 rounded`, visible solo con query.

### Excepción justificada a flat surface (2.4)

El input es la **única** materialización con caja dentro del header del
bloque inline. Justificación: affordance de control activo (no sub-card
editorial). El resto del bloque (current-point, mismatch banner, lista,
footer) conserva la flat surface.

### Fuera de alcance

Sticky positioning del input, footer fijo del popup, shell, hero,
breadcrumb, ratings, niveles POI, lógica de curación, marker grammar,
variantes `dialog`/`sidebar`/`card`, P-POI-CURATION-3.x.

## P-POI-CURATION-2.9 — Jerarquía del buscador dentro del header

Ajuste fino sobre 2.8: el input se leía como sub-elemento del slider de
Radio. 2.9 le da presencia vertical, contraste y un separador propio para
que el bloque se lea como **tres pasos secuenciales**:
`Radio → Buscar/refinar → Resultados`.

No mueve el input de sitio, no añade sticky, no toca lógica.

### Reglas canónicas (sobreescriben 2.8 en los valores que cambian)

- Wrapper exterior del input (separación del slider): `mt-3 pt-3 border-t border-border/30`. **No** introduce caja: sin background, sin radius.
- Caja del input (`data-nearby-search-input`):
  - Altura `h-8` (antes `h-7`).
  - Padding `px-2.5` (antes `px-2`), `gap-2` (antes `gap-1.5`).
  - `rounded-md`, `bg-muted/60` (antes `/40`), `border border-border/70` (antes `/50`).
  - `focus-within:border-primary/60 focus-within:bg-background` (sin cambios).
  - Sin `mx`/`mt`/`mb` propios: el wrapper exterior define la separación.
- Icono `Search` a `w-4 h-4` (antes `w-3.5 h-3.5`).
- Input: `text-[13px]` (antes `text-[12px]`), `placeholder:text-muted-foreground/70`.
- Botón clear `×`: `h-6 w-6 rounded`, `text-[14px]` (antes `h-5 w-5 text-[12px]`).
- Bloque del slider Radio compactado para reducir tensión visual:
  - Header sin `space-y-1`, `pt-2 pb-2.5` (antes `py-2`).
  - Label `Radio`: `text-[11px] uppercase tracking-wide text-muted-foreground/80` (meta-label).
  - Valor `{radius}m`: `text-[10px] text-muted-foreground tabular-nums` (dato secundario, sin `font-medium`).
  - Slider sin `pt-1` redundante.

### Anti-regresiones (tests `popup-poi-1b-manual-search.test.ts`)

- `data-nearby-search-input` debe contener `h-8`, `px-2.5`, `bg-muted/60`,
  `border-border/70`, `text-[13px]`, `w-4 h-4` (icono).
- No debe contener `h-7`, `bg-muted/40`, `rounded-lg`.
- El source debe matchear `mt-3 pt-3 border-t border-border/30` justo
  antes del wrapper `data-nearby-search-input`.

### Fuera de alcance

Sticky, footer fijo del popup, shell, hero, breadcrumb, ratings, niveles
POI, lógica de curación, lógica de búsqueda (debounce/filtrado), marker
grammar, variantes `dialog`/`sidebar`/`card`, P-POI-CURATION-3.x.

