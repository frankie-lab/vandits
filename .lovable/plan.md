# PR-HEALTH-SUBSET-FIX (revisado)

## A. Fit automático al activar chip Salud — APROBADO

`src/components/map/subset-fit.ts`:
- Añadir campo opcional `minZoom?: number` a `SubsetFitDetail` y `SubsetFitOptions` (default `null` = sin piso, retrocompat).

`src/components/LocationMap.tsx` (listener `SUBSET_FIT_BOUNDS_EVENT`):
- Tras calcular bounds y aplicar el clamp z12 superior, si `detail.minZoom != null` y el zoom resultante < `minZoom`, forzar `minZoom` manteniendo el centro.

`src/components/discovery/use-health-filter-fit.ts`:
- Pasar `minZoom: 7` (primer escalón compact donde los aros amber/yellow son visibles).
- Mantener `mode: 'if-outside'`.

Resultado: al activar "Rellenar huecos", el mapa aterriza en z≥7 y los aros aparecen sobre los 19.

---

## B. Separar "salud visible" vs "reparable por mí" — REFORMULADO

**Principio**: los health rings reflejan estado operativo del POI (propios y seguidos). El CTA y el RPC actúan SOLO sobre lo reparable por el caller. La UI explicita ambos números.

### B1. Helpers (sin cambios destructivos)

`src/domains/content/lib/point-health-rings.ts`:
- `getPointHealthRings(loc)` se queda EXACTAMENTE como está (propios + seguidos pintan rings reales).
- Añadir helper nuevo `isHealthRingRepairableByCaller(loc, currentUserId): boolean`:
  - `true` si `loc.ownerUserId === currentUserId` y el ring pertenece a `{partial, chain}`.
  - `false` para seguidos o rings no-accionables (`review`, `hardError` van por flujo per-POI).

`src/domains/discovery/lib/health-filter-scope.ts`:
- Extender el tipo de retorno con dos campos derivados:
  - `repairableIds: string[]` (subconjunto de `ids` que pasan `isHealthRingRepairableByCaller` para `partial`/`chain`).
  - `repairableCount: number` (longitud).
- `ids`/`total` se mantienen = "salud visible" (TODO el subset, propios + seguidos).
- Cálculo lee `currentUserId` del store de auth (helper único, sin prop drilling).

### B2. UI

`src/components/discovery/HealthFilterActionCTA.tsx`:
- Mostrar texto: `Rellenar mis huecos (${repairableCount})` / `Reparar mis cadenas (${repairableCount})`.
- Disabled cuando `repairableCount === 0` (caso "todo el subset es de seguidos") con tooltip: "Estos puntos son de usuarios que sigues; no puedes repararlos".
- Sin cambio para `review`/`hardError` (siguen siendo per-POI).

`src/components/discovery/HealthRepairPreviewDialog.tsx`:
- Header: `Rellenar huecos — ${total} con huecos visibles`.
- Sub-línea bajo el header (solo `partial`/`chain`):
  - `Reparables por ti: ${repairableCount}`
  - `De usuarios seguidos: ${total - repairableCount}` (solo si > 0)
- Lista preview: marcar las filas no-reparables con un chip discreto `Solo lectura · seguido` (icon Eye, sin acción), todavía clickeable para abrir el POI.
- Botón confirmar: `Confirmar reparación (${repairableCount})`. `enqueue_health_repair` recibe **solo `repairableIds`** (no `ids`), eliminando el `partial_skip` por ownership ya consumido en cliente.
- Si `repairableCount === 0` el botón queda disabled con el mismo tooltip.

### B3. Counts en FilterBar / chip

`src/components/FilterBar.tsx` (chip "Rellenar huecos N"):
- Mantener `N = total` (salud visible). El usuario sigue viendo "hay 19 puntos con huecos en pantalla".
- El número "reparable por ti" vive en el CTA y en el modal, no en el chip — el chip describe universo, no acción (alineado con `mem://ui/discovery/panel-modes`).

### B4. RPC y BD — SIN CAMBIOS

`enqueue_health_repair` se queda igual. Sigue filtrando defensivamente por `owner_user_id = caller`. Como el cliente ahora envía solo `repairableIds`, el `partial_skip` por ownership desaparece. El audit log mantiene su semántica (input válido, eligible computado, status real).

---

## Archivos tocados

```
src/components/map/subset-fit.ts                          (add minZoom field)
src/components/LocationMap.tsx                            (listener: floor zoom)
src/components/discovery/use-health-filter-fit.ts         (pass minZoom: 7)
src/domains/content/lib/point-health-rings.ts             (add isHealthRingRepairableByCaller)
src/domains/discovery/lib/health-filter-scope.ts          (add repairableIds/Count)
src/components/discovery/HealthFilterActionCTA.tsx        (text + disabled state)
src/components/discovery/HealthRepairPreviewDialog.tsx    (split counts + send repairableIds)
src/test/health-rings.test.ts                             (helper tests, rings unchanged)
src/test/health-filter-scope.test.ts                      (repairableIds split)
```

Cero migraciones. Cero cambios en rings visuales. Cero impacto en futuras features que diferencien propios vs seguidos — los rings siguen siendo verdad operativa.

---

## Memoria

- `mem://style/map/health-rings-rule` — explicitar: "rings = estado operativo del POI, propios y seguidos los pintan por igual. La acción de reparación es ortogonal al ring".
- `mem://logic/discovery/health-filter-axis` — añadir: "el chip cuenta salud visible (todos); el CTA y el modal cuentan reparables por el caller; el RPC recibe solo `repairableIds`".
- `mem://logic/health/workflow-split` — registrar la separación visible/reparable.
- `mem://logic/map/subset-fit-contract` — documentar `minZoom` opcional (default `null`).
- `mem://index.md` Core block: actualizar entrada de health rings con el matiz "rings ≠ acción".

---

## Validación

1. Activar "Rellenar huecos" desde z≤6 → mapa salta a z≥7, los 19 aros amber visibles.
2. Chip muestra **19**; CTA muestra **Rellenar mis huecos (14)**.
3. Abrir modal: header "19 con huecos visibles", sub-línea "Reparables por ti: 14 · De usuarios seguidos: 5", lista marca los 5 con chip "Solo lectura · seguido".
4. Confirmar → toast "Encolados 14 puntos", job arranca con 14/14.
5. Caso edge: filtro restringido a 5 puntos todos seguidos → CTA disabled con tooltip; modal igual con botón disabled.
6. Tests `getPointHealthRings` siguen verdes sin cambios; nuevos tests de `isHealthRingRepairableByCaller` y `health-filter-scope.repairableIds`.
