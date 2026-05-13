## PR-OWNER-IDENTITY-2.1 — Maximin estricto desde el primer seguido

### Problema

La regla pactada dice:

> El color de cada nuevo seguido se calcula por maximin perceptual frente a los colores ya asignados (`S`) y a los anchors prohibidos. El primero debe ser el más alejado de los anchors (especialmente verde enriched).

La implementación actual (`identity-allocator.ts`, líneas 131–139) hace lo contrario para los 8 primeros seguidos:

```ts
for (const seed of SEED_PALETTE) {
  if (!alreadyAssigned(seed, assigned)) {
    return { color: seed, degraded: false }; // ← orden fijo, no maximin
  }
}
```

Resultado: el primer seguido siempre recibe `SEED_PALETTE[0]` (cyan `L 0.65 C 0.12 h 227`), no el color con mayor `min ΔE` frente a `FORBIDDEN_ANCHORS`.

### Solución (híbrida — preserva inmutabilidad histórica)

1. **Asignaciones existentes en DB**: intactas. La inmutabilidad sigue siendo absoluta — nunca se recolorea.
2. **Backfill v1**: la migración existente ya escribió las 8 cool en orden para usuarios v1. No se toca.
3. **Nuevas asignaciones (incluyendo el primer seguido de un viewer nuevo)**: siempre maximin sobre `V`, con `S` = colores ya persistidos en DB para ese viewer.
4. **Seed cool-8 deja de ser tier preferente**: pasa a ser parte de `V` (vía sus coordenadas OKLCH ya presentes en el sampling) o se conserva sólo como constante de backfill v1, sin influir en el allocator runtime.

### Cambios técnicos

**`src/lib/color/identity-allocator.ts`**

- Eliminar el bucle "seed phase" (líneas 134–139). El allocator pasa a ser maximin puro desde la primera llamada.
- Renombrar `SEED_PALETTE` → `V1_BACKFILL_PALETTE` y marcarla `@deprecated for new allocations — kept only for v1→v2 backfill reference`. Mantener export para que la migración SQL y los tests de backfill sigan funcionando.
- Asegurar que las 8 coordenadas v1 estén dentro de `getCandidateSpace()` (o cerca, vía sampling). Comprobar: para `S = []`, el maximin elige el candidato con mayor `min ΔE` frente a los 6 anchors. Documentar el resultado esperado (probablemente un azul/púrpura frío profundo, lejos de verde/amber/red/magenta).
- Mantener `DEGRADED_THRESHOLD`, `ANCHOR_MIN_DELTA_E`, `isValidCandidate`, `getCandidateSpace` sin cambios.
- Tiebreak determinista (hue → L → C) ya existe — sirve para que `S = []` produzca siempre el mismo primer color.

**`src/test/owner-identity-allocator.test.ts`**

- Sustituir cualquier test que asuma `pickNextIdentityColor([]).color === SEED_PALETTE[0]`.
- Añadir tests:
  - `S = []` → resultado determinista, `min ΔE` frente a anchors > `DEGRADED_THRESHOLD`.
  - `S = [primer resultado]` → segundo seguido maximin frente a ese único color y los anchors; `ΔE > umbral` razonable.
  - Inmutabilidad: dado un `S` arbitrario con 1, 2, 5 colores, el resultado nunca coincide con ninguno de `S`.
  - Anchors: ningún resultado tiene `ΔE < ANCHOR_MIN_DELTA_E` frente a verde, amber, yellow, magenta, red, orange.
  - Determinismo: 100 ejecuciones con el mismo `S` devuelven el mismo color.

**Migración / DB**

- **Ninguna**. Las asignaciones existentes (`palette_version='owner-v2-oklch'`) son inmutables. Solo las nuevas filas usan el allocator actualizado.
- La migración v1→v2 ya ejecutada se conserva como histórico.

**Memoria**

- Actualizar `mem://logic/identity/owner-color-allocator`:
  - Quitar "SEED 8 cool consumido en orden los primeros 8 followeds".
  - Añadir: "Maximin puro desde el primer seguido. Backfill v1 conserva las 8 cool como histórico inmutable. Nuevas asignaciones siempre vía `argmax min ΔE` sobre `V`."
- Actualizar la línea Core de `mem://index.md` (sección PR-OWNER-IDENTITY-2): cambiar "SEED 8 cool (=v1 backfill exacto) + candidate space V" por "Maximin puro sobre V (~200) desde el primer seguido; backfill v1 (8 cool) preservado como histórico inmutable".

### Fuera de alcance

- Re-balancear o reasignar colores existentes (rompe inmutabilidad — explícitamente prohibido).
- Avatar/iniciales en marker o popup (deferido).
- UI manual para cambiar color de un seguido (deferido).
- ΔE2000 (deferido).

### QA

1. Crear viewer nuevo, seguir 1 usuario → marcador triangular con color frío lejos de verde. Verificar persistencia tras reload.
2. Seguir un 2º usuario → color visiblemente distinto del 1º y de los anchors.
3. Viewer v1 con seguidos antiguos → colores idénticos a antes (inmutabilidad).
4. Tests unitarios pasan (10+ casos).
