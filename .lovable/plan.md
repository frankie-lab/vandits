

# Plan: Refactor incremental — 4 frentes (revisado)

Ajustes solicitados:
- `use-layer-visibility` queda **fuera** de la limpieza genérica de hooks (es contrato congelado, singleton + event bus).
- `preferencesBus` se trata como **puente temporal**, no destino final (camino futuro: store reactivo).
- Añadimos cobertura específica para `useMarkerSizeConfig` (cache + listeners + DB sync).

---

## Frente 1 — Estructura por dominios

- Auditar `src/hooks/` y `src/store/` (proxies/duplicados de `src/domains/*`).
- Migrar consumidores y eliminar shims:
  - `use-auth.ts` → `@/domains/identity`
  - `use-routes.ts`, `use-route-*.ts` → `@/domains/routes`
  - `use-realtime-locations.ts`, `use-database-sync.ts` → `@/domains/content`
  - `use-social-stats.ts` → `@/domains/social`
  - `store/locations-store.ts` → `@/domains/content/store`
- **Excluido**: `use-layer-visibility.ts` y `use-resolved-map-features.ts` permanecen donde están — son contrato congelado del mapa (singleton `LAYER_VISIBILITY_EVENT`).
- ESLint `no-restricted-imports` para forzar barrels de dominio.
- Mover duplicados de `src/lib/` (`route-engine`, `geocoding`, `duplicate-detection`) a sus dominios con shim temporal.

## Frente 2 — Preferencias con reacción runtime

- `preferencesBus` se mantiene como **puente** entre el sistema actual basado en `window.dispatchEvent` y el destino futuro (store reactivo tipo Zustand/`useSyncExternalStore`). Documentar en JSDoc del propio archivo y en ADR.
- Migrar al sistema `shared/preferences/` los componentes que aún leen `localStorage`/`app_settings` directo:
  - `MapThemeToggle`, `SoundSettingsPanel`, `RouteEngineSettings`, `RoutePreferences`, `MapCenterSettings`.
- `MarkerSizeManager` y `useMarkerSizeConfig` **no migran al bus de preferencias** — siguen siendo Nivel B (config semántica admin) con su propio canal de listeners (`onMarkerSizeConfigChange`). Sí se documentan como tal.
- Verificación: cambiar tema, sonido o motor de ruta desde el panel debe verse sin recargar.

## Frente 3 — Adelgazar `Index.tsx` y separar hooks/store

- Inventariar responsabilidades de `Index.tsx` (paneles, capas, modo, rutas, doc activo, búsqueda, duplicados).
- Extraer:
  - `useDiscoveryPanels()` — completar el orquestador parcial.
  - `useDocumentFocus()` — modo documento.
  - `useGlobalShortcuts()` — atajos.
- Revisar `domains/content/store/locations-store.ts`: posibles slices `selection` / `filters` / `data`.
- Objetivo: `Index.tsx` < ~300 líneas, sin `useEffect` transversales.

## Frente 4 — Auditoría y testing dirigido

Tests unitarios nuevos:
- `preferences-bus.test.ts` — suscripción, optimismo, persistencia (puente actual).
- `domain-boundaries.test.ts` — imports prohibidos.
- `index-composition.test.tsx` — `Index` solo compone.
- **`use-marker-size-config.test.ts`** (nuevo, según ajuste):
  - Cache singleton (`getMarkerSizeConfig` devuelve defaults antes de fetch).
  - `updateMarkerSizeConfig` notifica a todos los listeners.
  - `invalidateMarkerSizeCache` fuerza re-fetch.
  - `onMarkerSizeConfigChange` devuelve unsubscribe funcional.
  - `useMarkerSizeConfig` se re-renderiza al cambiar el cache.

Tests E2E (Playwright ya configurado):
- Cambiar preferencia → cambio visible sin recarga.
- Abrir documento → marcadores conmutan capa.

---

## Orden de ejecución

1. **Frente 1** — estructura (excluyendo `use-layer-visibility`).
2. **Frente 2** — preferencias vía bus-puente.
3. **Frente 3** — adelgazar `Index.tsx`.
4. **Frente 4** — tests (incluido `useMarkerSizeConfig`) en paralelo a cada frente.

## Contratos congelados (NO tocar)

- `marker-grammar.ts`, `marker-validation.ts`, `visual-grammar.ts`.
- `LAYER_VISIBILITY_EVENT` y `use-layer-visibility.ts` (singleton + bus).
- `useMarkerSizeConfig` (canal propio Nivel B).
- Esquema Supabase V2.
- Routing determinista.

## Archivos clave

| Frente | Archivos |
|---|---|
| 1 | `src/hooks/use-{auth,routes,route-*,realtime-locations,database-sync,social-stats}.ts`, `src/store/locations-store.ts`, `eslint.config.js` |
| 2 | `MapThemeToggle.tsx`, `SoundSettingsPanel.tsx`, `RouteEngineSettings.tsx`, `MapCenterSettings.tsx`, `shared/preferences/preferencesBus.ts` (JSDoc puente) |
| 3 | `pages/Index.tsx`, `domains/discovery/components/DiscoveryOrchestrator.tsx`, `domains/content/store/locations-store.ts` |
| 4 | `src/test/preferences-bus.test.ts`, `src/test/domain-boundaries.test.ts`, `src/test/use-marker-size-config.test.ts`, `e2e/preferences-runtime.spec.ts` |

