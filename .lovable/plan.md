## Resumen

Extender el modificador "anillo de error" a un sistema unificado de **3 anillos concéntricos de 5px** que reflejan la integridad del POI. Se apilan **por fuera** del marker existente y **no sustituyen** el `stroke` blanco base ni el `collection-tint-ring` que ya tiñe el borde con el color de colección/catálogo. Cada anillo desaparece cuando ese problema se ha resuelto.

| Anillo | Color | Disparador | Helper | Limpieza |
|---|---|---|---|---|
| Error | rojo `#dc2626` | Último job de enriquecimiento marcó este id en `error_ids` | `hasEnrichmentFailure(loc)` (ya existe) | Tras enriquecer ese punto |
| Cadena rota | amarillo `#eab308` | `loc.geo_health ∈ {'broken','stale_name'}` — mismo filtro que "Reparar cadenas rotas" del panel admin | `hasBrokenGeoChain(loc)` (nuevo) | Tras backfill-admin-fks → `ok` |
| Vacío | naranja `#f97316` | `getPointVisualState(loc) === 'empty'` (sin descripción ni enriquecimiento) | `hasEmptyContent(loc)` (nuevo) | Tras enriquecer o tras añadir descripción |

Apilado, de dentro hacia fuera: **marker base → stroke blanco → collection-tint-ring (color de colección) → naranja vacío → amarillo cadena rota → rojo error**.

> Los anillos de salud son una capa **separada y aditiva**: no pisan el blanco interior, no pisan el tinte de colección, no cambian la paleta base (verde/gris/naranja). El color "de catálogo" o "de colección" del POI se sigue viendo intacto entre el marker y los anillos de salud.

## Cambios concretos

### 1. Exponer `geo_health` en el modelo cliente
- `src/types/location.ts` — añadir `geoHealth?: 'ok'|'broken'|'partial'|'stale_name'|'empty'|null` a `GeoLocation`.
- `src/domains/content/lib/db-transformers.ts` — mapear `loc.geo_health` desde `v_locations_resolved`.

### 2. Helper único de "anillos de salud"
Nuevo `src/domains/content/lib/point-health-rings.ts`:
```ts
export type HealthRing = 'empty' | 'chain' | 'error';
export function getPointHealthRings(loc: GeoLocation): HealthRing[]
```
Reglas:
- `error` solo si `hasEnrichmentFailure(loc)` (la regla "verde nunca marca error" vive ya dentro).
- `chain` si `loc.geoHealth === 'broken' || 'stale_name'`. **Aplica también a verdes** (la cadena admin puede estar rota aunque la descripción esté).
- `empty` si `getPointVisualState(loc) === 'empty'`.

Devuelve array ordenado de **dentro a fuera**: `['empty','chain','error']` filtrado.

### 3. `createCustomIcon` apila los anillos por fuera del marker
`src/components/map/map-icons.ts`:
- **No tocar** `stroke="white"` del `<path>`/`<circle>` base.
- **No tocar** el `<div class="collection-tint-ring">` (sigue tiñendo con `--collection-tint`).
- Añadir un nuevo wrapper `<div class="health-rings-wrap">` que envuelve TODO lo anterior y dibuja un `<svg>` overlay con un `<circle>` por cada `HealthRing` que devuelve el helper. Radios crecientes en saltos de `RING_GAP = 5px`, todos con `stroke-width:5`, `fill:none`.
- Recalcular `containerSize = baseSize + 2 * (collectionTintWidth + ringCount * RING_GAP)` para que el clic-hit y el centro del icono sigan cuadrando.
- Tabla de colores en `RING_COLORS: Record<HealthRing, string>` dentro del propio módulo.

### 4. Re-render automático
- `useRealtimeLocations` ya escucha UPDATE en `locations`; cuando cambia `geo_health` o `enriched_data`, la location se reemplaza en el store y `createCustomIcon` se vuelve a llamar → los anillos amarillo y naranja aparecen/desaparecen solos.
- El anillo rojo sigue usando `enrichmentFailureStore` con su `subscribeFailureChange` ya cableado.

### 5. Memoria
- Renombrar `mem://style/map/error-outline-rule` → `mem://style/map/health-rings-rule` con la tabla de 3 anillos y la nota explícita: **los anillos de salud nunca sustituyen al tinte de colección ni al stroke blanco base**.
- Actualizar el bullet Core de "Modificador error" a "Modificadores de salud (3 anillos concéntricos 5px, encima de la paleta y del tinte de colección)".

## Archivos a tocar
- `src/types/location.ts`
- `src/domains/content/lib/db-transformers.ts`
- `src/domains/content/lib/point-health-rings.ts` *(nuevo)*
- `src/components/map/map-icons.ts`

## Fuera de alcance
- Paleta base (verde/gris/naranja): intacta.
- `collection-tint-ring` y el sistema de color por colección/grado de catálogo: intactos.
- `geo_health = 'partial'`: NO se pinta (mismo criterio que el modo `repair` del panel admin). Si más adelante se quiere distinguir partial, se hará con un cuarto color en otro plan.
- TTL del store de fallos: vive en su propio plan.

## Verificación
1. Punto verde en colección "Castillos" (tinte azul) con FK admin rota → se ven: tinte azul + anillo amarillo por fuera. Tras `repair` → solo tinte azul.
2. Punto gris (importado, sin colección) con FKs incompletas → anillo amarillo + sin tinte. Tras enriquecer + backfill → marker pelado.
3. Punto naranja (vacío) en colección con tinte verde y con fallo de enriquecimiento → tinte verde + naranja + rojo. Tras enriquecer con éxito → solo tinte verde.
4. Punto verde con fallo legacy en `error_ids`: no se pinta rojo (regla existente).
5. Cluster + zoom: anillos sobreviven a la re-iconación (divIcon SVG).
