
# PR-OWNER-IDENTITY-2 — Persistent Perceptual Identity Allocation (OKLCH maximin)

Sustituye `hash(uid) % palette` por un **sistema de asignación de identidades cromáticas** persistente, inmutable y perceptualmente óptimo. Además elimina el stroke del marker de seguidos: la identidad pasa al **fill**.

---

## Principios (no negociables)

1. **Persistencia inmutable**: una vez asignado `(viewer, followed) → color`, ese color no cambia jamás. Nuevos seguidos no recolorean a los existentes.
2. **Distancia perceptual máxima**: `C_{n+1} = argmax_{x∈V}( min_{Ci∈S} ΔE(x, Ci) )`.
3. **Restricciones operativas WCAG + semánticas**: contraste mínimo contra fondo claro y oscuro; exclusión perceptual (ΔE) de hues reservados a salud/estado.
4. **Degradación progresiva**: cuando `V` se agota, sigue eligiendo el mejor disponible y marca `degraded=true` para QA.
5. **Espacio de color perceptual**: OKLCH para representación, ΔE en OKLab para distancia. (HSL queda solo para legacy v1.)

---

## 1. Cambio visual del marker de seguido

Hoy: triángulo invertido + **stroke** = identidad.
Nuevo: triángulo invertido **sin borde**; **fill = identidad OKLCH**. El estado curado (enriched/imported) se representa por icono interior / opacidad, no por fill.

Archivos:
- `src/components/map/map-icons.ts` rama `followed`: quitar `stroke` y `stroke-width`, aplicar `fill = ownerIdentityColor(uid)`. Eliminar la variación de stroke por `renderMode`.
- `mem://style/map/followed-poi-grammar` reescrito: "fill = identidad", "sin stroke".
- `mem://index.md` Core: actualizar la línea PR-OWNER-IDENTITY-1.

---

## 2. Motor de asignación (tiers)

### Tier 1 — Seed palette (8–12 colores ultra-distantes)
Constantes `SEED_PALETTE` en OKLCH, calculadas offline para máxima ΔE mutua dentro de las restricciones operativas. Se consumen primero, en orden, para los primeros N seguidos del viewer.

### Tier 2 — Generación incremental constrained (`V` candidate space)
Generado deterministamente:
- `L ∈ [0.55, 0.75]` (legible sobre tile claro y oscuro).
- `C ∈ [0.12, 0.20]` (saturación mínima para no parecer gris).
- `h` muestreado cada 5° → 72 hues × 3 (L,C) ≈ ~216 candidatos.
- Filtros (`isValidCandidate`):
  - Contraste WCAG ≥ 3:1 contra fondo claro `#f8fafc` y oscuro `#0b1220`.
  - Contraste ≥ 4.5:1 contra texto/icono interior blanco.
  - **Exclusión perceptual** (ΔE > 25 en OKLab) frente a anchors reservados:
    - verde enriched, gris imported, naranja empty
    - amber (partial), yellow (chain), magenta (review), red (hardError)
  - Sin rangos de hue HSL — todo por ΔE.

### Tier 3 — Degradación controlada
Si el mejor candidato queda a ΔE < 8 frente al conjunto asignado: se acepta igualmente, pero se persiste `degraded=true` para diagnóstico/QA.

### Algoritmo `pickNextIdentityColor(assigned)`
```
si assigned.length < SEED_PALETTE.length:
  devolver SEED_PALETTE[assigned.length]
sino:
  para cada c en V \ assigned:
    score(c) = min over Ci in assigned: ΔE(c, Ci)
  devolver argmax(score)
  desempate: hue index estable, luego L, luego C
```
Determinista: dado `assigned`, devuelve siempre lo mismo. Inmutable: nunca toca asignaciones previas.

---

## 3. Persistencia (DB)

La tabla `user_owner_color_assignments` ya existe (v1, `color_index`). Migración v2:

```sql
ALTER TABLE public.user_owner_color_assignments
  ADD COLUMN oklch_l double precision,
  ADD COLUMN oklch_c double precision,
  ADD COLUMN oklch_h double precision,
  ADD COLUMN degraded boolean NOT NULL DEFAULT false;

-- color_index queda NULLABLE legacy
-- palette_version pasa a 'owner-v2-oklch'
```

**Backfill (preserva inmutabilidad)**: para cada row v1, convertir el HSL paleta v1 a OKLCH y guardar en `oklch_*` con `palette_version='owner-v2-oklch'`. **No se reasigna ningún color**: los seguidos antiguos conservan exactamente su color visual.

RLS y `(viewer_user_id, followed_user_id)` PK sin cambios.

---

## 4. Servicio + store

`ensureAssignment(viewer, followed)`:
1. Si row existe → devolver `oklch_*` (inmutable).
2. Si no → cargar todos los OKLCH del viewer → `pickNextIdentityColor(assigned)` → `INSERT`.
3. Conflicto `23505` (otra pestaña insertó) → re-leer y devolver el persistido.

Concurrencia por viewer: serializar con `_inflight: Map<followedUid, Promise>` (ya existe).

Archivos:
- `src/lib/color/oklch.ts` (nuevo): sRGB ↔ OKLCH ↔ OKLab, ΔE OKLab, contraste WCAG.
- `src/lib/color/identity-allocator.ts` (nuevo): `SEED_PALETTE`, `CANDIDATE_SPACE`, `FORBIDDEN_ANCHORS`, `pickNextIdentityColor`, `isValidCandidate`.
- `src/repositories/owner-color-assignments.repository.ts` (nuevo): CRUD tipado.
- `src/services/owner-identity.service.ts` (nuevo): `loadAssignments`, `ensureAssignment`.
- `src/components/map/owner-stroke.ts` → renombrar a `src/components/map/owner-identity.ts`. API pública: `getOwnerIdentityColor(uid, oklch?) → string CSS` (`oklch(L C h)`).
- `src/stores/owner-identity-store.ts`: store guarda `Map<followedUid, OklchColor>` (no índices).
- `src/components/map/map-icons.ts`: rama followed sin stroke, `fill = identidad`.
- `src/components/UsersSidebar.tsx`: chip lee OKLCH del store; sigue ensure-on-mount.
- `src/components/LocationMap.tsx`: listener `lovable:owner-identity-updated` ya existente, sin cambios estructurales.

---

## 5. Tests (`src/test/`)

- `owner-identity-allocator.test.ts`:
  - Determinismo: mismo `assigned` → mismo siguiente.
  - Inmutabilidad: añadir el N+1 no muta los N anteriores.
  - Maximin: el segundo color es el más lejano del primero (ΔE máximo).
  - Anchors prohibidos: ningún candidato sale a ΔE < umbral de verde/amber/yellow/magenta/red.
  - Degradación: con `assigned` saturado marca `degraded=true`.
- `owner-identity-contrast.test.ts`: todos los SEED y muestras de V cumplen WCAG sobre `#f8fafc` y `#0b1220`.
- Eliminar `owner-stroke.test.ts` (paleta v1 obsoleta).

---

## 6. Migración v1 → v2 (sin recoloreado visible)

Backfill SQL en la misma migración de schema:
```sql
-- Para cada row v1: convertir HSL v1 → OKLCH y persistir.
UPDATE public.user_owner_color_assignments
SET oklch_l = ..., oklch_c = ..., oklch_h = ...,
    palette_version = 'owner-v2-oklch'
WHERE palette_version = 'owner-v1';
```
(Conversión vía función PL/pgSQL `_hsl_to_oklch_v1(idx int)` con los 8 valores fijos de la paleta v1.) Resultado: el viewer no nota ningún cambio de color en seguidos antiguos. Nuevos seguidos usan el allocator.

---

## 7. Memoria

- Reescribir `mem://style/map/followed-poi-grammar`: fill = identidad, sin stroke, OKLCH maximin.
- Crear `mem://logic/identity/owner-color-allocator`: contrato del allocator (tiers, ΔE, anchors prohibidos, inmutabilidad, degradación).
- Actualizar `mem://index.md` Core (PR-OWNER-IDENTITY-1 → PR-OWNER-IDENTITY-2): "fill OKLCH = identidad persistida; sin stroke".

---

## QA visual final

- Sandbox y Alpha tienen colores **muy distintos** (ΔE > 25), sin borde.
- Añadir un tercer seguido NO cambia el color de los dos primeros.
- Tras refresh, mismos colores (persistencia DB).
- Ningún color asignado se confunde con verde enriched, amber, yellow, magenta, red.
- Sidebar y mapa muestran color idéntico para un mismo seguido.
- Tests pasan: determinismo, maximin, inmutabilidad, contraste WCAG, anchors prohibidos.

---

## Fuera de alcance (PR futuros)

- ΔE2000 real (ahora ΔE OKLab simple — más que suficiente para identidad).
- Avatar/iniciales en marker rich → `PR-OWNER-IDENTITY-3`.
- UI manual para que el viewer reasigne color de un seguido concreto.
- Re-balance global opt-in (rompe inmutabilidad — solo bajo acción explícita).
