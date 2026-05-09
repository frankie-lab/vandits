## Problema real

No te estoy discutiendo el árbol: tienes razón. El sistema actual **no está usando de verdad la jerarquía canónica completa** que lleváis días definiendo.

### Qué está mal ahora

1. **El estado geo (`empty / broken / partial / stale_name / ok`) está mal definido**.
   La función `public._compute_location_geo_health(...)` solo mira:
   - `continent_id`
   - `country_id`
   - `region_id`
   - `zone_id`
   - y los strings legacy `country / region / zone`

   **Ignora por completo**:
   - `admin3_id`
   - `locality_id`
   - `sublocality_id`

   O sea: un punto puede tener mal media jerarquía profunda y aun así quedar como `ok`.

2. **El árbol visual no es el árbol canónico real**.
   Los RPCs `admin_user_geo_tree`, `admin_user_geo_locations` y `admin_user_geo_scope_ids` agrupan por:
   - `v.continent`
   - `v.country`
   - `v.region`
   - `v.zone`

   Esos son **strings cacheados en `locations`**, no la cadena canónica leída desde `admin_areas` por FK.

   Así que lo que ves en pantalla parece un árbol lógico, pero en realidad es una **proyección legacy**, no el árbol maestro que definisteis.

3. **`Reparar` y `Rellenar` están chequeando demasiado poco**.
   Hoy:
   - `repair` solo detecta desajustes de parentesco entre `country → continent`, `region → country`, `zone → region`, y un mismatch de `country_code`.
   - `fill` solo detecta strings con FK nulo en `country / region / zone`.

   No detecta bien cosas como:
   - `country_id` presente pero `continent_id` nulo
   - `admin3/locality/sublocality` vacíos o rotos
   - cadena profunda incoherente
   - nodos colocados en una rama que no coincide con el árbol canónico esperado

4. **`Revisar normalizados` no valida “vuestro árbol”; valida solo “si OSM devuelve los mismos IDs actuales”**.
   En `backfill-admin-fks`, el modo `reconcile` marca “sin cambios” cuando los 7 FKs resueltos por reverse-geocode + `resolve-admin-area` coinciden con los actuales.

   Por tanto, si el punto ya devuelve los mismos IDs, aunque la UI siga mostrando un árbol engañoso o aunque la clasificación de salud sea pobre, el resultado será “sin cambios”.

## Conclusión

El bug de fondo es este:

```text
El árbol de UI y los contadores usan una vista legacy e incompleta,
pero el backfill compara contra FKs canónicos.

Resultado:
- la UI dice una cosa,
- el job decide otra,
- y parece que no pasa nada.
```

No es que el job “no haga nada”. Es que **la definición de universo, árbol y salud está desalineada con el modelo canónico real**.

## Plan de corrección

### 1. Rehacer la clasificación de salud sobre la cadena canónica completa
Actualizar la lógica SQL para que el estado geográfico evalúe los 7 niveles:
- continent
- country
- region
- zone
- admin3
- locality
- sublocality

Y detectar como rotos/parciales casos hoy invisibles:
- FK profundo faltante
- parent_id incoherente en cualquier nivel
- `continent_id` ausente cuando existe `country_id`
- ramas canónicas inconsistentes
- nombres legacy desfasados donde aplique

### 2. Rehacer el árbol del panel para que salga de FKs canónicos, no de strings legacy
Sustituir los RPCs del panel para que agrupen por la cadena real en `admin_areas`.
Eso implica que el árbol de Continente > País > Región > Provincia/Zona > Comarca > Localidad > Sublocalidad sea el que manda.

### 3. Alinear los modos con esa nueva fuente única
Una vez el estado geo sea correcto:
- `Reparar` actuará sobre rotos reales
- `Rellenar` sobre faltantes reales
- `Revisar` sobre todo el universo no vacío real

Así el número que ve el usuario en tarjetas, árbol, selección y progreso será coherente.

### 4. Hacer visible por qué un punto entra en cada bucket
En la UI del resumen y/o detalle de punto, mostrar el motivo:
- falta `continent_id`
- `zone.parent_id` no coincide con `region_id`
- falta `locality_id`
- nombre legacy desactualizado

Sin esta trazabilidad, volverá la misma confusión.

## Detalle técnico

### Backend / DB
- Reemplazar `public._compute_location_geo_health(...)`
- Rehacer `public.v_location_geo_health`
- Reemplazar:
  - `admin_user_geo_summary`
  - `admin_user_geo_tree`
  - `admin_user_geo_locations`
  - `admin_user_geo_scope_ids`
  - y revisar `locations_with_broken_geo_chain` / `count_locations_with_broken_geo_chain`

### Frontend
- Ajustar `GeographyBackfillPanel.tsx` para consumir el árbol canónico nuevo
- Mantener `geocoding-job-store.ts` como consumidor del nuevo universo, sin cambiar la arquitectura del job

## Resultado esperado

Después de esto, cuando selecciones por ejemplo Galicia:
- el árbol representará la jerarquía real definida
- los contadores reflejarán rotos/faltantes reales
- `reparar`, `rellenar` y `revisar` dejarán de parecer arbitrarios
- y “sin cambios” solo saldrá cuando de verdad el punto ya esté bien según el árbol canónico completo