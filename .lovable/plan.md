## Plan — POI Maturity Diagnostics Overlay (v1.2.18, admin-gated, OFF por defecto)

### Resumen

Capa diagnóstica que pinta un badge numérico POI-0…POI-10 sobre cada POI **propio** del mapa, activable por un toggle visible **únicamente** a usuarios con capability `view_audit_log` (cualquier admin o master ya la tiene). OFF por defecto. Cero impacto en el renderer canónico de markers.

### Restricciones que respeta

- NO toca `createCustomIcon`, `resolvePoiVisualGrammar`, `getPoiCurationLevel`, `levelKey` (PR-MAP-CANON-3).
- NO toca paleta enriched/imported/empty, health rings, collection tints, identidad cromática de seguidos.
- NO toca datos, RLS, edge functions, migraciones.
- NO re-enrich.
- NO visible al usuario normal: gate por capability.
- OFF por defecto incluso para admins; opt-in explícito por sesión.

### Cómo se ve

- Toggle "Diagnóstico POI-N" en `FloatingToolbar`, sólo renderizado si `useCapability('view_audit_log') === true`. Icono Lucide (`Gauge`). Estado persistido en `localStorage` clave `lovable:diagnostics:poi-maturity` (boolean).
- Cuando ON: por cada POI propio visible (`paletteScope === 'state'`, `renderMode ∈ {standard, rich}`, z≥9), aparece un chip circular 16×16 px anclado al mismo lat/lng con offset `+10,-10` desde el centro del marker.
  - Texto: `0`…`10`, peso bold, color blanco con text-shadow para contraste.
  - Fondo: color del grupo de madurez según `docs/contracts/poi-maturity-visual-contract.md`, leído desde nuevos tokens `poi.maturity.{0..10}`.
  - `pointer-events: none` y `interactive: false` en el `L.divIcon` → no roba clic ni cursor al marker, no abre popup, no participa en selección.
- Leyenda flotante plegable bottom-left cuando el toggle está ON: lista los 11 niveles con su color y nombre corto del contrato. Cerrable; estado en localStorage.

### Archivos a tocar

**Nuevos:**

- `src/design-system/tokens/source/poi.json` → añadir bloque `poi.maturity.{0..10}` (11 entradas HSL alineadas con el contrato visual: 0=rojo, 1/2=gris cálido, 3=rojo intenso, 4=naranja, 5=ámbar, 6=amarillo, 7=lima, 8=verde claro, 9=verde, 10=verde intenso). NO toca `poi.level.*`. Tras edición, `npm run tokens:build` regenera `src/design-system/tokens/index.ts` automáticamente.
- `src/shared/diagnostics/poi-maturity-overlay.ts` → helpers puros:
  - `shouldRenderMaturityBadge(args): boolean` (gates: toggle ON, paletteScope==='state', renderMode∈{standard,rich}, viewer present).
  - `resolveMaturityBadgeStyle(level): { bg, label }` (lectura de tokens).
- `src/hooks/use-poi-maturity-diagnostics.ts` → estado del toggle (localStorage + listener de evento global `lovable:diagnostics:poi-maturity-changed`), expone `{enabled, setEnabled}`. Internamente combina con `useCapability('view_audit_log')` — si no hay capability, `enabled` siempre devuelve `false` (defensa en profundidad).
- `src/components/map/MaturityBadgeLayer.tsx` → componente React-Leaflet (`useMap()` + `L.layerGroup`) que:
  - Itera `markerLocations` (mismo subset que `LocationMap` ya calcula, filtrado por viewport culling v1).
  - Para cada POI que pasa `shouldRenderMaturityBadge`, calcula `computePoiMaturity(loc)` y monta un `L.marker` con `divIcon` interactivo=false y `zIndexOffset` por debajo de popups abiertos.
  - Listener a `lovable:diagnostics:poi-maturity-changed` y a cambios de zoom para re-render.
  - Cleanup al desmontar.
- `src/components/map/MaturityLegend.tsx` → leyenda plegable con la tabla del contrato.
- `src/lib/global-events.ts` → añadir tipo `'lovable:diagnostics:poi-maturity-changed'` (void payload) al map de eventos.
- Tests: `src/test/poi-maturity-overlay.test.ts` — cubre `shouldRenderMaturityBadge` (toggle off, paletteScope!=='state', renderMode=='micro'/'compact', sin viewer) y `resolveMaturityBadgeStyle` (los 11 niveles devuelven token válido).

**Tocados (cambios aditivos mínimos):**

- `src/components/map/FloatingToolbar.tsx` → import + render condicional del toggle dentro del bloque ya existente de toggles, envuelto en `{canViewAudit && (...)}`.
- `src/components/map/LocationMap.tsx` → un único `{maturityOverlayEnabled && <MaturityBadgeLayer locations={markerLocations} viewerUid={viewerUid} renderMode={renderMode} />}` cerca del resto de capas hijas. Sin tocar nada más.

**NO se tocan:**

`createCustomIcon`, `resolvePoiVisualGrammar`, `getPoiCurationLevel`, `getPointVisualState`, `getPointHealthRings`, `levelVisual`, `marker-grammar.ts`, `applyLayerVisibility`, collection-tint, identity-allocator, owner-identity-store, schema, RLS, edge functions.

### Gating exacto

- Capability: `view_audit_log` (ya existente, admin+master). NO se crea capability nueva.
- Tres líneas de defensa:
  1. `FloatingToolbar` no renderiza el toggle sin la capability.
  2. `use-poi-maturity-diagnostics` devuelve `enabled=false` si la capability falta, aunque haya valor `true` en localStorage de una sesión previa con permisos.
  3. `MaturityBadgeLayer` lee `enabled` del hook; sin él no monta nada.
- Sin la capability, el código de overlay nunca se ejecuta y el bundle apenas crece (componentes tree-shakeables tras `enabled=false`).

### Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Saturación visual a zoom alto (badge + marker + rings + tint) | Badge sólo en `standard/rich` (z≥9); chip 16px; gate por capability; OFF por defecto. |
| Confusión con colores actuales del marker | Leyenda siempre visible cuando ON; badge claramente externo al SVG del marker; tokens nuevos `poi.maturity.*` distintos de `poi.level.*`. |
| Performance con catálogos grandes | Reusa `markerLocations` (ya respeta culling); `L.layerGroup` único, no recrea por pan; cleanup determinista al desmontar. |
| Subset-fit o cámara movida sin querer | El layer no toca subset-fit ni emite `requestSubsetFit`. Sólo añade markers visuales. |
| Followed/app/source recibiendo badge | `shouldRenderMaturityBadge` exige `paletteScope==='state'`. Contract test verifica que followed/app/source nunca reciben badge. |
| Drift con `levelKey` PR-MAP-CANON-3 | El contrato visual ya documenta convivencia. Ambas señales coexisten ortogonales; ningún test asume implicación entre `computePoiMaturity` y `getPoiCurationLevel.level`. |
| Permisos cambian en runtime (admin → editor) | Hook reevalúa capability; el overlay desaparece al instante. |
| Bundle crece para usuarios sin capability | Imports estáticos pequeños; componentes condicionalmente montados; impacto cliente despreciable. |

### Por qué es debug y no feature de producto

- Es señal analítica para auditar la salud del catálogo antes de operaciones masivas (B5 y siguientes).
- El contrato visual canónico del marker sigue siendo enriched/imported/empty + `levelKey`. POI-N es complemento, no sustituto.
- Admin-only mantiene la superficie limpia para usuarios normales y deja la herramienta donde sí aporta valor: revisión y planificación.

### Verificación previa antes de mergear

1. `bunx vitest run poi-maturity-overlay` verde.
2. `bunx vitest run poi-maturity` sigue verde (helper canónico no tocado).
3. Toggle invisible en sesión de usuario sin capability (QA manual rápido).
4. Con toggle ON en sesión admin: badges aparecen sobre POIs propios en z≥9; followed/app/source siguen sin badge; popups, selección, drag y hover del marker funcionan idénticos a antes (badge no captura eventos).
5. Toggle OFF: cero rastro visual ni en DOM ni en consola.

### Version impact

`patch`: 1.2.17 → 1.2.18.

Bumps:

- `package.json`
- `src/lib/app-version.ts`
- `README.md` (entrada changelog)
- `docs/releases/version-history.md` (árbol + anchor v1.2.18)

Cero migraciones, cero datos, cero re-enrich, cero edge functions.

### Orden de ejecución cuando se apruebe

1. Tokens `poi.maturity.{0..10}` + regen (`tokens:build` auto en `predev/prebuild`).
2. Helper `poi-maturity-overlay.ts` + test.
3. Tipo de evento global + hook `use-poi-maturity-diagnostics`.
4. `MaturityBadgeLayer` + `MaturityLegend`.
5. Toggle en `FloatingToolbar` (gated).
6. Montaje condicional en `LocationMap` (1 línea).
7. Bump versión + changelog + version-history.
8. Run vitest completo para confirmar no-regresión.
