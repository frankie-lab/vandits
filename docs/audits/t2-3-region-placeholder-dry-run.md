# T2.3 — Dry-run: nodos `(sin región)` en GeographyTree

**Fecha:** 2026-05-21
**Modo:** SOLO LECTURA. NO UPDATE. NO INSERT. NO migraciones. NO código. NO re-enrich. NO bump.
**Referencias:**
- `docs/contracts/territorial-equivalence-canon.md`
- `docs/audits/t2-2-hasprovinciafalse-lote1-closure.md`
- `docs/audits/t2-2-no-postflight.md`
- `docs/audits/geo-country-alias-tree-audit.md`

---

## 0. Resumen ejecutivo

- **Scope total:** **241 POIs** (deleted_at IS NULL, `country_code` o `country_id` presente, y región ausente: `region_id IS NULL` o `region_id` apunta a `admin_areas` con `is_placeholder=true` / `name ILIKE '(sin %'`).
- **Distribución:** 31 países afectados. Concentrado en **RO (52), NO (38), PT (29), HR (25), RS (14), SI (11), IS (11), EE (9), SE (8)**.
- **Cobertura:**
  - 241/241 tienen `latitude/longitude`.
  - 219/241 tienen `raw_geocode` poblado.
  - 22/241 NO tienen `raw_geocode` (incluye 8 fixtures/sandbox).
  - 8 son fixtures/sandbox (3 `beta-partial-*` ES + 5 sandbox owner `b977aa23…`/`08e0c12c…`/`ec870c6b…` con prefijo `alpha-/beta-/sandbox-`).
- **Hallazgo crítico #1:** `raw_geocode` NUNCA contiene claves `region`/`state`/`admin1` para los POIs afectados (verificado en RO/NO/PT/HR/SE/IS/RS/SI/EE: 0/total). El geocoder histórico sólo escribió `country`, `continent`, `zone`, `admin3`, `locality`, `sublocality`, `street`, `postal_*`. **Class A (reparable data-only desde raw_geocode) ≈ 0.**
- **Hallazgo crítico #2:** `admin_areas.path` está poblada para el 100% de zones/admin3/localities involucrados (373/373), pero la región real (depth=2 no-placeholder) **NO** aparece en esa path — los zones del catálogo están enlazados directamente bajo el país, saltándose el nivel región. Por eso la derivación por parent-chain sólo resuelve ~17 POIs (RO 3, NO 6, HR 2, IS 2, SE 1, EE 1, PL 1, ME 1).
- **Catálogo `admin_areas` (depth=2 no-placeholder) ABUNDANTE:** FR=178, IT=146, PL=78, MA=74, IE=53, RO=53, JP=48, UA=42, PT=41, LV=37, HR=27, SE=25, NO=24, SI=23, EE=22, AT=21, ES=21, NL=19, DE=18, IS=15, CR=8, RS=4, ME=3, MT=2, SG=1. Las regiones reales existen — el bottleneck es el enlace (region_id en `locations` y parent_id en `admin_areas`).
- **Recomendación:** primer lote = **PT (29 POIs)**, todos con raw_geocode + zone_id + locality_id, catálogo PT con 41 regiones reales, `hasProvincia=true` → permite validar el patrón completo "resolve-coordinates determinista (Nominatim reverse `addressdetails=1`) → match por nombre vs `admin_areas.depth=2, parent=PT` → escribir `region_id`". Sin IA. Reversible vía `t23_snapshot` en `location_geo_provenance`.

---

## 1. Tabla global por país (afectados)

`raw=raw_geocode poblado`, `lo_fk = zone/admin3/locality FK presente`, `deriv = derivable por parent-chain en admin_areas hoy`, `cat = regiones reales en admin_areas`.

| ISO2 | total | raw | lo_fk(any) | deriv | cat(d=2) | hasProvincia | Notas |
|------|---:|---:|---:|---:|---:|:---:|------|
| RO | 52 | 49 | 52 | 3 | 53 | sí | Catálogo robusto, raw_geocode sin admin1 |
| NO | 38 | 31 | 23 | 6 | 24 | **no** (Lote 1.2) | 16 admin3 preservados por revisión humana |
| PT | 29 | 29 | 29 | 0 | 41 | sí | **Candidato Lote 1** — todo presente |
| HR | 25 | 23 | 25 | 2 | 27 | sí | Zone=Condado mayoritariamente Dubrovnik-Neretva |
| RS | 14 | 14 | 14 | 0 | 4 | sí | Catálogo Serbia muy escaso (4 regiones) |
| SI | 11 | 11 | 11 | 0 | 23 | sí | Catálogo OK |
| IS | 11 | 9 | 11 | 2 | 15 | sí | Catálogo OK |
| EE | 9 | 8 | 9 | 1 | 22 | sí | Catálogo OK |
| SE | 8 | 7 | 7 | 1 | 25 | **no** (Lote 1.4) | 1 admin3 preservado por revisión humana |
| LV | 4 | 4 | 4 | 0 | 37 | sí | |
| UA | 3 | 3 | 3 | 0 | 42 | sí | |
| ES | 3 | 0 | 0 | 0 | 21 | sí | **Fixtures** `beta-partial-*` (sin coords útiles enriquecibles, ver §6) |
| XK | 3 | 3 | 3 | 0 | — | sí | Catálogo Kosovo sin depth=2 cargado |
| AT | 3 | 3 | 3 | 0 | 21 | sí | |
| DE | 3 | 3 | 3 | 0 | 18 | sí | |
| FR | 3 | 3 | 1 | 0 | 178 | sí | 2 sin lower FK |
| ME | 3 | 2 | 3 | 1 | 3 | sí | Catálogo Montenegro escaso |
| MA | 2 | 1 | 1 | 0 | 74 | sí | Incluye 1 fixture `alpha-private-8` |
| CR | 2 | 2 | 2 | 0 | 8 | sí | |
| IT | 2 | 2 | 1 | 0 | 146 | sí | |
| SG | 2 | 2 | 2 | 0 | 1 | (ciudad-estado) | Región = país |
| MD | 2 | 2 | 2 | 0 | — | sí | |
| GL/JP/NL/PL/MT/SM/KY/CY/IE | 1 c/u | mix | mix | 0–1 | — | varía | Cola larga |
| `(NULL)` | 1 | 1 | 1 | 0 | — | — | Caso edge sin country_code |
| **TOTAL** | **241** | **219** | **~225** | **~17** | — | — | |

Los 2 fixtures E2E `(sin país)` documentados en `geo-country-alias-tree-audit.md` (`f04b3b95-…-e2e000000001/02`) **NO** entran en este scope (no tienen country_code).

---

## 2. Ejemplos representativos

### 2.1 PT — caso ideal (Class B' limpio)
- POI con `raw_geocode` completo: `{country, continent, zone, admin3, locality, sublocality, street, postal_*}` pero sin `admin1/region/state`. `zone_id`, `admin3_id`, `locality_id` apuntan a admin_areas reales (no placeholder). Falta enlazar `region_id` al `admin_area` depth=2 correcto del catálogo PT (41 disponibles).

### 2.2 HR — Dolac Market (Zagreb)
```
zone_id        = null
admin3_id      = b1cab0c5… (Distrito municipal Zagreb)
locality_id    = ec85d5e2… (Zagreb)
region_id      = 4c7ec4b3… → admin_areas.is_placeholder=true, name='(sin región)'
raw_geocode    = { admin3: "Zagreb", country: "Croacia", ... } (sin admin1)
```
Región real esperada: "Grad Zagreb" (existe en catálogo HR de 27 regiones). Derivable por reverse-geocoding determinista o por catalog repair (subir locality `Zagreb` bajo región `Grad Zagreb`).

### 2.3 NO — Borgund / Kjosfossen / Lysefjorden (Lote 1.2 herencia)
22 POIs sin raw_geocode (probablemente fixtures de `b977aa23-…`). Coords disponibles → Class B'. 16 ya estaban marcados para revisión humana en `t2-2-no-postflight.md`.

### 2.4 ES — beta-partial-1/2/3 (fixtures)
`country='Espana'` (cubierto por alias en v1.3.15), `country_code='ES'`, `country_id=NULL`, sin raw_geocode, sin FKs inferiores, `region='Galicia'` textual. **Class D (excluir)** — son fixtures sintéticos sin pipeline geo.

### 2.5 RS / XK / ME / MD — Class C parcial
Catálogo `admin_areas` para Serbia (4), Kosovo (0 depth=2), Montenegro (3), Moldavia (0 depth=2) es insuficiente. Aun con reverse-geocoding, no hay region_id destino que escribir. Requiere catalog backfill PREVIO o aceptar `region_id` NULL con texto descriptivo.

---

## 3. Clasificación

### A. Reparables data-only desde `raw_geocode` / `admin_areas`
**Total: ~17 POIs.** Coincide con la columna `deriv` de la tabla §1 — donde la path de zone/admin3/locality ya incluye una región real. Cero coste, cero red, cero IA, idempotente.

### B. Reparables con resolve-coordinates determinista (Nominatim reverse, sin IA)
**Total: ~211 POIs.** Tienen lat/lng. La operación es:
1. `GET /reverse?lat&lon&addressdetails=1&zoom=10` (Nominatim/Photon, sin IA).
2. Extraer `address.state` / `address.region` / `address.province`.
3. Resolver por nombre contra `admin_areas WHERE parent_id=<country.id> AND depth=2 AND COALESCE(is_placeholder,false)=false` con normalización Unicode/alias.
4. Escribir `region_id` (y opcionalmente `region` texto canónico) sin tocar zone/admin3/locality.

Aplica a: PT, HR, RO, SI, IS, EE, NO restantes, SE restantes, LV, UA, AT, DE, FR, IT, MA, CR, GL, JP, NL, PL, MT, SM, KY, CY, IE, MD. Subdivisible por país; idéntico patrón.

### C. Requieren revisión humana / catalog backfill previo
**Total: ~13 POIs.**
- RS (14): catálogo de 4 regiones — la mayoría caerá en región no presente. Catalog backfill primero.
- XK (3): 0 regiones depth=2.
- ME (3): 3 regiones.
- MD (2): 0 regiones.
- Casos edge sin FK inferior ni raw_geocode útil: FR 2, IT 1, MA 1, IE 1, `(NULL)` 1.

### D. Fixtures / excluir
**Total: 8 POIs.**
- ES: `beta-partial-1/2/3` (3).
- MA: `alpha-private-8` (1).
- (sandbox `b977aa23-…` sandbox-agent NO se excluye automáticamente — es el owner principal de muchos POIs reales; sólo se excluyen los prefijos sintéticos `alpha-*` / `beta-*` / `sandbox-*` / `E2E *`).
- Resto ≈4 con prefijos sintéticos en RO/NO/SE/HR.

> Aviso: la rule de exclusión por prefijo es heurística; la lista final del lote se valida manualmente antes de cualquier UPDATE.

---

## 4. Propuesta de lotes

### Lote 0 — Class A (parent-chain ya disponible)
- ~17 POIs distribuidos en RO/NO/HR/IS/EE/SE/PL/ME.
- Pure SQL UPDATE: `region_id = <ancestor depth=2 from admin_areas.path>`.
- Snapshot previo: `location_geo_provenance` con `source='t23_snapshot'`.

### Lote 1 — PT (29 POIs)
- 100% raw_geocode + lower FKs + catálogo robusto + `hasProvincia=true`.
- Patrón de referencia para Class B'. Valida el pipeline reverse-geocode → match → write.

### Lote 2 — HR / SI / IS / EE
- ~56 POIs. Mismo patrón B'. Catálogos OK.

### Lote 3 — NO / SE (Class B' restos)
- ~30 POIs. `hasProvincia=false`. Reverse-geocode → región Län/Fylke. Continúa el trabajo de T2.2 Lote 1.2/1.4 sin tocar zone/admin3 cleanup (ya hecho).

### Lote 4 — RO (52)
- Más volumen. Catálogo 53 regiones. Una sola pasada.

### Lote 5 — cola larga (LV/UA/AT/DE/FR/IT/MA/CR/GL/JP/NL/PL/MT/SM/KY/CY/IE/MD/SG, ~30 POIs)
- Heterogéneo, una pasada genérica.

### Lote 6 — Class C (RS/XK/ME/MD)
- Bloqueado por catalog backfill admin_areas depth=2. Ticket independiente.

### Lote 7 — Class D
- No-op. Documentar exclusión y cerrar.

---

## 5. Campos que se tocarían (solo `locations`)

- `region_id` (escribir FK al admin_area depth=2 real).
- Opcionalmente `region` (texto canónico EN según `admin_areas.name`), solo si está vacío o placeholder. Si ya hay texto del enrich IA divergente, NO sobrescribir (queda divergencia documentada, no se altera enriched_data).
- `geo_source` / `geo_confidence` / `geo_resolved_at` para trazabilidad.

**NO se tocan:** `name`, `latitude/longitude`, `country_*`, `zone_*`, `admin3_*`, `locality_*`, `sublocality_*`, `raw_geocode`, `enriched_data`, `enrichment_status`, `tags`, colecciones, media, `geo_health` (sólo si trigger natural).

---

## 6. Rollback

Snapshot global `location_geo_provenance` con `source='t23_snapshot'` antes de cada lote (mismo patrón que T2.2). Rollback one-shot:

```sql
UPDATE locations l
SET region_id = (
  SELECT (p.area_id)::uuid FROM location_geo_provenance p
  WHERE p.location_id = l.id AND p.source='t23_snapshot' AND p.field_type='region_id'
  ORDER BY p.resolved_at DESC LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM location_geo_provenance p
              WHERE p.location_id=l.id AND p.source='t23_snapshot');
```

Sin schema migration, sin `_pre_t23` suffix.

---

## 7. Impacto esperado en GeographyTree

- Los 30 nodos `(sin región)` actuales (uno por país afectado) reducirán su `count` hasta desaparecer cuando todos sus POIs sean reasignados a regiones reales.
- Se crearán nodos por región real (Lisboa, Açores, Algarve, …, Telemark, Vestland, …, Stockholms län, …) en GeographyTree. Cuenta país no cambia.
- `collapseZoneForCountriesWithoutProvincia` (P-1.1) sigue aplicando intacto para NO/SE/FI/NL/BR/AU/JP.
- Resuelve el ticket abierto en `docs/audits/t2-2-hasprovinciafalse-lote1-closure.md` § "T2.3 region placeholder".

---

## 8. Impacto esperado en POI-N / `geo_health`

- `geo_health` puede pasar de `partial` → `ok` cuando la única deuda era región ausente (ring magenta desaparece). Cambio idempotente vía trigger natural del recompute, no se fuerza desde la migración.
- POI curation level: POI-5 → POI-9 en POIs cuya única deuda objetiva era región.
- POI-9/10 enriquecidos: sin cambio funcional (estado personal intacto).
- Marker palette / shape / rings: sin cambio.
- Exportabilidad (PR-EXPORT-1): sin cambio (no depende de region_id).

---

## 9. Recomendación de primer lote

**PT — Portugal (29 POIs).**

Razones:
1. 100% tienen `raw_geocode` y FKs inferiores → no hay outlier que distorsione métricas.
2. Catálogo PT depth=2 sólido (41 regiones) → match por nombre alta tasa.
3. `hasProvincia=true` → no interfiere con el canon Lote 1 ya cerrado.
4. Volumen manejable, mismo orden que NL/SE/JP del Lote 1 — postflight comparable.
5. Valida los 4 ejes del pipeline B': reverse-geocode determinista → normalización de nombre → match en catálogo → write idempotente con snapshot. Si funciona limpio aquí, se aplica el mismo script a HR/SI/IS/EE/RO sin cambios.

Out-of-band (paralelo): cerrar Lote 0 (~17 POIs Class A) primero como sanity check — pure-SQL, sin red, sin Nominatim. Si Lote 0 + PT pasan postflight, escalar a Lote 2.

---

## 10. Restricciones cumplidas

- [x] Solo SELECT / lectura.
- [x] No UPDATE / INSERT / migraciones.
- [x] No re-enrich.
- [x] No código.
- [x] No bump.
