
## Regla canónica fijada

| Origen | Forma | Variables permitidas |
|---|---|---|
| **Propio** | **Círculo** | fill (estado: enriched/imported/empty) · health rings · collection tint · halo/check/star/warning |
| **Seguido** | **Triángulo invertido** | fill (estado curado) · stroke fino = identidad del owner (paleta cerrada) · halo si seleccionado. **Sin** rings, **sin** tint, **sin** warning |

Hoy ambos se renderizan como círculos con paleta de propios. Hay que separarlos.

---

## PR-SOCIAL-2A — Forma + identidad de owner para seguidos

1. **Añadir `inverted-triangle` al tipo `MarkerShape`** (`src/domains/v2/marker-types.ts`).

2. **Resolver shape en la grammar** (`src/domains/v2/marker-grammar.ts`):
   - Si `feature.ownershipSource !== 'own'` → `shape = 'inverted-triangle'` (independiente de enriched/promoted).
   - Sin rings, sin tint, sin warning para no propios (resolveDecorations ya filtra; añadir guard explícito).

3. **Helper único `getOwnerStrokeColor(ownerUid)`** (nuevo: `src/domains/v2/owner-stroke.ts`):
   - Hash determinista uid → índice en paleta cerrada (~10 colores) que NO colisione con health (amber/yellow/magenta/red) ni propios (verde/azul/naranja).
   - Mismo color del mismo owner en todas las vistas.

4. **Renderer único `createCustomIcon`**:
   - Detectar `ownershipSource !== 'own'` → renderizar SVG triángulo invertido con stroke 1.5px = `getOwnerStrokeColor(ownerUid)`.
   - Saltar rings (`getPointHealthRings`) y tint (collection chip) para no propios.

5. **Pipeline de composición**:
   - Donde hoy se llama `getPointVisualState` para todos: distinguir owner. Si no es propio + pasa `isShareablePoi` → ruta grammar V2 con `ownershipSource: 'followed'` y `ownerUid`. Propios siguen igual.

6. **Leyenda en `UsersSidebar`**: chip con `getOwnerStrokeColor(uid)` junto a cada usuario seguido.

7. **Memoria nueva** `mem://style/map/followed-poi-grammar`: forma triángulo invertido, stroke owner por hash, sin rings/tint/warning, helper único.
   Actualizar Core del index con la regla "Propio=círculo / Seguido=triángulo invertido".

---

## PR-SOCIAL-2B — Subset-fit aterriza en región densa

1. **Helper `pickDominantRegion(points)`** (`src/components/map/dominant-region.ts`): grid-bucket por grados, devuelve cluster mayor + sus bounds.

2. **Listener `SUBSET_FIT_BOUNDS_EVENT` en `LocationMap.tsx`**:
   - Si `reason === 'user-filter'` y bounds globales > umbral (≈40° lat ó 60° lng): usar bounds del cluster dominante en lugar de bounds globales.
   - Resto de triggers sin cambios. Mantener `minZoom: 7`, clamp z12, cooldown 4s.

3. **Actualizar** `mem://logic/map/subset-fit-contract`: cláusula "user-filter multi-regional → fit a dominant region".

---

## Archivos

```
src/domains/v2/marker-types.ts            (+ 'inverted-triangle')
src/domains/v2/marker-grammar.ts          (shape forzado por ownership)
src/domains/v2/owner-stroke.ts            (NUEVO)
src/components/.../createCustomIcon.tsx   (rama followed: triángulo + stroke owner, sin rings/tint)
src/hooks/use-resolved-map-features.ts    (pasar ownerUid + ownershipSource)
src/components/map/dominant-region.ts     (NUEVO)
src/components/LocationMap.tsx            (rama user-filter del listener)
src/components/UsersSidebar.tsx           (chip color owner)
mem://style/map/followed-poi-grammar      (NUEVO)
mem://logic/map/subset-fit-contract       (update)
mem://index.md                            (Core: regla forma propios/seguidos)
```

## QA

- Filtrar por Sandbox desde z2 → cámara aterriza en Iberia (cluster dominante 151/295), no en Sierra Leona.
- POIs Sandbox visibles como **triángulos invertidos** con stroke de color estable, sin rings ni tint.
- POIs propios siguen como círculos con su paleta + rings + tint completos.
- En `UsersSidebar` cada usuario muestra el mismo color que su stroke en mapa.

## Fuera de alcance
- Chips de regiones secundarias para navegar entre clusters → futuro PR-SOCIAL-2C.
- Avatar mini en marker → descartado.
