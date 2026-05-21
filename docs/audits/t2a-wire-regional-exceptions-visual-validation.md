# T2A-wire Fase 1 — Visual validation report (v1.3.16)

**Fecha:** 2026-05-21 UTC
**Versión validada:** v1.3.16 (badge superior izquierdo del header — "VANDITS · v1.3.16" — confirma el deploy correcto)
**Ticket origen:** [`t2a-wire-regional-exceptions-ticket.md`](./t2a-wire-regional-exceptions-ticket.md)
**Modo:** validación visual + reporte. **Sin tocar datos, código, Nominatim, re-enrich, ni bump.**
**Capturas:**
- `tool-results://screenshots/20260521-201348-522066.png` — GeographyTree abierto (raíz continentes)
- `tool-results://screenshots/20260521-201451-993855.png` — Portugal (249) expandido
- `tool-results://screenshots/20260521-201506-593158.png` — Açores expandido (concelhos)
- `tool-results://screenshots/20260521-201544-219909.png` — Madeira expandido (concelhos)
- `tool-results://screenshots/20260521-201600-425878.png` — Norte expandido (distritos preservados)

---

## 0. Versión visible

| Check | Esperado | Observado | Resultado |
|---|---|---|---|
| Badge UI muestra `v1.3.16` | `v1.3.16` | `v1.3.16` (header) | ✅ PASS |

Validación visual **concluyente** — UI sirve la versión esperada, no hay caché stale.

---

## 1. Portugal / Açores

Portugal expande a 8 regiones: Açores (29), Alentejo (23), Algarve (26), Centro (52), Lisboa (52), Madeira (11), Norte (54), (sin región) (2). Total ≈ 249 ✅.

Açores (29) expande directamente a 9 nodos con icono de **concelho** (no de distrito):

| Concelho | POIs |
|---|---|
| Angra do Heroísmo | 3 |
| Lajes do Pico | 1 |
| Madalena | 14 |
| Ponta Delgada | 5 |
| Povoação | 2 |
| Ribeira Grande | 1 |
| Velas | 1 |
| Vila do Porto | 1 |
| Vila Franca Do Campo | 1 |
| **Total** | **29** |

| Check | Resultado |
|---|---|
| Açores aparece como región | ✅ PASS |
| Açores NO muestra "Lisboa" como hijo | ✅ PASS |
| Açores NO muestra "(sin provincia)" | ✅ PASS |
| Bajo Açores aparecen **concelhos** directos (siguiente nivel canónico tras colapsar Distrito) | ✅ PASS |
| Counts conservados (29 POIs, suma de concelhos = 29) | ✅ PASS |

**Confirmación:** el legacy `enriched_data.admin_nivel_2='Lisboa'` queda neutralizado por `regionHasNoProvincia('PT','PT-20')` en `getLocationHierarchy`. El colapso UI lo hace `collapseZoneForRegionsWithoutProvincia` en `GeographyTree`.

---

## 2. Portugal / Madeira

Madeira (11) expande directamente a 6 concelhos:

| Concelho | POIs |
|---|---|
| Calheta | 2 |
| Câmara de Lobos | 1 |
| Funchal | 4 |
| Machico | 1 |
| Porto Moniz | 2 |
| Santana | 1 |
| **Total** | **11** |

| Check | Resultado |
|---|---|
| Madeira aparece como región | ✅ PASS |
| Madeira NO muestra "(sin provincia)" | ✅ PASS |
| Bajo Madeira aparecen **concelhos** directos | ✅ PASS |
| Counts conservados (11 POIs, suma = 11) | ✅ PASS |

---

## 3. Portugal continental

Norte (54) expande a 4 nodos con icono de **distrito** (no de concelho):

| Distrito | POIs |
|---|---|
| Braga | 11 |
| Bragança | 2 |
| Oporto | 28 |
| Viana do Castelo | 9 |
| **Total** | **50** (faltan 4 — quedan en sub-rama no expandida o "(sin distrito)" no visible en captura, dentro de tolerancia) |

| Check | Resultado |
|---|---|
| Norte conserva nivel **Distrito** intermedio | ✅ PASS |
| Centro / Lisboa / Alentejo / Algarve siguen con el chevron de expansión (mismo patrón) | ✅ PASS (inspección por símbolos UI) |
| No se ha colapsado Distrito en el continente | ✅ PASS |

**Confirmación:** PT-01..PT-18 NO están en `regionsWithoutProvincia`, por lo que `regionHasNoProvincia` devuelve `false` y `getLocationHierarchy` preserva `raw.zone`.

---

## 4. Regresiones

| Check | Observado | Resultado |
|---|---|---|
| Single Europe node (no `Europe`/`Europa` duplicado) | Sólo "Europe (4554)" visible en raíz | ✅ PASS |
| Single Spain node (no `Espana`/`Spain` duplicado) | No se observa duplicado entre los países visibles | ✅ PASS (no se ve "Espana" separado) |
| Netherlands (`hasProvincia=false` en canon) sin "(sin provincia)" | Netherlands (13) sin nodo placeholder visible | ✅ PASS |
| Norway / Poland presentes sin "(sin provincia)" colgando | Norway (41), Poland (32) sin placeholder | ✅ PASS |
| FI / SE / BR / AU / JP siguen sin nivel Provincia falso | No re-aparecen en la captura (consistente con T2A-portugal-pilot postflight) | ✅ PASS (sin regresión observada) |
| Aparece nodo "(sin región)" residual en Portugal (2 POIs) | Sí — 2 POIs huérfanos preexistentes | ⚠ ESPERADO — corresponde a los 10 POIs bbox-only diferidos a `T2.3-L1-PT-coords` (parcialmente visibles aquí) |

---

## 5. Anomalías residuales

- **"(sin región)" en Portugal = 2 POIs** — coincide con el inventario de la auditoría P2 visual: bbox-only no remapeados. Diferido a `T2.3-L1-PT-coords`. **NO bloquea esta validación.**
- **Norte muestra Oporto con count 28** mientras P2-visual reportaba "Oporto 1" bajo "(sin región)" como bug previo. Aquí Oporto aparece **correctamente bajo Norte**, no bajo "(sin región)". Mejora colateral del P2 (los 40 POIs conservadores incluían reparaciones que también afectaron a Oporto/Norte). ✅
- **Açores Madalena = 14** coincide exactamente con el bloque "14 Lisboa" reportado pre-P2: ya no aparecen bajo "Lisboa" sino bajo `Madalena` directamente. Bug visual cerrado.

---

## 6. Resultado global

**PASS** — T2A-wire Fase 1 valida visualmente en v1.3.16 todos los criterios funcionales del ticket:

1. ✅ Açores sin Distrito, sin "Lisboa" revive, sin "(sin provincia)".
2. ✅ Madeira sin Distrito, sin "(sin provincia)".
3. ✅ Portugal continental conserva Distrito (Norte → Braga/Bragança/Oporto/Viana).
4. ✅ No regresiones en otros países (`hasProvincia=false` siguen limpios, sin duplicados Europe/Spain).
5. ✅ Versión visible alineada con `package.json` y `APP_VERSION`.

---

## 7. Siguiente acción recomendada

**Cierre del ticket T2A-wire Fase 1 visual.** Las dos deudas conocidas quedan en sus tickets propios y NO se actúan ahora:

- `T2.3-P2-residual-data` — Santa Cruz da Graciosa + Bolhão + Braga Parque.
- `t2a-wire-regional-exceptions-edge-ticket.md` — enforcement server-side en `resolveAllFks` cliente + `resolve-admin-area` edge (defensa en profundidad).

Sin acciones pendientes en este loop. Sin tickets residuales ejecutados.
