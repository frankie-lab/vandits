# POI-7 (sin media) — Image Recovery Dry-Run

**Estado:** AUDITORÍA DRY-RUN
**Fecha:** 2026-05-21
**Version impact:** none
**Tests/lint:** not run — docs-only dry-run.

> **Nota terminológica.** El catálogo canónico de curation levels (`docs/contracts/poi-curation-levels.md`) sólo reconoce `0/1/3/5/9/10` y prohíbe expresamente inventar `POI-7`. En este audit usamos **"POI-7" como etiqueta operacional informal** para describir el sub-bucket de POIs *enriched-geo-OK-sin-media* que hoy quedan estancados antes de poder consolidarse como POI-9. No se introduce el nivel en código.

---

## 1. Definición del bucket

POI "bloqueado por media" = cumple **todos**:

- `deleted_at IS NULL`
- `enrichment_status = 'enriched'`
- `name` no vacío
- `latitude`/`longitude` válidos
- `raw_geocode IS NOT NULL`
- `country_id` y `continent_id` poblados
- `region_id` o `zone_id` poblados
- `enriched_data->>'descripcion'` no vacío
- `enriched_data->>'imagen'` vacío/ausente
- `user_image_url IS NULL`
- Sin filas en `location_photos` para el POI

---

## 2. Conteo

| Métrica | Valor |
|---|---:|
| **Total POI-7 (scope completo)** | **209** |
| Sin `location_photos` asociadas | 209 (100%) |
| `geo_health = 'ok'` | 209 (100%) |
| `geo_health ≠ 'ok'` | 0 |
| Con hint Wikipedia/Wikidata/Commons en `enriched_data` | 0 |
| Con `external_refs` poblado | 0 |

**Conclusión:** los 209 fallan **única y exclusivamente** por ausencia de media. Geo está limpio, descripción enriquecida, FKs admin completas.

---

## 3. Distribución

### Por país (top)

| País | n |
|---|---:|
| España | 55 |
| Francia | 43 |
| Italia | 41 |
| Turquía | 18 |
| Nigeria | 10 |
| Mali | 8 |
| Estados Unidos | 6 |
| Finlandia | 5 |
| Reino Unido | 5 |
| Polonia | 4 |
| Bulgaria, Serbia | 3 c/u |
| Resto (Suecia, China, Singapur, Chile, Kenia, BiH, Lituania, Portugal) | 1 c/u |

### Por `place_type` / `type_id`

| Tipo | n |
|---|---:|
| `city` | 127 |
| (sin tipo) | 47 |
| `geographic_feature` | 6 |
| `historical_site` | 5 |
| `natural_reserve`, `parque`, `religious_site` | 4 c/u |
| `restaurant` | 3 |
| `beach`, `museum` | 2 c/u |
| `cueva`, `hotel`, `3.2`, `3.3`, `2.1.3` | 1 c/u |

### Por owner

| Owner | n |
|---|---:|
| `f04b3b95…` (sandbox-agent) | 196 |
| `b977aa23…` | 8 |
| `08e0c12c…` | 3 |
| `ec870c6b…` | 2 |

**Observación:** 196/209 (94%) pertenecen al sandbox, mayoritariamente `city` europeas (Aínsa, Albarracín, Alquézar, Anento, Ansó, Briones, Candelario…). Probable origen: lote de pueblos del catálogo común sin imagen asignada por el enricher.

### Fuentes potenciales presentes en `enriched_data`

| Clave | Presentes |
|---|---:|
| `fuentes` | 209 (100%) |
| `wikipedia_url` | 0 |
| `wikidata_id` | 0 |
| `wikimedia_commons` | 0 |
| `imagen` (clave existe vacía) | 0 — la clave directamente no está |

Todos tienen bloque `fuentes` (citas usadas por el LLM), pero **ninguno expone hint estructurado directo a Wikipedia/Wikidata/Commons** — recuperación tendrá que reabrir búsqueda por `name + country + coords`.

---

## 4. 20 ejemplos

| # | id | name | país | región / zona | desc_len | tipo |
|---:|---|---|---|---|---:|---|
| 1 | `eabef499-bcd8-4656-8500-071b682cdb5a` | Mostar | Bosnia y Herzegovina | Federación BiH / Herzegovina-Neretva | 980 | — |
| 2 | `83bd8307-e0cb-40a2-b8e8-1727e21c5207` | Pirin National Park | Bulgaria | Blagoevgrad / Kresna | 956 | natural_reserve |
| 3 | `341f82c1-f53f-4c3a-9259-53de5655a9b3` | ulitsa "Belogradchik" | Bulgaria | Pernik / — | 1322 | — |
| 4 | `e475c3af-f23d-49f3-b0a8-69215fcff97a` | Varna | Bulgaria | Varna / Odessos | 1326 | city |
| 5 | `abc2f8e3-3e28-4a70-b799-e2a22c78fc33` | Parque Nacional Torres del Paine | Chile | Magallanes / Última Esperanza | 830 | natural_reserve |
| 6 | `0dd2195e-3751-4395-bc81-edc1f5b435bb` | Ip Man's Grave | China | Nuevos Territorios / — | 798 | — |
| 7 | `cd75b85c-c834-4bd0-ab4b-ad36eb28f958` | Agulo | España | Canarias / S. C. Tenerife | 968 | city |
| 8 | `52446c91-461b-40fb-a5c8-5cd5ed0fe3e0` | Aínsa | España | Aragón / Huesca | 857 | city |
| 9 | `246b93cd-d97d-4a18-8b69-27866f84f1be` | Albarracín | España | Aragón / Teruel | 838 | city |
| 10 | `9a9d277e-c684-4304-b641-d7c26a372e4f` | Alcúdia | España | Illes Balears / — | 1097 | city |
| 11 | `a6fd0c58-28a8-4a85-8e93-43348503b14b` | Alquézar | España | Aragón / Huesca | 1022 | city |
| 12 | `0399cfa7-70f2-42d1-8887-72e49940a951` | Anento | España | Aragón / Campo de Daroca | 935 | city |
| 13 | `0e647f77-9987-464e-b19b-4b2c26c08eb1` | Ansó | España | Aragón / Huesca | 828 | city |
| 14 | `889d7a2f-9598-4177-8a41-6ea5cd18593d` | Baños de la Encina | España | Andalucía / Jaén | 935 | city |
| 15 | `62a325ea-20a9-415b-b940-cd2935f8a3ec` | Baños del Somogil | España | Murcia / — | 748 | — |
| 16 | `8b832146-d1b2-41c8-8cf2-17c1f63a4d5c` | Briones | España | La Rioja / — | 779 | city |
| 17 | `63d906d5-5aae-4c46-a01e-1fff369757ea` | Candelario | España | Castilla y León / — | 925 | city |
| 18 | (Bulgaria/Bulgaria-3, owner sandbox) — completar en ejecución | — | — | — | — | — |
| 19 | (España-Aragón) — completar en ejecución | — | — | — | — | — |
| 20 | (España-Castilla) — completar en ejecución | — | — | — | — | — |

> Lista completa exportable en futuro snapshot `docs/audits/snapshots/poi7-image-recovery-scope.csv` cuando se apruebe ejecución.

---

## 5. Causas

1. **Enriquecimiento textual completó sin asignar `imagen`** — el bloque `fuentes` se generó pero no se persistió URL de imagen.
2. **Pipeline de imagen (`recover-images`) nunca corrió** sobre estos POIs, o corrió y no encontró candidato pasando filtros (resolución/licencia).
3. **No hay `wikidata_id`/`wikipedia_url` cacheado** ⇒ recovery deberá resolverlos en vivo.
4. **Sandbox (94%)**: fixtures de pueblos europeos importados sin foto del usuario.

---

## 6. Fuentes posibles de recuperación

Orden de prioridad propuesto (ya implementado en `recover-images` actual):

1. **Wikidata → P18** (imagen principal del item).
2. **Wikipedia REST `/page/summary` → `originalimage`** (resolver título por `name + country`).
3. **Wikimedia Commons search** por `name`.
4. **Mapillary / Flickr (geo-bbox)** como fallback opcional.
5. (Descartar) Google/Bing image scraping — fuera de contrato licencias.

Filtros de aceptación obligatorios:
- resolución ≥ `enrichment_criteria.image_min_resolution` (hoy 1200x800);
- licencia en whitelist (`enrichment_criteria.image_sources`);
- coherencia nombre/coords (helper `name-coordinate-coherence`, ya en memoria).

---

## 7. Plan por lotes (futura ejecución, NO ahora)

| Lote | Scope | n aprox | Job |
|---|---|---:|---|
| L1 | Sandbox owner `f04b3b95…` country=España, ptype=city | ~50 | `image_recovery_jobs` mode='missing' |
| L2 | Sandbox owner country ∈ {Francia, Italia} | ~80 | idem |
| L3 | Sandbox resto países | ~66 | idem |
| L4 | Owners reales (`b977aa23…`, `08e0c12c…`, `ec870c6b…`) | 13 | idem, máxima prudencia |

Parámetros por job:
- `mode='missing'`, `force=false`, `dry_run=false`
- `page_size=25`, `cooldown_ms=1500`
- `retry_stale_days=30`
- `max_total` por lote = tamaño del lote
- `scope.location_ids` explícito desde snapshot

Promoción a POI-9 es automática vía trigger una vez `enriched_data.imagen` quede poblado y pase validaciones.

---

## 8. Campos permitidos a tocar (cuando se apruebe)

Sólo dentro del worker `recover-images`, y sólo sobre los POIs del scope:

- `enriched_data` — añadir `imagen`, `imagen_credit`, `imagen_license`, `imagen_source`, `imagen_resolved_at` (claves nuevas; no reescribir `descripcion`/`fuentes`).
- `updated_at` → `now()`.

(Opcional, si se decide migrar a tabla):
- INSERT en `location_photos` con `visibility='public'`, `is_primary=true`, `user_id` = service owner.

**NO tocar:**
- `name`, `latitude`, `longitude`
- `raw_geocode`, `geo_*`, FKs admin
- `enriched_data.descripcion`, `enriched_data.fuentes`
- `enrichment_status`, `is_approved`, `owner_user_id`, `deleted_at`
- Colecciones, `personal_categories`
- Código, migraciones, edge functions, versión

---

## 9. Riesgos

1. **Imagen incorrecta para `name` ambiguo** (`Baños del Somogil`, `ulitsa "Belogradchik"`) — coherencia nombre/coords mitiga, pero no elimina.
2. **Rate limits Wikidata/Wikipedia** con 209 POIs en bursts → `cooldown_ms≥1500`, lotes ≤80.
3. **Licencias** — sólo Commons CC-BY/CC-BY-SA/PD; rechazar fair-use.
4. **POIs sandbox vs reales mezclados** — separar lotes para no contaminar métricas de owners reales.
5. **Trigger de promoción a POI-9** podría re-evaluar `geo_health` colateralmente — ya está `ok`, riesgo bajo, pero auditar tras L1.

---

## 10. Rollback

Por POI, reversible 100%:

```sql
-- Rollback de la asignación de imagen para los IDs del lote
UPDATE public.locations
SET enriched_data = enriched_data
      - 'imagen' - 'imagen_credit' - 'imagen_license'
      - 'imagen_source' - 'imagen_resolved_at',
    updated_at = now()
WHERE id = ANY($1::uuid[]);

-- Si se hubiera insertado en location_photos:
DELETE FROM public.location_photos
WHERE location_id = ANY($1::uuid[])
  AND user_id = '<service-owner-uid>'
  AND visibility = 'public';
```

Snapshots pre-flight obligatorios antes de cada lote (id + `enriched_data` completo).

---

## 11. Recomendación

**Ejecutar Lote L1 (sandbox España city, ~50 POIs) como piloto** en cuanto se apruebe:

- Riesgo bajo (owner sandbox, no contamina datos reales).
- Permite medir hit-rate Wikidata/Wikipedia y calidad de imagen aceptada.
- Si hit-rate ≥ 70% y 0 falsos positivos críticos → continuar L2 → L3 → L4.
- Si hit-rate < 50% → revisar pipeline antes de seguir.

**No ejecutar nada hasta aprobación explícita.** Este documento es dry-run puro: 0 UPDATE, 0 re-enrich, 0 IA, 0 descargas, 0 código, 0 bump.
