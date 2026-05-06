## Diagnóstico — por qué la jerarquía es "anárquica"

La causa no es el árbol Geo ni el resolver de `admin_areas`, sino **cómo `batch-geocode/index.ts` traduce la respuesta de Nominatim a nuestros 7 niveles canónicos**. Hoy hace esto (líneas 117-129):

```ts
admin_nivel_1 = address.state || address.region || address.province
admin_nivel_2 = address.county || address.state_district || address.district
admin_nivel_3 = address.municipality || address.city_district || address.borough || address.suburb
localidad     = address.city || address.town || address.village || address.hamlet
sublocalidad  = address.neighbourhood || address.quarter || address.suburb
```

Problemas reales que ves en pantalla:

1. **Cada país usa los campos de Nominatim de forma distinta.** En España `state` = comunidad autónoma y `county` = provincia. En Francia `state` = región y `county` = departamento. En UK no hay `state`, hay `state_district`. En USA `state` es estado y `county` es condado. Aplicar el mismo OR a ciegas mete a veces la provincia en `region`, otras veces deja `region` vacío y empuja la provincia a `zone`, etc.
2. **No hay relleno de huecos.** Si Nominatim no devuelve `county` para un punto en Cataluña pero sí `municipality` y `neighbourhood`, guardamos sublocalidad sin provincia ni ciudad → en el árbol aparece un barrio colgando directamente de la comunidad.
3. `**suburb` se usa dos veces** (en `admin_nivel_3` y en `sublocalidad`), lo que duplica/desplaza niveles según el orden de evaluación.
4. `**resolve-admin-area**` explícitamente "permite saltos" (líneas 50-53): si falta un nivel intermedio, los siguientes cuelgan del último conocido. Eso es lo que produce "barrio dentro de comunidad sin provincia".
5. **No se reintenta con menor zoom** cuando faltan niveles administrativos. Nominatim a `zoom=18` a veces devuelve solo calle+barrio; a `zoom=10` devolvería provincia+región; combinándolos tendríamos jerarquía completa.

Resultado: la misma comunidad puede tener unas filas con provincia + ciudad + barrio y otras con solo barrio, según qué devolvió Nominatim para cada punto.

## Objetivo

Que **toda** localización geocodificada produzca la misma estructura para el mismo país: `continente → país → región/comunidad → provincia/estado → comarca/municipio → ciudad → barrio`, rellenando huecos cuando se pueda y dejando `null` (no inventado) cuando no.

## Plan

### 1. Crear normalizador por país — `supabase/functions/_shared/geo-normalizer.ts`

Tabla de mapeo `Nominatim address → 7 niveles canónicos` por `country_code` (devuelto por Nominatim en `address.country_code`). Cubre los casos mayoritarios; resto cae a un mapeo "genérico" documentado.

```text
ES (España):       region=state          zone=county          admin3=municipality   locality=city|town|village  sublocality=suburb|neighbourhood|quarter
FR (Francia):      region=state          zone=county          admin3=municipality   locality=city|town|village  sublocality=suburb|neighbourhood|quarter
IT (Italia):       region=state          zone=county          admin3=municipality   locality=city|town|village  sublocality=suburb|neighbourhood
DE (Alemania):     region=state          zone=county|state_district  admin3=municipality|city_district  locality=city|town|village  sublocality=suburb|borough
GB (Reino Unido):  region=state|state_district  zone=county   admin3=city_district|borough  locality=city|town|village  sublocality=suburb|neighbourhood
US (USA):          region=state          zone=county          admin3=city_district  locality=city|town|village  sublocality=neighbourhood|suburb
PT (Portugal):     region=state|district zone=county|municipality  admin3=parish    locality=city|town|village  sublocality=suburb|neighbourhood
GENÉRICO:          region=state|region|province  zone=county|state_district|district  admin3=municipality|city_district|borough  locality=city|town|village|hamlet  sublocality=neighbourhood|quarter
```

Reglas duras:

- Cada campo de Nominatim aparece en **un único nivel** (eliminamos el doble uso de `suburb`).
- Si dos candidatos coinciden en valor, se mantiene el de mayor jerarquía y el inferior queda vacío.
- `locality` nunca contiene un valor que ya esté en `admin3`.

### 2. Doble llamada a Nominatim cuando falten niveles altos

En `reverseGeocode`:

1. Llamada 1 a `zoom=18` (detalle: barrio, calle, casa).
2. Si tras normalizar faltan `region`, `zone` o `admin3`, segunda llamada a `zoom=10` y se hace **merge**: los niveles bajos vienen de la 1ª, los altos de la 2ª. Esto resuelve el patrón "barrio sin provincia".
3. Coste: +1 req/sec puntual; aceptable porque solo se dispara en huecos.

### 3. Política de huecos en `resolve-admin-area`

Cambiar el comportamiento "permite saltos" por uno determinista:

- Si falta un nivel intermedio entre dos presentes, **se inserta un placeholder** `name = "(sin provincia)"`, `name = "(sin municipio)"`, etc., con `type_id` correcto y `parent_id` correcto. Así el árbol Geo nunca cuelga un barrio directamente de una comunidad: siempre hay padre del nivel adecuado.
- El placeholder se marca con `is_placeholder = true` (nueva columna boolean en `admin_areas`, default false) para poder filtrarlo de pickers de admin pero contarlo en el árbol.
- Migración añade la columna y un índice.

### 4. Re-geocodificar puntos ya importados con el normalizador nuevo

- Añadir parámetro `force_renormalize=true` a `batch-geocode`. Cuando está activo, ignora el filtro `country IS NULL` y procesa también los ya geocodificados.
- Botón en el panel "Geocodificar" del documento ya existe; añadimos toggle "Renormalizar" para reaplicar a puntos viejos sin tener que borrar `country`.
- También aplicable globalmente desde Admin → mantenimiento (UI ya existe para el job único).

### 5. Validación visual

Tras la migración + edge function:

- Abrir el árbol Geo en España: cada comunidad debe tener provincias, cada provincia municipios/comarcas, cada municipio ciudades, cada ciudad barrios. Sin saltos visibles.
- Repetir spot-check en Francia, Italia, UK, USA con 1 punto por país.
- Confirmar que los placeholders aparecen como "(sin provincia)" en italic/gris en el árbol y son filtrables.

## Detalles técnicos

- **Archivos modificados**:
  - `supabase/functions/_shared/geo-normalizer.ts` (nuevo).
  - `supabase/functions/batch-geocode/index.ts` (usa el normalizador, doble llamada Nominatim, soporta `force_renormalize`).
  - `supabase/functions/resolve-admin-area/index.ts` (placeholders en huecos, marca `is_placeholder`).
  - `src/shared/geography/hierarchy.ts` (lectura de `is_placeholder` para etiquetar visualmente; sin cambio de orden).
  - `src/components/filters/GeographyTree.tsx` (estilo italic/gris para placeholders).
  - UI de geocodificación: añadir toggle "Renormalizar" en el panel de documento.
- **Migración**:
  - `ALTER TABLE admin_areas ADD COLUMN is_placeholder boolean NOT NULL DEFAULT false;`
  - Índice parcial: `CREATE INDEX ON admin_areas(parent_id) WHERE is_placeholder = true;`
- **Sin cambios en**:
  - `src/shared/geography/resolve-admin-fks.ts` (sigue siendo el único punto de entrada cliente).
  - `enrich-location`, `scrape-tick` (siguen llamando a `resolve-admin-area`, heredan la política nueva automáticamente).
  - Estructura de `enriched_data.datos_geograficos` (mismos campos, solo más completos).
- **Compatibilidad**: puntos viejos sin renormalizar siguen funcionando porque los campos canónicos son los mismos; solo cambia el contenido si se relanza el job.

## Riesgos y trade-offs

- Nominatim es la única fuente y a veces simplemente no tiene datos administrativos para zonas remotas → el placeholder absorbe ese caso.
- Doble llamada duplica latencia en puntos con huecos altos (no en todos). Mitigado: solo cuando faltan niveles 1-3.
- El placeholder podría "sobrar" si el usuario filtra por provincia y no quiere ver "(sin provincia)". Solución: filtro automáticamente excluye placeholders en pickers de admin, pero los muestra en el árbol Geo para que el usuario sepa que ese punto existe.  
  
  
esta norma debe crecer y aplicarse a cualquier nuevo continente/pais/etc
- &nbsp;