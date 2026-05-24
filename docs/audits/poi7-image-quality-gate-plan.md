# POI-7 → POI-8 — Image Quality Gate Plan (pre-L2)

Status: PLAN (no data / no code / no re-enrich / no bump).
Scope: define qué cuenta como "imagen representativa" antes de ejecutar L2 del image recovery, y corregir los 20 falsos positivos del piloto L1.
Version impact: none.

---

## 1. Contexto

L1 piloto procesó 41 POIs sandbox España city y promovió 41/41 de POI-7 → POI-9 al poblar `enriched_data.imagen`. Auditoría visual posterior:

- 21/41 (51%) son **fotografías representativas** (paisaje, casco urbano, hito).
- 20/41 (49%) son **banderas / escudos municipales** servidos desde el infobox de Wikipedia (`Bandera_de_*.svg`, `Escudo_de_*.svg`, renderizados como `.png` vía `thumb/`).

El bucket POI-8 / POI-9 actualmente solo exige `enriched_data->>'imagen'` no vacío. Cualquier URL pasa. Esto rompe la semántica de "POI con media" — un escudo no es media del lugar, es media del municipio como entidad administrativa.

Snapshot de los 20 casos: `docs/audits/snapshots/poi7-l1-non-representative.csv`.

---

## 2. Criterio propuesto de "imagen válida para POI-8"

Una imagen cuenta para promoción a POI-8 si y solo si:

1. **URL accesible** (HTTP 200, content-type `image/*`).
2. **No es SVG vectorial puro** (heráldica/banderas suelen servirse como SVG; las fotos no).
3. **No coincide con patrones heráldicos / institucionales** en filename o caption (ver §3).
4. **Aspect ratio fotográfico**: ratio entre 0.5 y 3.0 (descarta banderas muy alargadas y escudos cuadrados-vectorial cuando es detectable).
5. **Dimensión mínima**: lado mayor ≥ 640 px en la fuente original (para `Wikimedia/thumb` se infiere del path).
6. **Procedencia categorizable** como `photograph | artwork | map` — nunca `coat_of_arms | flag | logo | seal | emblem | shield | icon`.

POIs que no cumplan (1)–(6) permanecen en **POI-7** y se marcan como `image_status = 'non_representative'` (ver §6) para que un futuro intento de recovery los seleccione con estrategia distinta.

---

## 3. Detección heurística de bandera / escudo / logo

Detección barata, sin descargar el binario. Aplica sobre `imagen` y `imagen_fuente`.

### 3.1 Regex de filename (ANY match ⇒ rechazar)

```
(^|/|_|-|%20)(bandera|escudo|flag|coat[_ -]?of[_ -]?arms|wappen|blason|blazon|coa|seal|emblem|shield|crest|logo|herb|gerb|gonfalone)([_ -]|\.|$)
```

Cobertura observada en L1:
- `Bandera_de_*` → 14 hits
- `Escudo_de_*` → 6 hits
- Total: 20/20 detectados sin falsos positivos sobre los 21 buenos.

### 3.2 Extensión / formato

- `.svg(\?|$)` (incluido si la URL termina en `.svg.png` vía Wikimedia `thumb/` — el filename original sigue siendo `.svg`, capturable por regex `/[A-Za-z0-9_%()-]+\.svg/`).
- Content-type `image/svg+xml`.

### 3.3 Caption Wikipedia infobox

`recover-missing-images` parsea el infobox. Si el `imageparam` proviene de campos `bandera`, `escudo`, `flag`, `coat_of_arms`, `seal`, `image_flag`, `image_shield`, `image_seal` ⇒ rechazar antes de proponer.

### 3.4 Fase 2 (opcional, futuro)

- Wikimedia Commons API → `categories` del File. Si contiene `Coats of arms of *`, `Flags of *`, `Logos of *` ⇒ rechazar.
- Clasificador ligero (CLIP / heurística color-uniforme) — fuera de alcance ahora.

---

## 4. ¿Marcar la imagen como `rejected` / `non_representative`?

**Sí.** Persistir el motivo de rechazo evita reprocesar y deja trazabilidad. Propuesta:

- Añadir clave `enriched_data.media_rejected[]` con `{url, reason, source, detected_at}` cuando el recuperador descarte un candidato.
- Si tras evaluar todos los candidatos no queda ninguno representativo, **no escribir `imagen`** y registrar `enriched_data.image_recovery.last_attempt = {at, mode, candidates_rejected: N, reason: 'no_representative_candidate'}`.

Los 20 POIs L1 actuales tienen `imagen` ya escrita ⇒ requieren paso de corrección (§7), no solo flag.

---

## 5. ¿POI con bandera/escudo debe seguir en POI-7?

**Sí.** Bandera/escudo no satisface el contrato "POI con media propia". Mantenerlos en POI-7 fuerza un segundo intento con estrategia mejorada (Commons categorías, Wikidata P18 vs P41 vs P94, panoramio/flickr CC, etc.) en lugar de "cerrar" el POI con media falsa.

Implicación para la matriz de maturity:
- POI-7: enriched + geo OK + sin media **representativa** (cambio de "sin media" a "sin media representativa").

---

## 6. `computePoiMaturity` — exigir imagen representativa

**Sí**, pero detrás de un flag para no romper buckets existentes hasta que la metadata esté poblada.

Cambio propuesto (futuro PR, no en este plan):

```ts
// Pseudocódigo, NO aplicar ahora
const hasRepresentativeImage =
  !!loc.enriched_data?.imagen &&
  loc.enriched_data?.image_kind !== 'flag' &&
  loc.enriched_data?.image_kind !== 'coat_of_arms' &&
  loc.enriched_data?.image_kind !== 'logo' &&
  loc.enriched_data?.image_kind !== 'seal' &&
  loc.enriched_data?.image_status !== 'non_representative';
```

Default seguro: si `image_kind` no está poblado, se asume `photograph` (no degradar buckets actuales hasta backfill). El backfill consiste en reclasificar los 41 (o 209) ya tocados aplicando la regex de §3.

---

## 7. Metadata necesaria (claves nuevas en `enriched_data`)

Sin migración (JSONB libre). Claves a estandarizar:

- `image_kind`: enum `photograph | artwork | map | flag | coat_of_arms | logo | seal | emblem | unknown`.
- `image_status`: enum `accepted | non_representative | pending_review | failed`.
- `image_rejection_reason`: string opcional (regex match, svg, infobox_field, etc.).
- `image_source_field`: campo del infobox (`bandera`, `escudo`, `imagen`, `vista`…).
- `image_license`, `image_credit`, `image_resolved_at` — ya en uso.
- `media_rejected[]`: array de candidatos descartados (ver §4).

Todas son aditivas, reversibles, sin tocar columnas estructurales.

---

## 8. Plan de corrección de los 20 casos L1 (no ejecutar aún)

Snapshot: `docs/audits/snapshots/poi7-l1-non-representative.csv` (20 filas).

### Paso A — Marcar como no representativos (reversible)

Por cada ID en el snapshot, dentro de `enriched_data`:

1. Mover `imagen` actual a `media_rejected[]` con `reason: 'flag_or_coat_of_arms_regex'`.
2. Borrar claves `imagen`, `imagen_fuente`, `media.cover` si referencia esa URL.
3. Setear `image_status = 'non_representative'`, `image_kind` inferido (`flag` si filename `bandera_`, `coat_of_arms` si `escudo_`).
4. `updated_at = now()`.

Efecto: los 20 vuelven de POI-9 → POI-7. Bucket POI-7 sube de 168 → 188.

### Paso B — Reintento con guardrail

Lanzar `recover-missing-images` solo para esos 20, con flag (a añadir) `excludeKinds: ['flag','coat_of_arms','logo','seal']`. Si no hay candidato válido ⇒ se queda en POI-7 marcado, sin escribir basura.

### Rollback Paso A

Trivial: restaurar `imagen` desde `media_rejected[]` por ID. Snapshot íntegro disponible.

### Restricciones

- No tocar `name`, coords, `raw_geocode`, `enriched_data.descripcion`, `enriched_data.fuentes`, `enrichment_status`, colecciones, `is_approved`, `owner_user_id`.
- Solo claves listadas en §7.

---

## 9. Plan seguro para L2 (sandbox France/Italy, ~80 POIs)

**Pre-requisito**: §8 ejecutado y `recover-missing-images` capaz de:
- Aplicar la regex de §3.1 antes de proponer una URL como `imagen`.
- Rechazar `.svg` puros y candidatos cuyo `image_source_field` sea heráldico.
- Persistir `image_kind` y `image_status='accepted'` cuando aceptado.
- Persistir `media_rejected[]` + `image_recovery.last_attempt` cuando no hay candidato y dejar el POI en POI-7.

**Cuando esos guardrails estén en el edge function**, L2 se ejecuta con:

- `mode: 'missing'`, `scope: 'ids'`, IDs = 80 sandbox France/Italy.
- `page_size: 20`, `cooldown_ms: 1500`.
- Post-run: snapshot + clasificación regex + recuento `accepted` vs `non_representative` vs `no_candidate`.

Si la tasa `accepted` ≥ 80% ⇒ proceder con L3. Si < 80% ⇒ analizar fuentes alternativas (Wikidata P18, Commons category traversal) antes de L3.

---

## 10. Restricciones de esta entrega

- **No** se han modificado datos.
- **No** se ha modificado código ni edge functions.
- **No** se ha re-enriched.
- **No** se ha hecho bump.
- **No** se ha tocado `.lovable/plan.md`.
- Snapshots generados: `docs/audits/snapshots/poi7-l1-non-representative.csv` (20 filas) y `.txt`.
- Version: `1.3.5` sin cambios.

---

## 11. Recomendación

1. Aprobar el criterio §2 y la regex §3.1.
2. Decidir si `image_kind` / `image_status` se introducen ahora (solo backfill conceptual) o cuando se modifique `recover-missing-images`.
3. Antes de L2: ejecutar §8 (corrección 20 casos) **solo si** el edge function ya integra el guardrail; en caso contrario, primero PR de código sobre `recover-missing-images` con la regex y la persistencia de `image_kind`/`image_status`.
4. L2 queda **bloqueado** hasta cumplir el guardrail. Procesar 80 POIs más sin él replicaría ~50% de basura.
