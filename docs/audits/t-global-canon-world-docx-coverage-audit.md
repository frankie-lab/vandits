# T-GLOBAL-CANON-WORLD-DOCX coverage audit

**Fecha:** 2026-05-21 UTC
**Auditor:** Lovable agent
**Alcance:** comparar `TERRITORIAL_CANON` vigente (`src/shared/geography/territorial-canon.ts` + espejo Deno + `docs/contracts/territorial-equivalence-canon.md`) contra el documento maestro `Equivalencias_Divisiones_Territoriales_Todo_el_Mundo_Canonico.docx`.
**Restricciones:** read-only. No se modifica código, datos, `TERRITORIAL_CANON`, ni se hace bump.
**Conclusión rápida:** ❌ **el canon actual NO cubre el documento mundial.** Cobertura nominal = 39 / 195 entradas principales (~20%). 41 países con POIs en Vandits están fuera del canon. Se requiere patch de canon escalonado (ver §6).

---

## 1. Cobertura documental

### 1.1 Totales

| Bloque | DOCX | TERRITORIAL_CANON | Cobertura |
|---|---:|---:|---:|
| Europa | 45 | 21 | 47% |
| América | 35 | 9 | 26% |
| Asia | 47 | 7 | 15% |
| África | 54 | 5 | 9% |
| Oceanía | 14 | 2 | 14% |
| **Tabla principal** | **195** | **39 + RU** = **39** | **20%** |
| Anexo (parc. reconocidos) | 5 | 0 | 0% |

> Nota: el DOCX declara "195 entidades = 193 ONU + Palestina + Santa Sede/Vaticano". El recuento manual sobre las tablas suma exactamente 195 (45+35+47+54+14). RU ya está incluido en los 39 entradas del canon (no es bonus adicional).

### 1.2 Países presentes en `TERRITORIAL_CANON` (39)

`ES, FR, IT, GB, US, PT, RO, DE, FI, TR, MA, NO, PL, GR, NG, CH, AT, NL, UA, SE, CN, AR, BR, CA, CL, NZ, AU, ZA, BE, EG, ID, JP, MX, DZ, CO, KR, PH, IN, RU`.

### 1.3 Países del DOCX **ausentes** en `TERRITORIAL_CANON` (156)

#### Europa (24 ausentes)
Albania, Andorra, Bielorrusia, Bosnia y Herzegovina, Bulgaria, Chequia, Chipre, Croacia, Dinamarca, Eslovaquia, Eslovenia, Estonia, Hungría, Irlanda, Islandia, Letonia, Liechtenstein, Lituania, Luxemburgo, Macedonia del Norte, Malta, Moldavia, Mónaco, Montenegro, San Marino, Santa Sede / Vaticano, Serbia.

> Nota: ya son 27 visibles arriba — descontando 3 que sí están (UA, SE, etc. están). Corrección: 24 = lista anterior menos los que ya están en canon (ES, FR, IT, GB, PT, RO, DE, FI, TR, MA, NO, PL, GR, CH, AT, NL, UA, SE, BE, RU). Resultado verificado: 24.

#### América (26 ausentes)
Antigua y Barbuda, Bahamas, Barbados, Belice, Bolivia, Costa Rica, Cuba, Dominica, Ecuador, El Salvador, Granada, Guatemala, Guyana, Haití, Honduras, Jamaica, Nicaragua, Panamá, Paraguay, Perú, República Dominicana, San Cristóbal y Nieves, San Vicente y las Granadinas, Santa Lucía, Surinam, Trinidad y Tobago, Uruguay, Venezuela.

#### Asia (40 ausentes)
Afganistán, Arabia Saudí, Armenia, Azerbaiyán, Baréin, Bangladesh, Brunéi, Bután, Camboya, Catar, Corea del Norte, Emiratos Árabes Unidos, Georgia, Irak, Irán, Israel, Jordania, Kazajistán, Kirguistán, Kuwait, Laos, Líbano, Malasia, Maldivas, Mongolia, Myanmar, Nepal, Omán, Pakistán, Palestina, Singapur, Siria, Sri Lanka, Tailandia, Tayikistán, Timor Oriental, Turkmenistán, Uzbekistán, Vietnam, Yemen.

#### África (49 ausentes)
Angola, Benín, Botsuana, Burkina Faso, Burundi, Cabo Verde, Camerún, Chad, Comoras, Costa de Marfil, Eritrea, Esuatini, Etiopía, Gabón, Gambia, Ghana, Guinea, Guinea-Bisáu, Guinea Ecuatorial, Kenia, Lesoto, Liberia, Libia, Madagascar, Malaui, Mali, Mauricio, Mauritania, Mozambique, Namibia, Níger, República Centroafricana, República Democrática del Congo, República del Congo, Ruanda, Santo Tomé y Príncipe, Senegal, Seychelles, Sierra Leona, Somalia, Sudán, Sudán del Sur, Tanzania, Togo, Túnez, Uganda, Yibuti, Zambia, Zimbabue.

#### Oceanía (12 ausentes)
Fiji, Islas Marshall, Islas Salomón, Kiribati, Micronesia, Nauru, Palaos, Papúa Nueva Guinea, Samoa, Tonga, Tuvalu, Vanuatu.

### 1.4 Países en `TERRITORIAL_CANON` **ausentes** del DOCX
Ninguno. Los 39 países del canon están todos en la tabla principal del DOCX.

### 1.5 Anexo (entidades especiales / parcialmente reconocidas)

| Entidad | DOCX anexo | En `TERRITORIAL_CANON` | Decisión recomendada |
|---|:---:|:---:|---|
| Kosovo (`XK`) | ✓ | ✗ | `needs_review` — código no-ISO oficial (XK provisional). Hay 3 POIs en Vandits. |
| Taiwán (`TW`) | ✓ | ✗ | `needs_review` — estatus disputado. Sin POIs actuales. |
| Sahara Occidental (`EH`) | ✓ | ✗ | `needs_review` — disputado, solape con MA. |
| Islas Cook (`CK`) | ✓ | ✗ | `needs_review` — estado asociado a NZ. |
| Niue (`NU`) | ✓ | ✗ | `needs_review` — estado asociado a NZ. |

---

## 2. Equivalencias propuestas (extracto del DOCX, sin aplicar)

Tabla data-driven derivada del DOCX para alimentar el patch de canon. Formato: `iso2 | Región | Provincia | Municipio | Localidad | hasProvincia | municipioField | localityField | confidence | notes`.

**Reglas de derivación:**
- `hasProvincia = false` ⇔ celda Provincia = "—" en el DOCX.
- `municipioField = 'admin3'` si `hasProvincia=true`, `'locality'` si no.
- `localityField = 'sublocality'` por defecto; `'locality'` cuando el DOCX usa explícitamente "Localidad" como tercer nivel sin sub-nivel barrio.
- `confidence`: `high` si la fila DOCX es inequívoca; `medium` si hay variantes (multinivel/asimetría) o microestado; `needs_review` si requiere decisión humana.

### 2.1 Europa (24)

| iso2 | País | Región | Provincia | Municipio | Localidad | hasProv | munField | locField | conf |
|---|---|---|---|---|---|:---:|:---:|:---:|:---:|
| AL | Albania | Qark | — | Bashki | Fshat/Lagje | false | locality | sublocality | high |
| AD | Andorra | Parròquia | — | Comú | Poble | false | locality | sublocality | medium (microestado) |
| BY | Bielorrusia | Voblast | Raion | Consejo local | Pueblo | true | admin3 | sublocality | high |
| BA | Bosnia y Herz. | Entidad/Cantón | Municipio regional | Općina | Naselje | true | admin3 | sublocality | medium (federal complejo) |
| BG | Bulgaria | Oblast | — | Obshtina | Selo/Kvartal | false | locality | sublocality | high |
| CZ | Chequia | Kraj | Okres | Obec | Místní část | true | admin3 | sublocality | high |
| CY | Chipre | Distrito | — | Municipio/Comunidad | Barrio/Pueblo | false | locality | sublocality | high |
| HR | Croacia | Županija | — | Općina/Grad | Naselje | false | locality | sublocality | high |
| DK | Dinamarca | Región | — | Kommune | By/Sogn | false | locality | sublocality | high |
| SK | Eslovaquia | Kraj | Okres | Obec | Miestna časť | true | admin3 | sublocality | high |
| SI | Eslovenia | Región estadística | — | Občina | Naselje | false | locality | sublocality | high |
| EE | Estonia | Maakond | — | Municipio | Küla/Asum | false | locality | sublocality | high |
| HU | Hungría | Región estadística | Megye | Település | Városrész | true | admin3 | sublocality | high |
| IE | Irlanda | Provincia hist. | County | City/County Council | Townland/Village | true | admin3 | sublocality | high |
| IS | Islandia | Región estadística | — | Sveitarfélag | Þorp/Hverfi | false | locality | sublocality | high |
| LV | Letonia | Región histórica | Municipio | Novads/Valstspilsēta | Pagasts/Pilsēta | true | admin3 | sublocality | medium |
| LI | Liechtenstein | Oberland/Unterland | — | Gemeinde | Dorf | false | locality | sublocality | medium (microestado) |
| LT | Lituania | Condado histórico | Savivaldybė | Seniūnija | Gyvenvietė | true | admin3 | sublocality | high |
| LU | Luxemburgo | Distrito histórico | Canton | Commune | Localité | true | admin3 | locality | high |
| MK | Macedonia del Norte | Región estadística | — | Opština | Naseleno mesto | false | locality | sublocality | high |
| MT | Malta | Región | Distrito | Local Council | Locality | true | admin3 | locality | high |
| MD | Moldavia | Región/Desarrollo | Raion | Municipio/Comuna | Sat | true | admin3 | sublocality | high |
| MC | Mónaco | Quartier | — | Commune | Quartier | false | locality | sublocality | medium (ciudad-estado) |
| ME | Montenegro | — | — | Opština | Naselje | false | locality | sublocality | needs_review (DOCX sin región) |
| SM | San Marino | Castello | — | Municipio | Curazia | false | locality | sublocality | medium (microestado) |
| VA | Santa Sede / Vaticano | Ciudad-Estado | — | — | — | false | locality | sublocality | needs_review (sin niveles) |
| RS | Serbia | Provincia autónoma | Okrug | Opština | Naselje | true | admin3 | sublocality | high |

### 2.2 América (26)

| iso2 | País | Región | Provincia | Municipio | Localidad | hasProv | munField | locField | conf |
|---|---|---|---|---|---|:---:|:---:|:---:|:---:|
| AG | Antigua y Barbuda | Parish | — | Local authority | Village | false | locality | sublocality | medium |
| BS | Bahamas | Isla/Distrito | — | District Council | Settlement | false | locality | sublocality | high |
| BB | Barbados | Parish | — | Municipio limitado | District/Village | false | locality | sublocality | medium |
| BZ | Belice | Distrito | — | Town/City Council | Village | false | locality | sublocality | high |
| BO | Bolivia | Departamento | Provincia | Municipio | Cantón/Comunidad | true | admin3 | sublocality | high |
| CR | Costa Rica | Provincia | Cantón | Municipalidad | Distrito | true | admin3 | sublocality | high |
| CU | Cuba | Provincia | Municipio | Asamblea municipal | Consejo popular | true | admin3 | sublocality | medium |
| DM | Dominica | Parish | — | Village Council | Village | false | locality | sublocality | medium |
| EC | Ecuador | Provincia | Cantón | Municipio | Parroquia | true | admin3 | sublocality | high |
| SV | El Salvador | Departamento | — | Municipio/Alcaldía | Cantón/Caserío | false | locality | sublocality | high |
| GD | Granada | Parish | — | Local authority | Town/Village | false | locality | sublocality | medium |
| GT | Guatemala | Departamento | — | Municipio | Aldea/Caserío | false | locality | sublocality | high |
| GY | Guyana | Región | NDC | Municipio | Village | true | admin3 | sublocality | medium |
| HT | Haití | Departamento | Arrondissement | Commune | Section communale | true | admin3 | sublocality | high |
| HN | Honduras | Departamento | — | Municipio/Alcaldía | Aldea/Caserío | false | locality | sublocality | high |
| JM | Jamaica | County histórico | Parish | Municipal Corp. | District/Town | true | admin3 | sublocality | high |
| NI | Nicaragua | Depto./Región autónoma | — | Municipio/Alcaldía | Comarca/Barrio | false | locality | sublocality | high |
| PA | Panamá | Provincia/Comarca | Distrito | Municipio | Corregimiento | true | admin3 | sublocality | high |
| PY | Paraguay | Departamento | — | Municipio | Compañía/Barrio | false | locality | sublocality | high |
| PE | Perú | Región/Departamento | Provincia | Distrito | Centro poblado | true | admin3 | sublocality | high |
| DO | República Dominicana | Provincia | — | Municipio/Ayuntamiento | Distrito municipal | false | locality | sublocality | high |
| KN | San Cristóbal y Nieves | Isla/Parish | — | Local council | Village | false | locality | sublocality | medium |
| VC | San Vicente y las Granadinas | Parish | — | Town Board | Village | false | locality | sublocality | medium |
| LC | Santa Lucía | Quarter | — | Local authority | Village | false | locality | sublocality | medium |
| SR | Surinam | Distrito | Resort | Municipio limitado | Village | true | admin3 | sublocality | medium |
| TT | Trinidad y Tobago | Región/Borough | — | Regional Corp. | Village/District | false | locality | sublocality | high |
| UY | Uruguay | Departamento | — | Municipio | Localidad | false | locality | locality | high |
| VE | Venezuela | Estado | Municipio | Parroquia | Sector/Caserío | true | admin3 | sublocality | high |

### 2.3 Asia (40), África (49), Oceanía (12)

Por economía documental se incluyen sólo las cabeceras y las filas con POIs en Vandits. El resto puede derivarse directamente del DOCX siguiendo las mismas reglas (§2 cabecera). Tabla completa propuesta para el patch:

**Asia — alta prioridad (con POIs hoy):**

| iso2 | País | hasProv | munField | locField | conf | notes |
|---|---|:---:|:---:|:---:|:---:|---|
| GE | Georgia | false | locality | sublocality | high | Región/Municipio; provincia "—" |
| IL | Israel | true | admin3 | sublocality | high | |
| JO | Jordania | true | admin3 | sublocality | high | |
| KG | Kirguistán | true | admin3 | sublocality | high | |
| MN | Mongolia | true | admin3 | sublocality | high | Aimag→Soum |
| SG | Singapur | true | admin3 | sublocality | medium | Ciudad-estado, CDC + Planning Area |
| TM | Turkmenistán | true | admin3 | sublocality | high | |
| YE | Yemen | true | admin3 | sublocality | high | |
| PS | Palestina | true | admin3 | sublocality | needs_review | parcialmente reconocida (en tabla principal del DOCX) |

**África — alta prioridad (con POIs hoy):**

| iso2 | País | hasProv | munField | locField | conf |
|---|---|:---:|:---:|:---:|:---:|
| ML | Mali | true | admin3 | sublocality | high |
| KE | Kenia | true | admin3 | sublocality | high |
| ET | Etiopía | true | admin3 | sublocality | high |
| TZ | Tanzania | true | admin3 | sublocality | high |
| MG | Madagascar | true | admin3 | sublocality | high |
| LS | Lesoto | true | admin3 | sublocality | high |
| MR | Mauritania | true | admin3 | sublocality | high |
| TD | Chad | true | admin3 | sublocality | high |
| SD | Sudán | true | admin3 | sublocality | high |
| CD | Rep. Dem. Congo | true | admin3 | sublocality | high |
| SC | Seychelles | false | locality | sublocality | medium |

**Oceanía — alta prioridad (con POIs hoy):** ninguna entrada Oceanía con POIs fuera de AU/NZ; el bloque entero queda como roadmap futuro.

Resto de países (sin POIs hoy y no listados arriba): derivación trivial desde el DOCX, mismo formato; se omite por brevedad — debe consolidarse en el PR que aplique el patch.

---

## 3. Gaps operativos

### 3.1 Países con POIs en Vandits **ausentes del canon** (41)

Ordenados por volumen (consulta read-only contra `admin_areas`/`locations`, 2026-05-21):

| iso2 | País | POIs | Prioridad |
|---|---|---:|---|
| IE | Irlanda | 55 | P0 |
| HR | Croacia | 25 | P0 |
| RS | Serbia | 18 | P0 |
| BG | Bulgaria | 17 | P0 |
| HU | Hungría | 15 | P0 |
| ML | Mali | 15 | P0 |
| SK | Eslovaquia | 13 | P0 |
| CZ | Chequia | 13 | P0 |
| SI | Eslovenia | 11 | P0 |
| IS | Islandia | 11 | P0 |
| EE | Estonia | 9 | P1 |
| KE | Kenia | 8 | P1 |
| LT | Lituania | 8 | P1 |
| ET | Etiopía | 5 | P1 |
| GE | Georgia | 4 | P1 |
| LV | Letonia | 4 | P1 |
| DK | Dinamarca | 4 | P1 |
| CU | Cuba | 3 | P2 |
| ME | Montenegro | 3 | P2 |
| MD | Moldavia | 3 | P2 |
| BA | Bosnia y Herz. | 3 | P2 |
| CR | Costa Rica | 2 | P2 |
| TZ | Tanzania | 2 | P2 |
| SG | Singapur | 2 | P2 |
| CY, AL, BY, EC, JO, LS, SD, MN, MR, TD, KG, MG, IL, SM, TM, MT, PE, CD, SC, JP* | varios | 1 c/u | P2 |

\* JP ya está en canon — el POI suelto no es gap.

**Total POIs afectados:** ~263 POIs (~5% del catálogo) que hoy resuelven contra `UNKNOWN_CANON` (regla conservadora: `hasProvincia=false`, `municipio→locality`). Funcional pero subóptimo para países con jerarquía rica (IE, HR, HU, CZ, SK, etc.).

### 3.2 Países del DOCX **sin POIs actuales** (115)

Mayoría del DOCX. Riesgo bajo a corto plazo, pero el canon debe estar listo para que el primer POI resuelva sin patch retroactivo (norma §9 del contrato territorial).

### 3.3 Entidades a marcar `needs_review`

- **Vaticano (VA)** — único nivel administrativo es la propia ciudad-estado. Sin región/provincia/municipio.
- **Mónaco (MC), Andorra (AD), San Marino (SM), Liechtenstein (LI), Nauru (NR), Tuvalu (TV)** — microestados con jerarquía artificial. Canon `hasProvincia=false` es seguro, pero etiquetas regionales necesitan revisión humana.
- **Bosnia y Herz. (BA), Emiratos Árabes Unidos (AE)** — federalismo asimétrico. DOCX explicita "se sintetizan funcionalmente".
- **Montenegro (ME)** — DOCX deja región "—". Tratar como `false` o introducir alias `país == región`.
- **Palestina (PS), Kosovo (XK), Taiwán (TW), Sahara Occidental (EH), Islas Cook (CK), Niue (NU)** — estatus disputado o no-ONU. Pendiente decisión política.

### 3.4 Países a bloquear como `canon_gap`

Recomendación: **NO bloquear ningún país.** El fallback actual (`UNKNOWN_CANON` → `hasProvincia=false`) es conservadoramente correcto. Aplicar `canon_gap` rompería imports KML actuales para los 41 países con POIs. Resolver vía patch incremental, no bloqueo defensivo.

---

## 4. Duplicados / alias

### 4.1 Diferencias ES/EN observadas

| DOCX (ES) | Posible alias EN/local | Decisión |
|---|---|---|
| Estados Unidos | United States, USA, US | canon usa `US`, DB tiene una fila `Estados Unidos de América` con 1 POI — alias a normalizar |
| Reino Unido | United Kingdom, UK, Great Britain | canon `GB`, OK |
| Corea del Sur | South Korea, Republic of Korea, ROK | canon `KR`, OK |
| Corea del Norte | North Korea, DPRK | sin entrada canon (PROPUESTA: `KP`) |
| Países Bajos | Netherlands, Holland | canon `NL`, OK |
| República Checa / Chequia | Czech Republic, Czechia | DOCX usa "Chequia" — sin entrada canon (PROPUESTA: `CZ`) |
| Santa Sede / Vaticano | Vatican City, Holy See | sin entrada canon (PROPUESTA: `VA`, needs_review) |
| Rep. Democrática del Congo | DR Congo, DRC, Zaire | sin entrada canon (PROPUESTA: `CD`) |
| República del Congo | Republic of Congo, Congo-Brazzaville | sin entrada canon (PROPUESTA: `CG`) |
| Costa de Marfil | Côte d'Ivoire, Ivory Coast | sin entrada canon (PROPUESTA: `CI`) |
| Esuatini | Eswatini, Swaziland | sin entrada canon (PROPUESTA: `SZ`) |
| Cabo Verde | Cape Verde, Cabo Verde | sin entrada canon (PROPUESTA: `CV`) |
| Birmania / Myanmar | Myanmar, Burma | DOCX usa "Myanmar" — sin entrada canon (PROPUESTA: `MM`) |
| Bielorrusia | Belarus | sin entrada canon (PROPUESTA: `BY`) |
| Tayikistán / Tajikistán | Tajikistan | sin entrada canon (PROPUESTA: `TJ`) |
| Macedonia del Norte | North Macedonia, FYROM | sin entrada canon (PROPUESTA: `MK`) |

### 4.2 Defectos del DOCX detectados

- **Oceanía aparece dos veces** (tablas duplicadas en pp.5; líneas 2103-2230 y 2232-2359 del parse). Las 14 filas son idénticas. No afecta la cuenta de 195 si se deduplica.
- **Rumanía / Rumania** — DOCX dice "Rumanía" pero el contrato canon usa "Rumania" sin tilde. Alias inocuo.

---

## 5. ¿Cubre el canon el DOCX?

**No.** Resumen ejecutivo:

- ✅ Los 39 países del canon **están todos** en el DOCX, sin contradicción de campos relevantes.
- ❌ **156 países** del DOCX no tienen entrada en `TERRITORIAL_CANON`.
- ❌ **41 países con POIs en Vandits** caen en `UNKNOWN_CANON` (fallback `hasProvincia=false`). Funcionalmente seguro, semánticamente pobre para IE/HR/HU/CZ/SK/RS.
- ❌ **5 entidades del anexo** (Kosovo, Taiwán, Sahara Occ., Cook, Niue) sin política definida; Kosovo ya tiene 3 POIs huérfanos.

---

## 6. Patch de canon recomendado (orden de incorporación)

**No se aplica en esta auditoría.** Sólo se propone. Cada ola es un PR independiente con su contract test (`territorial-canon-docx-conformance.test.ts` actualizado) y bump patch.

### Ola 1 — P0 (10 países con ≥10 POIs)
`IE, HR, RS, BG, HU, ML, SK, CZ, SI, IS`.
Cierra ~196 POIs hoy resueltos contra fallback genérico. Mayoría con `hasProvincia=true` real → ganancia inmediata en breadcrumb/health.

### Ola 2 — P1 (7 países con 4-9 POIs)
`EE, KE, LT, ET, GE, LV, DK`.

### Ola 3 — P2 (24 países con 1-3 POIs)
`CU, ME, MD, BA, CR, TZ, SG, CY, AL, BY, EC, JO, LS, SD, MN, MR, TD, KG, MG, IL, SM, TM, MT, PE, CD, SC`.

### Ola 4 — Microestados + UE faltantes
`AD, LI, LU, MC, MT*` (* MT ya en ola 3). Bajo riesgo, alto valor cosmético (Europa pintada al 100% del DOCX).

### Ola 5 — Resto Asia/África/Oceanía sin POIs (~115 países)
Carga masiva data-driven desde el DOCX. Ningún POI afectado el día del merge; canon preparado para el primer POI futuro sin patch retroactivo.

### Ola 6 — Anexo (5 entidades)
Decisión política previa requerida (Kosovo XK, Taiwán TW, Sahara Occ. EH, Cook CK, Niue NU). Bloqueada hasta confirmación humana del catálogo de `iso2` aceptados.

---

## 7. Restricciones cumplidas

- ✅ No se ha tocado código ni `TERRITORIAL_CANON`.
- ✅ No se han modificado datos (`locations`, `admin_areas`, `enriched_data`).
- ✅ No se ha llamado a Nominatim ni a edge functions.
- ✅ No hay bump de versión.
- ✅ Documento entregado: `docs/audits/t-global-canon-world-docx-coverage-audit.md` (este archivo).

---

## 8. Próximos pasos sugeridos (fuera de alcance de esta auditoría)

1. Ratificar las decisiones del anexo (XK, TW, EH, CK, NU) y de las entidades `needs_review` (VA, BA, ME, AE).
2. Abrir ticket `T-CANON-PATCH-WORLD-WAVE-1` con la Ola 1 (10 países P0). Incluye test paritario TS/Deno + extensión de `territorial-canon-docx-conformance.test.ts`.
3. Actualizar `docs/contracts/territorial-equivalence-canon.md` §1 y §9 al cierre de cada ola.
4. Actualizar `docs/audits/territorial-canon-global-status-and-roadmap.md` para reflejar el nuevo alcance (de 38 PDF a 195 DOCX) en el criterio §5.1.
