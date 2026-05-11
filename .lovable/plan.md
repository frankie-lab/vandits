## Objetivo

Eliminar el amarillo masivo en España (1176 puntos `stale_name`) atacando la causa raíz: el desajuste entre el cache legacy `locations.country = "España"` y el canónico `admin_areas.name = "Spain"`. Para ello, **localizamos `admin_areas.name` al idioma principal de la app (español)** usando `name_translations->>'es'` como fuente, y limpiamos el placeholder `(sin provincia)`.

Cero cambios en código cliente. Solo migración + repoblado de `geo_health`. La vista `v_locations_resolved` reflejará automáticamente los nombres nuevos.

## Diagnóstico (ya confirmado)

- 1176 puntos `stale_name` están **100% en España, 0 en el resto del mundo**.
- 100% tienen `country = "España"` (cache) ≠ `admin_areas.name = "Spain"` (canónico).
- 77% del desajuste es solo país; 23% suma uniprovinciales con placeholder `"(sin provincia)"`.
- `name_translations` ya contiene la traducción ES para la mayoría de países (`es:"España"`, `en:"Spain"`, …).

## Cambios

### 1. Migración SQL — renombrar admin_areas a idioma de la app

```text
PASO A — Backup defensivo
  Guardar (id, name) → admin_areas_name_backup_2026_05_11 (tabla temporal)
  por si hace falta revertir.

PASO B — Países (depth=1, type=country)
  UPDATE admin_areas
     SET name = name_translations->>'es',
         name_lang = 'es'
   WHERE name_translations ? 'es'
     AND name_translations->>'es' <> ''
     AND name_translations->>'es' <> name;
  → Spain→España, Germany→Alemania, France→Francia, etc.

PASO C — Continentes (depth=0)
  Mismo UPDATE filtrando depth=0.
  → Europe→Europa, Africa→África, etc.

PASO D — Uniprovinciales sin nombre real
  UPDATE admin_areas a
     SET name = p.name
    FROM admin_areas p
   WHERE a.name = '(sin provincia)'
     AND a.parent_id = p.id;
  → "(sin provincia)" hijo de "Comunidad de Madrid" → "Comunidad de Madrid"
  → "(sin provincia)" hijo de "Principado de Asturias" → "Principado de Asturias"
  Quedan 60+ filas con nombre humano, NO duplican el padre porque
  van indexadas por place_type=province (jerarquía distinta).

PASO E — Recalcular geo_health de los puntos afectados
  UPDATE locations
     SET geo_health = _compute_geo_health(
         continent, country, region, zone,
         continent_id, country_id, region_id, zone_id)
   WHERE geo_health IN ('stale_name','broken','partial')
     AND deleted_at IS NULL;
  (Llamar a la función centralizada existente, no recalcular inline.)
```

### 2. Verificación post-migración

Consulta de control que debe devolver ~0:

```text
SELECT geo_health, count(*) FROM locations
WHERE country_code='ES' AND deleted_at IS NULL
GROUP BY 1;
```

Esperado: `ok` ~1290, `stale_name` ~0, `partial` y `broken` sin cambios.

Visualmente en el mapa: desaparece la marea amarilla en España manteniendo intactos verdes/grises/naranjas y los amarillos que sí indiquen `broken` real.

### 3. Documentación

- Actualizar `mem://database/canonical-admin-areas` con la política: **`admin_areas.name` = nombre primario en idioma de la app (es); traducciones en `name_translations`. El cache legacy `locations.country/region/zone` queda alineado por construcción**.
- Actualizar `mem://style/map/health-rings-rule` reflejando que tras esta migración `stale_name` queda como categoría residual solo para puntos importados con strings exóticos.

## Fuera de scope

- No tocar el helper cliente `point-health-rings.ts` (la regla actual sigue siendo correcta una vez `geo_health` recalculado).
- No refrescar `locations.country/region/zone` (siguen siendo cache deprecado; la regla Core "Vista única" sigue intacta).
- No modificar la función `_compute_geo_health` — su lógica es correcta; solo cambian los datos canónicos contra los que compara.
- No tocar `name_translations` (sigue siendo la fuente para internacionalización futura).

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Algún `admin_areas` no tiene `name_translations->>'es'` | UPDATE filtra `WHERE name_translations ? 'es'`; los que no tengan se quedan con su nombre actual. |
| `_compute_geo_health` falla para alguna fila | Filtramos `WHERE geo_health IN ('stale_name','broken','partial')`; las `ok` no se tocan. |
| Vista `v_locations_resolved` queda desincronizada | Es una vista, no materializada — refleja cambios al instante. |
| Algún componente UI lee `admin_areas.name` y espera inglés | Auditoría rápida: la app es 100% en español, no hay punto donde se asuma inglés. |

## Plan de implementación

1. Crear tabla backup `admin_areas_name_backup_2026_05_11`.
2. Ejecutar UPDATE de países (depth=1).
3. Ejecutar UPDATE de continentes (depth=0).
4. Ejecutar UPDATE de uniprovinciales `(sin provincia)`.
5. Recomputar `geo_health` para filas afectadas.
6. Ejecutar consulta de verificación.
7. Actualizar memorias.

Tiempo estimado: 1 migración SQL en una sola tanda. Sin cambios de código.
