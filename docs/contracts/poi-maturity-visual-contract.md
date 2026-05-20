# POI Maturity Visual Contract (POI-0 … POI-10) — v2

> **Status:** ACTIVO (doc-only v2). Alinea contrato visual con la implementación canónica `computePoiMaturity`.
> **Version impact:** none. Sin código, sin datos, sin tokens, sin overlay, sin bump.
> **Scope:** define la escala de **madurez objetiva** del POI en 11 niveles (POI-0…POI-10), su SoT, su paleta cromática producto-aprobada (gris → amarillo → ámbar → verde), su interacción con flags `geo_resolution` y la reinyección de POIs tras validación humana.

---

## 1. Fuente de verdad (SoT)

**SoT funcional = `computePoiMaturity`** (`src/domains/content/lib/poi-maturity.ts`).

- Ladder estrictamente monotónico por **campos disponibles**. Función pura, determinista, ya cubierta por tests (`src/test/poi-maturity.test.ts`, `poi-maturity-overlay.test.ts`).
- Mide **deuda objetiva** del catálogo, no estado personal. Coherente con la regla DURA "salud objetiva ≠ estado personal" (P-POI-CURATION-1).
- `visited` / `user_rating` / foto propia **no** son gates de POI-N. Viven en `userPersonalState` (P-POPUP-14.2) y son ortogonales a la madurez.

Las versiones previas de este contrato mezclaban madurez con estado personal y proponían "broken=POI-3 rojo crítico". Esa parte queda **descartada** en v2.

---

## 2. Tabla canónica POI-0 … POI-10

| Nivel  | Color (grupo)      | Significado funcional (lo que el ladder mide)                                                       |
| ------ | ------------------ | --------------------------------------------------------------------------------------------------- |
| POI-0  | Gris neutro        | Sin dato útil: ni nombre validado ni coordenadas presentes.                                         |
| POI-1  | Gris cálido        | Sólo coordenadas presentes (sin nombre validado).                                                   |
| POI-2  | Gris cálido        | Sólo nombre validado (coordenadas inválidas o ausentes — Null Island, NaN, fuera de rango WGS84).   |
| POI-3  | Amarillo apagado   | Nombre + coordenadas WGS84 válidas, sin `raw_geocode`.                                              |
| POI-4  | Amarillo           | Identidad confirmada: `raw_geocode` poblado por geocoder.                                           |
| POI-5  | Amarillo intenso   | País o continente resuelto.                                                                         |
| POI-6  | Ámbar suave        | Región o zona/provincia resuelta.                                                                   |
| POI-7  | Ámbar              | Descripción IA verificable (no placeholder evasivo del LLM).                                        |
| POI-8  | Verde amarillento  | Media validada (imagen IA o foto propia).                                                           |
| POI-9  | Verde suave        | Categoría / tags semánticos validados.                                                              |
| POI-10 | Verde              | Curado completo: `geo_health='ok'` + `enrichment_status='enriched'` + `observacion` presente.       |

### Reglas DURAS del ladder
- Coordenadas inválidas (NaN, null, fuera de WGS84, Null Island) NUNCA pueden producir nivel > POI-2.
- Sin `raw_geocode` no se puede pasar de POI-3.
- Sin geografía resuelta (país/región) no se puede llegar a POI-7+.
- Estado personal NUNCA degrada el nivel objetivo. Tampoco lo eleva.

---

## 3. Lectura visual

**El color comunica el GRUPO. El badge numérico comunica el NIVEL EXACTO.**

| Grupo cromático | Niveles  | Intuición rápida                              |
| --------------- | -------- | --------------------------------------------- |
| Gris            | 0, 1, 2  | "Le falta lo básico."                         |
| Amarillo        | 3, 4, 5  | "Tiene identidad, falta geografía completa."  |
| Ámbar           | 6, 7     | "Tiene geografía, falta enriquecer."          |
| Verde           | 8, 9, 10 | "Enriquecido, escalando hasta curación máxima." |

POI-1 y POI-2 comparten gris cálido porque ambos son "le falta lo básico"; la diferencia (sólo coords vs sólo nombre) la comunica EXCLUSIVAMENTE el badge.

No hay rojo. No hay degradación cromática por estado personal.

---

## 4. Interacción con flags `geo_resolution` (regla DURA nueva)

Contrato base: [`docs/contracts/geo-resolution-flags-contract.md`](./geo-resolution-flags-contract.md).

Un POI con flag activo en `custom_data.geo_resolution.status` queda **topado** a un nivel máximo. El cálculo es `Math.min(nivel_calculado_por_el_ladder, techo_del_flag)`:

| Flag                | Techo máximo          |
| ------------------- | --------------------- |
| `pending_review`    | POI-4                 |
| `needs_name_fix`    | POI-3                 |
| `needs_coord_fix`   | POI-2                 |
| `geo_irrecoverable` | POI-1 (fijo)          |

Sin flag (o flag retirado) → sin techo, el ladder vuelve a operar libremente.

### Justificación
- `pending_review` (POI-4): identidad puede estar confirmada pero la calidad del nombre/coords no fue ratificada por humano → no debe presentarse como POI alto enriched.
- `needs_name_fix` (POI-3): el nombre tiene artefactos sintéticos (sufijos `Nuevo`, `Nueva`, `#N`) → la geografía resuelta posterior puede ser correcta pero el POI no es presentable.
- `needs_coord_fix` (POI-2): la geo es inválida o sospechosa → no puede pasar el gate de POI-3.
- `geo_irrecoverable` (POI-1): nombre fabricado / no verificable → no debe entrar en circuitos automáticos ni mostrarse como progresable.

---

## 5. Reinyección tras validación humana

Diagrama canónico de retorno al circuito normal cuando un POI flagueado es revisado en la cola B5b:

```text
POI flagueado (techo activo)
  │
  ├── revisión humana en cola B5b
  │     ├── approve_name      → borrar flag                                  → ladder libre → recomputa POI-N
  │     ├── edit_name         → UPDATE name + borrar flag                    → entra a próxima tanda B5/B5a
  │     ├── (coords corregidas) → humano corrige coords + borrar flag        → re-geocode normal
  │     ├── reject            → mantener flag o promover a geo_irrecoverable (POI-1 fijo)
  │     └── move_to_B5a       → borrar flag                                  → siguiente tanda automática lo recoge
  │
  └── al borrar el flag, `computePoiMaturity` vuelve a calcular SIN techo
```

Operaciones SQL únicas en reinyección (futuras, no incluidas en este contrato doc-only):
- `UPDATE locations SET custom_data = custom_data - 'geo_resolution' WHERE id = …` (libera techo).
- `UPDATE … SET name = …` opcional si `edit_name`.

Sin re-enrich forzado. Sin bump. Estado personal intacto. Sin tocar `coords` salvo decisión humana explícita.

---

## 6. Relación con el canon actual del renderer (NO se sustituye)

El renderer del marker sigue rigiéndose por dos ejes ortogonales **ya existentes**:

1. **`getPointVisualState`** (`enriched` / `imported` / `empty`) — SoT histórica del color del marker propio.
2. **`getPoiCurationLevel` → `levelKey`** (PR-MAP-CANON-3, 6 niveles `{poi-0, poi-1a, poi-1b, poi-3, poi-5, poi-9, poi-10}`) — SoT actual del fill via `levelVisual.fillHsl`.

POI-N es una **señal complementaria diagnóstica**, NO reemplaza ninguno de esos ejes:

- POI-0…POI-4 caen en buckets `empty` / `imported`.
- POI-5…POI-10 caen en bucket `enriched`.
- Mapeo informativo a `levelKey`: POI-0→`poi-0`, POI-1/2→`poi-1a`, POI-3→`poi-3`, POI-4→`poi-1b`, POI-5→`poi-5`, POI-6/7/8/9→`poi-9`, POI-10→`poi-10`. Función pura muchos-a-uno.
- Regla de identidad de seguidos (`paletteScope = 'owner-identity'`) intacta: POI-N **sólo aplica a POIs propios** (`paletteScope = 'state'`). Followed/app/source quedan fuera.

---

## 7. Consumo

POI-N hoy se consume EXCLUSIVAMENTE por:

- **Overlay diagnóstico admin-gated** `MaturityBadgeLayer` (`src/components/map/MaturityBadgeLayer.tsx`) sobre tokens `poi.maturity.0..10`.
- **Auditorías** (`docs/audits/b5-poi-maturity-distribution.md`, futuras revisiones de salud del catálogo).

NO se consume por: `createCustomIcon`, `resolvePoiVisualGrammar`, `getPoiCurationLevel`, popup, hero, ratings, export, sharing, health rings, collection tints. Esos siguen su SoT propia.

---

## 8. Pendientes (no incluidos en este contrato doc-only)

Estos cambios materializan el contrato en código y tokens. Cada uno requiere su propio PR con `Version impact: patch`:

1. **`computePoiMaturity`**: añadir input opcional `customData?.geo_resolution?.status` (camel + snake) y aplicar `Math.min(level, ceilingFromFlag(status))`. Tests aditivos.
2. **Tokens `poi.maturity.0..10`**: recalibrar HSL a la paleta producto-aprobada (gris → amarillo → ámbar → verde). Sólo namespace `poi.maturity.*`; **no tocar** `poi.state.*`, `poi.level.*`, `poi.ring.*`, `poi.collectionTintSample.*`.
3. **Helper SQL futuro** (opcional): índice parcial sobre `(custom_data->'geo_resolution'->>'status')` si la cola crece.

---

## 9. Qué este documento NO hace

- NO modifica `computePoiMaturity` ni tokens.
- NO modifica `getPoiCurationLevel`, `getPointVisualState`, `resolvePoiVisualGrammar`, `createCustomIcon`.
- NO toca markers, colecciones, health rings ni overlay.
- NO introduce migración de datos.
- NO cambia popup, footer, ratings block, hero ni breadcrumb.
- NO cambia visibilidad, sharing, export.
- NO bump de versión.

Es **contrato visual canónico** vivo. Cualquier PR que modifique POI-N debe enlazarlo y respetar §1, §2, §4 y §5.
