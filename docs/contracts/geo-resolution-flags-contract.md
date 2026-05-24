# Geo Resolution Flags — Contract (docs-only)

**Status:** 📋 Contrato docs-only. Sin código, sin datos, sin migración, sin bump.
**Fecha:** 2026-05-20
**Predecesores:** `b5b-needs-name-fix-dry-run.md`, `b5b-human-review-queue.md`, `enrichment-coord-coherence-contract.md`.

> **Cross-ref POI-N (v2):** estos flags actúan como **techo** sobre la escala POI-0…POI-10 calculada por `computePoiMaturity`. Tabla canónica de techos en [`poi-maturity-visual-contract.md §4`](./poi-maturity-visual-contract.md): `pending_review` → POI-4, `needs_name_fix` → POI-3, `needs_coord_fix` → POI-2, `geo_irrecoverable` → POI-1 (fijo). Reinyección al circuito normal: borrar el flag (`custom_data - 'geo_resolution'`) libera el techo y devuelve el POI al cálculo libre del ladder. Ver §5 del contrato POI-N.
**Version impact:** none.

---

## 1. Propósito

Definir cómo marcar POIs que **NO deben entrar en procesos automáticos** de geocoding/enrichment porque requieren revisión humana, corrección de nombre o descarte definitivo.

Un flag de resolución geográfica:

- **NO corrige el POI.** Solo declara su estado operativo.
- **Previene reprocesos automáticos** (B5, B5a, batch-enrich, resolve-coordinates).
- **Evita gasto innecesario** de IA / Nominatim sobre POIs irrecuperables.
- **Evita falsos positivos** (ej. POI sintético "Faro de Atenas" volviendo a aceptar coords aleatorias).
- **NO sustituye** a `geo_health`, `enrichment_status`, `is_approved` ni `raw_geocode`. Es metadato operativo paralelo.

---

## 2. Ubicación canónica

Se propone el objeto `custom_data.geo_resolution` sobre la columna `custom_data jsonb` (ya existente en `locations`, **no requiere migración**):

```json
{
  "geo_resolution": {
    "status": "pending_review",
    "reason": "generic_name",
    "source": "b5b-human-review-queue",
    "at": "2026-05-20T14:00:00Z",
    "notes": "Mercado Central de Málaga → posible Mercado de Atarazanas"
  }
}
```

| Campo    | Tipo          | Obligatorio | Descripción |
|---|---|---|---|
| `status` | enum (§3)     | sí          | Estado operativo del POI frente a geocoding/enrichment automático. |
| `reason` | enum (§4)     | sí          | Motivo justificativo. Enum cerrado. |
| `source` | string        | sí          | Quién/qué proceso aplicó el flag (`b5b-human-review-queue`, `admin-ui`, `user:<id>`, `auto-detector-vX`). |
| `at`     | ISO-8601 UTC  | sí          | Timestamp de la última transición. |
| `notes`  | string        | no          | Texto libre para el revisor humano. Máx. 500 chars recomendado. |

**Regla de ubicación:** ningún otro campo (`enriched_data.*`, `tags`, `raw_geocode`) puede albergar este flag. Lectura única desde `custom_data.geo_resolution`.

---

## 3. Estados permitidos

Enum cerrado. Cualquier otro valor es inválido.

| `status`                | Significado |
|---|---|
| `pending_review`        | Requiere revisión humana. Bloquea geocoding/enrichment automático hasta decisión. |
| `needs_name_fix`        | Coordenadas pueden ser válidas, pero el nombre no es fiable o necesita edición. Bloquea B5/B5a. |
| `needs_coord_fix`       | Nombre puede ser válido, pero las coordenadas parecen incorrectas. Bloquea enrichment hasta corregir coords. |
| `geo_irrecoverable`     | NO resolver automáticamente. POI sintético, no verificable o sin identidad suficiente. Exclusión definitiva de B5. |
| `approved_for_geocode`  | Aprobado manualmente para entrar en B5/B5a. Habilita reprocesos. |
| `resolved`              | Ya fue corregido o procesado satisfactoriamente. Flag terminal de éxito. |

---

## 4. Reasons permitidos

Enum cerrado. Cualquier otro valor es inválido.

| `reason`                        | Cuándo aplicar |
|---|---|
| `synthetic_or_unverifiable_name`| Nombre fabricado por LLM o sin referente real comprobable (ej. "Faro de Atenas"). |
| `name_coordinate_mismatch`      | Nombre real existe pero apunta a un lugar distinto al de las coords. |
| `generic_name`                  | Nombre genérico ambiguo ("Casco Antiguo de X", "Mercado Central de X") con múltiples candidatos. |
| `tail_suffix_artifact`          | Sufijo `Nuevo`/`Nueva`/`#N` legado de dedup LLM fallido. |
| `invalid_coordinates`           | Lat/lon fuera de WGS84, NULL, o `(0,0)`. |
| `null_island`                   | Coordenadas en `(0,0)` exactas. Subcaso explícito de `invalid_coordinates`. |
| `missing_raw_geocode`           | `enrichment_status='enriched'` pero `raw_geocode IS NULL` (incoherencia histórica). |
| `manual_review_required`        | Revisor pide congelar el POI sin motivo automatizable. |
| `admin_alias_mismatch`          | `geo_health='stale_name'` por traducción/alias administrativo no contemplado. Generalmente se resuelve con `resolved` tras fix de aliases (ver `b5a-stale-name-dry-run.md`). |
| `other`                         | Reservado para casos no contemplados. Requiere `notes` obligatorio. |

---

## 5. Reglas duras

1. **Inmutabilidad de datos del POI.** Los flags NO modifican `name`, `latitude`, `longitude`, `raw_geocode`, `enriched_data` ni `geo_health`. Son metadato paralelo.
2. **Exclusión `geo_irrecoverable`.** Un POI con `status='geo_irrecoverable'` queda excluido permanentemente de cualquier B5 automático (B5a, B5b.x, B5c, batches futuros).
3. **Exclusión `needs_name_fix`.** Un POI con `status='needs_name_fix'` NO entra a B5/B5a hasta que el nombre sea corregido y el flag cambie a `approved_for_geocode` o `resolved`.
4. **Exclusión `needs_coord_fix`.** Un POI con `status='needs_coord_fix'` NO entra a enrichment hasta que las coordenadas sean corregidas (proceso fuera de B5).
5. **Habilitación `approved_for_geocode`.** Un POI con este flag es elegible para B5a estándar (resolve-coordinates + FKs admin) sin restricciones adicionales.
6. **Terminalidad `resolved`.** Solo se asigna cuando `raw_geocode`/`geo_health` quedan correctos tras un proceso (B5a, fix manual) o cuando un humano cierra el caso. Equivalente operativo a "caso cerrado".
7. **Auditoría obligatoria.** Todo cambio de flag debe poblar `source`, `at` y opcionalmente `notes`. Sobrescritura silenciosa prohibida.
8. **Sin downgrade implícito.** Pasar de `resolved` a otro estado requiere `notes` justificativas obligatorias.
9. **Compatibilidad con `geo_health`.** `geo_resolution.status` NO altera ni reemplaza a `geo_health`. Un POI puede tener `geo_health='ok'` y `geo_resolution.status='pending_review'` simultáneamente (caso §6 de los `Parque Municipal`).

### Tabla resumen estados × efecto sobre B5/B5a

| `status`                | B5 automático | B5a (re-geocode) | Enrichment IA | Comentario |
|---|---|---|---|---|
| `pending_review`        | ❌ excluido    | ❌ excluido       | ❌ excluido    | Espera decisión humana. |
| `needs_name_fix`        | ❌ excluido    | ❌ excluido       | ❌ excluido    | Bloqueado hasta rename. |
| `needs_coord_fix`       | ⚠ permitido   | ⚠ permitido      | ❌ excluido    | Re-geocode puede ayudar; IA no. |
| `geo_irrecoverable`     | ❌ excluido    | ❌ excluido       | ❌ excluido    | Exclusión permanente. |
| `approved_for_geocode`  | ✅ elegible    | ✅ elegible       | ✅ elegible    | Vía rápida para B5a. |
| `resolved`              | ❌ excluido    | ❌ excluido       | ⚠ on-demand   | Caso cerrado; no reprocesar salvo petición. |

---

## 6. Aplicación al estado actual B5

Mapeo recomendado del backlog actual de B5b (ver `b5b-human-review-queue.md`):

### 6.1 Los 51 `human_review` de B5b → `pending_review` / `needs_name_fix`

- **§1.1 GENERIC ambiguos (14 POIs)** → `status='pending_review'`, `reason='generic_name'`. El revisor humano decidirá rename, reject o approve por POI.
- **§1.2 TAIL post-strip (37 POIs)** → `status='needs_name_fix'`, `reason='tail_suffix_artifact'`. Bloquean B5 hasta strip + dedup + rename canónico.

### 6.2 Los 19 `reject_geo_irrecoverable` de B5b → `geo_irrecoverable`

Todos los listados en `b5b-needs-name-fix-dry-run.md §5.1` y `b5b-human-review-queue.md §2`:

- 15 fabricados R4 (`Mirador de Dijon`, `Faro de Atenas`, etc.) → `reason='synthetic_or_unverifiable_name'`.
- 4 templates R5 (`Parque Municipal de Braga/Murcia/Sevilla/Toledo`) → `reason='synthetic_or_unverifiable_name'` con `notes` indicando "template LLM".

### 6.3 Los 4 `Parque Municipal de <ciudad>` procesados en B5a.3 (cosméticos)

Caso especial: tienen `geo_health='ok'` y `raw_geocode` poblado tras B5a.3, pero el nombre es template LLM y las coords son falsas/periféricas.

**Decisión:** asignar `status='pending_review'` (o `needs_name_fix` si el revisor lo prefiere) con `reason='synthetic_or_unverifiable_name'`. **NO tocar** el `raw_geocode` ni `geo_health` ya resueltos (resuelve el riesgo #5 documentado en `b5b-needs-name-fix-dry-run.md §7`).

El flag declara el problema cosmético sin romper la contabilidad de B5a.3.

---

## 7. Futuro (fuera de scope de este contrato)

- **UI admin** podrá filtrar por `geo_resolution.status` (cola de revisión, exclusiones, históricos `resolved`).
- **Batches futuros** (B5c, re-imports, re-enrich masivo) deben excluir `geo_irrecoverable` y `needs_name_fix` por contrato.
- **Cola de revisión manual** basada en este contrato puede materializar `b5b-human-review-queue.md` en un panel admin filtrable.
- **Helper canónico** futuro: `setGeoResolutionFlag(locationId, { status, reason, source, notes })` con validación de enums (no incluido aquí).
- **Contract test** futuro: enums sincronizados entre cliente y edge functions, similar a `capabilities-sot-parity`.
- **Migración opcional** futura: índice parcial sobre `(custom_data->'geo_resolution'->>'status')` si la cola crece.

---

## 8. Fuera de scope explícito (este documento)

- Sin helpers TS / hooks / componentes.
- Sin tipos enum en código.
- Sin UPDATE a `custom_data` de ningún POI.
- Sin migración SQL (índice, constraint, función).
- Sin bump de versión.
- Sin tests automáticos.
- Sin cambios a `geo_health`, `enrichment_status`, `is_approved`, `raw_geocode`.

---

## 9. Validación final

- [x] Archivo `docs/contracts/geo-resolution-flags-contract.md` creado.
- [x] `docs/tech-debt.md` ítem 7 actualizado con nota de pendiente.
- [x] Sin código modificado.
- [x] Sin datos modificados.
- [x] Sin bump de versión.
- [x] tests/lint not run: docs-only geo-resolution flags contract.
