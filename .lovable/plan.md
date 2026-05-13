
# PR-SOCIAL-1 — Panel de seguidos: stats sharing-aware + claridad de fila

Versión contenida. Cache + realtime se difieren a PR-SOCIAL-2.

## Diagnóstico (referencia)

Panel actual `src/components/UsersSidebar.tsx` muestra 4 métricas con iconos engañosos y data flow caro:

| Icono actual | Significa hoy | Problema |
|---|---|---|
| `MapPin` | `public_locations_count` (RPC) | NO refleja curated-only; ignora `followers` |
| `Users` | seguidores | OK |
| `Heart` | siguiendo | Icono sugiere "favoritos" — engañoso |
| `Link2` | `commonPointsCount` (cliente, escaneo full-table) | Caro, ambiguo, no ayuda a decidir |

Mute por usuario YA existe vía `useLayerVisibility.toggleUserVisibility` con persistencia en `localStorage.vandits_hidden_followed_users`. Pipeline ya lo respeta. Falta visibilidad en UI.

## Cambios PR-SOCIAL-1

### 1. RPC `get_followed_user_stats` (privacy-aware)

Nueva función SQL `STABLE SECURITY DEFINER`. Devuelve por user_id, **solo para perfiles con relación follow aceptada en cualquier dirección + el propio**:

| Campo | Definición |
|---|---|
| `user_id` | uuid |
| `shared_pois` | `COUNT(*)` de POIs del owner que pasan `isShareablePoi` server-side |
| `total_pois` | `COUNT(*)` de POIs del owner no borrados — **solo si caller==owner OR follow mutuo OR caller es admin/master**; en otro caso `NULL` |
| `last_contribution_at` | `MAX(created_at)` sobre POIs no borrados, mismas reglas de privacidad que `total_pois` |
| `contributions_7d` | `COUNT(*)` últimos 7 días con misma regla de privacidad |
| `followers_count` | igual que hoy |
| `following_count` | igual que hoy |

**Definición server-side de `shared_pois`** (replica `isShareablePoi` del frontend):

```sql
WHERE l.deleted_at IS NULL
  AND l.visibility IN ('public', 'followers')
  AND COALESCE(l.enriched_data->>'descripcion', '') <> ''
  AND l.geo_health = 'ok'
  AND l.owner_user_id = u.id
```

Comentario cruzado obligatorio en `src/domains/sharing/lib/is-shareable-poi.ts` y en la migración SQL: cualquier evolución de la regla debe sincronizarse en ambos lados.

**Privacidad `total_pois`**: alineada con la decisión de producto sugerida. Mutual = ambos sentidos `accepted` en `follows`. Admin/master vía `_is_admin_or_master(auth.uid())`. Si `NULL`, frontend muestra solo `shared_pois`.

Implementación: una query con CTE (`shared`, `total`, `last`, `recent`, `followers`, `following`) joinada al universo de `profiles` que el caller puede ver.

### 2. Frontend — fila rediseñada

`src/components/UsersSidebar.tsx`. Sustituir el bloque de 4 métricas por:

```text
┌──────────────────────────────────────────────┐
│ [👁/👁‍🗨] [Avatar] Sandbox Agent      [Filter] │
│         12 compartidos · 76 totales          │
│         · hace 2h · +14 (7d)                 │
│         Sigues  ·  Te sigue                  │
└──────────────────────────────────────────────┘
```

Reglas de render:

- **Toggle mute** (`Eye` / `EyeOff`) elevado a la izquierda del avatar. Estados: visible (tinta `primary`) ↔ muted (`opacity-50`). Tooltip: "Ocultar sus puntos del mapa (no afecta el follow)".
- **Compartidos / totales**: `12 compartidos` siempre; `· N totales` solo si la RPC devolvió `total_pois ≠ null`. Tooltip detalla: "12 visibles para ti · 76 totales en su catálogo (privados o sin curar)".
- **Actividad**: `· hace 2h` (`formatDistanceToNow`) si `last_contribution_at`. `· +N (7d)` solo si `contributions_7d > 0`.
- **Relación social** como chips compactos `Sigues` y/o `Te sigue` en lugar de números crípticos de following/followers.
- **"Ver solo sus puntos"**: botón `Filter` explícito a la derecha. Reusa `handleFilterByUser` existente. El click sobre avatar/nombre **deja** de filtrar (causa más fricción de la que aporta) y pasa a abrir perfil en futuras iteraciones — por ahora simplemente no dispara filtro.

Eliminado:
- `commonPointsCount` y todo su escaneo (`allLocations`/`allDocs` en `fetchUsers`). Ahorro: dos selects full-table por apertura.
- Icono `Heart` con número de "siguiendo" en la fila.
- Métrica "100% sano" (sería tautología sobre shared_pois — no aporta).

### 3. Header / footer del panel

- Header subtítulo cambia a `N seguidos · M te siguen`.
- Footer "Siguiendo" se mantiene (ya útil).
- Mini glosario tooltip en el header (icono `HelpCircle`) con:
  ```
  12 compartidos → POIs suyos visibles para ti (curados)
  76 totales → tamaño total de su catálogo (si es público)
  hace 2h → último POI añadido
  +14 (7d) → contribuciones últimos 7 días
  Mute → oculta sus puntos del mapa (sigue siguiéndolo)
  ```

### 4. Wiring de `fetchUsers`

- Reemplazar la mezcla `get_public_profile_stats` + escaneos por **una sola** llamada a `get_followed_user_stats`.
- Para perfiles no relacionados (tab "Buscar" futuro), seguir usando `get_public_profile_stats` solo con `followers_count`/`following_count`. En PR-SOCIAL-1 el panel sigue listando todos los perfiles (sin cambios de tabs); las nuevas métricas se renderizan vacías para no-seguidos: `0 compartidos`.

### 5. Naming alineado con curated-only canon

- En tooltips/labels: `Compartidos` / `Totales`. **No** usar `workspace`, `catálogo público`, `followers-only`.
- Bucket en código sigue como `followedShared` (ya migrado).

## Diagrama

```text
DB (RPC)
  get_followed_user_stats(_caller=auth.uid())
   ├── shared_pois        (= isShareablePoi server-side)
   ├── total_pois         (NULL si privacidad lo prohíbe)
   ├── last_contribution_at (mismas reglas)
   ├── contributions_7d   (mismas reglas)
   ├── followers_count
   └── following_count
        │
        ▼
 fetchUsers (sin cache, sin realtime — fetch en open)
        │
        ▼
 UsersSidebar row
   [👁 mute] [Avatar] Nombre              [Filter focus]
   12 compartidos · 76 totales
   hace 2h · +14 (7d)
   Sigues · Te sigue
```

## Archivos tocados

- `supabase/migrations/<ts>_get_followed_user_stats.sql` (nueva)
- `src/components/UsersSidebar.tsx` (rediseño de fila + uso nueva RPC + drop commonPoints)
- `src/domains/sharing/lib/is-shareable-poi.ts` (comentario cruzado a la SQL — no cambia lógica)
- Memoria nueva `mem://ui/social/users-sidebar-spec` con contrato fila-a-fila + privacidad de `total_pois`

## Diferido a PR-SOCIAL-2

- Store singleton `followed-stats-store` con TTL.
- Realtime postgres_changes filtrado por owners seguidos.
- Tabs `Sigues` / `Te sigue` / `Buscar más` con default `Sigues`.
- "Solo en búsqueda" como tercer estado de mute.

## Riesgos & mitigaciones

- **Sincronía SQL ↔ TS de `isShareablePoi`**: comentarios cruzados + futuro test PR-1 que cuente ambos lados sobre la matriz seedeada.
- **Coste de la RPC** sin cache: una sola query con índices `(owner_user_id, deleted_at, geo_health, visibility)` ya existentes; un fetch al abrir el panel. Aceptable.
- **Privacidad `total_pois`**: ocultar por defecto a no-mutuos; la decisión de producto puede revisarse sin tocar RPC (ya devuelve NULL controlado).

## Orden de ejecución

1. Migración: `get_followed_user_stats`.
2. Edit `UsersSidebar.tsx` (RPC + fila + drop commonPoints).
3. Comentario cruzado en `is-shareable-poi.ts`.
4. Memoria `mem://ui/social/users-sidebar-spec`.
5. Verificar manualmente con la matriz PR-1 ya seedeada (Sandbox 5+2 shared, Beta 0 shared, Alpha 5 shared).

