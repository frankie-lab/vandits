# POI Identity Root Status — Contract (A/B/C/D)

Status: DRAFT (no code, no schema, no data writes). Read-only conceptual contract.

## 1. Purpose

Provide a **root identity classification** for every POI that answers a single
operational question in O(1):

> ¿Quién es responsable de mover este POI hacia adelante: el **usuario**, el
> **sistema/canon/backfill**, o el **enriquecimiento automático**?

This axis is **orthogonal** to the canonical visual maturity scale `POI-0..POI-10`
(see `docs/contracts/poi-maturity-visual-contract.md` and
`docs/contracts/marker-fill-canon-v3.md`). It does **not** replace it, does
**not** change marker fill, and does **not** alter `computePoiMaturity` today.

## 2. The four states

| Root | Name | Auxiliary color | Typical POI-N cap | Cause | Action owner |
|------|------|-----------------|-------------------|-------|--------------|
| **A** | Incompleto real | rojo | POI-0 / POI-1 / POI-2 / POI-3 | Falta nombre útil, coordenadas válidas, o identidad mínima | **Usuario** |
| **B** | Canon/backfill pendiente | amarillo | suele quedar capado en POI-4 / POI-5 / POI-6 | POI válido pero mal clasificado por falta de canon territorial, `admin_area`, FK o backfill | **Sistema / canon / backfill** |
| **C** | Identidad incoherente | naranja | máximo POI-3 / POI-4 con flag | Nombre y coordenadas no apuntan al mismo lugar (`geo_health ∈ {broken, stale_name, empty}`) | **Usuario** (revisión) |
| **D** | Identidad confirmada | verde | mínimo POI-4; puede escalar hasta POI-10 | Nombre + coordenadas coherentes, `geo_health='ok'` o `partial` controlado | **Enriquecimiento automático** |

Color auxiliar = uso secundario (filtros, tooltip, panel admin, badge de
salud/identidad, auditoría, cola de trabajo). **NO sustituye** el fill canónico
POI-N del marker propio.

## 3. Relación con POI-0..POI-10

`POI-N` mide **madurez visual** (cuán "terminado" se ve un POI: identidad +
geografía + descripción + media + tags + valoración personal).
`POI-A/B/C/D` mide **a quién toca actuar**.

Mapping orientativo (no normativo, no se cablea como gate):

```
A → suele quedar en POI-0..POI-3   (falta lo más básico)
C → suele quedar en POI-3..POI-4   (geo_health degradado bloquea madurez)
B → suele quedar en POI-4..POI-6   (POI válido pero canon/backfill incompleto)
D → POI-4..POI-10                  (único habilitado para automatización)
```

La regla dura es asimétrica:

- **POI-N puede subir sin que A/B/C/D cambie** (ej: D que pasa de POI-5 a POI-9
  al enriquecer).
- **A/B/C/D puede cambiar sin que POI-N cambie inmediatamente** (ej: C → D
  cuando el usuario corrige el nombre, antes de re-clasificar madurez).

## 4. Responsable de acción

| Root | Owner | Operación esperada |
|------|-------|--------------------|
| A | `user` | Editar nombre / coordenadas / identidad mínima en la UI |
| B | `system` | Job de canon / backfill (`backfill-admin-fks`, canonicalize, FK resolver) |
| C | `user` | Revisar y corregir (no auto-resolver) |
| D | `auto` | Pipeline de enriquecimiento IA (`enrich-location`, image recovery, etc.) |

## 5. Reglas duras

### 5.1 No enriquecer A ni C

- **A**: enriquecer sin identidad mínima produce ruido y falsos POIs. Bloquear
  cualquier auto-enrichment hasta que el usuario complete identidad.
- **C**: enriquecer un POI con nombre y coordenadas incoherentes amplifica el
  error (la IA describiría el lugar equivocado o mezclaría ambos). Bloquear
  auto-enrichment hasta resolución manual.

Esto es coherente con el contrato existente
`docs/contracts/enrichment-coord-coherence-contract.md`.

### 5.2 No penalizar al usuario por B

`B = Canon/backfill pendiente` es **culpa del sistema**, no del usuario. No
mostrar mensajes de error orientados al usuario, no exigir intervención manual,
no degradar visualmente el POI más allá de su POI-N natural. La cola de trabajo
B la procesa el sistema.

### 5.3 D es el único estado apto para enriquecimiento automático

Cualquier batch IA, image recovery, semantic search indexing o re-enrich debe
filtrar `identity_root_status = 'D'` antes de operar. A/B/C son skip silencioso
(no errores).

### 5.4 No sustituye marker fill POI-N

El fill del marker propio sigue rigiéndose por
`mem://style/map/poi-visual-grammar-composition` y `marker-fill-canon-v3.md`.
A/B/C/D vive como capa auxiliar: color secundario en badge/filtro/tooltip,
nunca como `<circle fill>`.

## 6. Campos futuros (propuesta, NO crear ahora)

Cuando se decida materializar, los campos canónicos serían:

```ts
identity_root_status: 'A' | 'B' | 'C' | 'D'
identity_action_owner: 'user' | 'system' | 'auto'
identity_reason: string  // p.ej. 'missing-coordinates', 'canon-missing-region', 'name-coord-mismatch'
```

Notas de diseño previstas:

- Derivado, no editable manualmente.
- Recomputado por trigger o job, con el mismo SoT que `computePoiMaturity` para
  evitar divergencia A/D vs POI-N.
- `identity_reason` ENUM cerrado, no string libre.
- Index parcial `WHERE identity_root_status IN ('A','B','C')` para la cola.

Hasta entonces, la clasificación se hace en runtime/dry-run a partir de:

```
A := name vacío  OR coords nulas/(0,0)
C := geo_health ∈ {broken, stale_name, empty}
B := country_id IS NULL  OR geo_health='partial'  OR (enriched AND region_id IS NULL)
D := resto
```

Esta heurística es la base del dry-run en
`docs/audits/poi-identity-root-status-dry-run.md`.

## 7. Restricciones explícitas (lo que este contrato NO hace)

- No toca `computePoiMaturity`.
- No toca marker fill POI-N.
- No crea columnas en `locations`.
- No re-enrich.
- No migra datos.
- No introduce nuevos gates de visibilidad ni de export.
- No cambia RLS.
- No bump de versión.

## 8. Referencias

- `docs/contracts/poi-maturity-visual-contract.md`
- `docs/contracts/marker-fill-canon-v3.md`
- `docs/contracts/enrichment-coord-coherence-contract.md`
- `docs/contracts/geo-resolution-flags-contract.md`
- `mem://style/map/poi-visual-grammar-composition`
- `mem://logic/poi/curation-levels`
