
## Objetivo

Reestructurar el panel "Recuperar imágenes faltantes" (y su edge function) para separar claramente **Universo total** del **Subconjunto operativo actual**, e introducir **3 modos de operación** con queries base distintas.

---

## 1. Modelo conceptual nuevo

```
[UNIVERSO TOTAL]
Total POIs
├─ Enriquecidos
│   ├─ Con foto (cualquier fuente: enriched.imagen, user_image_url, location_photos)
│   └─ Sin foto
└─ No enriquecidos

         ↓ se elige modo

[UNIVERSO BASE DEL MODO]
 (•) missing   → enriquecidos sin foto
 ( ) refresh   → TODOS los enriquecidos
 ( ) full      → TODOS los POIs

         ↓ se aplican filtros

[SUBCONJUNTO OPERATIVO]
 Filtros: usuario · continente · país · zona · (fuente · fecha en avanzadas)
 → N POIs reales que se procesarán
```

El panel debe mostrar SIEMPRE estos 3 niveles de forma visualmente jerárquica y separada.

---

## 2. Cambios de base de datos

### 2.1 Nueva RPC `admin_image_recovery_breakdown_v2`
Devuelve los conteos del universo total (sin filtros, una sola fila):
- `total`, `enriched`, `not_enriched`
- `enriched_with_image`, `enriched_without_image`
- `image_from_enriched`, `image_from_user_url`, `image_from_photos_table`
- `attempted_recent`, `pending_missing`

(Renombrado conceptual sobre la actual `admin_image_recovery_breakdown` para claridad; mantenemos la antigua hasta retirar consumidores.)

### 2.2 Nueva RPC `admin_image_recovery_scope(_mode, _user_id?, _continent?, _country?, _zone?, _force, _retry_stale_days)`
Devuelve `(scope_count bigint)` — el subconjunto operativo según modo + filtros.

`_mode` ∈ `('missing','refresh','full')`:
- `missing` → predicado actual `_image_recovery_candidate_predicate`
- `refresh` → `enriched_data IS NOT NULL` (ignora si tiene o no foto, ignora cooldown salvo `_force=false` y `_retry_stale_days`)
- `full` → `deleted_at IS NULL` (todos)

Filtros adicionales aplicados a cualquier modo (todos opcionales):
- `owner_user_id = _user_id`
- `continent ILIKE _continent` (o `continent_id` si llega uuid; mejor por nombre, alineado con `v_location_geo_health`)
- `country`, `zone` análogos

### 2.3 Refactor `admin_image_recovery_locations` → aceptar `_mode` y filtros geo
Misma firma extendida con `_mode text default 'missing'`, `_continent`, `_country`, `_zone`. La paginación devuelve los IDs/POIs del subconjunto operativo (lo que la edge function va a procesar).

### 2.4 `admin_image_recovery_users` → aceptar `_mode`
Para que la lista de usuarios y sus contadores cambie según el modo elegido (en `refresh` un usuario muestra "todos sus enriquecidos", en `full` "todos sus POIs").

---

## 3. Cambios edge function

`supabase/functions/recover-missing-images/index.ts`:

- Aceptar nuevo parámetro `mode: 'missing' | 'refresh' | 'full'` (default `'missing'` por compatibilidad).
- Aceptar filtros geo opcionales: `continent`, `country`, `zone`.
- Construir el SELECT base según `mode`:
  - `missing`: query actual (sin foto en ninguna fuente + cooldown)
  - `refresh`: `enriched_data IS NOT NULL` (sin filtrar por foto). Cooldown opcional.
  - `full`: sin filtro de enriquecimiento ni foto.
- Aplicar filtros geo si llegan.
- Mantener dry-run y batching como hoy.
- Etiquetar el job/lane con el modo para que la barra inferior muestre "Refrescar imágenes" vs "Recuperar faltantes" vs "Reprocesar todos".

---

## 4. UI — `RecoverImagesPanel.tsx`

Reorganizar en 4 bloques visualmente separados:

### Bloque 1 · Universo total (siempre visible, neutro)
Pirámide compacta con tooltips:
```
Total POIs              5 443
├─ Enriquecidos         5 443
│  ├─ Con foto          1 995  (enriched 423 · user 1 559 · galería 13)
│  └─ Sin foto          3 448
└─ No enriquecidos          0
```

### Bloque 2 · Tipo de operación (radio cards, 3 opciones)
- **Recuperar faltantes** — universo base = enriquecidos sin foto (`3 448`)
- **Refrescar imágenes existentes** — universo base = todos los enriquecidos (`5 443`)
- **Reprocesar universo completo** — universo base = todos los POIs (`5 443`)

Cada tarjeta muestra el contador del universo base correspondiente y una descripción corta del objetivo (rellenar huecos / mejorar atribución / reprocesar todo).

### Bloque 3 · Filtros (sobre el universo base)
- Usuario (lista actual, columna izquierda) — contador refleja modo activo
- Continente / País / Zona (selects encadenados, datos de `v_location_geo_health` o de los POIs ya cargados)
- Avanzadas (cooldown, lote, dry-run, fuentes) — colapsable como ya está

### Bloque 4 · Resultado y lanzar
Card con el resumen final estilo:
```
Universo base   Todos los enriquecidos    5 443
Filtros         Frankie · Kenia              -75
─────────────────────────────────────────────
Subconjunto operativo                        75
```
Botón principal: `Dry-run sobre subconjunto (75)` / `Procesar subconjunto (75)`. La etiqueta del botón cambia con el modo.

### Store
Añadir al store local:
- `mode: 'missing' | 'refresh' | 'full'`
- `geoFilter: { continent?, country?, zone? }`
- Recalcular `scopeCount` vía la nueva RPC `admin_image_recovery_scope` con debounce cada vez que cambia modo, usuario o filtros geo.

---

## 5. Archivos afectados

- **Nueva migración**: 
  - `admin_image_recovery_breakdown_v2`
  - `admin_image_recovery_scope`
  - extender `admin_image_recovery_locations` y `admin_image_recovery_users` con `_mode` + filtros geo
- **Edge function**: `supabase/functions/recover-missing-images/index.ts` (parámetro `mode` + filtros + queries base)
- **UI**: `src/components/admin/RecoverImagesPanel.tsx` (reorg en 4 bloques + selects geo + nuevo store interno)
- **Tipos**: `src/integrations/supabase/types.ts` se regenera tras migración

Sin cambios en RLS, BottomProgressBar (solo se le pasa un `label` distinto según modo), ni en otros paneles.

---

## 6. Compatibilidad

- La RPC y edge function antiguas siguen vivas durante la migración.
- Default `mode='missing'` mantiene el comportamiento actual si algún consumidor no pasa el parámetro.

¿Apruebas el plan?
