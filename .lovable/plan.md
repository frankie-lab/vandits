## Bug: el predicado de "sin imagen" ignora fotos del usuario

El predicado SQL `_image_recovery_candidate_predicate` solo considera dos campos dentro de `enriched_data`:

- `enriched_data.imagen`
- `enriched_data.media.cover_url` (campo muerto: 0 registros lo usan)

Pero en el sistema real una foto puede venir de **3 fuentes**:

| Fuente | Dónde vive | POIs con foto (BD actual) |
|---|---|---|
| IA / scraping | `enriched_data.imagen` | 423 |
| Foto subida por el user | `locations.user_image_url` | (mayoría del delta) |
| Galería OneDrive / upload | tabla `location_photos` | 13 |
| **Total con foto (cualquier fuente)** | | **1995** |

Como el predicado no mira `user_image_url` ni `location_photos`, **1572 POIs que ya tienen foto se están contando como candidatos**. Por eso ves "5020" inflado.

Candidato real correcto: `5443 enriquecidos − 1995 con foto = 3448`.

## Plan: arreglar el predicado + visibilizar el desglose

### 1. Migración: predicado correcto

Reescribir `_image_recovery_candidate_predicate` para que reciba la fila completa (no solo `enriched_data`) y considere las 3 fuentes:

```sql
create or replace function public._image_recovery_candidate_predicate(
  _loc public.locations,
  _force boolean,
  _retry_stale_days integer
) returns boolean
language sql stable
as $$
  select
    _loc.deleted_at is null
    and _loc.enriched_data is not null
    -- sin imagen en NINGUNA de las 3 fuentes:
    and coalesce(nullif(_loc.enriched_data->>'imagen',''), null) is null
    and coalesce(nullif(_loc.user_image_url,''), null) is null
    and not exists (
      select 1 from public.location_photos lp where lp.location_id = _loc.id
    )
    -- cooldown:
    and (
      _force
      or coalesce(nullif(_loc.enriched_data->'media'->>'image_recovery_attempted_at',''), null) is null
      or (_loc.enriched_data->'media'->>'image_recovery_attempted_at')::timestamptz
         < (now() - make_interval(days => greatest(_retry_stale_days, 0)))
    );
$$;
```

Actualizar `admin_image_recovery_users` y `admin_image_recovery_locations` para llamar al predicado con la fila completa (`l.*` en vez de `l.enriched_data`).

Mantener firma antigua del predicado deprecada o eliminarla en la misma migración (no la usa nadie más; lo verifico antes de migrar).

### 2. Edge function `recover-missing-images`

Aplicar el mismo filtro al cargar candidatos:
- En el SELECT, `LEFT JOIN location_photos` y excluir `user_image_url IS NOT NULL`.
- Antes de procesar cada POI, doble-check (defensa en profundidad) por si la foto se subió mientras el job estaba en cola.

### 3. UI: tarjeta "Universo del panel" arriba de los modos

Reemplazar el "5020" sin contexto por una pirámide clara:

```
Universo del panel
─────────────────────────────────────
Total POIs activos              5443
  Enriquecidos                  5443
    Con foto (cualquier fuente) 1995
      · IA/scraping                423
      · Subida por el usuario    1559
      · Galería (OneDrive)         13
    Sin foto                    3448  ← candidatos
  No enriquecidos                  0  (no aplican)
```

Cada cifra con `AppTooltip` explicando el predicado en lenguaje claro. Se actualiza con una nueva RPC `admin_image_recovery_breakdown(_retry_stale_days int)` que devuelve todo en una sola fila (más barata que las dos llamadas actuales a `admin_image_recovery_users`).

### 4. Cards de modo

Subtítulos revisados sobre el subconjunto correcto:

- **Pendientes (recomendado)** · `3448 POIs` · `"Nunca intentados o último intento > 30d"`
- **Reintentar todos** · `3448 POIs` · `"Incluye los ya intentados en cooldown (hoy: 0)"`

Cuando empiecen a haber intentos, las cifras divergirán naturalmente.

### Archivos afectados

- **Migración**: nuevo `_image_recovery_candidate_predicate(locations, boolean, int)`, nueva RPC `admin_image_recovery_breakdown`, actualización de `admin_image_recovery_users` y `admin_image_recovery_locations`.
- **Edge function** `supabase/functions/recover-missing-images/index.ts`: filtro coherente en el SELECT.
- **Edit** `src/components/admin/RecoverImagesPanel.tsx`: nueva sección "Universo", cards usan la nueva RPC, copy revisado.

### Lo que NO cambia

- Lógica de selección por árbol geográfico.
- Store del job ni `BottomProgressBar`.
- Permisos / RLS.
