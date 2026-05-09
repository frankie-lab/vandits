# Reproceso geográfico — rediseño de raíz

## El problema, visto entero

Hoy el panel "Geografía universal" mezcla tres cosas que no encajan:

1. **Detección incompleta de qué reprocesar.**
   `admin_users_with_broken_geo_chain` y `admin_broken_locations_for_user` solo detectan **4 reglas estructurales** (region.parent ≠ country, zone.parent ≠ region, country.parent ≠ continent, country_code ≠ iso). Un punto con `country='Italy'` rellenado a mano y FKs nulos, o con `country_id` apuntando al admin_area equivocado pero coherente con su region_id basura, **se da por OK aunque sea falso**.

2. **El árbol del centro solo muestra "rotos".**
   Si quiero reprocesar todos los puntos de Frankie (o un subconjunto sospechoso), no tengo cómo: el árbol está cableado a la lista de rotos. No hay forma de seleccionar "todo Italia", "todo lo sin FKs" ni "todo".

3. **Contadores que no cuadran.**
   - "2417 rotos" viene de un `COUNT(*)` server-side correcto.
   - El árbol cuenta filas materializadas en cliente.
   - El job cuenta `total_in_scope` con su propia query.
   Tres fuentes distintas que pueden divergir cuando lanzas un explícito vs. un "todos". Con 4k puntos ya falla, con 50k es insostenible.

Conclusión: lo que está mal no es el botón ni la paginación — es **el modelo de datos del panel**. No hay un *único* concepto de "estado de salud geo de un punto" del que cuelguen el árbol, los contadores y el job.

---

## Propuesta — un solo modelo, tres consumidores

### 1. Estado de salud geo (definido en SQL, una sola vez)

Vista materializable `v_location_geo_health` (o función SQL inline) que, **para cada punto vivo de cada usuario**, devuelve un único `health` enum:

| Estado | Definición (server-side, sin OSM) |
|---|---|
| `empty` | Sin lat/lng, o sin ningún FK administrativo (`country_id` y `region_id` y `continent_id` todos nulos). |
| `partial` | Tiene strings (`country/region/zone`) pero **al menos un FK correspondiente está nulo** → hay nombre sin resolver al catálogo. *Antes pasaba por "OK" silenciosamente.* |
| `broken` | Cualquiera de las 4 reglas estructurales actuales: parent mismatch o country_code ≠ iso. |
| `stale_name` | El string `country/region/zone` **no coincide** con `admin_areas.name` del FK al que apunta (tras normalizar mayúsculas/aliases). Detecta los puntos rellenados a mano que ya no cuadran. |
| `ok` | Pasa todas las anteriores. *No garantiza que sea correcto contra OSM, solo contra el catálogo canónico.* |

`stale_name` y `partial` son **los estados que hoy no existían** y por eso "todo parecía OK aunque no lo fuera".

### 2. Una sola RPC de resumen

```
admin_user_geo_summary(_user_id)
  → { total, empty, partial, broken, stale_name, ok }
```

Y una sola RPC de árbol agregado:

```
admin_user_geo_tree(_user_id, _health_filter text[])
  → filas (continent, country, region, zone,
           total, empty, partial, broken, stale_name, ok)
```

Devuelve **agregados por nodo geográfico**, no filas individuales. Con 50k puntos la respuesta sigue siendo de cientos de filas, no decenas de miles. El árbol pinta cada nodo con badges por estado.

Una tercera RPC paginada solo para cuando el usuario expande un nodo hoja:

```
admin_user_geo_locations(_user_id, _node_path uuid[], _health_filter text[],
                         _limit, _offset)
```

### 3. UI del panel — tres columnas, una verdad

```text
┌────────────┬─────────────────────────────┬──────────────┐
│ Usuarios   │ Estado · Frankie GMZ        │ Acciones     │
│ (lista)    │                             │              │
│            │ [Tabs estado]               │ Cobertura    │
│ Frankie    │ Todos 4747                  │              │
│   2417 mal │ Vacíos 12                   │ Modo         │
│            │ Parciales 1820              │              │
│ Sandbox    │ Rotos 2417                  │ Lanzar sobre │
│   131 mal  │ Stale 568                   │ selección    │
│            │ OK 2327                     │  o sobre tab │
│            │                             │  activa      │
│            │ ─── árbol del tab ───       │              │
│            │ Europa 2122 [parc·rot·st]   │              │
│            │  Italia 516                 │              │
│            │   Toscana 80                │              │
│            └─────────────────────────────┘              │
└────────────┴─────────────────────────────┴──────────────┘
```

- **Tabs de estado** en cabecera del panel central: `Todos / Vacíos / Parciales / Rotos / Stale / OK`. Cada tab muestra su contador (todos vienen de la misma RPC summary, así que **nunca pueden discrepar**).
- El **árbol cuelga del tab activo** y suma el filtro: Tab "Rotos" + nodo "Italia" = solo rotos en Italia.
- **Selección**: las casillas del árbol seleccionan POIs. Hay un botón "Seleccionar todo lo del tab" que mete en la selección los IDs del filtro actual sin tener que materializarlos en cliente (el job recibe `{ user_id, health_filter: ['broken','stale_name'], node_path?: uuid[] }` y resuelve IDs server-side). **Nunca traemos 50k filas al navegador para contar.**

### 4. El job recibe un *scope*, no una lista

`geocoding_jobs.scope` ya existe como `jsonb`. Pasamos a usarlo de verdad:

```json
{
  "user_id": "…",
  "health_filter": ["broken", "stale_name", "partial"],
  "node_path": ["…uuid del país…"],
  "explicit_ids": null
}
```

`backfill-admin-fks` lee el scope, calcula el `total_in_scope` con la **misma query** que la RPC summary y **el mismo definicion de salud**. Resultado: el contador del job, el contador del tab y el contador del árbol son siempre el mismo número.

`explicit_ids` solo se usa cuando el usuario marca casillas individuales.

### 5. Mientras corre, el job actualiza el estado in-place

Cada batch que `backfill-admin-fks` procesa recalcula el `health` del punto (porque ya escribió FKs nuevos). Realtime de `geocoding_jobs` ya está conectado; añadimos un evento `geo-health-changed` para que el panel **refresque solo los contadores** vía la RPC summary cada N segundos, sin recargar el árbol.

---

## Qué se conserva sin tocar

- `admin_users_with_broken_geo_chain` (la lista izquierda) — sigue siendo válida; solo cambiamos su definición de "broken_count" para incluir también `partial` y `stale_name` y la columna pasa a llamarse `unhealthy_count`.
- `geocoding-job-tick` y `backfill-admin-fks` — el motor de procesado no cambia, solo cómo se calcula el universo.
- `v_geo_coverage` — sigue alimentando la columna derecha de "Cobertura geográfica".
- Modos `fill / reconcile / overwrite / repair` — siguen existiendo. `repair` pasa a operar sobre `health_filter ∋ {broken, partial, stale_name}` por defecto.

## Detalles técnicos

**Migración SQL**:
- Nueva función `public.location_geo_health(loc public.locations, c admin_areas, r admin_areas, z admin_areas) returns text` que centraliza las 5 reglas y se reutiliza desde todas las RPCs.
- Nuevas RPCs: `admin_user_geo_summary`, `admin_user_geo_tree`, `admin_user_geo_locations` (paginada).
- Renombrar `broken_count → unhealthy_count` en `admin_users_with_broken_geo_chain` y ampliar su WHERE para usar `location_geo_health(...) <> 'ok'`.
- Índices funcionales sobre `(owner_user_id, country_id, region_id)` ya cubren la mayoría; añadir uno parcial en puntos con FKs incompletos si EXPLAIN lo pide.

**Cliente** (`GeographyBackfillPanel.tsx`):
- Sustituir el estado `brokenLocations: GeoLocation[]` (que materializa filas) por `summary: { total, empty, partial, broken, stale_name, ok }` y `tree: AggregateNode[]`.
- Añadir `activeHealthTab: 'all' | 'empty' | 'partial' | 'broken' | 'stale_name' | 'ok'`.
- `handleStart` envía `scope: { user_id, health_filter, node_path, explicit_ids }` al store del job; **deja de calcular totales en cliente**.
- `loadBroken` se borra. En su lugar: `loadSummary(userId)` y `loadTree(userId, healthFilter, expandedNodePath?)`.
- El componente `GeographyScopeTree` pasa de pintar locations a pintar el árbol agregado; selección por nodo (no por id, salvo en hojas expandidas).

**Contadores**:
- La etiqueta "2417 rotos" desaparece. Pasa a ser "**Frankie GMZ — 2420 a revisar** (12 vacíos · 1820 parciales · 2417 rotos · 568 stale)" — todos del mismo objeto summary.
- La columna izquierda muestra el mismo `unhealthy_count` que verás al entrar.
- El job, al lanzarse, muestra `total_in_scope = scope_count(scope)` que llama al mismo helper SQL.

## Migración suave

1. Migración SQL con las funciones nuevas (no rompe nada existente).
2. Refactor del panel a las RPC nuevas.
3. Borrar `admin_broken_locations_for_user` (queda obsoleta) en una migración posterior.

## Resultado

- **Nunca más** un punto con campos rellenos pero contenido inconsistente pasa por OK.
- **Una sola fuente** para todo contador del panel; con 50k+ puntos los números siguen cuadrando porque ningún componente materializa el universo.
- **Selección flexible**: tab + nodo del árbol + casillas individuales, todo combinable.
- **Lanzamiento "todo"**: marcar tab "Todos" y pulsar "Lanzar" reprocesa los 4747, sin tener que traerlos al navegador.
