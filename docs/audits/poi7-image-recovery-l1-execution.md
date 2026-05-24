# POI-7 (sin media) — L1 Pilot Execution

**Estado:** ✅ EJECUTADO
**Fecha:** 2026-05-21
**Version impact:** none
**Tests/lint:** not run — data-only L1 pilot.

---

## 1. Scope

- Sub-bucket "POI-7" (etiqueta operacional, no canónica): enriched + geo OK + sin media.
- Filtros L1: `owner_user_id = 'f04b3b95…'` (sandbox), `country='España'`, `place_type='city'`.
- **41 POIs** seleccionados (snapshot completo en `docs/audits/snapshots/poi7-l1-pilot-scope.csv`).

## 2. Pre-flight

| Check | Resultado |
|---|---|
| `deleted_at IS NULL` | 41/41 |
| `enrichment_status='enriched'` | 41/41 |
| `raw_geocode IS NOT NULL` | 41/41 |
| `geo_health = 'ok'` | 41/41 |
| `enriched_data.descripcion` no vacío | 41/41 |
| `enriched_data.imagen` vacío / ausente | 41/41 |
| `user_image_url IS NULL` | 41/41 |
| Sin `location_photos` | 41/41 |
| Flags `geo_resolution` activos | 0/41 |

Todos calificaban en POI-7 estricto.

## 3. Ejecución

Mecanismo: **edge function existente** `recover-missing-images` (no IA generativa, no re-enrich).

```jsonc
POST /functions/v1/recover-missing-images
{
  "scope": "ids",
  "locationIds": [ ...41 UUIDs ],
  "mode": "missing",
  "batchSize": 50,
  "dryRun": false,
  "force": false
}
```

Fuentes consultadas por `searchImageFromSources` (orden interno): Wikidata P18 → Wikipedia summary → Wikimedia Commons. OSM deshabilitado por defecto. Sin Mapillary/Flickr en este pipeline.

**Nota operacional:** el primer POST excedió el budget del cliente HTTP (`context canceled` al cliente) pero el edge runtime completó las 41 POIs en background. Verificación posterior confirma 41/41 procesados. Sin re-ejecución necesaria.

## 4. Resultados

| Métrica | Valor |
|---|---:|
| POIs en scope | 41 |
| Con `enriched_data.imagen` poblado tras run | **41 (100%)** |
| Sin imagen tras run (`noImage`) | 0 |
| Errores transitorios | 0 |
| Skipped (cooldown previo) | 0 |
| `image_recovery_attempted_at` registrado | 41/41 |

### Por fuente

| Fuente | n |
|---|---:|
| `wikipedia` (REST summary `originalimage`) | 39 |
| `wikimedia_commons` (search) | 2 |
| `wikidata` (P18) | 0 |

### Calidad de la imagen (auditoría heurística por URL)

| Tipo | n | % |
|---|---:|---:|
| Fotografía probable (paisaje/edificio del pueblo) | **21** | 51% |
| Bandera / escudo SVG (`Bandera_de_…`, `Escudo_…`, `coat_of_arms`) | **20** | 49% |

Detalle por POI: ver `docs/audits/snapshots/poi7-l1-pilot-scope.csv` (extender en seguimiento). Ejemplos:

- ✅ Foto: Aínsa, Alcúdia, Alquézar, Ansó, Briones, Candelario, Castro Caldelas, El Burgo de Osma, Fornalutx, Frías, Guadalupe, Laguardia, Letur, Linares de Mora, Pampaneira, Puertomingalvo, Robledillo de Gata, Roda de Isábena, Sajazarra, Sos del Rey Católico, Zuheros.
- ⚠️ Bandera/escudo: Agulo, Albarracín, Anento, Baños de la Encina, Capileira, Covarrubias, Genalguacil, Grazalema, Llerena, Lucainena de las Torres, Mojácar, Mondoñedo, Níjar, Olivenza, Pastrana, San Martín de Trevejo, Setenil de las Bodegas, Trevélez, Vejer de la Frontera, Zahara de la Sierra.

**Causa:** la API REST de Wikipedia (`/page/summary`) devuelve `originalimage` que para artículos de municipios españoles **frecuentemente es la imagen del infobox = bandera o escudo**, no la fotografía principal. El ordering Wikidata-P18 → Wikipedia → Commons da preferencia a Wikipedia REST, que en estos casos pierde frente a Commons.

## 5. Promoción de nivel POI

Catálogo canónico (`docs/contracts/poi-curation-levels.md`): 0/1/3/5/9/10 — **no existe POI-8**.

Estado objetivo tras el run (todos los 41):
- `enrichment_status = 'enriched'` ✅
- `geo_health = 'ok'` ✅
- `rings = []` (sin deuda objetiva) ✅
- `enriched_data.imagen` poblado ✅
- **⇒ POI-9** (objetivo, salud + media completas)

Sub-modulación por estado personal (sandbox = no visitado): POI-9 con `primaryAction = 'none'` (no `rate-experience`).

**Conteo final del bucket POI-7 estricto:**

| Antes | Después |
|---:|---:|
| 209 | **168** (209 − 41) |

Total país España city dentro de POI-7 cayó de **55 → 14**.

## 6. Errores documentados

Ninguno técnico. **Sí riesgos de calidad** (20 POIs con bandera/escudo en lugar de foto). Estos NO bloquean POI-9 (objetivamente cumplen: tienen `imagen`), pero deterioran la experiencia visual del popup hero.

Mitigaciones propuestas para L2+ (NO ejecutadas):

1. Reordenar fuentes en `search-image-sources`: **Commons search → Wikipedia REST → Wikidata P18**, o
2. Post-filtro de URL: rechazar `bandera|flag|escudo|coat_of_arms|emblem` en path antes de aceptar el hit y re-intentar con la siguiente fuente.
3. Forzar `width≥1200` y reject `.svg` en `enrichment_criteria.image_min_resolution` (hoy ya es `1200x800` pero no se está aplicando al SVG → revisar).

Estos cambios son de código y quedan **fuera del scope de este L1**.

## 7. Campos tocados

Sólo dentro de `enriched_data` para los 41 IDs, vía función edge:

- `enriched_data.imagen` (URL)
- `enriched_data.imagen_fuente` (`"<source>: <title>"`)
- `enriched_data.media.cover_url`
- `enriched_data.media.images[0]` (objeto hit completo)
- `enriched_data.media.image_recovery_attempted_at`
- `enriched_data.media.image_recovery.{source_telemetry, recovered}`

Implícito por trigger: `updated_at` posiblemente refrescado (la función no setea `updated_at` explícitamente; depende de trigger).

**NO tocado:** `name`, `latitude`, `longitude`, `raw_geocode`, `geo_*`, FKs admin, `enriched_data.descripcion`, `enriched_data.fuentes`, tags, `enrichment_status`, `is_approved`, `owner_user_id`, `deleted_at`, colecciones, `location_photos`.

## 8. Rollback

Reversible 100% por POI:

```sql
UPDATE public.locations
SET enriched_data = enriched_data
      - 'imagen' - 'imagen_fuente'
      || jsonb_build_object(
        'media',
        coalesce(enriched_data->'media','{}'::jsonb)
          - 'cover_url' - 'images'
          - 'image_recovery_attempted_at' - 'image_recovery'
      )
WHERE id = ANY(ARRAY[ /* 41 IDs del snapshot L1 */ ]::uuid[]);
```

Snapshot del scope: `docs/audits/snapshots/poi7-l1-pilot-scope.csv`.

## 9. Próximos pasos (recomendación, no ejecutar)

1. **Decidir antes de L2:** ¿aceptar imágenes de bandera/escudo como válidas, o exigir foto y refactorizar `search-image-sources`?
2. Si se acepta → continuar con **L2** (sandbox Francia + Italia city, ~80 POIs).
3. Si no se acepta → tarea de código previa (reordenar fuentes / post-filtro URL / reject SVG), luego re-ejecutar L1 con `force:true` sobre los 20 banderas y continuar.

Hit-rate técnico del L1: **100%**. Hit-rate "calidad fotográfica" estimado: **51%**. Decisión pendiente del owner del proyecto.

## 10. Garantías negativas

- ✅ No se llamó IA generativa.
- ✅ No se re-enriqueció (descripción/tags/fuentes intactos).
- ✅ No se tocó nombre, coords, geo, raw_geocode, FKs admin.
- ✅ No se modificó código.
- ✅ No se aplicaron migraciones.
- ✅ No hubo bump de versión (`1.3.5` sin cambios).
- ✅ No se tocó `.lovable/plan.md`.
