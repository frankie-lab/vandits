

## Plan: Congelar Gramatica Visual V2 — Version Final

### Decisiones cerradas

1. **Propio no enriquecido = Waypoint** hasta enriquecido o promovido manualmente a Place
2. **renderContext = por que se muestra** (default, document, search). Sin estado de dominio
3. **Enrichment = boolean unico** (isEnriched). Sin eje current/previous
4. **Catalog vs Workspace = distincion visual preservada** via `isCatalog` flag en el feature, no colapsada
5. **Promocion manual = `entityType: 'place'` con `isEnriched: false`** — caso valido y explicito
6. **Validador solo valida entrada de dominio**, no salida de gramatica. Track+decoraciones se valida en tests de gramatica
7. **`isApproved` influye en `entityType`**, no en ownershipSource ni shape

### Paleta V2 definitiva (own)

Basada en lo que V1 ya resuelve via `marker_size_config`:

| Caso | entityType | shape | Color source | Fallback |
|------|-----------|-------|-------------|----------|
| Own enriched catalog | place | teardrop | `catalog_enriched.fill_color` | sky blue hsl(207,90%,54%) |
| Own enriched workspace | place | teardrop | `own_enriched.fill_color` | green hsl(142,76%,36%) |
| Own unenriched (waypoint) | waypoint | circle-hollow | `own_empty.fill_color` | orange hsl(24,95%,53%) |
| Own promoted (place, not enriched) | place | circle-solid | `own_new.fill_color` | orange hsl(24,95%,53%) |
| Followed enriched | place | circle-solid | HSL from userId | deterministic hue |
| Curator enriched | place | teardrop | curator custom color | teal |
| Druid enriched | place | teardrop | druid custom color | purple |

**Regla clave**: Un waypoint pending siempre usa `own_empty.fill_color` (orange). No hay ambiguedad gray/orange — esa distincion (unknown=gray, new=orange) era V1 legacy basada en `criteriaTimestamp`. V2 colapsa a un solo color para unenriched.

---

### Archivos a crear

#### 1. `src/domains/v2/marker-types.ts`

Tipos compartidos sin dependencias ciclicas:

```typescript
export type MarkerShape = 'teardrop' | 'circle-solid' | 'circle-hollow' | 'circle-dashed';
export type Decoration = 'halo' | 'check' | 'star' | 'warning';

export interface MarkerValidationResult {
  isValid: boolean;
  reason?: string;
}

export interface MarkerGrammarOutput {
  shape: MarkerShape;
  fillColor: string;
  borderColor?: string;
  decorations: Decoration[];  // plural
  zIndex: number;
}

export interface DiscardedFeature {
  feature: MapFeature;
  reason: string;
}
```

zIndex documentado:
- selected: +1000
- conflict: +500
- teardrop (shape resultado): +200
- default: +100

#### 2. `src/domains/v2/marker-validation.ts`

Valida **entrada de dominio** (MapFeature pre-gramatica). No valida salida.

**Flags incompatibles:**
- `place + isConflict` — Places no tienen conflicto de resolucion
- `waypoint + isVisited` — Waypoints no se visitan
- `waypoint + isFavorite` — Waypoints no se marcan favorito
- `track + isFavorite` — Tracks no soportan favorito
- `track + isVisited` — Tracks no se visitan
- `track + isConflict` — Tracks no tienen conflictos

**Coherencia contextual:**
- `renderContext === 'document'` sin `documentId` en clickPayload
- `ownershipSource !== 'own'` en waypoints (salvo imports compartidos futuros)

Exporta: `validateFeature(feature: MapFeature): MarkerValidationResult`

**No incluye**: restricciones de decoraciones en tracks (eso es responsabilidad de la gramatica, validado via tests).

#### 3. `src/domains/v2/marker-grammar.ts`

Funcion pura `resolveMarkerGrammar(feature: MapFeature): MarkerGrammarOutput`.

Asume feature ya validado. Logica:

**Shape:**
- track → `circle-dashed`
- waypoint → `circle-hollow` (siempre, independiente de enrichment)
- place + isEnriched → `teardrop`
- place + !isEnriched (promovido manualmente) → `circle-solid`

**Color:**
- Necesita `isCatalog` para distinguir catalog vs workspace en own places. Esto se anade como propiedad al MapFeature o se infiere del renderContext. Propuesta: **nuevo campo opcional `isCatalog: boolean` en MapFeature** (o derivado de una convencion — si la feature tiene `renderContext: 'default'` y `ownershipSource: 'own'` y `entityType: 'place'`, se consulta `marker_size_config`).
- Para V2 puro: colores hardcoded en la gramatica con la paleta de la tabla anterior. Los colores de `marker_size_config` se inyectan como override opcional via `overrideColor` ya existente en el tipo.

**Decorations (plural):**
- selected → halo
- isConflict → warning (solo waypoints, places ya filtrados por validador)
- isFavorite → star
- isVisited → check
- track: solo produce `halo` si selected; nunca star/check/warning

**zIndex:**
- isSelected: +1000
- isConflict: +500
- shape === teardrop: +200
- default: +100

#### 4. `src/test/marker-grammar.test.ts`

**Seccion 1 — Validacion (8 casos):**
- 6 flags incompatibles → invalid
- document sin documentId → invalid
- waypoint con ownershipSource !== own → invalid

**Seccion 2 — Gramatica snapshots (9 casos):**
- Place own enriched catalog → teardrop, sky blue, zIndex 200
- Place own enriched workspace → teardrop, green, zIndex 200
- Waypoint pending → circle-hollow, orange, zIndex 100
- Place own promoted (not enriched) → circle-solid, orange, zIndex 100
- Waypoint conflict selected → circle-hollow, red border, [halo, warning], zIndex 1000
- Place followed → circle-solid, purple, zIndex 100
- Curator enriched → teardrop, teal, zIndex 200
- Druid not enriched → circle-solid, purple, zIndex 100
- Track selected → circle-dashed, [halo], zIndex 1000

**Seccion 3 — Gramatica restricciones de salida:**
- Track nunca produce star, check, warning
- Waypoint nunca produce check, star

**Seccion 4 — Mapper V1→V2 (3 casos):**
- GeoLocation enriched + isApproved → MapFeature place + teardrop
- GeoLocation enriched + !isApproved → MapFeature place + teardrop (workspace color)
- GeoLocation not enriched → MapFeature waypoint + circle-hollow

#### 5. `src/domains/v2/legacy-to-feature.mapper.ts`

Firma explicita con renderContext como argumento:

```typescript
function mapLegacyLocationToMapFeature(
  location: GeoLocation,
  options: {
    isOwn: boolean;
    isSelected: boolean;
    isFocused: boolean;
    isVisited: boolean;
    isFavorite: boolean;
    isCatalog: boolean;
    ownerInfo?: { curatorId?, druidId?, followedUserId? };
  },
  renderContext: MapRenderContext,
): MapFeature
```

Reglas de mapeo:
- `isApproved` → determina `entityType`: si `isApproved && enrichedData` → place; si `!enrichedData` → waypoint; si `isApproved && !enrichedData` (promovido) → place
- `renderContext` → pasado directamente, no derivado
- `isEnriched` → `!!location.enrichedData?.descripcion` (boolean, sin timestamp)
- `isCatalog` → pasado desde options, determina paleta de color
- `ownershipSource` → derivado de ownerInfo (druidId → druid, curatorId → curator, !isOwn → followed, else → own)

---

### Archivos a modificar

#### 6. `src/domains/v2/types.ts` — Anadir `isCatalog` a MapFeature

Nuevo campo opcional:
```typescript
export interface MapFeature {
  // ... existing fields
  isCatalog?: boolean;  // Determines catalog vs workspace color palette for own places
}
```

#### 7. `src/domains/v2/visual-grammar.ts` — Capa de compatibilidad

Las funciones existentes (`resolveVisualGrammar`, `resolveShape`, etc.) pasan a ser wrappers que llaman a `marker-grammar.ts`. Ningun import existente se rompe.

#### 8. `src/domains/v2/index.ts` — Nuevos exports

Exportar: `resolveMarkerGrammar`, `validateFeature`, `mapLegacyLocationToMapFeature`, tipos de `marker-types.ts`.

#### 9. `src/hooks/use-resolved-map-features.ts` — Integrar

- Validar antes de resolver gramatica
- Exponer `discarded: DiscardedFeature[]` con reason tipado
- `console.warn` en dev para descartados
- Solo llamar `resolveMarkerGrammar()` con features validos

#### 10. `src/components/map/map-v2-renderer.ts` — zIndex

- Usar `zIndexOffset` del MarkerGrammarOutput
- Comentario documentando que pane-based layering puede ser necesario con clusters

---

### Secuencia de implementacion

1. `marker-types.ts` (sin dependencias)
2. `marker-validation.ts` (depende de types)
3. `marker-grammar.ts` (depende de types)
4. Tests de validation + grammar
5. `legacy-to-feature.mapper.ts` (depende de grammar + types)
6. Tests del mapper
7. `visual-grammar.ts` → compat layer
8. `types.ts` → isCatalog field
9. `index.ts` → exports
10. `use-resolved-map-features.ts` → integrar
11. `map-v2-renderer.ts` → zIndex

