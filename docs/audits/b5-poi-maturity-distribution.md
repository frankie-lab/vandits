# B5 — Distribución por madurez POI-N del scope (inspección)

**Status:** 📊 Inspección (no se modifica nada)
**Fecha:** 2026-05-20
**Helper aplicado:** `computePoiMaturity` (v1.2.17) — contrato `docs/contracts/poi-maturity-visual-contract.md`.
**Scope B5 (candidato):** `geo_health = 'hardError'` ∪ (`enrichment_status = 'enriched'` ∧ `raw_geocode` vacío/NULL).

> No se ha ejecutado B5. No se ha tocado código, datos, ni el renderer del mapa. Esta nota se apoya en el overlay POI-N (modo admin, v1.2.18) y en un mirror SQL determinista del ladder.

## 1. Totales del scope

| Bucket | n |
|---|---|
| `geo_health = 'hardError'` | 389 |
| `enrichment_status = 'enriched'` ∧ sin `raw_geocode` | 394 |
| **Unión (scope B5)** | **394** |
| Intersección (ambas condiciones a la vez) | 388 |

→ El subconjunto `enriched-sin-raw_geocode` **contiene casi por completo** al subconjunto `hardError`. Sólo 1 POI cae únicamente por el lado "enriched-sin-raw" (no marcado hardError) y 5 caen sólo por el lado "hardError" sin estar enriched-sin-raw. El scope efectivo es **394 POIs**.

## 2. Conteo por nivel POI-N

| POI-N | Total | `hardError` | `enriched ∧ ¬raw_geocode` | Ambos |
|---|---:|---:|---:|---:|
| POI-2 (nombre, coords inválidas) | 1 | 1 | 1 | 1 |
| POI-3 (nombre + coords válidas, sin `raw_geocode`) | **393** | 388 | 393 | 388 |
| POI-4..10 | 0 | 0 | 0 | 0 |

**Lectura:** el 99.7 % del scope se concentra en POI-3. Es el techo natural de la ladder cuando falta `raw_geocode` — coincide con la regla DURA `"sin raw_geocode no se puede pasar de POI-3"`. El único POI-2 es un caso Null Island clásico (lat=0, lng=0).

## 3. Ejemplos representativos

### POI-3 — 10 muestras aleatorias

| id | name | lat | lng | geo_health | país |
|---|---|---:|---:|---|---|
| `4fc18bfc…` | Plaza Mayor de Albacete de la Sierra | 39.068463 | −1.97694 | hardError | España |
| `f43da01c…` | Níjar | 36.966 | −2.206 | partial* | España |
| `81db2216…` | Mercado Central de Rennes Alto | 48.055132 | −1.743717 | hardError | Francia |
| `1b2b47d2…` | Mirador de Nueva York | 40.804203 | −74.009669 | hardError | EE.UU. |
| `4d382d2d…` | Ruta de Senderismo Zaragoza del Valle | 41.595665 | −0.992439 | hardError | España |
| `d8151dd1…` | Jardín Botánico de Vigo | 42.224558 | −8.666837 | hardError | España |
| `d2d0faf5…` | Cueva de Madrid Bajo | 40.33612 | −3.595076 | hardError | España |
| `f5caa63b…` | Parque Municipal de Grenoble Antiguo | 45.144834 | 5.669769 | hardError | Francia |
| `7fcf8f21…` | Jardín Botánico de Murcia Alto | 38.05416 | −1.084954 | hardError | España |
| `1c1f98f3…` | Sant'Antonino | 42.5883511 | 8.9048052 | hardError | Francia |

\* `Níjar` aparece porque cumple `enriched ∧ ¬raw_geocode` aunque `geo_health = 'partial'` (no `hardError`).

### POI-2 — único caso

| id | name | lat | lng | geo_health |
|---|---|---:|---:|---|
| `89867d20…` | Antarctica Roundabout | 0 | 0 | hardError |

Null Island puro. No remediable con re-geocoding; requiere acción manual o purge.

## 4. Observaciones

- **Patrón evidente:** muchos nombres son sintéticos (`"Mirador de Nueva York"`, `"Mercado Central de Rennes Alto"`, `"Cueva de Madrid Bajo"`) — POIs generados por IA contra topónimos genéricos, sin verificación real (`raw_geocode` ausente). Son los principales candidatos a falsos positivos del enrichment LLM.
- **Geográficamente concentrados** en ES/FR (con outliers EE.UU., Corse). No hay sesgo de continente que justifique lotes regionales.
- **Riesgo de re-enrich masivo:** todos comparten la misma deuda objetiva (falta de `raw_geocode`). Una pasada B5 que sólo intente re-resolver `raw_geocode` (sin reenriquecer descripción/imagen) es homogénea sobre el scope.

## 5. Recomendación

**Ir por lotes pequeños, no por todos a la vez.** Justificación:

1. **Homogeneidad ≠ seguridad.** Los 393 POI-3 son uniformes en deuda, pero también en riesgo: nombres dudosos pueden producir geocoding incorrecto y materializar coordenadas falsas como `raw_geocode` válido — exactamente el bug que B5 debería cerrar, no abrir.
2. **Calibración del normalizador.** Antes de tocar 393 filas conviene validar la heurística de re-geocoding con un lote de 20–30 muestras representativas (mezcla ES/FR/intl + nombres sintéticos vs reales) y revisar manualmente los resultados.
3. **Caso Null Island (POI-2)** → tratar **fuera del lote principal**. No tiene coordenadas reales que validar; necesita decisión específica (purge, manual fix, o flag `geo_irrecoverable`).
4. **No hay payoff en paralelizar por nivel** (sólo hay POI-3 con masa real). La estratificación útil es por **fiabilidad del nombre**, no por POI-N.

### Plan de lotes sugerido

| Lote | Filtro | n aprox | Acción |
|---|---|---:|---|
| L0 (calibración) | 25 POIs muestreados al azar del POI-3 | 25 | Re-geocode + revisión humana antes de promover |
| L1 (Null Island) | POI-2 (`abs(lat)<1e-7 ∧ abs(lng)<1e-7`) | 1 | Decisión manual: purge o `geo_irrecoverable` |
| L2 (ES/FR mass) | POI-3 con `country ∈ {España, Francia}` | ~370 | Sólo tras L0 verde |
| L3 (resto) | POI-3 restante (EE.UU., Corse, …) | ~20 | Tras L2 |

**No ejecutar B5 hasta:**
- L0 validado humanamente.
- Definir explícitamente qué campos toca B5 (sólo `raw_geocode` + `geo_health` + `region/zone/country_id` derivados, **no** `enriched_data.descripcion` ni media).
- Confirmar que el re-geocoding usa el mismo motor canónico (ORS/Nominatim según pipeline geo unificado) y no introduce drift contra `canonical-admin-areas`.

## 6. Trazabilidad

- Helper: `src/domains/content/lib/poi-maturity.ts`
- Overlay admin: `src/components/map/MaturityBadgeLayer.tsx` (v1.2.18)
- Mirror SQL del ladder usado en esta inspección: ver bloque CTE `flags → levels` ejecutado en sesión 2026-05-20.
- Predecesores: `docs/audits/b4-geo-placeholders-execution.md`.

No re-enrich. No bump. No `.lovable/plan.md`.
