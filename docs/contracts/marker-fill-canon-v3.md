# Marker Fill Canon v3 — POI-N como SoT cromática del marker

> **Status:** ESTRATÉGICO (doc-only, no ejecutado). Aprobado como plan; ejecución diferida.
> **Version impact:** none (este documento). La ejecución futura requiere bump **minor** a `v1.3.0`.
> **Scope:** define que el **fill principal del marker POI** pasará a regirse por `poi.maturity[ computePoiMaturity(loc) ]` (11 niveles), conservando colección, owner, selección y health rings como capas secundarias.

---

## 1. Regla visual futura (canon v3)

```text
Fill principal     = poi.maturity[ computePoiMaturity(loc) ]    (11 niveles)
Forma              = origen (círculo propio, triángulo seguido)
Borde              = origen + selección
Tinte (ring 2px)   = colección (única o múltiple)
Health rings 5px   = salud objetiva (partial/chain/review/hardError)
Halo               = focus/selección
Owner identity     = sólo para POIs seguidos (triángulo OKLCH)
Badge numérico     = retirado del runtime; conservado como overlay admin debug
```

Invariante DURA: **una sola decisión cromática para el fill** = la madurez. Las demás capas no compiten por el fill — sólo añaden anillos/borde/halo geométricamente separados.

---

## 2. Qué se sustituye

| Hoy (v1.2.x)                                                  | Mañana (v1.3.0)                                            |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| Fill propio = `poi.state.{enriched, imported, empty}`          | Fill propio = `poi.maturity[ level ]` (11 tonos)           |
| `getPointVisualState(loc)` decide fill                         | `getPoiMaturityColor(loc)` decide fill (helper nuevo)      |
| Leyenda pill = `Estado base · Final · Importado · Vacío`       | Leyenda pill = `Madurez · [chip 0..10]`                    |
| Badge POI-N visible en runtime (admin overlay)                 | Badge POI-N degradado a debug interno admin                |

`getPointVisualState` **se conserva** como semántica (categoriza enriched/imported/empty) pero deja de ser SoT del fill. Lo siguen consumiendo filtros, leyendas heredadas y telemetría.

---

## 3. Qué se conserva (sin cambio)

- **Forma POI por origen** (círculo propio, triángulo seguido) — regla DURA PR-OWNER-IDENTITY-2.6.
- **Borde por origen** (`poi.originBorder.{my, followed, service, catalog}`).
- **Tinte de colección** (ring 2px con `poi.collectionTintSample.*` y `--poi-ring-collection-gap`).
- **Health rings 5px** (`partial`/`chain`/`review`/`hardError`) — regla DURA `mem://style/map/health-rings-rule`.
- **Halo de selección/focus** (`poi.halo.own`).
- **Owner identity OKLCH** para seguidos (`palette_version='owner-v2.6-no-green-no-gray'`). Exclusiones verdes/grises se mantienen; no colisiona con la nueva escala de fill.
- **`getPoiCurationLevel`** (6 niveles 0/1/3/5/9/10) sigue dictando `data-curation-action` en footer/popup — independiente del fill.
- **Pipeline POI source canónico** (`resolvePoiSource → … → createCustomIcon`).

---

## 4. Por qué Final/Importado/Vacío deja de ser fill principal

La triada actual codifica **tres estados discretos**; la nueva escala POI-N codifica **once niveles ordenados** sobre la misma dimensión (madurez del POI). La triada queda como **semántica legacy** útil para:

- Filtros explícitos del usuario ("solo enriquecidos").
- Buckets de telemetría y agregaciones (`getBucketStats`).
- Leyendas heredadas durante el periodo de transición.

Equivalencias informativas (no son reglas de pintado):

```text
POI-0..POI-2   ≈ empty
POI-3..POI-6   ≈ imported
POI-7..POI-10  ≈ enriched
```

Tras v1.3.x se evaluará retirar la leyenda Final/Importado/Vacío de la pill inferior derecha. La información sigue accesible vía `getPointVisualState` y filtros, pero deja de tener swatch propio en pantalla.

---

## 5. Por qué el badge POI-N deja de ser UI principal

El badge numérico fue introducido como overlay diagnóstico admin-gated cuando POI-N era una señal complementaria al fill. Al pasar POI-N a **gobernar el fill**, el número se vuelve redundante en la UI normal: el color ya transmite el nivel. El badge sobrevive **sólo como debug interno** (`view_audit_log` + toggle `Madurez POI ON/OFF`) durante al menos dos releases tras v1.3.0, para validar que el fill renderizado coincide con la madurez calculada y para depurar techos de `geo_resolution`. Su retirada definitiva se decide en `v1.3.x` posterior.

---

## 6. Ejecución diferida (no incluida en este documento)

Las seis fases de migración (helper SoT, renderer, leyendas, popup/miniaturas, tests, cleanup) están documentadas en el plan estratégico y NO se ejecutan aquí. Cada fase requiere PR propio con:

- `Version impact: minor` para la fase que cambia el fill renderizado (`v1.2.x → v1.3.0`).
- `Version impact: patch` para fases posteriores de cleanup (`v1.3.x`).

Ningún PR de Fase ≥ 1 puede mergearse antes de que producto firme la nueva paleta.

---

## 7. Qué este documento NO hace

- NO modifica `createCustomIcon`, `resolvePoiVisualGrammar`, `getPointVisualState`, `getPoiCurationLevel`, `computePoiMaturity`.
- NO modifica tokens `poi.*` (ni `poi.state.*`, ni `poi.maturity.*`, ni `poi.level.*`).
- NO toca markers, popup, miniaturas, colecciones, health rings ni overlay.
- NO toca leyendas en `LocationMap` ni en `FloatingToolbar`.
- NO introduce migración de datos.
- NO bump de versión.

Es **contrato visual canónico futuro** vivo. Cualquier PR que mueva el fill del marker a POI-N debe enlazarlo y respetar §1, §3 y §5.
