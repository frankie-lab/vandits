## Diagnóstico

Tienes razón: hoy el panel está invertido.

```
[Usuarios] [Árbol/Salud]   [Modo de normalización + Lanzar]
                            └── al final, como si fuera un detalle
```

El "Modo" (Reparar / Rellenar / Reconciliar / Reescribir) es **lo que define qué puntos tiene sentido mirar**:

- **Reparar** → universo = `broken` + `stale_name`
- **Rellenar huecos** → universo = `empty` + `partial`
- **Reconciliar** → universo = todos (pero el foco real es `ok` + `stale_name`)
- **Reescribir todo** → universo = todos

Hoy el árbol y los contadores muestran siempre los 5 estados a la vez, y el modo solo se aplica al final al pulsar "Lanzar". Eso hace que el usuario vea cifras que no corresponden con lo que se va a procesar, y que las pestañas `Vacíos / Rotos / Parciales / Desactualizados / Correctos` compitan visualmente con el modo.

## Propuesta: el modo es el paso 1, no el paso final

Reordenamos el panel como un flujo de 3 pasos en horizontal arriba, y debajo dos columnas (usuario + árbol filtrado):

```
┌─────────────────────────────────────────────────────────────────┐
│ Paso 1 · Modo                                                   │
│ [Reparar] [Rellenar huecos] [Reconciliar] [Reescribir]          │
│   ↳ define qué estados de salud entran en el universo            │
├─────────────────────────────────────────────────────────────────┤
│ Paso 2 · Alcance                Paso 3 · Lanzar                 │
│ ┌──────────┬──────────────────┐ ┌─────────────────────────────┐ │
│ │ Usuarios │ Árbol del usuario│ │ Resumen del job:            │ │
│ │ (admin)  │ ya filtrado por  │ │  · Modo: Reparar             │ │
│ │          │ el modo          │ │  · Universo: 2 417 puntos    │ │
│ │          │                  │ │  · Selección: 1 240          │ │
│ │          │ Tabs solo con    │ │ [Lanzar]  [Detener]          │ │
│ │          │ los estados      │ │                              │ │
│ │          │ relevantes al    │ │ Progreso del job activo …    │ │
│ │          │ modo             │ │                              │ │
│ └──────────┴──────────────────┘ └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Reglas

1. **El modo filtra el universo.** Cambiar de modo recalcula contadores, pestañas visibles del árbol y selección. No se pueden seleccionar puntos fuera del universo del modo.

2. **Mapa modo → health_filter por defecto** (single source of truth):
   - `repair` → `['broken', 'stale_name']`
   - `fill` → `['empty', 'partial']`
   - `reconcile` → `['ok', 'stale_name', 'partial', 'broken']` (excluye `empty`)
   - `overwrite` → `['empty', 'partial', 'broken', 'stale_name', 'ok']`

3. **Pestañas dinámicas.** El árbol solo muestra las pestañas de estado que pertenecen al modo. En `repair` no aparecen `Vacíos / Correctos`. La pestaña activa por defecto es la primera del filtro.

4. **Contadores coherentes.** El número junto al nombre del usuario, los badges del árbol y "Universo del job" usan **el mismo `admin_user_geo_summary` filtrado por `health_filter` del modo**. Nunca verás "2 417 rotos" arriba y "1 000" en otro sitio: es el mismo cálculo.

5. **Selección persistente al cambiar de modo.** Si el usuario tenía IDs marcados que ya no entran en el nuevo universo, se descartan con un aviso ("120 puntos quedaron fuera del modo Reparar"). No se pierde silenciosamente.

6. **Lanzar** envía al job el `scope` con `mode`, `user_id`, `health_filter` (derivado del modo, ajustable solo si el usuario marca pestañas concretas) y `node_path` / `explicit_ids` si los hay. Sin materializar listas en cliente.

## Cambios concretos

- `GeographyBackfillPanel.tsx`: pasar de 2-3 columnas a layout `Stepper arriba + 2 columnas debajo`. Mover el bloque "Modo de normalización" a la cabecera.
- Nuevo helper `modeToHealthFilter(mode)` en el mismo archivo (o en `geocoding-job-store.ts`) como única fuente de verdad.
- `summary` y `tree` se llaman pasándoles el `health_filter` derivado del modo (las RPCs ya lo aceptan).
- `AdminBrokenUsersList`: pasa a llamarse de hecho "Usuarios" y la columna "rotos" muestra el contador del modo activo (no siempre `broken`). Renombrar `unhealthy_count` para que quede claro que depende del modo.
- Resumen del job (columna derecha) siempre visible con: modo, universo, selección, ETA, botón Lanzar/Detener y progreso.

## Lo que NO cambia

- Las RPCs (`admin_user_geo_summary`, `_tree`, `_locations`, `_scope_ids`) ya aceptan `health_filter`. No hay migración nueva.
- El job (`geocoding_jobs`, `backfill-admin-fks`, `geocoding-job-tick`) ya recibe `scope.health_filter`. No cambia.
- La lógica de salud (`v_location_geo_health`, 5 estados) se mantiene tal cual.

Solo es un **reordenamiento de UI + un mapeo modo→filtro coherente**, que ya es el cuello de botella que mencionas.
