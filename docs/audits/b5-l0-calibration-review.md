# B5-L0 — Tabla de revisión manual (recomendaciones a priori)

**Status:** 📋 Recomendación heurística (sin ejecutar)
**Fecha:** 2026-05-20
**Predecesor:** `docs/audits/b5-l0-calibration-sample.md`
**Base de evidencia:** sólo nombre, coordenadas, país/región/zona, `geo_health`, `enrichment_status`. **No** se ha llamado a Nominatim, Wikipedia ni ningún geocoder externo. Estas recomendaciones son hipótesis derivables del propio registro; la decisión final la valida un humano.

> Legend: `approve` = candidato seguro para B5 (re-geocode); `reject` = no enviar a B5 (purge o flag `geo_irrecoverable`); `needs-name-fix` = revisar el nombre antes de cualquier geocode; `needs-coord-fix` = no aplica en L0 (B5 corrige coords, no las invalida).

## Tabla canon (25 filas)

| # | Bucket | id (short) | name | lat | lng | país / región / zona | geo_h | recomendado | motivo | acción siguiente | ¿Entra a B5? |
|--:|---|---|---|---:|---:|---|---|---|---|---|---|
| 1 | NULL_ISLAND | `89867d20` | Antarctica Roundabout | 0 | 0 | España / Castilla-La Mancha / – | hardError | **reject** | Null Island + nombre absurdo + país incoherente con topónimo | Flag `geo_irrecoverable` o purge | **No** |
| 2 | SYNTH_ES | `4fc18bfc` | Plaza Mayor de Albacete de la Sierra | 39.0685 | −1.9769 | España / – / – | hardError | **reject** | Sufijo "de la Sierra" fantasma; coords en zona urbana de Albacete; toponímia inexistente | Flag `geo_irrecoverable` | **No** |
| 3 | SYNTH_ES | `f977e226` | Faro de Valladolid de la Sierra | 41.7480 | −4.7366 | España / – / – | hardError | **reject** | Valladolid es interior (sin costa, sin faros); doble inconsistencia | Flag `geo_irrecoverable` | **No** |
| 4 | SYNTH_ES | `49e2c8ee` | Mirador de Sevilla de la Sierra | 37.4959 | −5.9441 | España / – / – | hardError | **reject** | Sufijo fantasma; coords en periferia urbana sevillana | Flag `geo_irrecoverable` | **No** |
| 5 | SYNTH_ES | `fd36530c` | Monasterio de Toledo del Valle | 39.8795 | −4.0883 | España / – / – | hardError | **reject** | Sufijo "del Valle" inventado; ningún monasterio canónico con ese nombre exacto | Flag `geo_irrecoverable` | **No** |
| 6 | SYNTH_ES | `974c3222` | Playa Secreta de Valencia de la Sierra | 39.5226 | −0.4242 | España / – / – | hardError | **reject** | Contradicción semántica (playa + sierra); coords en interior de Valencia | Flag `geo_irrecoverable` | **No** |
| 7 | SYNTH_ES | `a4b87810` | Plaza Mayor de Valladolid Nuevo | 41.7674 | −4.6721 | España / – / – | hardError | **needs-name-fix** | Plaza Mayor de Valladolid SÍ existe; sufijo "Nuevo" es ruido LLM; coords plausibles | Renombrar a "Plaza Mayor de Valladolid" y revalidar antes de B5 | **No** (hasta fix) |
| 8 | SYNTH_ES | `da120e15` | Pueblo Encantado Alicante Alto | 38.3312 | −0.4377 | España / – / – | hardError | **reject** | "Pueblo Encantado + ciudad + Alto" es estructura LLM típica; no existe topónimo | Flag `geo_irrecoverable` | **No** |
| 9 | SYNTH_ES | `af0f976c` | Ruta de Senderismo Oviedo del Valle | 43.6580 | −5.7655 | España / – / – | hardError | **reject** | Ruta sin nombre oficial; coords en centro de Oviedo (no en sendero) | Flag `geo_irrecoverable` | **No** |
| 10 | SYNTH_FR | `0d54fe36` | Bodega Artesanal de Bastia del Valle | 42.8179 | 9.5254 | Francia / – / – | hardError | **reject** | Bodega es término hispánico; Bastia no es región vinícola conocida; sufijo "del Valle" inventado | Flag `geo_irrecoverable` | **No** |
| 11 | SYNTH_FR | `38a8e45b` | Casco Antiguo de Aviñón (Sur) | 44.0630 | 4.8654 | Francia / – / – | hardError | **needs-name-fix** | Aviñón tiene casco histórico real (centre historique d'Avignon); "(Sur)" es subdivisión informal sin base | Renombrar a "Centro Histórico de Aviñón" y validar antes de B5 | **No** (hasta fix) |
| 12 | SYNTH_FR | `d44956ff` | Faro de Burdeos del Valle | 44.8709 | −0.6866 | Francia / – / – | hardError | **reject** | Burdeos es interior fluvial (sin faro marítimo); doble inconsistencia | Flag `geo_irrecoverable` | **No** |
| 13 | SYNTH_FR | `51fdbbf2` | Plaza Mayor de Nantes del Valle | 47.2692 | −1.4510 | Francia / – / – | hardError | **reject** | "Plaza Mayor" término hispánico aplicado a Francia; sufijo "del Valle" fantasma | Flag `geo_irrecoverable` | **No** |
| 14 | SYNTH_INTL | `13b6ac67` | Jardín Botánico de Beja Nuevo | 38.0617 | −7.9371 | Portugal / – / – | hardError | **reject** | Sufijo español sobre topónimo portugués; sin jardín botánico canónico en Beja | Flag `geo_irrecoverable` | **No** |
| 15 | SYNTH_INTL | `5a977f93` | Puente Medieval de Almada Nuevo | 38.8722 | −9.1132 | Portugal / – / – | hardError | **reject** | Sufijo español; "Almada Nuevo" no es topónimo; coords en zona urbana | Flag `geo_irrecoverable` | **No** |
| 16 | MUNI_ES | `f43da01c` | Níjar | 36.966 | −2.206 | España / Andalucía / Almería | partial | **approve** | Municipio real verificable; coords redondeadas coherentes con centroide municipal; geo_health=partial confirma fallo previo de geocode, no invalidez | Enviar a B5 (re-geocode); esperado < 2 km de drift | **Sí** |
| 17 | MUNI_ES | `07f548c8` | Zuheros | 37.543 | −4.316 | España / Andalucía / Córdoba | partial | **approve** | Municipio real (provincia Córdoba); coords coherentes con centroide | Enviar a B5 (re-geocode) | **Sí** |
| 18 | MUNI_FR | `e623d113` | Autoire | 44.8533 | 1.8205 | Francia / Occitanie / Lot | hardError | **approve** | Comuna real (Lot, Occitanie); coords con 7 decimales sugieren origen verificable | Enviar a B5 (re-geocode) | **Sí** |
| 19 | MUNI_FR | `fa4cec93` | Belcastel | 44.3879 | 2.3365 | Francia / Occitanie / Aveyron | hardError | **approve** | Comuna real (Aveyron); coords plausibles | Enviar a B5 (re-geocode) | **Sí** |
| 20 | MUNI_FR | `1c1f98f3` | Sant'Antonino | 42.5884 | 8.9048 | Francia / Corse / Upper Corsica | hardError | **approve** | Comuna real de Haute-Corse; coords coherentes con villaggio in altura | Enviar a B5 (re-geocode) | **Sí** |
| 21 | MULTI_ES | `ced0df03` | Ruta de Senderismo Valencia | 39.4590 | −0.3348 | España / – / – | hardError | **reject** | Coords = Plaza del Ayuntamiento de Valencia (centro urbano), no ruta de senderismo; nombre genérico LLM | Flag `geo_irrecoverable` | **No** |
| 22 | MULTI_ES | `2cc8afab` | Cueva de Cáceres (Norte) | 39.4114 | −6.3487 | España / – / – | hardError | **needs-name-fix** | Coords ~ Cáceres ciudad; sufijo "(Norte)" sin base oficial; podría haber cueva real bajo nombre distinto | Investigar nombre canónico antes de B5 | **No** (hasta fix) |
| 23 | MULTI_ES | `adeefb3c` | Ruta de Senderismo Palma | 39.5974 | 2.7556 | España / – / – | hardError | **reject** | Mismo patrón que #21; coords en zona urbana de Palma; ruta inexistente | Flag `geo_irrecoverable` | **No** |
| 24 | OTHER | `0f731bdd` | Playa Secreta de Lisboa | 38.6908 | −9.1893 | Portugal / – / – | hardError | **reject** | Lisboa no es destino playero canónico; nombre "Playa Secreta + ciudad" patrón click-bait LLM | Flag `geo_irrecoverable` | **No** |
| 25 | OTHER | `069b515b` | Ruta de Senderismo Roma | 42.0227 | 12.5377 | Italia / – / – | hardError | **reject** | Coords en periferia romana; ningún sendero oficial con ese nombre; patrón LLM | Flag `geo_irrecoverable` | **No** |

## Resumen de recomendaciones

| Decisión | n | % del lote | Acción colectiva |
|---|---:|---:|---|
| `approve` | 5 | 20 % | Entran a **B5a** (re-geocode seguro) |
| `needs-name-fix` | 3 | 12 % | Quedan fuera de B5 hasta renombrar manualmente |
| `reject` | 17 | 68 % | Entran a **B5c** (flag `geo_irrecoverable` o purge), no a re-geocode |
| `needs-coord-fix` | 0 | 0 % | (Esta decisión no aplica en B5) |

## Lectura para B5

1. **El scope candidato B5 no es uniforme.** Sólo 5/25 (20 %) en esta muestra son seguros para `resolve-coordinates`. Si la proporción se mantiene en los 394 totales, B5 sólo debería tocar **~80 POIs reales** (no 394).
2. **La masa del scope (≈ 68 %)** son "fichas LLM alucinadas" sin existencia verificable. Re-geocodearlas materializaría coordenadas falsas como `raw_geocode` "válido" → exactamente el bug que B5 debería cerrar.
3. **Recomendación firme antes de tocar nada:**
   - **B5a** (approve): re-geocode determinista sobre POIs con nombre verificado (criterio = ausencia de sufijos sintéticos + topónimo corto/conocido). Heurística SQL a redactar tras esta revisión humana.
   - **B5b** (needs-name-fix): cola manual pequeña, sin pipeline automático.
   - **B5c** (reject): bulk flag `geo_irrecoverable` (campo nuevo en `enriched_data.geo_status` o similar; **no purge directo** sin segunda confirmación).
4. **Validación pendiente:** un humano debe confirmar/refutar estas 25 recomendaciones (Nominatim + Wikipedia). Si la concordancia con la heurística ≥ 80 %, la heurística puede generalizarse a los 394 vía SQL. Si no, B5 queda **en espera**.

## Trazabilidad

- Predecesor inmediato: `docs/audits/b5-l0-calibration-sample.md` (muestreo).
- Cadena: B4 ✅ → B5 inspección ✅ → B5-L0 muestreo ✅ → **B5-L0 recomendaciones** (este doc) → revisión humana ⏳ → diseño B5a/B5b/B5c.
- Sin SQL ejecutado, sin `UPDATE`, sin re-enrich, sin bump, sin tocar código del mapa ni overlay POI-N.
