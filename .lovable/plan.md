# Popup Inventory + UX Contract Audit — plan de discovery

Sólo discovery/documentación. Cero código, cero refactor, cero cambios de UI/cámara/subset-fit/marker grammar.

## Entregable

**Crear**: `docs/popups/poi-popup-inventory.md` (documento nuevo, único archivo a tocar).

## Alcance del análisis

Auditar los puntos confirmados que generan o intervienen en popups de POI:

```text
src/components/map/map-popups.ts            (1201 LOC, generador HTML principal)
src/components/map/map-popup-handlers.ts    (457 LOC, notes/photo updated handlers)
src/components/map/popup-recovery-mount.ts  (116 LOC, mount React dentro de popup)
src/components/map/map-v2-renderer.ts       (bindPopup paralelo V2)
src/components/map/map-photo-layer.ts       (createPhotoPopup — fotos OneDrive)
src/components/map/useEnrichmentTracker.ts  (flyTo + openPopup tras enriquecer)
src/components/LocationMap.tsx              (3 sitios bindPopup + 5 setPopupContent + openPopup)
src/components/CollectionFocusView.tsx      (setFocusedLocation → openPopup)
src/domains/content/hooks/use-popup-actions.ts        (647 LOC, action wiring)
src/domains/content/lib/nearby-popup-context.ts       (registro contexto cercano)
src/domains/content/components/UnenrichedRecoveryBlock.tsx (664 LOC, inline recovery)
src/domains/content/components/PointContextActions.tsx    (1028 LOC, acciones inline)
```

Cualquier surface adicional que aparezca durante la exploración se añade al inventario.

## Estructura del documento

### 1. Resumen ejecutivo
- Conteo total de popups distintos detectados.
- Conteo de generadores (HTML string vs React mount vs híbrido).
- Top 3 violaciones de contrato más graves.
- Top 3 quick wins.

### 2. Inventario por variante
Una entrada por variante de popup detectada. Mínimo esperado (a confirmar durante exploración):

- POI propio enriched
- POI propio imported (sin IA)
- POI propio empty (sin descripción ni IA)
- POI seguido (`isOwn=false`, ownerName)
- POI de curator/druid (`isCuratorPoint=true`) — verificar si sobrevive tras "Curators & Druids REMOVED"
- POI de catálogo común
- POI workspace / admin edit (warning de admin)
- Photo popup (OneDrive, `map-photo-layer.ts`)
- Home marker popup (`LocationMap.tsx:1206`)
- V2 renderer popup (`map-v2-renderer.ts:83`)
- Popup con `UnenrichedRecoveryBlock` montado (recovery inline)
- Popup con `<NearbyPanel variant="inline">` (contexto cercano inline)
- Popup con barra de progreso de enrichment (`progressBarHtml`)
- Popup con bloque de health (si aparece — verificar)

Por cada variante:

| Campo | Contenido |
|---|---|
| Nombre | etiqueta canónica |
| Archivo + símbolo | ruta + función/línea |
| Condición de activación | flags, ownership, visualState, source |
| Datos consumidos | `GeoLocation`, `enrichedData`, `customData`, `ownership`, criterios |
| Acciones visibles | botones, `data-action`, handlers |
| Estados visuales | colores, gradientes, badges |
| Estados health/enrichment | rings, status bar, badges de criterio |
| Superficie técnica | Leaflet popup HTML string / React mount / inline contextual / dialog |
| Mezcla visual+dominio+acciones | sí/no + ejemplos concretos |
| Cierre | vector(es): outside, esc, action, programático |
| Focus/camera disparados | `flyTo`, `openPopup`, `setFocusedLocation`, `requestSubsetFit` |
| Duplicación | qué bloques se repiten en otras variantes |
| Violaciones de contrato | citando contrato afectado |
| Mapping a primitives | `ContextualSurface`/`OverlaySurface`/`StatusSurface`/`FocusEmitter`/`ObservableAction`/`DismissibleSurface` |

### 3. Generadores
- `createPopupContent()` — generador HTML string monolítico (~786 LOC).
- `buildCollectionChipsPlaceholder`, `buildPersonalTagsBlock`, `buildSourceHashtagsBlock`, `buildImageSection` — builders auxiliares HTML.
- `popup-recovery-mount.ts` — mount React imperativo dentro del DOM del popup tras `setPopupContent`.
- `map-popup-handlers.ts` — re-render handlers (`notes-updated`, `photo-updated`) que llaman `setPopupContent` + `openPopup`.
- Diagrama de quién dispara `setPopupContent` (al menos 8 call sites detectados en `LocationMap.tsx`).

### 4. Problemas de UI detectados
- Estilos inline con hex hardcodeados (`#dbeafe`, `#8b5cf6`, `#fef3c7`…) — violan design tokens.
- Tres familias de "Mi punto vs De X" badges con colores divergentes.
- SVG icons inline (violación de la regla Core "No Emojis / SVG via icon-utils").
- Estado "Sin ficha IA / Sin procesar / Pendiente actualizar / Completado" definido en `statusLabels` local — no comparte fuente con marker palette canónica.

### 5. Problemas de arquitectura
- Generación dual: HTML string + mount React imperativo en el mismo popup (frágil).
- Lógica de dominio (`canEnrich`, `isCuratorPoint`, `visitRelevance`) mezclada con generación visual.
- Re-render del popup en múltiples call sites de `LocationMap.tsx` sin abstracción común.
- Trigger de `openPopup` desde `useEnrichmentTracker`, `CollectionFocusView`, handlers y `LocationMap` → 4 caminos de apertura.
- Persistencia del popup ante rebuilds gestionada por `popup-persist-on-rebuild` rule + `viewport-culling` keep-always + `popup-recovery-mount` (tres mecanismos coexistiendo).

### 6. Duplicidades concretas
- `formatRegistrationDate` (local) vs helpers existentes de fecha.
- Badge de ownership replicado entre popup, sidebar y marker tooltip.
- Status bar gradient (`statusInfo.gradient`) replica visual de health rings sin compartir helper.
- Admin warning HTML replicado parcialmente en `PointContextActions.tsx`.
- Photo popup (`map-photo-layer.ts`) y POI popup no comparten shell.

### 7. Violaciones de contrato (referenciadas)
Por cada item: contrato citado + dónde se viola.
- `popup-contract.md` — formato y secciones canónicas
- `popup-matrix-rule` — matriz de estados
- `popup-collapsible-sections`, `popup-dimensions-and-scrolling`
- `popup-persist-on-rebuild`
- `contexto-cercano-inline` (Core rule)
- `unenriched-waypoint-click-behavior`
- `marker-palette` (3 estados únicos)
- `poi-icon-single-source-of-truth`
- Política de tokens (design system v1)

### 8. Mapping preliminar a primitives
Tabla "variante → primitives recomendados", sin prescribir API:
- POI popup base → `ContextualSurface` (entity-bound) + `OverlaySurface` (non-modal anchored).
- Status bar / badges / rings dentro del popup → `StatusSurface` (read-only).
- Botones de acción (enrich, edit, delete, add-to-collection) → `ObservableAction` con `opId`.
- `flyTo + openPopup` post-enrichment → `FocusEmitter` (no llamar Leaflet directo).
- Progress bar inline → `BlockingOperation` feedback bound al popup.
- Photo popup → mismo `OverlaySurface` shell, distinto `ContextualSurface` body.

### 9. Riesgos
- Refactor de `createPopupContent` toca rendering crítico de mapa (zona peligrosa).
- `popup-recovery-mount.ts` depende de timing de `setPopupContent` — cualquier unificación rompe el contrato `popup-persist-on-rebuild` si no se preserva.
- 8+ call sites de `setPopupContent` requieren migración coordinada.
- Interacción con `viewport-culling` keep-always set.

### 10. Quick wins (no implementar — sólo listar)
- Extraer tokens hardcodeados a CSS vars del design system.
- Reemplazar SVG inline por referencias al icon library.
- Centralizar `formatRegistrationDate`.
- Reemplazar tres mecanismos de re-render por un único `refreshPopup(locationId)` helper (futuro).
- Eliminar rama `isCuratorPoint` si "Curators removed" ya es definitivo (verificar).

### 11. Plan preliminar de unificación (sin compromiso)
Fases sugeridas, cada una requeriría su propio **Migration Impact Check** según `docs/contracts/canon-change-policy.md`:
1. Tokenización visual (quick wins).
2. Extraer status/badges a `StatusSurface` puro.
3. Centralizar apertura/refresh detrás de `FocusEmitter` + helper único.
4. Migrar body a `ContextualSurface` React, manteniendo Leaflet popup como `OverlaySurface` shell.
5. Unificar photo popup bajo el mismo shell.

### 12. Deuda explícita y open questions
- ¿`isCuratorPoint` está realmente muerto?
- ¿`map-v2-renderer.ts` popup convive o sustituye a `map-popups.ts`?
- ¿Hay popups de POI fuera del mapa (sidebars, focus views) que deban entrar en el inventario?

## Restricciones honradas
- No implementar, no mover archivos, no cambiar UI.
- No tocar cámara, subset-fit, marker grammar, kernel, Pilot 2, specs, assertions.
- Sólo lectura del código + producción del documento.

## Archivos
- **Crear**: `docs/popups/poi-popup-inventory.md`
- **Editar**: ninguno
