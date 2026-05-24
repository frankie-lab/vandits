# PR-BACKOFFICE-TECHNICAL-SURFACES-IA-PLAN-1

> **Estatus**: diagnóstico documental. No autoriza implementación.
> **Fecha**: 2026-05-19.
> **Fuente base**: `docs/audits/backoffice-discovery-dossier.md`, `src/components/admin/admin-tabs.tsx`, lectura directa de los componentes lazy.
> **Alcance**: 6 surfaces técnicas — `icons`, `markers`, `routes`, `audit`, `design-system`, `internal-tools`.

## 0 — Restricciones (PR documental)

Este PR NO toca:

- `admin-tabs.tsx`, labels, rutas, capabilities, domains, `routeMode`, componentes.
- runtime, backend, edge functions, schema, RLS, app_settings.
- ningún panel, hook, helper o test.

No mueve tabs. No fusiona código. No renombra capabilities ni archivos. Toda recomendación es **diagnóstico**, no autorización.

## 1 — Vocabulario cerrado

### 1.1 Recomendaciones (`recommendation`)

`KEEP_TOP_LEVEL` · `MOVE_ADVANCED` · `MOVE_DEVTOOLS` · `MERGE` · `RENAME` · `NEEDS_DECISION`

Convención: cuando se usa `MERGE`, el `reason` DEBE incluir la frase *"diagnostic only, no execution authorized"*. La fusión real requiere un PR separado (`PR-BACKOFFICE-APPEARANCE-MERGE-PLAN` sugerido, no autorizado aquí).

### 1.2 `management_value`

Valor de la surface desde la óptica de un operador de gestión real (no sólo "¿es útil para algún humano?"):

- `HIGH` — gestión master que cambia comportamiento crítico del producto.
- `MEDIUM` — configuración con impacto runtime real pero ámbito acotado.
- `LOW_AS_TOP_LEVEL` — útil, pero no merece ranura top-level del menú.
- `DEV_ONLY` — sólo interesa a desarrollo / debug.
- `UNKNOWN` — evidencia insuficiente para clasificar.

### 1.3 `top_level_policy`

Dónde debería vivir la surface en la IA del BackOffice:

- `keep_visible` — top-level del grupo actual.
- `advanced_group` — bajo un subgrupo plegable "Avanzado" (misma capability, menor prominencia).
- `diagnostics_group` — dentro del dominio `diagnostics` (badge DIAG).
- `devtools_only` — diagnostics restringido master-only, visibilidad revisable.
- `merge_candidate` — candidata a desaparecer absorbida por otra surface.
- `needs_decision` — la evidencia no resuelve la ubicación.

### 1.4 Tres ejes de valor (siempre distinguidos)

Toda ficha distingue de forma explícita:

- **valor runtime** — qué cambia en el producto si se acciona la surface.
- **valor de gestión master** — utilidad para un operador master en operación normal.
- **valor técnico / dev** — utilidad para diagnóstico, debug o desarrollo.

Una surface puede ser `HIGH` en uno y `LOW` en otro. Eso es exactamente lo que el documento quiere visibilizar.

### 1.5 Definición operativa de los baldes destino

- **Gestión master visible** — top-level, sin plegar; cambia comportamiento real del producto y el operador debe llegar en ≤2 clicks.
- **Configuración avanzada** — capability idéntica, pero detrás de un "Avanzado" o subgrupo; misma autoridad, menor ruido.
- **DevTools / Diagnóstico** — dominio `diagnostics` con badge DIAG; no es feature de producto, no se promete estabilidad UX como tal.

---

## 2 — Tabla maestra

| surface | clasif. actual (dossier) | impacto runtime real | clasif. propuesta | recommendation | management_value | top_level_policy | confianza |
|---|---|---|---|---|---|---|---|
| icons | CONFIG simple (`config`) | global: `app_settings.icon_library` propaga a renderer Lucide en toda la app | Apariencia del mapa / app — config visual avanzada | `MERGE` (diagnostic only, no execution authorized) — destino: surface "Apariencia" junto a `markers` | `LOW_AS_TOP_LEVEL` | `merge_candidate` | media |
| markers | CONFIG visual (`config`) | global: tamaños base + estados (normal/selected/focused/recent) + paleta enriched/imported/empty | ADVANCED_CONFIG / visual map configuration · `MASTER_VISIBLE only if merged into Apariencia del mapa` | `KEEP_TOP_LEVEL` (provisional) + `NEEDS_DECISION` sobre merge con `icons` | `MEDIUM` | `keep_visible` (hoy) / `merge_candidate` (si Apariencia se aprueba) | alta |
| routes | HYBRID CONFIG+DIAG (`config`) | mixto: override personal motor rutas (immediate writes) + "Verificar conexiones" (read-only diag a ORS/Duffel/ferry) | ADVANCED_CONFIG para el bloque config + Diagnóstico para "Verificar conexiones" | `KEEP_TOP_LEVEL + NEEDS_DECISION` sobre extraer "Verificar conexiones" a Diagnóstico | `MEDIUM` | `keep_visible` con `needs_decision` para el split DIAG | media |
| audit | DATA read-only (`diagnostics`) | ninguno — inspector de preferencias runtime + trace + sync runtime↔storage | DevTools / Diagnóstico | `KEEP_TOP_LEVEL` (dentro de `diagnostics`) + `RENAME` → "Diagnóstico de preferencias runtime" | `DEV_ONLY` (gestión) / `MEDIUM` (técnico) | `diagnostics_group` | alta |
| design-system | INSPECTOR + DEBUG (`diagnostics`) | mixto: lectura tokens read-only + EditModeBar publica drafts (writes globales que tocan a TODOS los usuarios) | inspector = DevTools; publish/edit = acción global de alto impacto, authority/risk distintos del inspector | `NEEDS_DECISION` (separar conceptualmente Inspector vs Editor/Publish) + `KEEP` provisional en diagnostics | `DEV_ONLY` (inspector) / `HIGH` (publish, por riesgo global) | `diagnostics_group` (inspector) / `needs_decision` (publish) | media |
| internal-tools | DEBUG (`diagnostics`) | one-shot tools (fixtures E2E, purge-user, geocoding tick, canonicalize-admin-areas) | DevTools master-only | `KEEP in diagnostics as DEBUG_ONLY, master-only. Visibility policy can be revisited later.` | `DEV_ONLY` | `devtools_only` | alta |

---

## 3 — Fichas por surface

Plantilla fija: evidencia → impacto runtime → frecuencia → audiencia → solapamientos → propuesta IA → impacto de mover/degradar → riesgo de eliminar → recommendation + reason + evidence_summary.

### 3.1 `icons`

- **evidencia**
  - file: `src/components/IconLibraryManager.tsx`
  - route: `/admin/icons` (modal legacy, `routeMode` por defecto)
  - capability: `manage_icon_library`
  - domain actual: `config` (PR-BACKOFFICE-MENU-ORDER-1: posición 3 del grupo)
  - dossier: §1.A.5, §2 ("DOWNGRADE"), §3.3 ("Jerarquía rota: full page para un único RadioGroup"), §4 (frecuencia "one-shot / <1 min")
- **valor runtime**: global. Cambia `app_settings.icon_library`; propaga a `IconLibraryContext` y a todos los renders Lucide vía `icon-utils.tsx`. Una sola decisión por instalación del producto.
- **valor de gestión master**: bajo. Decisión casi de marca, no de operación.
- **valor técnico/dev**: bajo (no se usa para debug).
- **frecuencia**: one-shot.
- **audiencia**: admin/master, una vez.
- **solapamientos**: con `markers` (ambas viven el eje "Apariencia visual del mapa/app").
- **propuesta IA**: candidata a desaparecer como tab independiente, absorbida por una surface "Apariencia" junto a `markers`. Mientras no exista esa surface, mantenerse donde está.
- **impacto de mover/degradar**: ninguno operativo; se reduce ruido top-level. La capability sobrevive idéntica.
- **riesgo de eliminar**: bajo, pero **no se autoriza eliminación**: la decisión sigue siendo global y debe quedar accesible.
- **recommendation**: `MERGE`
- **reason**: *"diagnostic only, no execution authorized"* — la fusión con `markers` bajo "Apariencia del mapa" debe ejecutarse en un PR separado con su propio diseño de IA.
- **evidence_summary**: 1 `RadioGroup` con N opciones + 1 botón Save; full page sobredimensionada para una única decisión global de marca (dossier §3.3).

### 3.2 `markers`

- **evidencia**
  - file: `src/components/MarkerSizeManager.tsx` (+ `MarkerStateRulesPanel`, `useMarkerSizeConfig`)
  - route: `/admin/markers` (modal legacy)
  - capability: `manage_marker_config`
  - domain actual: `config`
  - dossier: §1.A.3, §2 ("KEEP"), §3.2 (N marker rows, sliders, preview live), §4 (frecuencia "weekly inferred")
- **valor runtime**: global. Escribe sliders base (normal/selected/focused/recent), shape, fill colors y reglas por estado; `updateMarkerSizeConfig` impacta a todo el mapa.
- **valor de gestión master**: medio. Es configuración visual avanzada, no gestión master core (no toca dato, ni autoridad, ni acceso). El operador master "ajusta", no "gestiona".
- **valor técnico/dev**: bajo.
- **frecuencia**: incident-only / refinamiento ocasional.
- **audiencia**: admin/master con criterio visual.
- **solapamientos**: con `icons` (ambas son apariencia del mapa/app); con la paleta canónica de marker states (norma transversal: enriched/imported/empty).
- **propuesta IA**: clasificación honesta = **ADVANCED_CONFIG / visual map configuration**, o bien **MASTER_VISIBLE only if merged into Apariencia del mapa**. Hoy mantiene su slot top-level porque es el panel más sustantivo del grupo `config`.
- **impacto de mover/degradar**: si se mueve a "Avanzado" sin fusión, se gana orden a coste de descubribilidad. Si se fusiona en "Apariencia", se gana coherencia conceptual y se libera `icons`.
- **riesgo de eliminar**: alto — controla parámetros visuales globales con preview live. **No se propone eliminar.**
- **recommendation**: `KEEP_TOP_LEVEL` (provisional) + `NEEDS_DECISION` sobre fusión con `icons`.
- **reason**: hoy es el ancla legítima del grupo `config`; la decisión real es si "Apariencia del mapa" es una surface canónica futura.
- **evidence_summary**: sliders + estados + paleta enriched/imported/empty, todos con efecto global runtime (`EffectBadge×1`, dossier §3.2). Frecuencia y autoridad coinciden más con "configuración avanzada" que con "gestión master core".

### 3.3 `routes`

- **evidencia**
  - file: `src/components/RouteSettingsPanel.tsx` (+ `RouteEngineSettings`)
  - route: `/admin/routes` (modal legacy)
  - capability: `manage_route_engine`
  - domain actual: `config`
  - dossier: §1.A.4, §2 ("HYBRID CONFIG + DIAG", "KEEP (split visual ya canon)"), §3.2 ("2 secciones A/B + Verify"), §4 (frecuencia "incident-only", autoridad "admin/master")
- **valor runtime**: mixto. (a) Override personal del motor de rutas (escribe `EngineConfig` con efecto immediate sobre cálculos ORS/Duffel/ferry). (b) "Verificar conexiones" hace probes read-only a servicios externos (ORS, Duffel, ferry DB) — esto es diagnóstico.
- **valor de gestión master**: medio. Afecta itinerarios reales del usuario cuando se overridea engine config. La parte de "Verificar conexiones" NO es gestión, es diagnóstico.
- **valor técnico/dev**: medio (el bloque verify es útil en incidencia).
- **frecuencia**: incident-only.
- **audiencia**: admin/master ante incidencia de motor.
- **solapamientos**: el bloque verify se parece a una "health check" de proveedores; conceptualmente vive en diagnostics.
- **propuesta IA**: dos posibles destinos:
  1. mantener top-level con split visual interno (status quo, ya canon en dossier §2);
  2. dividir físicamente: config queda en `config`, "Verificar conexiones" pasa a `diagnostics` como surface mínima.
- **impacto de mover/degradar**: si se degrada todo a ADVANCED_CONFIG sin split, se entierra una operación con impacto real en itinerarios. Si se extrae sólo el verify, se gana pureza conceptual sin perder utilidad.
- **riesgo de eliminar**: alto. **No se propone eliminar.**
- **recommendation**: `KEEP_TOP_LEVEL + NEEDS_DECISION` sobre extraer "Verificar conexiones" a `diagnostics`.
- **reason**: la evidencia confirma impacto real en itinerarios (engine override), pero el bloque verify es claramente diagnóstico y no debe contarse como gestión.
- **evidence_summary**: 2 secciones (A: engine, B: service status) en el mismo body; service status×3+ (ORS/Duffel/ferry) con badges de latencia y conectividad — patrón de salud, no de configuración.

### 3.4 `audit`

- **evidencia**
  - file: `src/components/AuditPanel.tsx`
  - route: `/admin/audit` (routeMode `route`)
  - capability: `view_audit_log`
  - domain actual: `diagnostics`
  - dossier: §1.A.10, §2 ("KEEP"), §3.2 ("4 secciones, Refresh, provenance, trace"), §4 ("read-only", autoridad master, frecuencia incident-only)
- **valor runtime**: ninguno (read-only).
- **valor de gestión master**: bajo. No es auditoría administrativa de acciones de usuarios; es introspección del preference-bus runtime (provenance, trace de los últimos 20 eventos, sync memoria↔storage, escenarios de verificación).
- **valor técnico/dev**: medio-alto en incidencia (es la única ventana directa al runtime de `shared/preferences`).
- **frecuencia**: incident-only.
- **audiencia**: master + ingeniería ante regresión de preferencias.
- **solapamientos**: con `internal-tools` (ambos son DevTools), pero distintos: aquí inspección, allí acción.
- **propuesta IA**: mantener en `diagnostics` con rename. El label actual "Auditoría de preferencias" se confunde con un historial administrativo de acciones (qué hizo qué usuario), cosa que **no es**.
- **impacto de mover/degradar**: ninguno; ya vive en diagnostics.
- **riesgo de eliminar**: medio (perder ventana al runtime), bajo en operación normal. **No se propone eliminar.**
- **recommendation**: `KEEP_TOP_LEVEL` (dentro de `diagnostics`) + `RENAME` → **"Diagnóstico de preferencias runtime"**.
- **reason**: "auditoría" implica historial administrativo de acciones; este panel inspecciona el bus de preferencias, no acciones de usuarios. El nuevo nombre alinea el label con la realidad técnica.
- **evidence_summary**: 4 secciones (resolved+provenance, live trace, runtime↔persistence diff, scenarios) — patrón de inspector, no de log administrativo. Imports: `listUnits`, `resolveWithProvenance`, `onPrefChanged`, `defaultAdapter` (todos de `shared/preferences`).

### 3.5 `design-system`

- **evidencia**
  - file: `src/components/admin/DesignSystemPanel.tsx` (+ `HistoryTab`, EditModeBar en `src/design-system/runtime/edit-mode-store.ts`)
  - route: `/admin/design-system` (routeMode `route`)
  - capability: `inspect_design_system` (master-only, PR-HYGIENE-4 rename desde `manage_design_system`)
  - domain actual: `diagnostics`
  - dossier: §1.A.11, §2 ("INSPECTOR + DEBUG", "SPLIT por modo"), §3.2 ("tabs verticales, publish sticky, per-token, filter switches, search, ScrollArea"), §4 ("MEDIUM risk por publish runtime")
- **valor runtime**: **mixto y mal mezclado**.
  - **Inspector**: read-only. Lee tokens (`color`, `typography`, `density`, `motion`, `radius`, `z-index`, `popup`, `map`, `poi`, `elevation`). Sin efecto runtime.
  - **Editor / Publish (EditModeBar)**: **acción global de alto impacto**. Publicar un draft sobreescribe tokens visibles para todos los usuarios. Authority y riesgo son distintos del inspector aunque compartan capability.
- **valor de gestión master**:
  - inspector: bajo (DEV_ONLY).
  - publish: alto, **porque el riesgo es alto**, no porque sea gestión normal.
- **valor técnico/dev**: alto.
- **frecuencia**: incident-only para inspector; raro y deliberado para publish.
- **audiencia**: master + diseño/ingeniería. Publish es operación deliberada, no flujo normal.
- **solapamientos**: con `internal-tools` (ambos DevTools), pero publish es ortogonal a tooling: es edición de runtime.
- **propuesta IA**: la decisión pendiente NO es sólo visual; es de **authority y risk**. Opciones:
  1. mantener todo bajo `inspect_design_system` (status quo): inspector y publish comparten gate, el riesgo recae en confirmaciones internas;
  2. separar conceptualmente — inspector en `diagnostics` y publish detrás de una capability distinta de mayor fricción (typed-token, last-master guard equivalente);
  3. dejar publish fuera del BackOffice como flujo de release deliberado.
  Cualquiera de las tres exige decisión humana; **no se propone aquí**.
- **impacto de mover/degradar**: degradar publish a "acción normal de gestión" sería **incorrecto** dado su alcance global. El inspector puede vivir en diagnostics sin cambios.
- **riesgo de eliminar**: alto (perder inspector valioso + bloquear flujo de tokens). **No se propone eliminar.**
- **recommendation**: `NEEDS_DECISION` (separar Inspector de Editor/Publish) + `KEEP` provisional en `diagnostics`.
- **reason**: hoy una capability single (`inspect_design_system`, master-only) cubre dos operaciones de authority muy distintas. Esta asimetría debe resolverse antes de cualquier rediseño UX.
- **evidence_summary**: imports de tokens read-only (color/typography/density/motion/radius/z-index/popup/map/poi/elevation) coexistiendo con `HistoryTab` y `edit-mode-store` que publica drafts. Dossier §2 lo marca como `SPLIT (por modo)` y §4 como `MEDIUM risk por publish runtime`.

### 3.6 `internal-tools`

- **evidencia**
  - file: `src/components/admin/InternalToolsPanel.tsx`
  - route: `/admin/internal-tools` (routeMode `route`)
  - capability: `run_internal_tooling` (master-only)
  - domain actual: `diagnostics`
  - dossier: §1.A.12, §2 ("KEEP (DEBUG_ONLY)"), §3.2 ("N tool rows, Run+EffectBadge por row"), §4 ("incident-only", master)
- **valor runtime**: variable por tool — fixtures E2E (`create-test-users`), purge-user (delegada al panel de usuarios), `canonicalize-admin-areas` (delegado a `/admin/geography`), `geocoding-job-tick` (cron, sin UI). El panel es índice + ownership UX, no ejecutor exclusivo.
- **valor de gestión master**: bajo. No es operación normal.
- **valor técnico/dev**: alto. Cierra capability huérfana y documenta dónde se invoca cada tool.
- **frecuencia**: incident-only.
- **audiencia**: master + ingeniería.
- **solapamientos**: por diseño, con paneles que "poseen" cada tool (`/admin/users`, `/admin/geography`). El propio panel apunta a ellos.
- **propuesta IA**: mantener en `diagnostics` como DEBUG_ONLY master-only. La política de visibilidad (mostrar siempre vs. ocultar tras un toggle "Modo desarrollo") puede revisarse más adelante; no es decisión de este PR.
- **impacto de mover/degradar**: ninguno operativo si se mantiene la capability y el ownership UX.
- **riesgo de eliminar**: medio — perder el registro central de tools internas y reabrir capability huérfana. **No se propone eliminar.**
- **recommendation**: `KEEP in diagnostics as DEBUG_ONLY, master-only. Visibility policy can be revisited later.`
- **reason**: para un BackOffice de gestión, puede tener sentido que DevTools esté detrás de un modo avanzado aunque conserve capability; esa decisión no se cierra aquí.
- **evidence_summary**: panel-índice de 4 tools con `ownership: panel|inline|cron|here`, cada row con `EffectBadge`. Capability master-only ya canon (RBAC core).

---

## 4 — Reglas IA derivadas

Criterios diagnósticos extraídos de las 6 fichas. NO son cambios, son tests futuros para evaluar nuevas surfaces:

1. **R-1 — Surface trivial ≠ top-level.** Una surface CONFIG con única decisión binaria/radio (caso `icons`) no justifica top-level; debe fusionarse o degradarse.
2. **R-2 — Inspector y publish son cosas distintas.** Una surface que mezcla lectura read-only con acciones de efecto global (caso `design-system`) debe declarar cada modo con su propio `PanelEffectHeader` y, idealmente, su propia capability con fricción proporcional al riesgo.
3. **R-3 — Diagnóstico ≠ auditoría.** Toda surface `diagnostics` debe llevar badge DIAG (ya canon) y un nombre auto-explicativo que no sugiera historial administrativo (caso `audit` → "Diagnóstico de preferencias runtime").
4. **R-4 — Verificación de proveedores es diagnóstico.** Un bloque "Verificar conexiones" embebido en un panel CONFIG (caso `routes`) es candidato natural a vivir en `diagnostics`; su presencia no convierte la surface en CONFIG+DIAG canónico, requiere decisión.
5. **R-5 — Apariencia no es gestión core.** Configuración visual (sliders, paletas, iconografía) es **configuración avanzada**, no gestión master core, aunque sea global.
6. **R-6 — DevTools master-only no se "promueve" a feature.** Las DevTools (`internal-tools`) no migran a flujos de gestión normales por el hecho de ser útiles; mantienen su contrato DEBUG_ONLY y su visibilidad es policy revisable.
7. **R-7 — Cero eliminación sin tres condiciones.** Una surface sólo se elimina si: (a) cero consumidores runtime, (b) capability sin gating de feature crítica, (c) ADR explícito. Ninguna de las 6 cumple las tres → **0 recomendaciones de eliminación** en este PR.

---

## 5 — Resumen ejecutivo

- **0 REMOVE** — ninguna surface se propone eliminar.
- **1 MERGE candidato (diagnostic only, no execution authorized)** — `icons` → "Apariencia del mapa" junto a `markers`.
- **1 RENAME firme** — `audit` → "Diagnóstico de preferencias runtime".
- **1 RENAME condicional** — `markers` puede pasar a "Apariencia del mapa" si la fusión con `icons` se aprueba en un PR separado.
- **2 NEEDS_DECISION** — (a) `routes`: extraer "Verificar conexiones" a `diagnostics`; (b) `design-system`: separar Inspector vs Editor/Publish (authority + risk).
- **2 KEEP estrictos** — `internal-tools` (DEBUG_ONLY master-only, visibility revisable), `routes` (top-level hasta que la decisión del split se cierre).
- **Próximo PR sugerido (no autorizado aquí)** — `PR-BACKOFFICE-APPEARANCE-MERGE-PLAN` para evaluar formalmente la surface "Apariencia del mapa" (icons + markers).
- **Separación clara entre los 3 baldes**:
  - **Gestión master visible**: ninguna de las 6 califica de forma pura. `markers` y `routes` son los más próximos, pero ambos arrastran una dimensión de "configuración avanzada" (markers) o "diagnóstico" (routes).
  - **Configuración avanzada**: `markers` (core), `icons` (trivial), parte CONFIG de `routes`.
  - **DevTools / Diagnóstico**: `audit`, `design-system` (inspector), `internal-tools`, parte DIAG de `routes`.

---

## 6 — Criterios de aceptación cumplidos

- [x] Las 6 surfaces analizadas con bloque de evidencia, recomendación, reason y evidence_summary.
- [x] Tabla maestra con columnas `management_value` y `top_level_policy` añadidas.
- [x] Vocabulario cerrado respetado; `MERGE` etiquetado con *"diagnostic only, no execution authorized"*.
- [x] 0 recomendaciones de eliminación.
- [x] Ninguna surface descrita como "inútil"; se distingue siempre valor runtime / valor de gestión master / valor técnico-dev.
- [x] Toda recomendación fuerte (`KEEP_TOP_LEVEL`, `RENAME`, `MERGE`) lleva `reason` + `evidence_summary`.
- [x] Sin cambios en `admin-tabs.tsx`, labels, rutas, capabilities, domains, `routeMode`, componentes, runtime, backend, schema ni RLS.
- [x] Sin movimientos de tabs ni fusiones de código.
