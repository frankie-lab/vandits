# P-POI-CURATION-1 — POI curation levels (lógica) + footer contextual

Capa **operacional/lógica**, no visual. Introduce niveles canónicos POI-0/1/3/5/9/10 que derivan salud, compartibilidad y acción principal de curación. **Blindaje arquitectónico**: el renderer del popup permanece único y los niveles **nunca** lo bifurcan.

## Regla dura — Renderer invariance

Los niveles POI-0 → POI-10 **NO pueden**:
- crear variantes nuevas del popup,
- crear layouts alternativos,
- crear shells distintos (`data-popup-footer="v2"`, `data-popup-version` ≠ `geo-canonical-v1`, etc.),
- crear ramas visuales legacy,
- alterar la jerarquía editorial consolidada (hero, breadcrumb, composer, ratings block, footer, PopupShell).

Los niveles **sólo** pueden modificar:
- salud (deriva),
- compartibilidad (deriva),
- contenido del atributo `data-curation-action` en el botón principal del footer canónico,
- estados operacionales y prioridades de curación.

El popup sigue siendo **un único renderer + fragments condicionales** dentro del mismo shell.

## Niveles canónicos (sólo los 6 reales)

| Level   | Definición                                                                  | Health  | Shareability | Primary action       |
|---------|-----------------------------------------------------------------------------|---------|--------------|----------------------|
| POI-0   | Sólo coordenadas; sin nombre validado                                       | red     | no           | `name`               |
| POI-1   | Coords + nombre; geografía sin validar (`geoHealth` ∈ {empty, stale_name, null}) | red     | no           | `validate-geo`       |
| POI-3   | Conflicto geográfico (`geoHealth='broken'`)                                 | red     | no           | `resolve-conflict`   |
| POI-5   | Enriquecido con deuda (`partial`, rings activos, falta visited)             | yellow  | limited      | `heal`               |
| POI-9   | Enriquecido + visitado + sin `user_rating`                                  | green   | yes          | `rate-experience`    |
| POI-10  | Enriquecido + visitado + valorado                                           | green   | yes          | `none`               |

Prioridad descendente 10→9→5→3→1→0. Prohibido inventar POI-2/4/6/7/8.

## Entregables

### 1. Contrato — `docs/contracts/poi-curation-levels.md`

Secciones:
1. Niveles y criterios de detección.
2. Mapping a salud / compartibilidad / acción principal.
3. Regla de prioridad descendente.
4. **Renderer invariance** (regla dura arriba, literal).
5. Lista de helpers canónicos en los que delega (sin duplicar predicados).
6. Matriz de tests obligatorios.

### 2. Memoria — `mem://logic/poi/curation-levels`

Incluye literal: *"Curation levels never fork popup renderer. They modify only logic, health, shareability and the `data-curation-action` attribute of the single canonical footer."*
Añadir entrada en `mem://index.md` (Core) reflejando la misma regla y los helpers únicos.

### 3. Helpers — `src/domains/content/lib/poi-curation-level.ts`

```ts
export type PoiCurationLevel = 0 | 1 | 3 | 5 | 9 | 10;
export type PoiCurationHealth = 'red' | 'yellow' | 'green';
export type PoiCurationShareability = 'no' | 'limited' | 'yes';
export type PoiPrimaryAction =
  | 'name' | 'validate-geo' | 'resolve-conflict'
  | 'heal' | 'rate-experience' | 'none';

export interface PoiCurationVerdict {
  level: PoiCurationLevel;
  healthState: PoiCurationHealth;
  shareability: PoiCurationShareability;
  primaryAction: PoiPrimaryAction;
}

export function getPoiCurationLevel(loc: GeoLocation): PoiCurationVerdict;
export function getPoiPrimaryHealingAction(level: PoiCurationLevel): PoiPrimaryAction;
export function isPoiShareable(level: PoiCurationLevel): PoiCurationShareability;
```

Delega 100% en: `isPointEnriched`, `getPointHealthRings`, `loc.geoHealth`, `loc.customData.visited|user_rating`, `isShareablePoi`. No duplica predicados.

Tests `src/test/poi-curation-level.test.ts`: fixture por nivel + coherencia con `isShareablePoi` (yes ⇒ true).

### 4. Integración mínima en footer

En `src/components/map/map-popups.ts`, dentro del **mismo** `data-popup-footer="v1"` existente:

- Computar `verdict = getPoiCurationLevel(location)`.
- Inyectar **un único** botón principal `data-action="curation-primary" data-curation-action="${primaryAction}"` como primer hijo del footer canónico.
- `primaryAction === 'none'` → no se emite botón.
- Resto del footer (acciones técnicas existentes) sin cambios.
- Etiquetas es-ES: Nombrar / Validar geografía / Resolver conflicto / Sanar POI / Valorar experiencia.
- Handlers sin implementar: el botón emite `lovable:curation-action { locationId, action }`. `rate-experience` puede mapearse al flujo `set-rating` existente.

**Nada más** se toca: ni hero, ni breadcrumb, ni composer, ni ratings (P-POPUP-14.2), ni taxonomía, ni PopupShell, ni F2, ni marker grammar, ni layouts, ni wrappers nuevos.

### 5. Tests de blindaje (renderer invariance)

**`src/test/popup-golden-poi-contract.test.ts`** — añadir aserción:
> Para cada nivel ∈ {0,1,3,5,9,10}, renderizar el Golden POI con datos que fuercen ese nivel y verificar que **no cambian**:
> - `data-popup-version="geo-canonical-v1"`,
> - presencia única de `data-popup-footer="v1"` (y ausencia de `v2`+),
> - presencia del shell: hero, breadcrumb, composer slots 1→4, `data-popup-ratings-block="v1"`,
> - el único cambio admisible es el atributo `data-curation-action` del botón principal.

**`src/test/popup-curation-primary-action.test.ts`** (nuevo) — guards:
- Por nivel: el footer contiene exactamente un `data-action="curation-primary"` con el `data-curation-action` correcto.
- POI-10: no existe `data-action="curation-primary"`.
- Para todos los niveles: NO existen `data-popup-footer="v2"`, NO existen wrappers nuevos alrededor de `.popup-content`, NO aparecen clases/atributos de ramas legacy (`legacy-`, `popup-v2-`, `data-popup-variant`).
- Snapshot estructural: la lista de atributos `data-popup-*` presentes es idéntica entre POI-1 y POI-10 salvo `data-curation-action`.

## Restricciones explícitas

No tocar: renderer canónico del popup, composer, hero, ratings, taxonomía, breadcrumb, marker grammar, PopupShell, F2, schema DB, RLS, sharing pipeline real, handlers existentes. No crear POI-2/4/6/7/8. No crear capas físicas nuevas. El veredicto es **derivado** — nunca fuente para visibilidad de markers, health rings o tints.

## Criterio de aceptación

1. `getPoiCurationLevel` devuelve uno de los 6 niveles para cualquier POI; coherente con `isShareablePoi`.
2. Footer del popup muestra el botón principal correcto por nivel; POI-10 no lo muestra.
3. Tests de blindaje verde: ningún nivel altera shell, footer base, composer, ratings, hero, breadcrumb ni PopupShell.
4. `popup-golden-poi-contract.test.ts` falla si reaparece cualquier variante de renderer por nivel.
5. Contrato + memoria publicados con la sección **Renderer invariance**; índice actualizado.
