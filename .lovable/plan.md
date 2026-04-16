

# Plan: Testing + Consola de Auditoría Admin

Dos entregables independientes: testing automatizado externo y consola de auditoría interna.

---

## Carril 1 — Testing Automatizado (externo a la app)

### 1A. Tests unitarios (Vitest) — 4 suites nuevas

**`src/test/layer-visibility.test.ts`**
- `resolveVisibility()` con combinaciones: capa oculta, entidad oculta, zoom insuficiente
- `applyVisibilityFromPanel()` actualiza singleton y emite evento
- Persistencia: toggle -> localStorage refleja el nuevo estado

**`src/test/locations-store.test.ts`**
- `addDocument` / `removeDocument` / `updateLocation` CRUD basico
- `setFilters` preserva filtros persistentes (ownershipFilter, hiddenFollowedUserIds)
- `softDeleteLocation` / `restoreLocation` ciclo completo
- `_cachedAnnotated` se recalcula solo cuando `_docVersion` cambia

**`src/test/parsers.test.ts`**
- KML con rutas y waypoints, GPX con tracks, GeoJSON con features
- CSV con coordenadas en distintos formatos
- Archivos vacios o malformados devuelven resultado vacio sin throw

**`src/test/route-engine.test.ts`**
- Scoring de modos de transporte segun preferencias usuario
- Calculo de distancia haversine
- Deteccion de cruce maritimo (>8km)

### 1B. Tests Deno (edge functions) — 3 funciones criticas

**`supabase/functions/enrich-location/index.test.ts`**
- CORS preflight devuelve 204
- Request sin body devuelve 400
- Request con coordenadas validas devuelve 200 + estructura esperada

**`supabase/functions/calculate-route/index.test.ts`**
- CORS preflight
- Request sin origin/destination devuelve error
- Modo walking con distancia >500km devuelve impossible

**`supabase/functions/batch-geocode/index.test.ts`**
- CORS preflight
- Array vacio devuelve array vacio
- Estructura de respuesta correcta

### 1C. Playwright (infraestructura + 1 spec)

Solo la infraestructura: `playwright.config.ts`, `e2e/auth.spec.ts` (login -> redirect a /), `.github/workflows/e2e.yml`. No ejecutable en sandbox, pero listo para CI.

---

## Carril 2 — Consola de Auditoría Admin (dentro de VANDITS)

### Ubicacion

Nueva pestana `audit` en `AdminPanel.tsx` (tabs existentes: users, permissions, markers, routes, icons, enrichment). Protegida por `isAdmin()` via `usePermissions()`.

### 4 secciones iniciales

**1. Estado resuelto de preferencias**
- Lista todas las unidades registradas (`listUnits()` del registry)
- Para cada unidad: muestra valores resueltos y provenance (`resolveWithProvenance()`)
- Indica scope que gano para cada campo (system, user, device, session)

**2. Traza del ultimo cambio**
- Escucha `onPrefChanged()` del bus y mantiene un log circular (ultimos 20 eventos)
- Muestra: timestamp, unitId, scope, campos cambiados

**3. Comprobacion runtime vs persistencia**
- Boton "Verificar" que para cada unidad:
  - Lee el valor resuelto en memoria (usePreferences)
  - Lee el valor persistido (adapter.load)
  - Compara y marca discrepancias en rojo

**4. Escenarios rapidos**
- 4 botones que aplican un cambio y muestran el resultado:
  - **Theme**: toggle dark/light, verifica `document.documentElement.classList`
  - **Sonido**: toggle global, verifica `areSoundsEnabled()`
  - **Visibilidad**: toggle catalog, verifica singleton via `getSharedLayers()`
  - **Heatmap threshold**: cambia valor, verifica localStorage

Cada boton muestra resultado inline: OK (verde) o FALLO (rojo) con detalle.

### Componente

`src/components/AuditPanel.tsx` — componente independiente renderizado dentro de AdminPanel cuando tab === 'audit'.

---

## Archivos afectados

| Accion | Archivo |
|---|---|
| Crear | `src/test/layer-visibility.test.ts` |
| Crear | `src/test/locations-store.test.ts` |
| Crear | `src/test/parsers.test.ts` |
| Crear | `src/test/route-engine.test.ts` |
| Crear | `supabase/functions/enrich-location/index.test.ts` |
| Crear | `supabase/functions/calculate-route/index.test.ts` |
| Crear | `supabase/functions/batch-geocode/index.test.ts` |
| Crear | `playwright.config.ts` |
| Crear | `e2e/auth.spec.ts` |
| Crear | `.github/workflows/e2e.yml` |
| Crear | `src/components/AuditPanel.tsx` |
| Editar | `src/components/AdminPanel.tsx` (agregar tab 'audit') |

## Orden de ejecucion

1. Tests unitarios Vitest (4 suites)
2. Tests Deno edge functions (3 suites)
3. Consola de Auditoria admin
4. Infraestructura Playwright

