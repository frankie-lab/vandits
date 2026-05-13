
## PR-OWNER-IDENTITY-2.2 — Reset histórico + bump de versión

### Diagnóstico confirmado

El renderer y el repintado por evento están bien cableados:
- `LocationMap.tsx:1972-1999` escucha `lovable:owner-identity-updated` y hace `setIcon` sólo de los markers afectados.
- `map-icons.ts:475` usa `getOwnerIdentityColor(ownerUid, getOwnerIdentityOklch(ownerUid))` como `fill` del triángulo.
- `UsersSidebar.tsx:231-233` carga `loadOwnerIdentityAssignments` y dispara `ensureAssignmentsForFolloweds`.
- El allocator (`identity-allocator.ts`) ya es maximin puro desde el primer seguido.

El fallo es **dato heredado**, no runtime. Las 5 filas existentes en `user_owner_color_assignments` con `palette_version='owner-v2-oklch'` son el backfill v1→v2 — todas hue 227–270 (cluster azul-índigo). Como son inmutables por contrato, el nuevo allocator nunca las recalcula y por eso visualmente todos los seguidos parecen iguales.

### Decisión

Reset único justificado: las identidades actuales nunca cumplieron la regla matemática pactada (fueron `SEED_PALETTE` en orden, no maximin). Borrar las filas heredadas y dejar que el allocator maximin las recalcule en orden de aparición. A partir de aquí, inmutabilidad absoluta.

### Cambios

**1. Migración (data-only delete + bump)**

```sql
-- Borrar todas las asignaciones v2 (provienen del backfill v1, no del maximin pactado).
DELETE FROM public.user_owner_color_assignments
WHERE palette_version IN ('owner-v1', 'owner-v2-oklch');
```

No se altera schema, RLS, ni constraints. La tabla queda vacía y se repuebla en cuanto cualquier viewer abre `UsersSidebar`.

**2. `src/lib/color/identity-allocator.ts`**

- Bump `OWNER_PALETTE_VERSION` de `'owner-v2-oklch'` a `'owner-v2.1-oklch'`. Las nuevas filas quedan etiquetadas con la nueva versión para auditoría: cualquier fila futura `owner-v2.1-oklch` proviene del maximin puro; cualquier `owner-v2-oklch` que reaparezca sería bug.
- `SEED_PALETTE` se queda como está (deprecated, sólo fallback determinista de `owner-stroke.ts` cuando aún no hay asignación cargada en memoria).
- Sin cambios al algoritmo: el maximin puro de PR-OWNER-IDENTITY-2.1 es correcto.

**3. `src/test/owner-identity-allocator.test.ts`**

Actualizar la única assertion sobre `OWNER_PALETTE_VERSION` si existe; añadir test que verifique que dos uids distintos producen colores con `ΔE > DEGRADED_THRESHOLD` cuando se piden secuencialmente (smoke del contrato).

**4. Memoria**

Actualizar `mem://logic/identity/owner-color-allocator` y la entrada Core en `mem://index.md` para reflejar:
- `palette_version='owner-v2.1-oklch'` como versión activa.
- Nota histórica: `owner-v2-oklch` fue purgada el 2026-05-13 por incumplir el contrato maximin (era backfill v1 disfrazado).

### Fuera de alcance

- Tocar el renderer, el store o el listener de `LocationMap` (todos verificados OK).
- Tocar `SEED_PALETTE` o el candidate space `V`.
- Cambios en `UsersSidebar.tsx` (la chip de identidad ya lee del store).

### Verificación post-deploy

1. Refresh + abrir `UsersSidebar` con `currentUser.id`.
2. Confirmar en DB: 5 nuevas filas con `palette_version='owner-v2.1-oklch'` y hues distribuidos (no cluster azul).
3. Visual: las 5 chips del sidebar y los triángulos del mapa deben mostrar 5 colores perceptualmente distintos.
4. Test unitario passing.
