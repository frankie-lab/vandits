## Objetivo

Extender el contrato de coherencia coordenadas↔enriquecimiento para que la **identidad del POI** (nombre + coordenadas) sea condición necesaria antes de cualquier llamada al LLM. Sólo documentación. Sin código, datos, Supabase ni bump.

## Archivos a modificar

1. `docs/contracts/enrichment-coord-coherence-contract.md`
2. `docs/audits/enrichment-coord-coherence-audit.md`
3. `docs/tech-debt.md`

## Cambios

### 1. `docs/contracts/enrichment-coord-coherence-contract.md`

**§1 Principios** — añadir principio 6:

> 6. Identidad del POI = nombre compatible + coordenadas compatibles. Coordenadas válidas no bastan; nombre válido no basta. Sin identidad confirmada no hay enriquecimiento.

**§2 Definiciones** — añadir:

- **Identidad nombre↔coords**: par `(name, lat, lng)` cuya verificación cruzada (reverse-geocode + nearby + name-search) devuelve match con confianza alta.
- **`name_coordinate_mismatch`**: razón canónica cuando coords son válidas pero el nombre apunta a otro lugar.

**§3 Reglas duras** — añadir **R9 — Name-coordinate identity gate**:

Antes de invocar la IA, además de R1:

1. Validar coords (R1).
2. Reverse-geocode + nearby lookup desde `(lat,lng)` → conjunto `C_coords` de candidatos cercanos (radio configurable, p.ej. ≤ 250 m / 1 km según tipo).
3. Cuando el nombre es resoluble (no genérico), búsqueda por nombre → conjunto `C_name` de candidatos con coords.
4. Comparar `name` declarado contra `C_coords` (fuzzy + normalización topónimos).
5. Decisión:
   - **match alto** (`name ∈ C_coords` o `dist(name_best, coords) ≤ ε`) → continuar enriquecimiento.
   - **coords válidas, nombre no aparece cerca** → `validation_required` con `reason='name_coordinate_mismatch'`, modo "revisión", no enriquece.
   - **nombre existe lejos** (`C_name ≠ ∅` y todos están lejos de `coords`) → devolver `C_name` como **candidatos** al usuario (con sus coords), `reason='name_found_elsewhere'`. No mover el POI automáticamente. No enriquecer como `enriched`.
   - **coords inválidas** (R1 falla) → forward-geocode por nombre + contexto (`country/region`), pero NO enriquecer hasta que el usuario confirme coordenadas.
6. Toda decisión distinta de "match alto" se registra en `custom_data.enrichment_block = { reason, candidates, source }` y deja `enrichment_status` en `pending_validation` (no en `enriched`, no en `quarantine` —  la quarantine de R6 cubre incoherencia IA↔coords post-enriquecimiento; R9 es pre-LLM).

R9 es **pre-LLM** y **complementaria** a R6 (post-LLM).

**§4 Fases** — reordenar/renumerar:

- Fase 1 — Entry gates duros (`isValidWgs84Coord`). [sin cambio]
- Fase 2 — `resolve-coordinates` obligatorio antes del LLM. [sin cambio]
- **Fase 3 (nueva) — Name-coordinate identity gate** (R9). Helper `assertNameCoordinateIdentity({name, lat, lng})`; consume `resolve-coordinates` (Fase 2) + nearby lookup + name-search. Emite `pending_validation` con candidatos. UI de validación reutiliza panel de unresolved/quarantine. Va **después** de Fase 2 y **antes** del LLM.
- Fase 4 — Prompt y validator: IA fuera de geografía estructurada. [antes Fase 3]
- Fase 5 — `geo_health` honesto. [antes Fase 4]
- Fase 6 — `assertGeoCoherence` post-LLM + quarantine (R6). [antes Fase 5]
- Fase 7 — `places_trunk` saneado + guard `zone≠region`. [antes Fase 6]

**§5 Riesgos** — añadir:

- Fase 3 puede frenar imports masivos legítimos con nombres genéricos (“Parking”, “Mirador”). Umbral de "match alto" y exenciones por tipo deben iterarse.
- `name_found_elsewhere` requiere UI de candidatos; sin ella, los POIs quedan atascados en `pending_validation`.

**§6 Fuera de scope** — sin cambios materiales, sólo recordar que R9 no mueve coords del POI automáticamente.

### 2. `docs/audits/enrichment-coord-coherence-audit.md`

- **§3 Cadena de fallos** — añadir paso 8:
  > 8. **Sin gate de identidad nombre↔coords** — nadie compara el nombre declarado contra reverse-geocode/nearby/name-search antes del LLM. Permite que “Glorieta de la Antártida” en `(0,0)` o un nombre real desplazado a coordenadas erróneas pase a enriquecimiento.

- **§4 Tabla de anomalías** — añadir fila:
  | F8 | identity gate | Nombre y coords incoherentes pasan al LLM | No existe `assertNameCoordinateIdentity` pre-LLM | Identidad del POI no garantizada |

- **§5 Síntesis** — añadir párrafo:
  > Adicionalmente, **identidad y verdad geográfica también están desacopladas**: el sistema acepta cualquier `(name, lat, lng)` sin verificar que el nombre exista cerca de esas coordenadas ni que las coordenadas correspondan a algún lugar compatible con ese nombre.

### 3. `docs/tech-debt.md`

**Ítem 7 “Coherencia coordenadas-enriquecimiento”**:

- Tabla resumen: añadir mención a identidad nombre↔coords en la columna comentario.
- Cuerpo: ampliar “Motivo” y “Causa raíz” para reflejar que existen **dos** desacoples:
  1. coords ↔ geografía estructurada (ya documentado).
  2. **nombre ↔ coords** (nuevo): un nombre puede apuntar a un lugar y las coords a otro, y nada lo detecta antes del LLM.
- Lista de fases: insertar “3. Name-coordinate identity gate (R9).” y renumerar las siguientes (4–7).

## Restricciones

- No tocar `src/`, `supabase/`, datos, `package.json`, `README`, versión, tests.
- Version impact: none.
- tests/lint not run: docs-only contract update.

## Reporte final (tras implementar)

- Archivos modificados: los 3 listados.
- Nueva regla: R9.
- Nueva fase: Fase 3 (renumeración 4–7).
- Nuevo principio: §1.6.
- Confirmación: sin código / sin datos / sin Supabase / sin bump.
