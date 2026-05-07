# Catálogo canónico de regiones (ISO-3166-2)

Mismo problema que con países, ahora a nivel de **región** (CCAA, états, Bundesländer, etc.) y de **provincias** mal clasificadas como regiones.

## Diagnóstico verificado en BD

- **España**: 17 CCAA reales repartidas en 49 filas distintas. Ej.: `Castile and León` (153 pts) + `Castilla y León` (22 pts) = misma región, dos filas.
- **Francia**: 18 regiones repartidas en 60+ filas. Mezcla idiomas (`Brittany`/`Bretagne`/`Bretaña`), variantes tipográficas (`Île-de-France`/`Ile-de-France`), e incluso regiones antiguas pre-2016 (`Aquitaine`, `Languedoc-Roussillon`) que ya no existen oficialmente.
- **Provincias colgando como región**: `Alicante`, `Málaga`, `Cádiz`, `Girona`, `A Coruña`, `La Rioja`, `Hérault` (FR)… deberían ser `zone`, no `region`.

Mismo origen: `resolve-admin-area` no aplica a regiones la lógica canónica `iso_code + aliases` que ya tenemos para países.

## Plan en 3 pasos (cero pérdida de puntos)

### 1. Seed canónico de regiones por código ISO-3166-2

Añadir filas canónicas con `iso_code = "ES-AN"`, `"ES-CT"`, `"FR-IDF"`, etc. y `aliases text[]` con todas las variantes ES/EN/local.

Países a cubrir en la primera tanda (los que tienen >5 puntos en BD):

- **ES**: 17 CCAA (AN, AR, AS, CB, CL, CM, CN, CT, EX, GA, IB, MD, MC, NC, PV, RI, VC) + Ceuta/Melilla.
- **FR**: 13 regiones metropolitanas post-2016 + 5 ultramar.
- **PT**: 7 distritos + 2 archipiélagos.
- **IT**: 20 regiones.
- **DE**: 16 Bundesländer.
- **GB**: 4 nations + 9 regions Inglaterra.
- **US**: 50 estados + DC.

Por cada canónico, `aliases` cubre: nombre oficial local, nombre EN, nombre ES, código ISO, sinónimos comunes y regiones históricas fusionadas (ej. `Aquitaine` → alias de `Nouvelle-Aquitaine`).

### 2. Migración de fusión (helper `_merge_admin_area` ya existe)

Recorrer cada región huérfana (sin `iso_code`) y, si su nombre coincide con un alias canónico bajo el mismo país, llamar a `_merge_admin_area(orphan, canonical)`. Esto:
- Re-puntea `region_id` en todos los locations afectados.
- Re-parenta zonas/localidades hijas (manejando duplicados con merge recursivo).
- Borra la fila huérfana.

Resultado: ~840 puntos en España + ~600 en Francia + similares en otros países se reagrupan bajo la fila canónica correcta. **Cero locations borradas.**

### 3. Endurecer `resolve-admin-area` para regiones

Aplicar a `region` (y por extensión `zone`, `admin_level_3`, `locality`) la misma lógica que ya tiene `country`:

1. Match por `iso_code` (ISO-3166-2 si llega como `"ES-AN"`).
2. Match por `aliases @> [name]` bajo el mismo `parent_id`.
3. Match por `name + parent_id` (legacy).
4. Insert solo como último recurso, con warning en logs si parent canónico ya existe.

Esto evita que el próximo importador KML en EN vuelva a crear `"Catalonia"` cuando ya tenemos `Cataluña` canónica.

## Provincias mal clasificadas

Aparte del seed: las filas tipo `Alicante`, `Málaga`, `Cádiz`, `Hérault`… colgando como `region` se reclasifican a `zone` (cambio de `type_id`) y se re-parentan a la CCAA/región canónica correcta. Los locations se mueven de `region_id` a `zone_id` automáticamente con un script SQL puntual incluido en la migración.

## Archivos a tocar

- `supabase/migrations/<ts>_canonical_regions_iso2.sql` — seed canónico + fusión + reclasificación de provincias.
- `supabase/functions/resolve-admin-area/index.ts` — extender lógica ISO/aliases a niveles `region`, `zone`, `admin_level_3`, `locality`.

Sin cambios de frontend. El trigger `locations_sync_admin_cache` resincroniza los strings cache automáticamente. Memoria `mem://database/canonical-admin-areas` se actualiza para reflejar que la regla es transversal a todos los niveles, no solo país/continente.

## Verificación post-migración

```sql
-- Debe ser 0 (ninguna región huérfana sin iso_code en países cubiertos)
SELECT COUNT(*) FROM admin_areas a
JOIN admin_areas p ON p.id = a.parent_id
WHERE a.type_id = (SELECT id FROM place_types WHERE code='region')
  AND a.iso_code IS NULL
  AND p.iso_code IN ('ES','FR','PT','IT','DE','GB','US');

-- En la captura del usuario: 17 filas (CCAA), no 49
SELECT COUNT(DISTINCT a.id) FROM admin_areas a
JOIN admin_areas p ON p.id = a.parent_id
WHERE a.type_id = (SELECT id FROM place_types WHERE code='region')
  AND p.iso_code = 'ES';
```
