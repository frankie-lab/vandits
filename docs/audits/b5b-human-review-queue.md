# B5b — Human Review Queue

**Status:** 📋 Cola accionable de revisión manual. **NO ejecutar cambios.** Read-only snapshot.
**Fecha:** 2026-05-20
**Predecesor:** `b5b-needs-name-fix-dry-run.md`
**Scope:** 70 POIs B5b totales = **51 `human_review`** (esta cola) + **19 `reject_geo_irrecoverable`** (sección separada §2).

> Sin UPDATE. Sin re-enrich. Sin resolve-coordinates. Sin bump. Sin migraciones.
> Coords y nombres mostrados son los actuales en `locations`. La columna `geo_health` es informativa.

---

## 0. Convenciones

**Decisión pendiente (D)** — el revisor humano debe marcar exactamente UNA por fila:

| Código | Significado |
|---|---|
| `approve_name` | Nombre actual aceptable, no modificar. Solo refrescar FKs / `raw_geocode` si procede. |
| `edit_name`    | Renombrar al `suggested_name` propuesto (o variante). Tras rename → re-geocode. |
| `reject`       | Marcar `name_origin='llm_template'` (flag futura) o degradar a `hardError` permanente. |
| `move_to_B5a`  | Tras rename, el POI queda canónico y elegible para refresco B5a estándar. |

**Campos a revisar por humano (C)** — qué inspeccionar antes de decidir:

- `N` = `name` (consistencia con referente real)
- `W` = referente Wikipedia ES/EN / OSM `wikidata`
- `X` = `latitude`/`longitude` plausibles para el referente propuesto
- `C` = uso en `collection_locations` / `user_places` (impacto multiusuario)
- `E` = `enriched_data.descripcion` (¿describe el mismo referente que el nombre?)

---

## 1. Cola `human_review` (51)

### 1.1 GENERIC reales pero ambiguos (14)

| id8 | id (full) | current_name | lat | lon | país | región | zona | problema | acción sugerida | C | D |
|---|---|---|---:|---:|---|---|---|---|---|---|---|
| `b41a33d7` | b41a33d7-10e7-45c0-9cc9-f95fbd775d13 | Monasterio de Sumela | 40.690064 | 39.658438 | Turquía | Black Sea Region | Provincia de Trabzon | Referente único, geo_health=partial | conservar nombre, refrescar FKs | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `8cd7b1e1` | 8cd7b1e1-eaeb-40a3-a897-07ddd36000dd | Casco Antiguo de Cáceres | 39.556242 | -6.480782 | España | — | — | Nombre genérico; referente canónico = "Ciudad Monumental de Cáceres" | edit → "Ciudad Monumental de Cáceres" | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `70f14a7e` | 70f14a7e-d8d2-4482-b580-e50ab16a64c6 | Casco Antiguo de Coimbra | 40.318904 | -8.415711 | Portugal | — | — | Genérico; candidato canónico = "Alta de Coimbra" (confianza media) | edit → "Alta de Coimbra" o reject | N,W,X,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `1637941c` | 1637941c-6431-4c5e-b41e-b80bec3079ba | Casco Antiguo de Niza | 43.593766 | 7.331596 | Francia | — | — | Coords plausibles para Vieux Nice | edit → "Vieux Nice" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `05bd4905` | 05bd4905-86cd-4802-b4e3-b9015917ce5f | Castillo de Toledo | 39.947601 | -4.121703 | España | — | — | Coords coinciden con Alcázar de Toledo | edit → "Alcázar de Toledo" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `0c56e1c9` | 0c56e1c9-b6ca-486c-b0c5-faa3c7657d8d | Catedral de A Coruña | 43.262205 | -8.507388 | España | — | — | A Coruña NO tiene catedral; ¿Iglesia de Santiago / Colegiata Sta. María? | edit baja-confianza o reject | N,W,X,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `6bfda188` | 6bfda188-ddce-4f14-8b90-883bebb3f64f | Catedral de Niza | 43.647451 | 7.255655 | Francia | — | — | Coords coinciden con Cathédrale Sainte-Réparate | edit → "Cathédrale Sainte-Réparate de Nice" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `c7a1d2a9` | c7a1d2a9-00d2-4ffa-8b08-f31518d21e74 | Jardín Botánico de Alicante | 38.337236 | -0.390022 | España | — | — | Candidato = "Jardín Botánico de la Universidad de Alicante" | edit (precisar) | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `d8151dd1` | d8151dd1-63be-442b-a49b-5c6f2b597b40 | Jardín Botánico de Vigo | 42.224558 | -8.666837 | España | — | — | Vigo NO tiene jardín botánico; ¿Parque Quiñones de León? | edit baja-confianza o reject | N,W,X,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `5b74c902` | 5b74c902-901e-4687-a3c7-9980cba9a1ca | Mercado Central de Málaga | 36.667296 | -4.434357 | España | — | — | Candidato = "Mercado Central de Atarazanas". **COLISIÓN con `28cf0c27`** | edit + dedup vs 28cf0c27 | N,W,X,C | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `4df7ac3a` | 4df7ac3a-da4b-4e02-921a-25cbf3152034 | Plaza Mayor de Palma | 39.536954 | 2.751054 | España | — | — | Topónimo canónico catalán = "Plaça Major de Palma" | edit → "Plaça Major de Palma" | N,W | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `c9e0df07` | c9e0df07-10de-4218-9a3b-a6ab10992b13 | Plaza Mayor de Santander | 43.501883 | -3.838905 | España | — | — | Santander NO tiene Plaza Mayor canónica; ¿Plaza Porticada / Ayuntamiento? | edit baja-confianza o reject | N,W,X,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `953c4376` | 953c4376-702c-47b1-af0f-08cc897cd13e | Plaza Mayor de Sevilla | 37.358343 | -5.887588 | España | — | — | Candidato = "Plaza de San Francisco" (confianza media); coords periferia | edit + revisar X | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `d11f44dd` | d11f44dd-0667-40a4-b87d-c5cfc35ef9bb | Mercado Central de Llívia | 42.559759 | 1.641969 | España | — | — | Llívia (~1.500 hab) no tiene mercado central. Listado en dry-run §5.1 como reject; aquí en cola por revisión | reject probable | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |

> Nota: `d11f44dd` aparece simultáneamente en §5.1 (reject) y §1.1 (revisión). El revisor decide el bucket final.

### 1.2 TAIL — strip `Nuevo|Nueva|#N` (37)

Plan común: aplicar `R1 (TAIL strip)` → `name_stripped`. Si tras strip el nombre es candidato R3 con referente real, marcar `edit_name` con `suggested_name` específico. Si tras strip cae en R4/R5, marcar `reject`.

**⚠ Colisiones de identidad** documentadas en columna "colisión": dedup obligatorio antes de aplicar rename.

| id8 | id (full) | current_name | lat | lon | país | colisión | acción sugerida (post-strip) | C | D |
|---|---|---|---:|---:|---|---|---|---|---|
| `97994320` | 97994320-be06-450e-94c8-2a8f058cd051 | Casco Antiguo de Leiria Nuevo | 39.811473 | -8.828289 | Portugal | — | edit → "Centro Histórico de Leiria" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `2719e6b9` | 2719e6b9-e6b5-4ae2-bc96-c2cfa74811aa | Casco Antiguo de Lisboa Nuevo | 38.706696 | -9.027888 | Portugal | — | edit → "Alfama" o "Baixa Pombalina" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `94a05278` | 94a05278-c7d4-432b-a6a5-9ba40c7658a6 | Casco Antiguo de Viana do Castelo Nuevo | 41.779506 | -8.934117 | Portugal | — | edit → "Centro Histórico de Viana do Castelo" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `5626ab6c` | 5626ab6c-fbfa-4dad-9ae0-4b52da362fbb | Castillo de Estrasburgo Nuevo | 48.577660 | 7.754385 | Francia | — | reject (Estrasburgo no tiene castillo) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `d3587fb9` | d3587fb9-5847-4872-9a7b-0d402e5297fc | Castillo de Évora Nuevo | 38.562607 | -7.826875 | Portugal | — | reject (no hay castillo canónico) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `2309c116` | 2309c116-f7e0-41a8-9b22-9297d61008e4 | Castillo de Zaragoza Nuevo | 41.579598 | -0.930657 | España | — | edit → "Palacio de la Aljafería" (verificar X) | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `b3cf9399` | b3cf9399-6fd1-4975-bbae-7f144400e3d7 | Catedral de Rennes Nuevo | 48.129234 | -1.770629 | Francia | — | edit → "Cathédrale Saint-Pierre de Rennes" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `8e932821` | 8e932821-1a3d-4907-bb74-ef57daf86d4f | Cueva de Alicante Nuevo | 38.278372 | -0.453374 | España | — | reject (no hay cueva canónica) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `1bdb4c0b` | 1bdb4c0b-8ff0-41b9-9943-efa457bfb3eb | Cueva de Consuegra Nuevo | 39.677513 | -3.497704 | España | — | reject (no hay cueva canónica) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `294219ec` | 294219ec-b114-4384-b968-e06c68747cf0 | Faro de Llívia Nuevo | 42.605509 | 1.497914 | España | — | reject (Llívia es interior, sin faro) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `13b6ac67` | 13b6ac67-83d9-447b-bba9-7326cb3bcd30 | Jardín Botánico de Beja Nuevo | 38.061739 | -7.937130 | Portugal | — | reject (no hay jardín botánico) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `568df858` | 568df858-a5e8-4bdd-94f3-fe2a43d02e1a | Jardín Botánico de Valencia Nuevo | 39.555756 | -0.417147 | España | — | edit → "Jardí Botànic de la Universitat de València" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `34fad56f` | 34fad56f-88f0-4ad8-906d-d5758d0642e3 | Mercado Central de Aveiro Nuevo | 40.590703 | -8.764649 | Portugal | — | edit → "Mercado Manuel Firmino" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `451c596f` | 451c596f-4dbe-4254-97c7-538704ca3f96 | Mercado Central de Granada Nuevo | 37.158056 | -3.487916 | España | — | edit → "Mercado San Agustín" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `28cf0c27` | 28cf0c27-8739-4c5d-b2e8-e6f8638d1d19 | Mercado Central de Málaga Nuevo | 36.797354 | -4.349098 | España | **`5b74c902`** | dedup con 5b74c902 → edit → "Mercado Central de Atarazanas" | N,W,X,C | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `40b287bf` | 40b287bf-f0f6-4309-b257-53ce875e1a67 | Mercado Central de Montpellier Nuevo | 43.714421 | 3.781561 | Francia | — | edit → "Halles Castellane" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `932084b0` | 932084b0-49b7-4002-82f4-7279feb052f6 | Mercado Central de Santander Nuevo | 43.390856 | -3.764638 | España | — | edit → "Mercado de la Esperanza" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `8dbef3a0` | 8dbef3a0-0256-4a4e-974a-1b463c66d253 | Mirador de Grenoble Nuevo | 45.140967 | 5.777992 | Francia | — | edit → "Bastille de Grenoble" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `49f4b495` | 49f4b495-cf8d-402b-bfd5-9902ab717924 | Monasterio de Albacete Nuevo | 38.907711 | -1.799703 | España | **`802a59b7`** | dedup → ambos reject | N,W,E,C | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `664e5d8b` | 664e5d8b-b28d-4ccc-b046-1a04ce7a4545 | Monasterio de Burdeos #2 | 44.784272 | -0.678980 | Francia | **`68a61cc4`, `e86188df`** | dedup → reject | N,W,E,C | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `e86188df` | e86188df-f488-4d8f-9aab-7b80278f30d0 | Monasterio de Burdeos Nuevo | 44.787902 | -0.633235 | Francia | **`68a61cc4`, `664e5d8b`** | dedup → reject | N,W,E,C | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `1813cd8c` | 1813cd8c-80a1-46a3-b2d9-0fd41dca2f0a | Monasterio de Le Havre Nuevo | 49.442797 | 0.093064 | Francia | — | reject (no hay monasterio canónico) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `373a3fd9` | 373a3fd9-84fe-49e7-83a5-17906ed120ab | Monasterio de Valencia Nuevo | 39.583448 | -0.405452 | España | — | edit → "Monasterio de San Miguel de los Reyes" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `898b7fef` | 898b7fef-a3fb-4ca1-8488-a88740bd900e | Museo Etnográfico de Los Ángeles Nuevo | 33.992995 | -118.182910 | Estados Unidos | — | reject (no hay museo etnográfico canónico) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `272393af` | 272393af-3198-4f9c-bccd-8fe251cabcc6 | Parque Municipal de Lille Nuevo | 50.586553 | 2.996219 | Francia | — | **reject (R5 template)** | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `cc5fc42b` | cc5fc42b-8e32-4b82-bf4d-446e4cbe1e29 | Parque Municipal de Marrakech Nuevo | 31.540448 | -7.930980 | Marruecos | — | **reject (R5 template)** | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `6de248f1` | 6de248f1-71a1-4bdd-bab4-d1008aef667a | Parque Municipal de Valladolid Nuevo | 41.658078 | -4.633462 | España | — | **reject (R5 template)** | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `d25504ac` | d25504ac-5586-4db8-b58a-5b6a9aa27fa6 | Parque Municipal de Vigo Nuevo | 42.272831 | -8.640414 | España | — | **reject (R5 template)** | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `b35a79fc` | b35a79fc-b3f1-49b7-b6e1-623586a77444 | Plaza Mayor de A Coruña Nuevo | 43.370109 | -8.497856 | España | — | edit → "Praza de María Pita" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `e280fafd` | e280fafd-f42c-45d4-99e3-7ffc25170b43 | Plaza Mayor de Le Havre Nuevo | 49.501805 | 0.207137 | Francia | — | edit → "Place de l'Hôtel de Ville (Le Havre)" | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `a4b87810` | a4b87810-5326-4f00-a2fb-eebe395ef8af | Plaza Mayor de Valladolid Nuevo | 41.767396 | -4.672094 | España | — | edit → "Plaza Mayor de Valladolid" (referente único, alta) | N,W,X | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `5a977f93` | 5a977f93-ecc8-4d6f-85a8-9070e0ad0588 | Puente Medieval de Almada Nuevo | 38.872186 | -9.113203 | Portugal | — | reject (no hay puente medieval) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `7e25339f` | 7e25339f-34d8-4043-924f-948b62429939 | Puente Medieval de Burdeos Nuevo | 44.903966 | -0.607909 | Francia | — | reject (Pont de la Guillotière reconstruido s.XIX) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `2b405059` | 2b405059-33e6-46bc-8ebd-a8d8b3f2e82e | Puente Medieval de Cáceres Nuevo | 39.363135 | -6.455201 | España | — | reject (no hay puente medieval canónico) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `0eee796e` | 0eee796e-57e3-4edf-b1f0-c5b0f4180e65 | Puente Medieval de Santiago de Compostela Nuevo | 42.987475 | -8.645833 | España | — | edit → "Ponte Maceira" (baja confianza) o reject | N,W,X,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `48139cf5` | 48139cf5-ce5e-4ed5-b252-b28a2093637b | Restaurante Tradicional Burdeos Nuevo | 44.765697 | -0.478772 | Francia | — | reject (template LLM) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |
| `4859aff1` | 4859aff1-91c7-4383-96f0-57f5b6971abe | Restaurante Tradicional Grenoble Nuevo | 45.185765 | 5.631348 | Francia | — | reject (template LLM) | N,W,E | ☐ approve ☐ edit ☐ reject ☐ B5a |

---

## 2. `reject_geo_irrecoverable` — sección separada (19)

**No resolver automáticamente.** Candidatos a flag `geo_irrecoverable` (futura columna `name_origin='llm_template'`, ver dry-run §7 riesgo #5 y §8.3). No re-geocode, no re-enrich, no rename. Mantener fila por auditoría histórica.

> Estos POIs NO entran en la cola de revisión §1. El revisor humano sólo necesita confirmar la decisión global "marcar todos como `geo_irrecoverable`" cuando se ejecute la migración correspondiente.

| id8 | id (full) | name | lat | lon | país | región/zona | regla | geo_health actual |
|---|---|---|---:|---:|---|---|---|---|
| `654ecabd` | 654ecabd-0d03-4e9f-89d9-2f274bb9fbdc | Mirador de Dijon | 47.419161 | 5.061679 | Francia | — | R4 | hardError |
| `1b2b47d2` | 1b2b47d2-3c3a-4b85-9911-d6aec8fdfecd | Mirador de Nueva York | 40.804203 | -74.009669 | Estados Unidos | — | R4 | hardError |
| `fb79a9e3` | fb79a9e3-61cb-4cae-b50b-ac6349a7087c | Mirador de Santander | 43.482389 | -3.738679 | España | — | R4 | hardError |
| `802a59b7` | 802a59b7-4e96-4d4e-8487-a6fb295893d6 | Monasterio de Albacete | 39.011984 | -1.784767 | España | — | R4 | hardError |
| `58fa11c0` | 58fa11c0-e4e7-4df6-a5e8-8056ecd1472b | Monasterio de Beja | 37.917571 | -7.845308 | Portugal | — | R4 | hardError |
| `68a61cc4` | 68a61cc4-1cbc-41f0-9376-163b3f1d98be | Monasterio de Burdeos | 44.907490 | -0.692892 | Francia | — | R4 | hardError |
| `63036654` | 63036654-062d-4824-b8a7-81ff38704d8b | Faro de Atenas | 38.020071 | 23.791570 | Grecia | — | R4 | hardError |
| `5b322261` | 5b322261-0ad1-4656-9a94-04c116847496 | Museo Etnográfico de Bastia | 42.587476 | 9.379282 | Francia | — | R4 | hardError |
| `ef50654b` | ef50654b-ca8b-4294-8b78-8e89d4f76141 | Museo Etnográfico de Estrasburgo | 48.469866 | 7.815738 | Francia | — | R4 | hardError |
| `c1663f48` | c1663f48-dc32-44ef-a3ff-f690f0554d34 | Museo Etnográfico de Valladolid | 41.569516 | -4.794911 | España | — | R4 | hardError |
| `1b17cb4a` | 1b17cb4a-c61b-495f-bcb9-0e17442bf638 | Puente Medieval de Alicante | 38.312027 | -0.419454 | España | — | R4 | hardError |
| `006aa8d9` | 006aa8d9-8666-47f2-a852-7a9ea6d61f78 | Puente Medieval de Grenoble | 45.095273 | 5.708844 | Francia | — | R4 | hardError |
| `a49fc322` | a49fc322-3c95-4b2a-8520-4cba5625f4b2 | Puente Medieval de Lyon | 45.655026 | 4.865983 | Francia | — | R4 | hardError |
| `d5664740` | d5664740-7395-4c47-bd93-d9508202c96a | Puente Medieval de Sevilla | 37.347801 | -6.033546 | España | — | R4 | hardError |
| `3a407d77` | 3a407d77-4762-4407-86cf-d75712ba4409 | Puente Medieval de Viana do Castelo | 41.674751 | -8.860722 | Portugal | — | R4 | hardError |
| `1a5bd7b3` | 1a5bd7b3-67af-4ecd-8190-30078ef48a50 | Parque Municipal de Braga | 41.520597 | -8.374896 | Portugal | (sin región) / Braga | R5 | **ok** ⚠ (B5a.3) |
| `94d2e9d9` | 94d2e9d9-4162-48d8-832b-6ef063873d12 | Parque Municipal de Murcia | 38.036106 | -1.067646 | España | Región de Murcia | R5 | **ok** ⚠ (B5a.3) |
| `5c98da4f` | 5c98da4f-6bdf-4a17-9a20-85bc90c67a7d | Parque Municipal de Sevilla | 37.438982 | -6.090370 | España | Andalucía / Sevilla | R5 | **ok** ⚠ (B5a.3) |
| `e9cfe0cd` | e9cfe0cd-df92-4ff8-9638-94dc86699e62 | Parque Municipal de Toledo | 39.832138 | -3.996029 | España | Castilla-La Mancha / Toledo | R5 | **ok** ⚠ (B5a.3) |

> ⚠ Los 4 `Parque Municipal de <ciudad>` muestran `geo_health='ok'` tras B5a.3 (FKs poblados contra coords falsas). Marcarlos `geo_irrecoverable` requerirá flag separado para NO romper el contrato de `geo_health` (ver dry-run §7 riesgo #5).

---

## 3. Resumen contable

| Bucket | n |
|---|---:|
| §1.1 GENERIC ambiguos (incluye `d11f44dd` solapado) | 14 |
| §1.2 TAIL post-strip | 37 |
| **§1 Total `human_review`** | **51** |
| §2 `reject_geo_irrecoverable` (no entra en cola) | 19 |
| **Total B5b** | **70** |

---

## 4. Próximos pasos (NO ejecutar en este doc)

1. Revisor humano marca casilla `D` para los 51 de §1.
2. Subbucket `edit_name` alta-confianza → B5b.1 (batch rename + re-geocode, ≤8 POIs).
3. Subbucket `edit_name` baja-confianza + colisiones → B5b.2 (manual, caso a caso).
4. Subbucket `reject` (§1 + §2) → B5b.3 (marcar flag `name_origin='llm_template'` — requiere migración previa).
5. Tras §4.3 cerrar B5b. Pasar a **B5c** (290 sintéticos).

**Restricciones reiteradas:** sin UPDATE, sin re-enrich, sin bump, sin migraciones en este documento.
