# Health Workflow Split — PR-3A (Contextual CTA + Preview, sin escritura)

Sólo PR-3A. Cierra el bucle "detectar → previsualizar" desde el mapa con scope estricto y guardarraíles. **Cero escrituras en BD. Cero cambios en Back Office.**

## Principios (duros)

```
Mapa       = previsualización local sobre subconjunto seguro
Backoffice = sin cambios en este PR
```

- Scope **nunca** usa `markerLocations` (viewport culling) salvo opt-in explícito.
- Sin `healthFilter` activo → CTA no se renderiza.
- Selección manual no vacía → tiene prioridad sobre filtered.
- "Sólo visibles" es **opt-in explícito** (toggle off por defecto).
- `review` abre panel manual, no modal de reparación.
- Ninguna acción escribe en BD.

---

## Alcance PR-3A

### 1. Helper único de scope

`src/domains/discovery/lib/health-filter-scope.ts`

```ts
type ScopeMode = 'filtered' | 'selection' | 'viewport';

interface HealthScopeCtx {
  filteredLocations: Location[];   // verdad lógica del filtro
  selectedLocations: Location[];   // selección manual
  visibleLocations: Location[];    // viewport (sólo si modo='viewport')
  healthFilter: HealthFilterValue; // partial | chain | review | hardError | null
  onlyVisible: boolean;            // toggle opt-in del CTA
}

getHealthFilterScopeIds(ctx): { ids: string[]; total: number; mode: ScopeMode }
```

Resolución de modo (precedencia):
1. `selectedLocations.length > 0` → `mode='selection'`, ids = selección ∩ filtered.
2. `onlyVisible === true` → `mode='viewport'`, ids = visible ∩ filtered.
3. default → `mode='filtered'`, ids = filteredLocations cuyo `getPointHealthRings(loc)` contenga `healthFilter`.
4. Sin `healthFilter` → `{ ids: [], total: 0 }`, CTA oculto.

Tests (`src/test/health-filter-scope.test.ts`):
- precedencia selection > viewport > filtered
- viewport requiere opt-in
- verde nunca entra en review/hardError (consecuencia del helper)
- sin healthFilter → ids vacíos

### 2. CTA contextual en FilterBar

`src/components/discovery/HealthFilterActionCTA.tsx`

- Sólo se renderiza si hay `healthFilter` activo.
- Etiqueta + contador del subconjunto: `Reparar cadenas (47)`.
- Toggle adyacente "Sólo visibles" (off por defecto). Se oculta si hay selección manual no vacía (la selección manda).
- Tabla de mapeo (riesgo declarado, no ejecutado en este PR):

| Filtro       | Etiqueta CTA      | Acción al click (PR-3A)      | Riesgo  |
|--------------|-------------------|------------------------------|---------|
| `partial`    | Rellenar huecos   | abrir HealthRepairPreviewDialog | bajo    |
| `chain`      | Reparar cadenas   | abrir HealthRepairPreviewDialog | medio   |
| `hardError`  | Reintentar        | abrir HealthRepairPreviewDialog | bajo    |
| `review`     | Abrir revisión    | abrir UnenrichedRecoveryBlock (manual) | manual |

`review` no abre el preview dialog — abre directamente el panel manual existente.

### 3. Preview modal (sin escritura)

`src/components/discovery/HealthRepairPreviewDialog.tsx`

Contenido:
- Header: verbo + scope (`Reparar cadenas — 47 puntos`).
- Línea de scope: `Modo: filtro activo` / `selección manual` / `sólo visibles` (según `ScopeMode`).
- Lista de los **primeros 10** puntos (nombre + breadcrumb geo + chip de health).
- Total + filtro origen.
- Footer: **únicamente `Cerrar`**. No hay botón de confirmación deshabilitado en este PR — se evita la confusión visual de un CTA inactivo. La acción real llegará en PR-3B.

### 4. Sin cambios en Back Office, sin renaming

- Cero modificaciones en páginas admin.
- Cero modificaciones en memorias salvo añadir nota en `mem://logic/discovery/health-filter-axis` describiendo el CTA, el helper de scope y la regla de precedencia.

### 5. Tests y verificación

- Unit: `health-filter-scope.test.ts` (precedencia, viewport opt-in, casos vacíos).
- Component: render del CTA cuando hay filtro activo, oculto cuando no, contador correcto al alternar `Sólo visibles`, `review` no abre preview.
- Manual QA en `/`: cada filtro de salud abre la superficie correcta; el dialog lista los 10 puntos del scope correcto y no escribe BD.

---

## Detalles técnicos

- Cero cambios en edge functions, RPCs, schema o Back Office.
- Cero cambios visuales en markers/rings/popups.
- CTA: `Button` variant `cta` size `sm`. Toggle "Sólo visibles": variant `filter-chip`.
- Lectura de `filteredLocations`/`selectedLocations`/`visibleLocations` desde `discovery-store` (todos ya disponibles).
- Dialog reutiliza `Dialog` primitive del design system y tokens existentes.

## Diferido (no en este PR)

- **PR-3B**: añadir botón de confirmación + cableado real al job (`geocoding_jobs` con `location_ids`, `batch-enrich` para hardError) + audit log + cancelación.
- **PR-3C**: reetiquetar Back Office a "Mantenimiento geográfico (Admin)" tras medir uso.
- **PR-3D**: unificar naming en toda la app + memoria `mem://logic/health/workflow-split`.

## Condiciones de cierre PR-3A

- [x] Scope nunca usa `markerLocations`.
- [x] Sin `healthFilter` activo no hay CTA.
- [x] Selección manual no vacía tiene prioridad sobre filtered.
- [x] "Sólo visibles" es opt-in explícito.
- [x] `review` abre panel manual, no modal de reparación.
- [x] Ninguna acción escribe en BD.
- [x] Dialog cierra con un único botón `Cerrar` (sin confirm deshabilitado).
