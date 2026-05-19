
# Canon territorial v2 — documentación del eje contención

Aprobado como **canon conceptual** (no operativo). Cero código, cero schema, cero cambios funcionales. Solo tres entregables documentales.

## Ajustes finales aplicados

- `site` ≡ `complex` → **alias del mismo nivel C0**.
- `entrance` se mantiene como **C2** (nivel, no metadata).
- Popup **NO** renderiza "Dentro de" en esta fase (queda como deuda).
- Dedupe operativo basado en `container_path` se mueve a **PR-DEDUPE** separado (fuera de alcance).

## Out of scope (explícito, no resuelto)

Schema (`parent_place_id`, `is_container`) · dedupe operativo · popup "Dentro de" · inferencia automática de containers · helpers de path reales · modelado indoor completo · cache/read-model del container path.

---

## Entregable 1 — `docs/contracts/geo-territorial-canon.md` (v2)

Añadir al contrato v1 una sección nueva **"Place containment hierarchy"** con:

- **§X.1 Dogma de los dos ejes**
  - Territorial dice WHERE · Containment dice INSIDE WHAT.
  - Same coords ≠ same POI.
  - Coexisten en todo POI; nunca mezclar `admin1/2/3` con `site/building/...`.
- **§X.2 Niveles universales contención** (C0–C5 + T)
  - C0 `site` (≡ `complex` — alias)
  - C1 `building`
  - C2 `entrance` (hermano de floor, no metadata)
  - C3 `floor`
  - C4 `unit` (≡ `venue` — alias)
  - C5 `room` (≡ `exhibit` — alias)
  - T `poi` (cierra jerarquía)
  - Skipping permitido. Un POI puede ser container (`is_container` lógico).
- **§X.3 Identidad: por qué coords ≠ POI**
  - Discriminadores: `placeId` | `placeType` | `place_container_path` | `name+autor`.
  - Ejemplo Catedral / Pórtico de la Gloria.
- **§X.4 `place_container_path`** — calculado, no nivel, no denormalizado, no cycles, profundidad máx 6.
- **§X.5 Mapping local labels** por contexto (genérico ES/EN, museo, religioso, comercial, transporte, hotel, estadio).
- **§X.6 Aliases legacy y soporte actual** — matriz indicando que hoy **no** existe `parent_place_id`; eje solo declarado.
- **§X.7 Impacto por superficie** (declarativo, no implementado en esta fase): popup, mapa, búsqueda, dedupe, export/share, resolver.
- **§X.8 Out of scope / deuda futura** (lista de arriba textual).

Marca visible al inicio de la sección: **"Canon conceptual — sin implementación en esta fase. No usar para inferir comportamiento operativo."**

## Entregable 2 — `mem://geography/territorial-canon`

Ampliar el anchor existente del canon v1 añadiendo invariantes del eje contención:

```
---
name: Geo-territorial canon (v2 — containment axis)
description: Dos ejes ortogonales territorial+containment. Coords ≠ POI. Container path calculado.
type: feature
---
... (contenido v1 preservado)

## Eje contención (v2, conceptual)
- Territorial dice WHERE; Containment dice INSIDE WHAT. Nunca mezclar.
- Niveles universales: site(≡complex) > building > entrance > floor > unit(≡venue) > room(≡exhibit) > poi.
- Same coords ≠ same POI. Identidad requiere placeId | placeType | container_path | name+autor.
- `place_container_path` es calculado, no nivel; no se denormaliza; no cycles; depth ≤ 6.
- Edificio puede ser POI y container simultáneamente (`is_container` lógico).
- Out of scope hoy: schema, dedupe operativo, popup "Dentro de", inferencia automática, helpers reales, cache.
```

## Entregable 3 — `mem://index.md`

Una línea adicional en **Core** (preservando todo el contenido existente):

```
- **Canon territorial v2 (containment)**: Territorial=WHERE, Containment=INSIDE WHAT. Same coords ≠ same POI. Niveles universales site/building/entrance/floor/unit/room→poi. `place_container_path` calculado, nunca denormalizado. Conceptual; sin schema ni dedupe operativo aún. Ver `mem://geography/territorial-canon` y `docs/contracts/geo-territorial-canon.md`.
```

Y una entrada en **Memories** si no estaba ya enlazada:

```
- [Geo-territorial canon (containment v2)](mem://geography/territorial-canon)
```

---

## Verificación post-implementación

1. Los tres archivos existen y son coherentes entre sí.
2. La sección nueva del contrato lleva el banner "Canon conceptual — sin implementación".
3. `mem://index.md` conserva íntegro su Core y Memories previos.
4. Cero archivos de código tocados. Cero migraciones. Cero tests.
