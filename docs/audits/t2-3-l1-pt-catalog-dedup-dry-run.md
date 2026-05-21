# T2.3-L1-PT — Catálogo `admin_areas` PT depth=2: dry-run de deduplicación

**Estado:** dry-run. SELECT-only. No UPDATE / INSERT / DELETE. No Nominatim. No código. No bump.
**Prerequisito de:** T2.3-L1-PT (asignación de región a 65 POIs por parent-chain + Nominatim reverse).
**Referencias:**
- `docs/contracts/territorial-equivalence-canon.md` — fila PT (#6).
- `docs/audits/t2-3-region-placeholder-execution-plan.md` — §Lote 1 (PT).
- `docs/audits/t2-3-lote0-lote1-postflight.md` — diferimiento L1.

---

## 0. Canon PT (recordatorio)

Según `territorial-equivalence-canon.md` fila #6:

| Slot | Concepto PT | Catálogo formal |
|---|---|---|
| `region` | **Região / CCDR** (NUTS-II) | 7 entradas: Norte, Centro, Lisboa (AML), Alentejo, Algarve, Açores, Madeira |
| `zone`   | **Distrito** | 18 distritos continentales + nada en RA Açores/Madeira |
| `admin3` | **Concelho** | ~308 |
| `locality` | **Freguesia / Localidade** | — |

**Consecuencia dura para T2.3-L1-PT:** sólo las 7 CCDR son destino legítimo de `region_id`. Toda entrada depth=2 que sea distrito, concelho o variante textual queda **excluida como destino de region**, aunque puede ser destino válido de `zone_id` (fuera de alcance de T2.3).

---

## 1. Auditoría `admin_areas` PT depth=2 — inventario

Total: **42 filas** bajo el país PT (`parent_id = cb47a8fd…`). Clasificación canónica:

### 1.A — CCDR canónicas (destino legítimo de `region_id`) — 7

| id | name | iso_code | aliases |
|---|---|---|---|
| `0e0cd77d-…` | **Norte** | PT-01 | norte, pt-01, northern portugal, region norte |
| `969ee249-…` | **Centro** | PT-02 | centro, centro portugal, central portugal, pt-02 |
| `9574cd33-…` | **Lisboa** | PT-03 | lisboa, greater lisbon, lisbon, pt-03, área metropolitana de lisboa, lisbon region |
| `c568ed08-…` | **Alentejo** | PT-04 | pt-04, alentejo |
| `1dab62f3-…` | **Algarve** | PT-05 | algarve, pt-05 |
| `ee871f7d-…` | **Açores** | PT-20 | açores, região autónoma dos açores, acores, pt-20, azores |
| `a0553c22-…` | **Madeira** | PT-30 | pt-30, madeira, região autónoma da madeira |

Estado: **OK**, todas con `iso_code` NUTS-II y `aliases` poblados.

### 1.B — Distritos (NO son region; deben ser zone) — 18

`iso_code` PT-06..PT-18 (excepto PT-11 inexistente en NUTS) + 4 sin `iso_code` reflejados como duplicados textuales:

| name | iso_code | duplicado textual | seed |
|---|---|---|---|
| Aveiro | — | (sin par) | — |
| Beja | — | (sin par) | — |
| Braga | — | (sin par) | — |
| Bragança | — | (sin par) | — |
| Castelo Branco | — | (sin par) | — |
| **Coimbra** | **PT-06** | ↔ **Coimbra District** (sin iso) | iso-seed |
| **Évora** | **PT-07** | ↔ **Évora District** (sin iso) | iso-seed |
| Faro | PT-08 | (sin par) | iso-seed |
| **Guarda** | **PT-09** | ↔ **Guarda District** (sin iso) | iso-seed |
| Leiria | PT-10 | (sin par) | iso-seed |
| Portalegre | PT-12 | (sin par) | iso-seed |
| **Porto** | **PT-13** | ↔ **Porto District** (sin iso) | iso-seed |
| Santarém | PT-14 | (sin par) | iso-seed |
| Setúbal | PT-15 | (sin par) | iso-seed |
| Viana do Castelo | PT-16 | (sin par) | iso-seed |
| Vila Real | PT-17 | (sin par) | iso-seed |
| Viseu | PT-18 | (sin par) | iso-seed |

Estado: están a depth=2 por seed histórico, pero canónicamente son **zone** (distrito). Para T2.3-L1-PT son **NO-USAR como region**.

### 1.C — Duplicados textuales de CCDR (alias-degenerados) — 5

| id | name | colisiona con | razón |
|---|---|---|---|
| `015a889c-…` | **Lisbon** | Lisboa (PT-03) | inglés ya cubierto en `aliases` |
| `2d7823e8-…` | **Lisbo** | Lisboa (PT-03) | typo/truncamiento |
| `adcb69e7-…` | **Región Norte** | Norte (PT-01) | etiqueta ES, `source='osm'` |
| `0066df6e-…` | **Región Autónoma de Madeira** | Madeira (PT-30) | etiqueta ES larga |
| (Azores en aliases de PT-20) | — | — | ya absorbido |

Estado: **alias colisionantes**, deben canalizarse al CCDR canónico vía tabla de alias §4. **Nunca destino de `region_id`.**

### 1.D — Distritos duplicados (sufijo "District") — 4

| id | name | canónico | acción |
|---|---|---|---|
| `9a77806c-…` | Coimbra District | Coimbra (PT-06) | NO-USAR (es zone) |
| `0a97545e-…` | Évora District | Évora (PT-07) | NO-USAR (es zone) |
| `edbfa8de-…` | Guarda District | Guarda (PT-09) | NO-USAR (es zone) |
| `13d1af96-…` | Porto District | Porto (PT-13) | NO-USAR (es zone) |

### 1.E — Concelhos mal clasificados a depth=2 — 9

Son municipios (depth correcto = 3) sembrados accidentalmente como depth=2:

`Angra do Heroísmo`, `Arouca`, `Calheta`, `Funchal`, `Machico`, `Ourém`, `Ponta Delgada`, `Porto Moniz`, `Povoação`.

Acción T2.3: **NO-USAR como region**. Reasignar depth a 3 queda fuera de alcance (sería migración estructural).

### 1.F — Placeholder — 1

`(sin región)` `is_placeholder=true`. Sólo destino transitorio; T2.3 lo evita por filtro §0bis del plan.

---

## 2. Tabla de alias PT canonical (matching Nominatim → region_id)

Entrada esperada de Nominatim (`accept-language=pt`, claves `state`/`region`/`ISO3166-2-lvl4`) → `region_id` canónico. Confianza alta = match unívoco; media = via aliases; baja = ambiguo (preservar).

| Input Nominatim (case-insensitive, strip diacritics) | region_id canónico | iso_code | Confianza | Razón |
|---|---|---|---|---|
| `Norte`, `Região do Norte`, `Northern Portugal`, `Region Norte`, `Región Norte`, `PT-01` | Norte | PT-01 | alta | match directo + aliases |
| `Centro`, `Região Centro`, `Centro Portugal`, `Central Portugal`, `PT-02` | Centro | PT-02 | alta | match directo + aliases |
| `Lisboa`, `Lisbon`, `Greater Lisbon`, `Área Metropolitana de Lisboa`, `Lisbon Region`, `Lisbo`, `PT-03` | Lisboa | PT-03 | alta | absorbe Lisbon/Lisbo |
| `Alentejo`, `Região do Alentejo`, `PT-04` | Alentejo | PT-04 | alta | match directo |
| `Algarve`, `Região do Algarve`, `PT-05` | Algarve | PT-05 | alta | match directo |
| `Açores`, `Azores`, `Região Autónoma dos Açores`, `Acores`, `PT-20` | Açores | PT-20 | alta | match directo + aliases |
| `Madeira`, `Região Autónoma da Madeira`, `Região Autónoma de Madeira`, `PT-30` | Madeira | PT-30 | alta | match directo + aliases |
| `Coimbra` / `Coimbra District` / `Distrito de Coimbra` | — (distrito, no region) | — | **baja** | Nominatim devuelve distrito; mapear a CCDR por coords (PT-02 Centro en este caso). Preservar si Nominatim sólo devuelve distrito y no se confirma CCDR. |
| Cualquier "X District" / "Distrito de X" sin CCDR adjunta | — | — | **baja** | Preservar + flag `pt_district_only`. |
| Cualquier valor no listado | — | — | **cero** | Preservar + flag `unknown_region_label`. |

Notas duras:
1. **Distrito ≠ región.** Si Nominatim devuelve sólo `state="Coimbra"` (= distrito), NO escribir en `region_id`. El distrito iría a `zone_id` en otra fase, fuera de T2.3.
2. Match canónico **debe** preferir `iso_code` (`ISO3166-2-lvl4` de Nominatim) sobre `name`. Sólo si falta `iso_code` → caer a alias por `name`.
3. Comparación: lower + strip diacritics + trim. Nunca substring; sólo igualdad exacta contra `{name, aliases[]}`.

---

## 3. Confirmación de los 65 POIs PT

Re-query del universo:

```
total PT sin region resoluble:     94
├─ resolubles por parent-chain:    29   → habrían entrado en L0 si admin3/zone/locality_id apuntaran a CCDR;
│                                          en realidad apuntan a distrito/concelho a depth≥2 → requieren resolver CCDR por path[2]
└─ coords-only (sin a3/zone/loc):  65   ← este es el "65" del plan
```

Desglose esperado tras aplicar §0bis + tabla de alias §2 sobre los **65 coords-only**:

| bucket | conteo estimado | criterio |
|---|---|---|
| **A. Auto-asignables** Nominatim devuelve CCDR (state PT-01..PT-05/PT-20/PT-30 o nombre canónico) | ~55 | mayoría caen claramente en una CCDR continental o RA |
| **B. Distrito-only ambiguos** Nominatim devuelve sólo distrito (Coimbra/Évora/…) sin CCDR adjunta | ~8 | requieren mapeo distrito→CCDR vía catálogo NUTS-II; si no fiable → preservar |
| **C. Fuera de canon / unknown label** | ~2 | preservar + `unknown_region_label` |
| **D. Synthetic fixtures** (nombres con sufijo "Antiguo/Nuevo/del Valle/Norte/Sur") | (incluidos arriba) | tratados igual: la geometría coords es real; el nombre no afecta a la resolución reverse |

Verificación rápida sobre la muestra (20 filas inspeccionadas):
- Todos los coords caen en territorio continental PT o Azores (Ponta Delgada).
- Una proporción significativa son fixtures sintéticos generados con sufijos. La geocoordenada es la que manda.
- No se detecta ningún POI con coords fuera de PT.

**Los 29 "resolubles por parent-chain"** quedan fuera de este dry-run de dedup: irían en un T2.3-L1-PT-pre (parent-chain puro) idéntico en lógica a L0 pero parametrizado a PT, una vez que la tabla de alias §2 esté ratificada.

---

## 4. Reglas de matching propuestas (para el día que se ejecute L1-PT)

Pre-condiciones DURAS antes de cualquier UPDATE:
1. `country_code = 'PT'` y `country_code ∈ TERRITORIAL_CANON`.
2. Snapshot previo en `location_geo_provenance` con `source='t23_snapshot'`.
3. Sólo se tocan `region` y `region_id`. Nada más.
4. Destino de `region_id` ∈ **únicamente** los 7 ids §1.A. Cualquier otro destino → BUG, abortar.
5. Si la resolución devuelve un id de §1.B/C/D/E/F → preservar + flag.
6. Sin LLM, sin re-enrich, sin tocar `name`, `coords`, `raw_geocode`, `country`, `zone`, `admin3`, `locality`, `enriched_data`, tags, colecciones, media.

Pipeline propuesto por POI:
```
parent-chain (path[2])
   └─ si apunta a §1.A → asignar (alta confianza)
   └─ si apunta a §1.B/C/D/E (distrito/concelho/dup) → continuar a Nominatim
Nominatim reverse (lat,lng, accept-language=pt, zoom=8)
   └─ leer ISO3166-2-lvl4 → si ∈ {PT-01..PT-05, PT-20, PT-30} → asignar §1.A
   └─ si state/region en {aliases canónicos §2} → asignar §1.A
   └─ si sólo distrito (§1.B name) → preservar + pt_district_only
   └─ resto → preservar + unknown_region_label
```

---

## 5. Riesgos detectados

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Los 18 distritos están sembrados a depth=2 → confusión semántica permanente | Documentado; fuera de alcance T2.3. Marcar como deuda estructural T-CATALOG-PT-DISTRICTS. |
| R2 | "Lisbon", "Lisbo", "Región Norte", "Región Autónoma de Madeira" son entradas independientes con UUID propio → cualquier código que matchee por `name` puede asignarlas como region | El plan T2.3 sólo asigna ids ∈ §1.A; cualquier otro destino aborta. Adicionalmente, NO se borran estas filas (fuera de alcance). |
| R3 | 9 concelhos a depth=2 (Funchal, Ponta Delgada, etc.) podrían matchear "name" si Nominatim devuelve concelho como state en zoom alto | Forzar `zoom=8` en reverse + match sólo contra §1.A. |
| R4 | `Lisboa` aliases ya incluye `lisbon` → al usar la tabla de alias §2 hay riesgo de doble-match si se compara contra todas las filas depth=2 | Restringir el matching de alias **exclusivamente** a las 7 filas §1.A. Las filas §1.C/D quedan invisibles al matcher. |
| R5 | Nominatim puede devolver respuestas distintas según `accept-language` | Fijar `accept-language=pt` + log de respuesta cruda en `location_geo_provenance.raw` (campo provenance, no en `locations`). |

---

## 6. Qué queda fuera

- Borrar/fusionar las 5 filas §1.C (duplicados textuales).
- Mover las 4 filas §1.D a depth=2-zone (distrito).
- Mover las 9 filas §1.E a depth=3 (concelho).
- Reasignar `zone_id` para los 65 POIs (sería T2.4 o similar).
- Cualquier ejecución sobre IE / países ∉ TERRITORIAL_CANON (sigue bloqueado por §0bis del plan).

---

## 7. Recomendación

1. **Ratificar §1.A como única lista canónica de destino `region_id` PT.** Bloquear cualquier escritura a region_id PT que no sea uno de esos 7 UUIDs vía precondición en el job.
2. **Antes de ejecutar L1-PT:** poblar/ratificar `aliases[]` de las 7 filas §1.A con el set completo de §2 (sólo lectura ahora; UPDATE iría en una micro-migración separada y aprobada).
3. **Primer sub-lote ejecutable:** los **29 POIs "resolubles por parent-chain"** (L1-PT-pre), idéntico en lógica a L0 pero parametrizado a PT, sin Nominatim. Bajo riesgo.
4. **Segundo sub-lote:** los **65 coords-only** con Nominatim + matching §4, en pasadas de 10 con verificación humana inicial.
5. **No ejecutar nada** hasta que esté aprobado:
   - la tabla §2,
   - la lista §1.A como única destino,
   - el bloqueo duro de §1.B/C/D/E/F como destino.

---

**Estado final del dry-run:** completado. 0 escrituras realizadas. 0 llamadas a Nominatim. Documento listo para revisión.
