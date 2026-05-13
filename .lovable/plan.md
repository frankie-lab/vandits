
# PR-OWNER-IDENTITY-2.5 — Maximin perceptual con única exclusión = vecindad del verde curado

## Regla canónica (acordada)

Para **seguidos** (followed users):
- **forma** = triángulo invertido sin stroke
- **fill** = identidad social persistente, OKLCH
- **única exclusión cromática dura** = cercanía perceptual al verde curado (anchor `enriched`)
- el resto de la rueda OKLCH está disponible (rojo, naranja, amarillo, magenta, azul, violeta, cyan, etc.)
- cada nuevo seguido recibe el color que **maximiza la distancia perceptual** contra los ya asignados
- los colores asignados **no se recalculan jamás** (inmutabilidad)

Rojo/naranja/amber/magenta siguen siendo semánticos para anillos de salud, **pero** la forma (triángulo invertido vs círculo + rings) elimina ambigüedad. Por eso solo se prohíbe el verde.

## Diagnóstico del fallo de v2.4

v2.4 bloqueó todo el arco cálido (180°–320° hue band). Resultado: 5 seguidos amontonados en cyan/azul/violeta, indistinguibles. La regla era demasiado restrictiva.

## Implementación

### 1. `src/lib/color/identity-allocator.ts` — reescritura

```ts
const ENRICHED_ANCHOR_OKLCH = { L: 0.72, C: 0.18, h: 145 }; // verde curado
const EXCLUSION_DELTA_E = 25; // radio perceptual prohibido alrededor del verde
const OWNER_PALETTE_VERSION = 'owner-v2.5-maximin-perceptual';

isInForbiddenZone(oklch): boolean
  → deltaE_OK(oklch, ENRICHED_ANCHOR_OKLCH) < EXCLUSION_DELTA_E

pickNextIdentityColor(assignedOklchList): OKLCH
  // Sampling denso de la rueda (paso 5° hue × 3 niveles C × 2 niveles L)
  // Filtrar candidatos por !isInForbiddenZone
  // Caso N=0: argmax ΔE(x, ENRICHED_ANCHOR) sobre V
  // Caso N≥1: argmax_{x ∈ V} ( min_{c ∈ S} ΔE(x, c) )
```

ΔE en OKLab estándar (no hue-gap circular como v2.4).

### 2. Migración SQL (purga acotada)

Acotada explícitamente a versiones defectuosas conocidas — **no** usar `!= 'v2.5'`:

```sql
DELETE FROM user_owner_color_assignments
WHERE palette_version IN (
  'owner-v1',
  'owner-v2-oklch',
  'owner-v2.1-oklch',
  'owner-v2.2-oklch',
  'owner-v2.4-cool-hue-band'
);
```

A partir de v2.5 los assignments son sagrados. Si en el futuro hay v2.6, esa migración listará explícitamente las versiones a purgar.

### 3. Orden determinista de regeneración

El allocator es incremental, por tanto el orden de procesamiento al recolorear los 5 seguidos existentes **debe ser estable**. En la capa que itera (`UsersSidebar` write path o backfill puntual):

```ts
followsToReassign
  .sort((a, b) =>
    (a.followed_since ?? a.created_at).localeCompare(b.followed_since ?? b.created_at)
    || a.followed_user_id.localeCompare(b.followed_user_id)
  )
```

Mismo orden → mismos colores, siempre. Sin ambigüedad por orden de query.

### 4. `src/test/owner-identity-allocator.test.ts` — tests de contrato

1. **Exclusión perceptual**: para N=1..50, ningún color asignado cae en la zona prohibida (`ΔE(c, anchor) ≥ EXCLUSION_DELTA_E`).
2. **Primer follow** (sin "magenta" hardcoded): `ΔE(C₁, ENRICHED_ANCHOR) ≥ ΔE(x, ENRICHED_ANCHOR) ∀ x ∈ V` — argmax verificado por sampling, no por hue específico.
3. **Maximin incremental**: para todo N≥1, `min_{c ∈ S} ΔE(C_{N+1}, c) ≥ min_{c ∈ S} ΔE(x, c) ∀ x ∈ V`.
4. **Cobertura cromática**: en los primeros 6 follows debe aparecer al menos un color en hue cálido (`h ∈ [0°, 90°] ∪ [300°, 360°]`) y al menos uno en hue frío. (Garantiza que la regla NO está atrapada en un arco.)
5. **Determinismo**: misma `assignedOklchList` → mismo siguiente color.
6. **Separación perceptual mínima**: para los 5 primeros, `min ΔE entre pares ≥ 20`.
7. **Inmutabilidad**: assignments persistidos no se recalculan al añadir nuevos.

### 5. `src/components/map/owner-stroke.ts` — solo verificación

Confirmar que solo lee el color persistido. Si aplica algún offset/filtro adicional de hue, eliminarlo.

### 6. Memoria

Reemplazar la línea core de v2.4 por una entrada v2.5 con la regla acordada. Crear/actualizar `mem://logic/social/owner-identity-allocator-v2.5` con el contrato perceptual.

## Lo que NO se toca

- Shape (triángulo invertido sin stroke) de followed.
- Helpers públicos `getOwnerIdentityColor` / `getOwnerIdentityOklch`.
- Evento `lovable:owner-identity-updated`.
- Persistencia inmutable por viewer.
- Sidebar / writes desde `UsersSidebar`.

## Resultado visible

Tras el deploy, los 5 seguidos actuales se regeneran **una vez** con orden determinista (`followed_since ASC, user_id ASC`) y obtendrán colores perceptualmente bien separados a lo largo de toda la rueda excepto la vecindad del verde. Diferenciables a simple vista. Próximos follows seguirán subdividiendo el mayor hueco libre.
