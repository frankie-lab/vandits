# Known Dangerous Areas

Zonas del código donde una modificación inocente ha causado regresiones históricas. **Leer esta página antes de tocar cualquiera de estos archivos**.

Cada zona declara: qué NO romper, qué invariantes dependen de ahí, regresiones históricas conocidas.

---

## 1. `src/components/LocationMap.tsx` (archivo monolítico)
**Tamaño**: ~2500+ líneas. Contiene listeners globales, reconciliación de markers, popup lifecycle, subset-fit listener, viewport culling, owner identity.

**Qué no romper**:
- Listeners globales con dep `[]` (popupclose, subset-fit, collection-visibility, owner-identity-updated). Añadir deps reactivas re-creará listeners y duplicará handlers.
- Comentarios normativos (L.1801-1803) prohibiendo `marker.on('popupclose')` per-marker.
- `openPopupLocationId` como `useState` local — NO promover al store sin ADR.

**Invariantes dependientes**: popup-contract #1-3, focus-selection-contract #2, subset-fit-contract #1, visibility-contract.

**Regresiones históricas**:
- BL-001: stale closures per-marker.
- BL-003: cooldown bloqueando `mode:'always'`.
- Múltiples deps lists rotas en historiales viejos.

**Backlog**: BL-002, BL-011.

---

## 2. Subset-fit listener (`LocationMap.tsx` L.2335-2491)
**Qué no romper**:
- Bypass de cooldown para `mode:'always'` (guard L.2357 con negación explícita).
- Prioridad de `detail.coords` sobre `markersRef`.
- Cleanup `removeEventListener` (L.2491).
- Clamp z12 (`FIT_CLAMP_ZOOM`).

**Invariantes dependientes**: subset-fit-contract #1, #2, #3, #5.

**Regresiones históricas**:
- BL-003: condición de cooldown sin distinguir modos.
- BL-004: fits parciales por culling cuando caller no pasaba coords.

---

## 3. `popupclose` flow (`LocationMap.tsx` L.1436-1446 + reconciliación L.1660-1714)
**Qué no romper**:
- Único `map.on('popupclose')`.
- `keepIds = focusedLocationId ∪ openPopupLocationId` (L.1616-1618). NO añadir `selectedLocations` aquí.
- `preservedId` en reconciliación (L.1662) garantiza que el marker no se desmonta mientras está abierto.

**Invariantes dependientes**: popup-contract #1-3.

**Regresiones históricas**: BL-001.

---

## 4. Viewport culling (`applyViewportCulling` + `getLocationSubsetSignature`)
**Qué no romper**:
- `filteredLocations ⊇ markerLocations` siempre.
- En z<7 sin culling.
- Signature determinista (mismo subset → mismo string).

**Invariantes dependientes**: visibility-contract #1, subset-fit-contract #5.

**Regresiones históricas**:
- BL-004: cualquier consola que asuma "markers montados == subset" rompe el fit.

---

## 5. FilterBar ↔ popover Mis POI sync
**Qué no romper**:
- Popover SIEMPRE fuerza `ownershipFilter='mine'`.
- Mutua exclusión `visualState` ↔ `healthFilter` dentro del popover.
- FilterBar NO toca `ownershipFilter='mine'` (es decisión del popover).
- `MyCatalogQuickFilters` emite `lovable:my-catalog-popover-applied`; el listener del fit está montado UNA vez en `FloatingToolbar`.

**Invariantes dependientes**: filter-axis-contract #1, #4.

**Regresiones históricas**:
- ADR-0007: ownership ambiguo de visualState entre FilterBar y popover.

---

## 6. Listeners globales `window.addEventListener`
Activos hoy:
| Evento | Owner | Cleanup | Riesgo |
|---|---|---|---|
| `subset-fit-bounds-request` | `LocationMap` | sí | duplicación si se añaden deps |
| `lovable:my-catalog-popover-applied` | `useMyCatalogPopoverFit` (en `FloatingToolbar`) | sí | doble mount de `FloatingToolbar` |
| `lovable:owner-identity-updated` | `LocationMap` + `UsersSidebar` | sí | doble registro intencional (justificado en duplicate-listeners H3) |
| `COLLECTION_VISIBILITY_EVENT` | `LocationMap` | sí | — |
| `COLLECTION_FIT_BOUNDS_EVENT` | `LocationMap` | sí | — |

**Qué no romper**:
- Cualquier nuevo `addEventListener` requiere `removeEventListener` en cleanup.
- No registrar el mismo evento desde dos componentes salvo que esté justificado.

**Backlog**: BL-002, BL-012.

---

## 7. `applyLayerVisibility` + zoom gates + `bypassZoomGates`
**Qué no romper**:
- Orden: zoom gates ANTES de `entityHidden` y `minVisibilityZooms`.
- `bypassZoomGates: true` ÚNICAMENTE cuando `filterByUserId` está set.
- Capas `app`/`source` son padres globales con `entityHidden: id[]` — NO crear capa por entidad.

**Invariantes dependientes**: visibility-contract.

---

## 8. Owner identity allocator (`src/lib/color/identity-allocator.ts`)
**Qué no romper**:
- Dos exclusiones cromáticas duras: verdes (hue 85°-175° + ΔE<25 vs ancla enriched) y grises (C<0.16).
- Identidad solo a `followStatus === 'accepted'`.
- Sidebar NO inventa OKLCH si no hay color cargado.

**Invariantes dependientes**: marker-grammar-contract #4.

**Regresiones históricas**: identidades cayendo en verde "enriched" o en grises desaturados (versiones v1-v2.5 purgadas).

---

## 9. `useLocationsStore` (zustand)
**Qué no romper**:
- Setters únicos para `selectedLocations` y `focusedLocationId`.
- Reset atómico al cambiar `viewMode`/`documentId` (L.241-254).
- Limpieza de selección al eliminarse locations (L.196-205).

**Invariantes dependientes**: focus-selection-contract.

---

## Regla general

**Si vas a tocar un archivo listado aquí**:
1. Lee el contrato relacionado en `docs/contracts/`.
2. Lee la entrada de timeline correspondiente.
3. Si tu cambio modifica una invariante → ADR nuevo obligatorio.
4. Actualiza esta página si introduces una nueva regresión histórica.
