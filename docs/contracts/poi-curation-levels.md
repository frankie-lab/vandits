# POI Curation Levels — Contrato canónico (P-POI-CURATION-1)

Capa **operacional / lógica** que describe el estado de curación de un POI
y deriva tres consecuencias: **salud**, **compartibilidad** y **acción
principal de curación** del footer del popup. NO es un canon visual.

> **Renderer invariance (regla DURA)** — Los niveles de curación SÓLO
> pueden modificar el atributo `data-curation-action` del botón principal
> dentro del footer canónico (`data-popup-footer="v1"`). NUNCA pueden
> crear variantes del popup, layouts alternativos, shells distintos,
> ramas legacy ni alterar hero / breadcrumb / composer / ratings block /
> taxonomía / PopupShell / marker grammar. Cualquier evolución del
> sistema de curación opera sobre lógica y acciones, nunca creando otra
> UI paralela. El popup sigue siendo **un único renderer + fragments
> condicionales**.

## 1. Niveles canónicos

Sólo existen 6 niveles. **Prohibido inventar POI-2, POI-4, POI-6, POI-7,
POI-8**. Si una combinación de datos no encaja, cae al nivel inmediato
inferior por prioridad descendente `10 → 9 → 5 → 3 → 1 → 0`.

| Level   | Definición operacional                                                          | Health   | Shareability | Primary action       |
|---------|---------------------------------------------------------------------------------|----------|--------------|----------------------|
| POI-0   | Sólo coordenadas; sin nombre validado (vacío o `Sin nombre`)                    | red      | no           | `name`               |
| POI-1   | Coords + nombre; geografía sin validar (`geoHealth ∈ {null, empty, stale_name}`) | red      | no           | `validate-geo`       |
| POI-3   | Conflicto geográfico (`geoHealth = 'broken'`) — **tiene prioridad sobre enriched** | red      | no           | `resolve-conflict`   |
| POI-5   | Enriquecido con deuda: rings activos, `geoHealth='partial'`, o aún no visitado  | yellow   | limited      | `heal`               |
| POI-9   | Enriquecido + visitado + sin `user_rating`                                      | green    | yes          | `rate-experience`    |
| POI-10  | Enriquecido + visitado + valorado                                               | green    | yes          | `none` (estado final) |

## 2. Helpers canónicos (no duplicar predicados)

`src/domains/content/lib/poi-curation-level.ts` delega 100% en:

- `isPointEnriched(loc)` — frontera "tiene `enriched_data.descripcion`".
- `getPointHealthRings(loc)` — deuda operativa observable.
- `loc.geoHealth` — `'ok' | 'partial' | 'broken' | 'stale_name' | 'empty' | null`.
- `loc.customData.visited` / `loc.customData.user_rating` — estado personal.

Coherencia con `isShareablePoi`: si el veredicto es `shareability === 'yes'`,
`isShareablePoi(loc)` debe devolver `true`.

API:

```ts
getPoiCurationLevel(loc): PoiCurationVerdict
getPoiPrimaryHealingAction(level): PoiPrimaryAction
isPoiShareable(level): PoiCurationShareability
getPoiCurationHealth(level): PoiCurationHealth
```

## 3. Integración en footer del popup

Dentro del mismo `data-popup-footer="v1"`:

- Se inyecta **un único** botón principal con atributos:
  - `data-action="curation-primary"`
  - `data-curation-action="${primaryAction}"`
  - `data-curation-level="${level}"`
- Etiquetas es-ES: `Nombrar / Validar geografía / Resolver conflicto /
  Sanar POI / Valorar experiencia`.
- `primaryAction === 'none'` (POI-10) → **no se emite botón**.
- Se omite también para curator points y para popups en contexto nearby
  (paridad con la regla del bloque de ratings P-POPUP-14.2).
- Los handlers concretos no se implementan aquí: el botón puede emitir
  `lovable:curation-action { locationId, action }` o, cuando ya exista
  un flujo equivalente (`rate-experience` ↔ `set-rating`), reutilizarlo.

## 4. Renderer invariance — guards obligatorios

Esta sección es **norma de blindaje**. Cualquier PR que afecte
`map-popups.ts` o introduzca un nuevo nivel/acción debe pasar:

- `src/test/popup-golden-poi-contract.test.ts`
  - Bloque `P-POI-CURATION-1 — los niveles de curación NO bifurcan el renderer`.
- `src/test/popup-curation-primary-action.test.ts`
  - Por nivel: el footer contiene exactamente un `data-action="curation-primary"`
    con el `data-curation-action` correcto.
  - POI-10: NO existe `data-action="curation-primary"`.
  - **NO** existen `data-popup-footer="v2+"`, `data-popup-variant`,
    `popup-v2-*`, ni clases `legacy-popup`.
  - Snapshot estructural: la lista de markers `data-popup-*` (excepto
    `data-curation-action` / `data-curation-level`) es idéntica entre
    POI-1 y POI-10.

## 5. Matriz de tests obligatorios

| Test                                                | Cubre                                         |
|-----------------------------------------------------|-----------------------------------------------|
| `poi-curation-level.test.ts`                        | 6 niveles + prioridad + coherencia shareable  |
| `popup-curation-primary-action.test.ts`             | Footer + invariance                           |
| `popup-golden-poi-contract.test.ts` (sección curation) | Golden POI mantiene shell único               |

## 6. Restricciones

- No tocar: composer, hero, ratings (P-POPUP-14.2), taxonomía, breadcrumb,
  PopupShell, F2, marker grammar, schema DB, RLS, sharing pipeline real.
- No crear capas físicas nuevas. Verdict **derivado** — nunca fuente para
  visibilidad de markers, health rings o tints.
- No inventar POI-2/4/6/7/8.

## 7. Memoria asociada

- `mem://logic/poi/curation-levels` — regla operativa + literal de
  renderer invariance.
- Entrada en `mem://index.md` (Core).
