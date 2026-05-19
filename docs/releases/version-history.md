# Vandits Version History

Estado: reconstrucción inicial — 2026-05-19

Este documento reconstruye el árbol de versiones de Vandits a partir de
README, `package.json`, commits, documentación técnica y cambios funcionales
relevantes. No todas las versiones aquí listadas fueron releases formales
publicados; algunas son hitos **reconstructed** para fijar memoria histórica.

---

## Criterios de confianza

| Nivel           | Significado                                                              |
|-----------------|--------------------------------------------------------------------------|
| `high`          | La versión aparece explícitamente en README, `package.json` o changelog. |
| `medium-high`   | El hito se deduce de commits claros y agrupados.                         |
| `medium`        | El hito se deduce de commits o documentación, pero no fue release formal.|
| `low`           | Hito probable pendiente de validación.                                   |
| `planned`       | Versión futura propuesta.                                                |

---

## Árbol general

```text
0.x — Prototipo y fundación
  0.1.0-alpha  Mapa + locations + filtros básicos
  0.2.0-alpha  Enriquecimiento IA + popup enriquecido
  0.3.0-alpha  Tags/geografía/filtros interactivos
  0.4.0-beta   Mapa fullscreen + estabilización popup/mapa

1.x — Producto funcional
  1.0.0        Sistema completo inicial
  1.1.0        Layout unificado y consistencia UX
  1.1.1        Welcome card + fix conteo catálogo   ← versión actual
  1.2.0        Rutas e itinerarios                  (reconstructed, not current)
  1.2.1        Refinamiento rutas/intermodal/persistencia (reconstructed, not current)
  1.3.0        Architecture baseline                (planned)

2.x — Futuro
  2.0.0        Reservado para ruptura real de arquitectura/contratos
```

---

## Patch History

Las versiones patch reconstruidas agrupan bloques coherentes de fixes/estabilización. No representan un commit por versión. Las entradas `reconstructed` no fueron necesariamente releases formales publicadas en su momento.

### 0.x — Pre-release / fundación

| Versión | Fecha | Tipo | Hito | Confianza | Evidencia |
|---|---:|---|---|---|---|
| 0.1.0-alpha | 2026-01-16 | inferred | Mapa base, locations, filtros, Leaflet y primeros popups | medium | Commits iniciales de mapa, filtros y popups. |
| 0.1.1-alpha | 2026-01-16 | inferred patch | Correcciones iniciales de mapa/filtros/runtime | medium | Fix map rendering with Leaflet, FilterBar, múltiples instancias React, overlays/modales. |
| 0.2.0-alpha | 2026-01-16 | inferred | Enriquecimiento IA + popup enriquecido | medium | Show enriched popup. |
| 0.2.1-alpha | 2026-01-16 | inferred patch | Estabilización de enriquecimiento/import | medium | AI edge handling, KML UUID, guardado al pausar enriquecimiento, batch resume. |
| 0.3.0-alpha | 2026-01-16 | inferred | Geografía, tags y filtros interactivos | medium | Filtros clicables, tags geográficos, árbol de tags, hashtags. |
| 0.3.1-alpha | 2026-01-16 | inferred patch | Correcciones de geografía/tags/popup | medium | Continente desconocido, hashtags geográficos, filtros desde popup, null safety. |
| 0.4.0-beta | 2026-01-16 | inferred | Mapa fullscreen + experiencia app | medium | Make map fullscreen with popups. |
| 0.4.1-beta | 2026-01-16 | inferred patch | Estabilización de realtime, popups y foco | medium | Realtime hook crash, popup update safety, popup null safety, foco al enriquecer. |

### 1.x — Producto funcional

| Versión | Fecha | Tipo | Hito | Confianza | Evidencia |
|---|---:|---|---|---|---|
| 1.0.0 | 2026-01-17 | stable | Sistema completo inicial | high | README changelog. |
| 1.0.1 | 2026-01-17 | reconstructed patch | Estabilización post-1.0 | medium | useDatabaseSync race, popup lookup, geo hashtags, map center, search icon, semantic toggle, TagsTree, impacto enriquecimiento, animación, auth redirect, profile sync, admin scroll/loading. |
| 1.1.0 | 2026-01-18 | stable | Layout unificado y consistencia UX | high | README changelog. |
| 1.1.1 | 2026-04-19 | stable current | Welcome card + fix conteo catálogo | high | README changelog + `package.json`. |
| 1.1.2 | TBD | candidate patch | Estabilización social/fotos/delete/markers posterior a 1.1.1 | medium | Users sidebar, photo update flow, duplicate threshold, delete workflow, soft-deleted locations, curator marker fallback, map scale guard, marker interaction, dialog close guard. |
| 1.2.0 | 2026-04-04 | reconstructed minor | Rutas e itinerarios base | medium-high | routes schema, route_waypoints, calculate-route, RouteBuilder, RoutesListPanel, renderizado en mapa y eventos de rutas. |
| 1.2.1 | 2026-04-06 | reconstructed patch | Refinamiento rutas/intermodal/persistencia | medium | stages, ida/vuelta, colores, persistencia, ferry_routes, alternativas driving/ferry/flight, selección en mapa, agrupación padre/hijo, skeleton, paradas/jornadas. |
| 1.2.2 | TBD | planned patch | Gobernanza y estabilización documental | planned | versioning policy, reconstructed history, global events docs, tech debt. |
| 1.3.0 | TBD | planned minor | Architecture baseline | planned | Requiere tests visuales, foto arquitectura, tipado inicial eventos y reducción de deuda. |

Decisión de gobernanza: no se crea una patch version por commit. Solo se documentan patches cuando agrupan un bloque coherente de correcciones o estabilización con valor histórico.

La versión oficial actual sigue siendo **1.1.1** hasta que se haga un release/bump explícito. Entradas marcadas como `TBD`, `candidate patch`, `planned patch` o `planned minor` son hitos propuestos, no versiones publicadas.

---

## 0.x — Prototipo y fundación

| Versión        | Fecha       | Tipo       | Hito                                              | Confianza | Evidencia |
|----------------|-------------|------------|---------------------------------------------------|-----------|-----------|
| 0.1.0-alpha    | 2026-01-16  | inferred   | Mapa + locations + filtros básicos                | medium    | Commits iniciales de mapa, popups, filtros, reset y geocoding. |
| 0.2.0-alpha    | 2026-01-16  | inferred   | Enriquecimiento IA + popup enriquecido            | medium    | Commit `Show enriched popup`; integración de ficha enriquecida en popup. |
| 0.3.0-alpha    | 2026-01-16  | inferred   | Tags/geografía/filtros interactivos               | medium    | Commits de filtros clicables, tags geográficos, árbol de tags y hashtags. |
| 0.4.0-beta     | 2026-01-16  | inferred   | Mapa fullscreen + estabilización popup/mapa       | medium    | Commit `Make map fullscreen with popups`; fixes posteriores de foco, apertura y null safety. |

---

## 1.x — Producto funcional

| Versión | Fecha       | Tipo                          | Hito                                              | Confianza      | Evidencia |
|---------|-------------|-------------------------------|---------------------------------------------------|----------------|-----------|
| 1.0.0   | 2026-01-17  | stable                        | Sistema completo inicial                          | high           | README changelog. |
| 1.1.0   | 2026-01-18  | stable                        | Layout unificado y consistencia UX                | high           | README changelog. |
| 1.1.1   | 2026-04-19  | stable (current)              | Welcome card + fix conteo catálogo                | high           | README changelog + `package.json`. |
| 1.2.0   | 2026-04-04  | reconstructed, not current    | Rutas e itinerarios                               | medium-high    | Commits `Routed: added itineraries system`, `Rewrite RouteBuilder with stages`, alternativas intermodales y persistencia. |
| 1.2.1   | 2026-04-06  | reconstructed, not current    | Refinamiento rutas/intermodal/persistencia        | medium         | Commits de fixes y mejoras sobre rutas: selección en mapa, agrupación padre/hijo, skeleton, persistencia de paradas/jornadas. |
| 1.3.0   | TBD         | planned                       | Architecture baseline                             | planned        | Requiere versioning policy, version history, tech debt, global events, tests visuales y foto de arquitectura. |

---

## 2.x — Futuro

| Versión | Fecha | Tipo               | Hito                                            | Confianza | Evidencia |
|---------|-------|--------------------|-------------------------------------------------|-----------|-----------|
| 2.0.0   | TBD   | reserved / planned | Ruptura real de arquitectura/contratos          | planned   | Reservado para cambios incompatibles: bus de eventos, modelo de datos, mapa, popup canónico o catálogo. |

---

## Nota sobre 1.2.0 y 1.2.1

El sistema de rutas e itinerarios parece suficientemente grande para ser una
versión **minor** propia. Incluye schema, edge function, `RouteBuilder`,
`RoutesListPanel`, renderizado en mapa, eventos, alternativas intermodales y
persistencia. Como el README actual sigue en **v1.1.1** y `package.json`
también, estas versiones se marcan como **reconstructed, not current**: no
fueron releases formales publicados, sino hitos reconstruidos a partir de
commits y documentación. La versión vigente y publicada sigue siendo
**1.1.1**.

## Nota sobre 1.3.0

`1.3.0` queda reservada para una **baseline arquitectónica** real. No debe
publicarse solo por crear documentación. Debe incluir como mínimo:

- política de versionado,
- árbol histórico,
- deuda técnica priorizada,
- catálogo de eventos globales,
- tests de gramática visual de puntos,
- foto de arquitectura actual,
- posible tipado inicial de eventos globales.
