# Plan canónico aprobado — Servicio de POIs por origen

## 1. Principio

Cada POI atraviesa el pipeline en un orden estricto. **Cada capa decide UNA cosa y nada más.**

```text
raw POI
  → resolvePoiSource          (qué es)
  → resolveShareability       (puede verlo este viewer)
  → apply filterBySource      (filtro activo del usuario)
  → resolveLayerVisibility    (capa activa + mute + zoom gate → opacity/pointer-events)
  → resolveMarkerGrammar      (shape + color + decorations + zIndex)
  → render
```

**Blindajes:**
- `resolveLayerVisibility` **NO** decide shareability — solo capa activa, entity mute y zoom gate.
- `resolveMarkerGrammar` **NO** decide visibilidad — solo apariencia.
- `resolveShareability` **NO** decide forma ni color.

## 2. sourceType

```ts
type PoiSourceType = 'own' | 'followed' | 'app' | 'source';
```

| sourceType | identificación                        | shape               | hashtags                          |
|------------|---------------------------------------|---------------------|-----------------------------------|
| own        | `ownerUid === viewerUid`              | círculo             | `#<username>`                     |
| followed   | owner es uid seguido aceptado         | triángulo invertido | `#<username>`                     |
| app        | flag explícito `sourceKind='app'` + `sourceId='vandits-app'` + `groupId` | rombo | `#vandits-app` + `#<grupo>` |
| source     | `sourceKind='external'` + `sourceId`  | forma de fuente     | `#<fuente>`                       |

**Importante:** `app` se identifica por marcadores explícitos del POI (`sourceKind`, `sourceId`, `groupId`), **nunca** por owner especial. Mezclar identidad de usuario con fuente de sistema es la fuente de bugs que estamos quitando.

## 3. Reglas por origen

### own — círculo, workspace operativo
- Todos los estados visibles para el owner
- Health rings + collection tint
- Reparable/enriquecible/editable
- Compartibles solo si curados

### followed — triángulo invertido, social curado
- Solo curado/shareable
- Sin rings, sin tint, sin estados internos
- No editable
- Color = identidad social OKLCH (allocator v2.6)
- Mute por usuario; filtro `filterBySource={type:'followed', id:uid}`
- Zoom gate

### app — rombo, oficial curado
- Solo curado
- Sin salud privada, sin tint de usuario
- Pertenece a grupo (`groupId`)
- Toggle por grupo
- Filtro `filterBySource={type:'app', id:'vandits-app'}` o `{type:'app', id:groupId}`
- Zoom gate

### source — forma de fuente, externo curado
- Solo curado/publicable
- Toggle y filtro por fuente
- Zoom gate propio

## 4. Hashtags clicables

En toda ficha/popup. Click aplica `filterBySource` y dispara `requestSubsetFit({ reason: 'source-filter' })`.

| POI       | Hashtags                  |
|-----------|---------------------------|
| propio    | `#frankie`                |
| seguido   | `#sandbox-agent`          |
| app       | `#vandits-app` + `#playas`|
| fuente    | `#osm`                    |

## 5. Filtro unificado

```ts
filters.filterBySource?: {
  type: 'own' | 'followed' | 'app' | 'source';
  id: string;
};
```

- `filterByUserId` queda como **alias legacy temporal** (deprecated)
- Si ambos existen → **gana `filterBySource`**
- Migrar todos los call-sites en PR-3, eliminar el alias en una limpieza posterior

## 6. Gramática visual

| sourceType | shape              | color/fill                     | rings | tint | estados |
|------------|--------------------|--------------------------------|-------|------|---------|
| own        | círculo            | enriched/imported/empty        | sí    | sí   | todos   |
| followed   | triángulo invertido | identidad social OKLCH owner   | no    | no   | curado  |
| app        | rombo              | color APP / color grupo OKLCH  | no    | no   | curado  |
| source     | forma de fuente    | color de fuente OKLCH          | no    | no   | curado  |

`createCustomIcon` se vuelve declarativo puro — solo lee la grammar resuelta.

## 7. PRs (orden de QA)

### PR-POI-SOURCE-1 — Resolver de origen
- `src/domains/content/lib/poi-source.ts`
- `resolvePoiSource(viewerUid, poi) → { type, ownerUid?, sourceId?, groupId?, hashtags[] }`
- Detección por marcadores explícitos (sin heurísticas por owner)
- Cache `WeakMap` invalidada por `_docVersion`
- Tests: matriz viewer × poi por sourceType

### PR-POI-SOURCE-2 — Shareability
- `src/domains/content/lib/poi-shareability.ts`
- `resolveShareability(viewer, poi, source) → { allowed, reason }`
- own=todo; followed/app/source=`isShareablePoi`
- Absorbe la curated-only boundary

### PR-POI-SOURCE-3 — Filtro unificado + hashtags clicables
- Añadir `filters.filterBySource` al matcher
- Migrar `filterByUserId` a alias legacy
- `src/components/poi/SourceHashtag.tsx` clicable
- Render en popup + ficha
- **Beneficio QA:** valida funcionalmente que el source resolver es correcto **antes** de tocar render del marker

### PR-POI-SOURCE-4 — Gramática visual app/source
- Extender `point-visual-state.ts` con `resolveMarkerGrammar(poi, source)`
- own (canon actual) + followed (canon actual) intactos
- **Nuevo:** rombo para `app`, forma propia para `source`
- `getAppGroupColor(groupId)` y `getSourceColor(sourceId)` con misma firma OKLCH del allocator (sin verdes/grises)
- `createCustomIcon` solo lee

### PR-POI-SOURCE-5 — Layer visibility + zoom gates + panel App & Sources
- `resolveLayerVisibility(layers, poi, zoom) → { opacity, pointerEvents }`
- Ejes: capa activa, mute por entity (user/grupo/fuente), zoom gate por sourceType
- **Prohibido** decidir nada de shareability aquí
- `UsersSidebar` + bloque "App & Sources" (grupos APP, fuentes externas) con toggles
- Zoom gates configurables en `app_settings`:
  - own: sin gate
  - followed: z ≥ 7
  - app: z ≥ 6 (configurable por grupo)
  - source: z ≥ 8

## 8. Detalles técnicos

- **Tipos canónicos** en `src/domains/content/types/poi-pipeline.ts`. Re-export **solo de tipos** desde el barrel para evitar ciclos (LocationMap/FloatingToolbar ya tuvieron crashes por esto).
- **Identidad cromática**: `getOwnerIdentityColor` v2.6 sin cambios. Nuevos `getAppGroupColor` y `getSourceColor` con mismas exclusiones (sin verdes, sin grises).
- **Tests** por PR; suite completa `poi-pipeline.test.ts` al cierre.

## 9. Lo que NO se toca

- Allocator de identidad cromática v2.6
- RLS y backend de sharing
- Pipeline de enrichment, geocoding, health
- Routing/itinerarios

## 10. Memorias al cerrar PR-5

- Nueva: `mem://logic/poi/source-pipeline-canonical`
- Nueva regla Core: "POI pipeline pasa SIEMPRE por source → shareability → filterBySource → layer-visibility → grammar; cada capa decide UNA cosa; renderer solo lee"
- Marcar superseded: partes absorbidas de `location-owner-resolver`, `curated-only-rule`, `followed-poi-grammar`, `marker-classification-v3`, `visibility-rule-approval-gated`
- Documentar que `filterByUserId` es alias legacy y planificar su eliminación
