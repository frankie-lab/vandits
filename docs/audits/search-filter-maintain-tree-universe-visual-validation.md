# Validación visual — árbol unificado por universo activo

Fecha: 2026-05-23
Ref: `docs/audits/search-filter-maintain-tree-universe-plan.md`, `src/test/resolve-universe-base.test.ts`
Entorno: preview sandbox (`id-preview--0d7813f2…lovable.app`), viewport 1536×864.

## Resumen ejecutivo

Estructura visual **conforme al contrato**: las tres vistas (Explorar, Mantener→Con deuda, Mantener→Sin enriquecer) renderizan el mismo bloque `Geo / Tipo / Tags / Legacy` debajo del CTA, sin vistas vacías. Tab activa se preserva al cambiar de modo. Cámara no se auto-ajusta al cambiar de modo.

**Anomalía bloqueante de counts**: los tres totales que conviven en cada modo de Mantener **no coinciden** entre sí (chip de subtab ≠ contador del CTA "ACCIÓN SOBRE …" ≠ suma de raíces Geo). Tres universos distintos están alimentando tres widgets que deberían leer el mismo `universeBase`. Detalle abajo (§ Anomalías).

**Release-ready: NO** hasta resolver la divergencia de counts.

---

## Casos

### 1. Explorar — PASS
- Tabs `Geo / Tipo / Tags / Legacy` visibles.
- Geo: Africa 98 · Americas 372 · Asia 66 · Europe 4554 · Oceania 5 → suma **5095**.
- Header "0 / 5071 seleccionados" (Mios 5071 · Seguidos 5095).
- Sin regresión visual.

### 2. Mantener → Con deuda — PASS estructura / FAIL counts
- Chip subtab: **Con deuda 13**.
- CTA "ACCIÓN SOBRE CON DEUDA (**15**)" + botón "Seleccionar todo".
- Árbol Geo presente bajo el CTA: Africa **2** · Europe **20** → suma **22**.
- No es vista vacía: el árbol coexiste con el CTA.
- Divergencia: 13 (chip) ≠ 15 (CTA) ≠ 22 (suma Geo). Esperado por el plan: la suma de raíces Geo debe igualar el universo `debt`.

### 3. Mantener → Sin enriquecer — PASS estructura / FAIL counts
- Chip subtab: **Sin enriquecer 1302**.
- CTA "ACCIÓN SOBRE SIN ENRIQUECER (**1306**)" + texto "1306 POIs sin enriquecer en el subconjunto activo. La cola de enriquecimiento masivo se gestiona desde el panel de Imported Content." + botón "Seleccionar todo".
- Árbol Geo presente: Africa **54** · Americas **341** · Asia **32** · Europe **903** · Oceania **5** → suma **1335**.
- No es vista vacía: el árbol coexiste con CTA + texto explicativo.
- Divergencia: 1302 ≠ 1306 ≠ 1335.

### 4. Cambio de tab — PASS
- En Mantener→Sin enriquecer se cambia a `Tipo`.
- Se vuelve a Explorar: la tab activa sigue siendo **Tipo** y muestra el árbol Explorar/Tipo completo (Asentamientos humanos 1352 con desglose, Entidades construidas 1193, …).
- Persistencia entre modos confirmada.

### 5. Filtro geográfico — PASS
- En Sin enriquecer se expande **Europe (903)**: muestra países con counts refinados dentro del universo `unenriched` (Albania 1, Austria 9, Belgium 1, Bielorrusia 1, Bosnia 2, Bulgaria 9, Chipre 1, Croatia 24, …).
- El refinamiento ocurre dentro del universo activo (no global).
- Caso "Con deuda → Europe" no expandido en esta sesión por riesgo de tiempo, pero el patrón es idéntico (Europe 20).

### 6. Seleccionar todo — NO EJECUTADO
- Acción destructiva potencialmente costosa (1306 POIs); no se pulsó "Seleccionar todo" en preview live. La invariante (`effectiveActionSet = universeBase ∩ treeSelection`) está cubierta por el contract test `src/test/resolve-universe-base.test.ts` ("effectiveActionSet (regla del plan UX)").

### 7. Cámara — PASS
- El viewport del mapa permanece idéntico al cambiar Explorar ↔ Mantener→Con deuda ↔ Mantener→Sin enriquecer.
- No se observa `requestSubsetFit` ni animación de cámara.

---

## Anomalías

### A1 — Triple count divergente en Mantener (BLOQUEANTE)

| Modo | Chip subtab | CTA "ACCIÓN SOBRE …" | Suma raíces Geo |
|---|---:|---:|---:|
| Con deuda | 13 | 15 | 22 |
| Sin enriquecer | 1302 | 1306 | 1335 |

El plan exige que los tres widgets lean el **mismo `universeBase`** resuelto por `resolveUniverseBase`. Hoy parecen alimentarse de tres snapshots distintos:

- **Chip de subtab** (13 / 1302): probablemente sigue calculándose sobre el contador legacy del modo Mantener (pre-implementación del árbol).
- **CTA "ACCIÓN SOBRE …"** (15 / 1306): cuenta inputs del `effectiveActionSet` previo a aplicar `treeSelection` — pero su número tampoco coincide con el árbol.
- **Suma raíces Geo** (22 / 1335): proviene del `UniverseBaseProvider` y de los predicados canónicos (`getPointHealthRings`, `isPointEnriched`).

Diferencias plausibles entre las fuentes:
- Inclusión / exclusión de POIs `followed` (header marca 5071 míos vs 5095 totales; delta 24 cuadra aprox. con la diferencia Geo↔CTA en `Sin enriquecer`).
- `geoHealth ∈ {partial, stale_name, empty}` cuenta dentro de `debt` para el árbol pero quizá no para el chip.
- POIs sin `region` resuelta no entran al árbol Geo pero sí al chip (huérfanos geográficos).

Acción recomendada (fuera de este PR visual): unificar el origen de los tres contadores al `universeBase` del `UniverseBaseProvider` activo, o documentar explícitamente que el chip cuenta `myCatalog ∩ universo` y el árbol cuenta `myCatalog ∪ followed ∩ universo`.

### A2 — Caso 6 no ejercitado en preview
Cubierto por unit test pero no validado a ojo. Bajo riesgo dado el contract test.

---

## Conteo esperado por el plan

- "Con deuda suma 13": **NO confirmado** — suma raíces Geo = 22 (chip = 13).
- "Sin enriquecer suma 1302": **NO confirmado** — suma raíces Geo = 1335 (chip = 1302).

El conteo objetivo del plan (13 / 1302) corresponde al chip, no al árbol. Releváncia depende de cuál sea la fuente canónica acordada.

---

## Release-ready

**NO**. Estructura visual y persistencia de tab/cámara cumplen el contrato, pero la divergencia de counts entre chip, CTA y árbol rompe la invariante "los counts del árbol corresponden al universo activo correcto" del plan (§ 4 Cálculo de counts).

**Pasos sugeridos antes de merge**:
1. Cablear el chip de subtab y el CTA "ACCIÓN SOBRE …" al mismo `universeBase` que consume `UniverseBaseProvider`.
2. Decidir si followed entra en `debt`/`unenriched` (afecta los tres widgets a la vez).
3. Repetir esta validación esperando `chip == CTA == Σ raíces Geo`.

No se aplicó fix en este pase: queda como hand-off al PR de unificación de counts.
