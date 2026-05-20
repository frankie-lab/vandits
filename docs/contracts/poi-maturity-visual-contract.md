# POI Maturity Visual Contract (POI-0 … POI-10)

> **Status:** DRAFT — documentación. NO implementar todavía.
> **Version impact:** none. Sin código, sin datos, sin bump.
> **Scope:** define una escala visual de **madurez** del POI extendida a 11 niveles (POI-0…POI-10) para futura adopción. **No sustituye** el canon actual del mapa (`getPointVisualState` enriched/imported/empty + `levelKey` PR-MAP-CANON-3 con 6 niveles {0,1,3,5,9,10}). Cuando se implemente, deberá **convivir** con ese canon, no reemplazarlo en caliente.

---

## 1. Tabla canónica POI-0 … POI-10

| Nivel  | Color semántico    | Token sugerido (futuro)         | Significado                                                                                  |
| ------ | ------------------ | ------------------------------- | -------------------------------------------------------------------------------------------- |
| POI-0  | Rojo               | `poi.maturity.0`                | Sólo coordenadas. Sin nombre validado. POI fantasma.                                         |
| POI-1  | Gris cálido        | `poi.maturity.1`                | Coords + nombre, geografía **sin validar** (`geoHealth ∈ {null, empty, stale_name}`).        |
| POI-2  | Gris cálido        | `poi.maturity.2`                | Coords + nombre, geografía **parcial** (`geoHealth = 'partial'`). Mejor que POI-1, no resuelto.|
| POI-3  | Rojo intenso       | `poi.maturity.3`                | Conflicto geográfico explícito (`geoHealth = 'broken'`). Requiere intervención.              |
| POI-4  | Naranja            | `poi.maturity.4`                | Geo OK pero **sin enriquecer**. Listo para IA, pendiente de descripción.                     |
| POI-5  | Ámbar              | `poi.maturity.5`                | Enriquecido **con deuda** (rings activos: `partial/chain/review/hardError` o geo ≠ ok).      |
| POI-6  | Amarillo           | `poi.maturity.6`                | Enriquecido sano, **sin imagen** representativa o sin tags semánticas mínimas.               |
| POI-7  | Lima               | `poi.maturity.7`                | Enriquecido sano completo (descripción + imagen + tags), **no visitado**.                    |
| POI-8  | Verde claro        | `poi.maturity.8`                | Enriquecido sano + **visitado**, sin rating personal.                                        |
| POI-9  | Verde              | `poi.maturity.9`                | Enriquecido sano + visitado + **rating personal**.                                           |
| POI-10 | Verde intenso      | `poi.maturity.10`               | Curación máxima: POI-9 + observación/nota personal + foto propia. Referencia editorial.      |

---

## 2. Regla de lectura visual

**El color comunica el GRUPO de madurez. El badge comunica el NIVEL EXACTO.**

Agrupación cromática canónica:

| Grupo                | Niveles            | Color base       | Lectura rápida                                  |
| -------------------- | ------------------ | ---------------- | ----------------------------------------------- |
| **Crítico**          | POI-0, POI-3       | Rojo             | "Roto, intervenir."                             |
| **Pendiente geo**    | POI-1, POI-2       | Gris cálido      | "Falta validar geografía."                      |
| **Pendiente enrich** | POI-4              | Naranja          | "Geo OK, falta IA."                             |
| **Deuda**            | POI-5              | Ámbar            | "Enriquecido pero con avisos."                  |
| **Casi listo**       | POI-6, POI-7       | Amarillo / Lima  | "Sano, falta pulir o vivir."                    |
| **Curado**           | POI-8, POI-9, POI-10 | Verde escala   | "Experiencia personal real."                    |

**Invariante de diseño:**
- El usuario distingue **a primera vista** el grupo por color.
- El usuario distingue **el nivel exacto** leyendo el badge numérico (`POI-N`) o el ring de detalle.
- **POI-1 y POI-2 comparten gris cálido** porque ambos son "pendiente geo"; la diferencia (sin validar vs. parcial) la comunica EXCLUSIVAMENTE el badge. No inventar dos grises distintos.
- Mismo principio aplica a POI-6/POI-7 (amarillo/lima son matices del mismo grupo "casi listo") y a POI-8/POI-9/POI-10 (verde en escala creciente).

---

## 3. Relación con el canon actual (NO se sustituye)

El mapa hoy opera con dos ejes ortogonales:

1. **Bucket visual plano** (`getPointVisualState`): `enriched` (verde ancla) / `imported` (gris) / `empty` (naranja). Es la SoT histórica del color del marker propio.
2. **`levelKey` PR-MAP-CANON-3**: 6 niveles `{poi-0, poi-1a, poi-1b, poi-3, poi-5, poi-9, poi-10}` derivados de `getPoiCurationLevel`. Es la SoT actual del fill via `levelVisual.fillHsl`.

Esta escala POI-0…POI-10 es una **extensión documental** que:

- **No** redefine `enriched_data.descripcion` como criterio enriched.
- **No** elimina los buckets `enriched/imported/empty`: POI-0…POI-4 caen en `imported|empty`, POI-5…POI-10 caen en `enriched`.
- **No** rompe `levelKey`: el mapeo futuro será **función pura** `PoiMaturityLevel → levelKey` (muchos-a-uno). Ej.: POI-1 y POI-2 → `poi-1a`; POI-7/8/9 → `poi-9`; POI-10 → `poi-10`.
- **No** rompe la regla de identidad de seguidos (`paletteScope = 'owner-identity'`): la escala POI-N **sólo aplica a POIs propios** (`paletteScope = 'state'`). Followed/app/source quedan fuera.

---

## 4. Mapeo propuesto (referencia, no normativo todavía)

| POI-N  | Bucket actual (`getEnrichmentBucket`) | `levelKey` (PR-MAP-CANON-3) | Notas                                                  |
| ------ | ------------------------------------- | --------------------------- | ------------------------------------------------------ |
| POI-0  | `empty`                               | `poi-0`                     | Sin nombre validado.                                   |
| POI-1  | `empty` / `imported`                  | `poi-1a`                    | Geo sin validar.                                       |
| POI-2  | `empty` / `imported`                  | `poi-1a`                    | Geo parcial. Subnivel dentro de poi-1a hoy.            |
| POI-3  | `empty` / `imported` / `enriched`     | `poi-3`                     | Conflicto geo. Puede convivir con enrich.              |
| POI-4  | `imported`                            | `poi-1b`                    | Geo OK, sin descripción IA.                            |
| POI-5  | `enriched`                            | `poi-5`                     | Enriquecido con deuda objetiva.                        |
| POI-6  | `enriched`                            | `poi-9`                     | Sano sin imagen. Hoy se agrupa en poi-9.               |
| POI-7  | `enriched`                            | `poi-9`                     | Sano completo, no visitado.                            |
| POI-8  | `enriched`                            | `poi-9`                     | Visitado sin rating. Hoy `poi-9` con `primaryAction = 'none'`. |
| POI-9  | `enriched`                            | `poi-9` / `poi-10`          | Visitado + rating.                                     |
| POI-10 | `enriched`                            | `poi-10`                    | Curación editorial máxima.                             |

---

## 5. Reglas de futura implementación (cuando se decida activar)

1. **Aditiva**: nuevos tokens `poi.maturity.{0..10}` en `src/design-system/tokens/source/poi.json`. No tocar `poi.level.*` existentes hasta migración consciente.
2. **Helper único**: `getPoiMaturityLevel(loc): 0..10`, viviendo junto a `getPoiCurationLevel`. Composición pura sobre helpers canónicos (`isPointEnriched`, `getPointHealthRings`, `geoHealth`, `customData.visited`, `customData.user_rating`, presencia de imagen, etc.).
3. **Renderer invariance**: el marker propio sigue leyendo `levelVisual.fillHsl`. Hasta que la escala POI-N entre en `levelVisual`, **no** se pinta en el mapa. Sólo se podrá mostrar en:
   - badges del popup,
   - paneles de admin/audit,
   - vistas de "salud del catálogo".
4. **Convivencia obligatoria**: la primera versión productiva debe convivir con `enriched/imported/empty` SIN romperlos. Migración por feature flag tester-global (ver `docs/governance/rollout-policy.md`).
5. **Followed/app/source**: PROHIBIDO leakeo. Esta escala sólo describe POIs propios. PR-1 curated-only sigue vigente.
6. **Estado personal ≠ salud objetiva** (regla DURA, ya canónica): `visited`/`user_rating` sólo discriminan POI-8/9/10. Nunca degradan a POI-5.

---

## 6. Qué este documento NO hace

- NO modifica `poi.level.*` tokens existentes.
- NO modifica `getPoiCurationLevel`, `getPointVisualState`, `resolvePoiVisualGrammar`, ni el renderer del marker.
- NO introduce migración de datos.
- NO cambia popup, footer, ratings block, hero ni breadcrumb.
- NO cambia visibilidad, sharing, export ni health rings.
- NO bump de versión.

Es **contrato visual de referencia**. Cualquier PR que quiera materializarlo deberá enlazarlo y respetar la sección 5.
