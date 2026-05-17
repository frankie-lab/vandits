# P-POPUP-7A.3 — Implementación del contrato de ratings del popup

Implementa el contrato documental ya ratificado en `docs/popups/p-popup-7a2-rating-contract.md`. Solo presentación en `src/components/map/map-popups.ts` + tests + docs/memoria. Sin cambios a handlers, schema, hero chrome, ownership, F2 o PopupShell.

## Objetivo visual

Orden canónico final en el body enriched:

```text
description → enrichmentRating → userPersonalState → observation → secondaryFields(field_order)
```

Las estrellas IA salen de la cabecera y entran al composer como slot disjunto.

## Cambios

### 1. Nuevo helper único `buildEnrichmentRatingBlock`

Ubicación: `src/components/map/map-popups.ts`, junto a `buildPersonalStateBlock` (~L356).

Firma:
```ts
export function buildEnrichmentRatingBlock(
  location: GeoLocation,
  enriched: EnrichedData | null | undefined,
  ownership: { isCuratorPoint: boolean },
): string
```

Comportamiento:
- `isCuratorPoint === true` → renderiza el actual `.weighted-rating-container` (curator weighted, verde, con `data-ai-rating`, valor numérico y breakdown oculto).
- `!isCuratorPoint && enriched?.indice_interes` → renderiza el chip ámbar.
- Ninguno de los dos → `''`.
- Envuelve la salida en un slot semántico discreto (mismo wrapper visual que ya tenían, sin la caja gris superior `background: --surface-muted`) con `margin: 0 0 ${CARD.sectionGap}px 0`, alineado al cuerpo del popup (no centrado dentro de caja). Diseño minimalista: chip/badge inline alineado a la izquierda. No introduce label "Valoración IA" textual nuevo (los tooltips actuales se mantienen).
- Idéntico HTML interno de estrellas que hoy, para preservar selectores `.weighted-rating-container`, `data-ai-rating`, etc.

### 2. Eliminar render inline de estrellas IA en la cabecera

En L1294–L1340, el bloque "Índice IA + Botones de interacción":
- Quitar las dos ramas (curator weighted-rating-container y chip ámbar) — L1311–L1334.
- Mantener el warning de validación (L1296–L1309) — sigue siendo cabecera válida (no es rating semántico).
- Si tras quitar las ramas el contenedor exterior queda vacío (sólo flex wrapper sin children visibles), eliminarlo. Si queda warning, conservar wrapper sin la `<div>` interior flex de rating.

### 3. Composer: añadir slot `enrichmentRating`

En L1383 y siguientes:

```ts
const enrichmentRatingFragment = buildEnrichmentRatingBlock(
  location, enriched, { isCuratorPoint }
);
const personalStateFragment = buildPersonalStateBlock(location, personalStateCtx);
```

Renombrar `ratingFragment` → `personalStateFragment` (eliminar nombre ambiguo).

Actualizar el anclaje canónico (L1638–L1645) a la tripleta extendida:

```ts
// desc + enrich + personal + obs
// Reducciones: compactar adyacentes preservando orden 1→2→3→4
const parts = [descFragment, enrichmentRatingFragment, personalStateFragment, obsFragment]
  .filter(Boolean);
const canonicalBlock = parts.join('');
```

Fallback (L1654–L1656, ninguna canonical key en `orderedKeys`):
```ts
composed.push(enrichmentRatingFragment);
composed.push(personalStateFragment);
```

`CANONICAL_KEYS` se mantiene `{'descripcion','observacion'}` (las claves que el composer "absorbe" de `orderedKeys`). `indice_interes` ya retornaba `''` en su `case` (L1607) — sigue igual: el composer es la única fuente.

### 4. Documentación

- `docs/popups/p-popup-7a-validation.md`: añadir sección "7A.3 — Ratificación" con evidencia (selectores movidos, tests verdes).
- `docs/popups/p-popup-7a2-rating-contract.md`: marcar §7 Migration Impact Check como ejecutado.
- `mem://style/popup/canonical-body-composer`: refrescar al estado implementado.

### 5. Tests (`src/test/popup-personal-state-hierarchy.test.ts` + nuevo archivo si se hace pesado)

Guardrails G1–G10 ya definidos en el contrato. Mínimo a añadir:

- **G1**: la cabecera (todo lo previo a `case 'descripcion'`) no contiene `weighted-rating-container`, `data-ai-rating`, ni el chip ámbar con `★`/`☆` ligado a `indice_interes`.
- **G2**: scan estático: `weighted-rating-container` aparece exclusivamente dentro de `buildEnrichmentRatingBlock`.
- **G5/G6**: render del popup enriched con desc+enrich+personal+obs todos presentes → orden HTML 1→2→3→4. Cubrir las reducciones (sin enrich, sin personal, etc.).
- **G8**: `buildPersonalStateBlock` no contiene `data-ai-rating`/`indice_interes`; `buildEnrichmentRatingBlock` no contiene `data-action="set-rating"`/`user_rating`.
- **G9**: en el HTML completo del popup enriched, no aparece `★`/`☆` antes del marcador `>Descripción<`.

Actualizar el test existente `P-POPUP-7A.1 — switch produces fragments only` para reflejar el nuevo nombre `personalStateFragment` y la presencia de `enrichmentRatingFragment` en el composer.

## Fuera de scope

Hero chrome, visited overlay, fotos, taxonomy, collections, provenance, geo header, lifecycle, schema, marker grammar, F2, React migration, PopupShell, tokens visuales nuevos.

## Criterios de aceptación

- Visual: no quedan estrellas arriba; estrellas IA aparecen debajo de Descripción; Valorar aparece debajo de las estrellas IA; Observación debajo de ambos.
- Tests G1–G2, G5, G6 (reducciones), G8, G9 en verde + tests existentes 7A.1 ajustados.
- Build limpio, sin cambios fuera de `map-popups.ts` (presentación) y archivos de test/docs/memoria.

## Archivos tocados

- `src/components/map/map-popups.ts` (helper nuevo + remoción cabecera + composer)
- `src/test/popup-personal-state-hierarchy.test.ts` (actualizar 7A.1; añadir G1–G9)
- `docs/popups/p-popup-7a-validation.md`
- `docs/popups/p-popup-7a2-rating-contract.md`
- `mem://style/popup/canonical-body-composer`
