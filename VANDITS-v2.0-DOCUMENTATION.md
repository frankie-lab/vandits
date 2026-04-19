# VANDITS v2.0.0 - Documentación Técnica Completa

**Fecha de consolidación:** 2026-04-19
**Versión documento:** 2.0.0
**Versión app:** 1.1.1
**Stack:** React 18 + TypeScript + Vite 5 + Tailwind CSS v3 + Supabase (Lovable Cloud)

> **Última actualización (2026-04-19, app v1.1.1):** Welcome card adaptativa con dos modos (onboarding / summary), 4 cifras del estado del usuario (Mi catálogo · Total accesible · Seguidos · Seguidores), saludo personalizado con fecha y hora del último acceso, y cierre por click fuera. El conteo del catálogo deja de leerse del store filtrado para evitar falsos onboardings cuando hay filtros activos en el mapa.

---

## Índice

1. [Descripción General](#descripción-general)
2. [Identidad Visual](#identidad-visual)
3. [Arquitectura del Sistema](#arquitectura-del-sistema)
4. [Arquitectura V2 — Modelo de Datos](#arquitectura-v2--modelo-de-datos)
5. [Domain-Driven Design](#domain-driven-design)
6. [Sistema de Preferencias UX (5 Capas)](#sistema-de-preferencias-ux-5-capas)
7. [Estructura de Directorios](#estructura-de-directorios)
8. [Esquema de Base de Datos](#esquema-de-base-de-datos)
9. [Edge Functions](#edge-functions)
10. [Componentes Principales](#componentes-principales)
11. [Hooks Personalizados](#hooks-personalizados)
12. [Librerías Utilitarias](#librerías-utilitarias)
13. [Estado Global (Zustand)](#estado-global-zustand)
14. [Sistema de Autenticación y Permisos](#sistema-de-autenticación-y-permisos)
15. [Funcionalidades Implementadas](#funcionalidades-implementadas)
16. [Motor de Rutas](#motor-de-rutas)
17. [Sistema Social](#sistema-social)
18. [Dependencias](#dependencias)

---

## Descripción General

**VANDITS** es un atlas personal de ubicaciones geográficas con capacidades de enriquecimiento mediante IA, planificación de rutas multimodales y sistema social. Permite importar, gestionar, enriquecer y compartir puntos de interés desde múltiples formatos de archivo.

### Características principales:
- Importación multi-formato (KML, GPX, GeoJSON, CSV) con flujo de 2 pasos (Upload + Review/Confirm)
- Enriquecimiento automático con IA (Google Gemini via Lovable AI Gateway)
- Geocodificación inversa automática
- Arquitectura V2 con separación places/user_places/collections
- Motor de rutas determinístico multimodal (ORS + Duffel + ferries)
- Sistema de preferencias UX con 5 capas y scopes jerárquicos
- Notas personales, fotos y categorías por ubicación
- Sistema social (seguimiento de usuarios con visibilidad granular)
- Panel de administración con roles y permisos
- Exportación a múltiples formatos
- Integración OneDrive para fotos geoetiquetadas
- Dashboard BI personal con estética Cyber-Telemetry HUD

---

## Identidad Visual

### Tipografía
- **Display / Headings:** Space Grotesk (Google Fonts)
- **Body:** DM Sans (Google Fonts)
- Nunca serif. Nunca Inter ni Poppins.

### Paleta de colores (HSL)
| Token | Valor (dark) | Uso |
|-------|-------------|-----|
| `--primary` | `24 75% 50%` | Amber/naranja — acento principal |
| `--background` | `30 10% 7%` | Fondo base oscuro cálido |
| `--card` | `30 8% 11%` | Superficies de tarjetas |
| `--muted` | `30 5% 18%` | Fondos secundarios |
| `--brand-gradient` | `linear-gradient(135deg, hsl(35,85%,55%), hsl(24,80%,48%))` | Gradiente de marca |
| `--ocean-gradient` | `linear-gradient(135deg, hsl(200,80%,55%), hsl(210,70%,45%))` | Acciones de rutas |

### Glassmorphism
- `.glass-panel`: `backdrop-filter: blur(16px); background: hsla(40,20%,100%,0.82)`
- `.glass-elevated`: `blur(20px)` con sombra elevada

### Regla estricta
- **No emojis nunca.** Todo icono es SVG Lucide via `icon-utils.tsx`.
- Los colores en componentes siempre usan tokens semánticos (`bg-primary`, `text-foreground`), nunca valores directos.

---

## Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 18)                        │
├──────────────────────────────────────────────────────────────────┤
│  Pages             │  Domains              │  Shared              │
│  - Index (orquesta)│  - Content            │  - preferences/      │
│  - Auth            │  - Discovery          │  - ui/ (shadcn)      │
│  - Dashboard       │  - Routes             │                      │
│  - Terms           │  - Identity           │                      │
│                    │  - Social             │                      │
│                    │  - Privacy            │                      │
├──────────────────────────────────────────────────────────────────┤
│  Repositories (DB) → Services (logic) → Hooks (React) → UI      │
├──────────────────────────────────────────────────────────────────┤
│                     STATE (Zustand Stores)                        │
│  locations-store.ts │ duplicate-store.ts │ discovery-store.ts     │
├──────────────────────────────────────────────────────────────────┤
│                      SUPABASE CLIENT                              │
│  - Auth       │  - Realtime    │  - Storage    │  - Edge Fns     │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     LOVABLE CLOUD (Supabase)                      │
├──────────────────────────────────────────────────────────────────┤
│  TABLES (30+)                                                     │
│  Legacy: documents, locations, profiles, follows, ...             │
│  V2:     places, user_places, collections, collection_items       │
│  Prefs:  preference_values, app_settings                          │
│  Routes: routes, route_waypoints, route_stops, route_day_stages  │
│  Other:  airports, ferry_routes, transport_modes, ...             │
├──────────────────────────────────────────────────────────────────┤
│  EDGE FUNCTIONS (17)                                              │
│  - enrich-location, batch-enrich, batch-geocode                  │
│  - calculate-route, check-route-services, correct-segment        │
│  - search-flights, find-intermodal-options                       │
│  - semantic-search, druid-search, search-nearby-osm              │
│  - quick-classify, scan-onedrive-geo, browse-onedrive            │
│  - migrate-v2, purge-user, create-test-users                     │
├──────────────────────────────────────────────────────────────────┤
│  STORAGE BUCKETS                                                  │
│  - avatars (public)  │  location-photos (public)                 │
│  - document-originals (private, archivos raw inmutables)          │
├──────────────────────────────────────────────────────────────────┤
│  REALTIME: locations table subscription                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Arquitectura V2 — Modelo de Datos

V2 introduce una separación canónica entre el **lugar** (entidad geográfica universal) y la **relación usuario-lugar** (datos personales).

### Tablas V2

| Tabla | Propósito |
|-------|-----------|
| `places` | Entidad geográfica canónica: nombre, coordenadas, clasificación, enriched_data. Creada por `created_by`. |
| `user_places` | Relación N:M usuario-lugar. Contiene: `visit_status`, `rating`, `is_favorite`, `is_saved`, `is_archived`, `visibility`, `origin`. |
| `collections` | Agrupaciones personales de lugares (nombre, icono, color, visibilidad). |
| `collection_items` | Items dentro de una colección (`item_type`: place, route, document). |
| `place_merge_history` | Registro de fusiones de lugares duplicados. |

### Coexistencia V1/V2

El modelo V2 coexiste con la tabla legacy `locations` mediante feature flags (`use-v2-flags.ts`). Los servicios en `src/services/` y repositorios en `src/repositories/` abstraen el acceso:

```
repositories/ (DB queries)
  → place.repository.ts
  → user-place.repository.ts
  → collection.repository.ts
  → waypoint.repository.ts

services/ (business logic)
  → place.service.ts
  → user-place.service.ts
  → import.service.ts
  → collection.service.ts

domains/v2/ (contracts)
  → types.ts (V2Feature, V2Place, V2UserPlace)
  → marker-grammar.ts (FROZEN visual contracts)
  → visual-grammar.ts (shape/color/decoration rules)
  → marker-validation.ts
```

### Gramática Visual V2 (CONGELADA)

Los contratos de shapes, colores y decoraciones del mapa están **congelados** y no son editables por el usuario:

| Concepto | Regla |
|----------|-------|
| Catálogo (published) | Marcador teardrop, azul cielo (`#87CEEB`) |
| Workspace (draft) | Círculo gris (importado) o naranja (vacío) |
| Enriquecido | Pin teardrop con datos |
| No enriquecido | Círculo pequeño (12-18px) |
| Ownership colors | Definidos por admin en `marker_size_config` |

`resolveIsCatalogMarker()` en LocationMap.tsx es la **única fuente de verdad** para determinar estilo catálogo vs workspace.

---

## Domain-Driven Design

La arquitectura se organiza en dominios independientes con aislamiento estricto de datos:

| Dominio | Ubicación | Responsabilidad |
|---------|-----------|-----------------|
| **Content** | `src/domains/content/` | Importación, parsers, enriquecimiento, documentos, duplicados |
| **Discovery** | `src/domains/discovery/` | Mapa, filtros, galería, búsqueda semántica, capas, paneles flotantes |
| **Routes** | `src/domains/routes/` | Motor de rutas, cálculo, paradas, itinerarios |
| **Identity** | `src/domains/identity/` | Autenticación, permisos, perfil |
| **Social** | `src/domains/social/` | Follows, stats sociales |
| **Privacy** | `src/domains/privacy/` | Configuración de visibilidad |
| **V2** | `src/domains/v2/` | Dual-write, mappers legacy→V2, gramática visual |

### Discovery Domain (extraído)

`DiscoveryOrchestrator.tsx` gestiona toda la UI de descubrimiento:
- Mapa interactivo (`LocationMap`)
- Filtros (`FilterBar`)
- Galería (`GalleryView`)
- Búsqueda semántica (`SemanticSearch`)
- Duplicados (`DuplicatesList`)
- Capas (`LayersPanel`)
- Paneles flotantes

`Index.tsx` se reduce a **orquestación ligera**: monta el orquestador de Discovery, el toolbar y los paneles modales.

---

## Sistema de Preferencias UX (5 Capas)

Documentado en detalle en `docs/adr/001-manageable-unit.md`.

### Arquitectura de 5 capas

| Capa | Qué cubre |
|------|-----------|
| **1. Tokens base** | Tema, accent, tipografía, densidad, radio, sombras, motion — afecta shell y componentes, NO semántica del mapa |
| **2. UX por área** | Preferencias por contexto: `shell.*`, `map.chrome.*`, `map.interaction.*`, `content.layout.*`, `accessibility.*` |
| **3. Semántica (protegida)** | Visibilidad de capas, thresholds de heatmap — existen pero pueden estar parcialmente protegidas |
| **4. Scopes** | `system < role < domain < user < device < entity < session` — cada scope sobreescribe el anterior |
| **5. Paneles** | Agrupados por familia (Apariencia, Layout, Mapa, Audio, Accesibilidad), no por componente |

### Frontera Nivel A / Nivel B

| Nivel | Qué | Quién edita | Dónde se almacena |
|-------|-----|-------------|-------------------|
| **A — Personal** | Tema, accent, densidad, grid, audio, motion, visibilidad de capas, chrome del mapa | Usuario (scope `user`/`device`/`session`) | `preference_values` |
| **B — Semántico/Admin** | Formas de marcadores, tamaños, state rules, colores de ownership, contratos V2 | Admin/Master (scope `system`/`role`) | `app_settings` + Back Office |

**Frontera crítica**: La gramática V2 de marcadores (shapes, colores, decoraciones de estado de negocio) **NUNCA** se expone como preferencia de usuario.

### Tabla `preference_values`

```sql
CREATE TABLE preference_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_key TEXT NOT NULL,         -- ej: 'ux.appearance', 'ux.layout'
  scope_type TEXT NOT NULL,       -- 'system'|'role'|'domain'|'user'|'device'|'session'
  scope_id TEXT,                  -- user_id, role name, device fingerprint, NULL para system
  values JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(unit_key, scope_type, scope_id)
);
```

**RLS:**
- Todos los usuarios autenticados pueden **leer** todas las preferencias
- Solo pueden **insertar/actualizar/eliminar** si `scope_type='user' AND scope_id=auth.uid()`, o si son `master`

### Unidades UX registradas

| Unit Key | Group | Campos principales |
|----------|-------|--------------------|
| `ux.appearance` | appearance | theme (light/dark/auto), accentColor, contrast, radius, motionLevel |
| `ux.layout` | layout | density, gridColumns, cardDensity, sidebarPersist, floatingPanelMode |
| `ux.map.chrome` | map | showScale, showMiniLegend, toolbarPosition |
| `ux.map.interaction` | map | hoverPreview, clickBehavior |
| `ux.map.visibility` | map | Toggles de capas (migrado de discovery) |
| `ux.audio` | appearance | globalEnabled, enrichmentSound, importSound |
| `ux.accessibility` | accessibility | reduceMotion, largeTargets, showKeyboardShortcuts |

### Precedencia de scopes

```
session (más alta) > device > entity > user > domain > role > system (más baja)
```

### Almacenamiento por scope

| Scope | Storage |
|-------|---------|
| `session`, `device` | localStorage |
| `user`, `domain`, `role`, `system` | tabla `preference_values` (Supabase) |
| `entity` | `preference_values` con entity ID |

### NO está en el sistema de preferencias

- `marker_size_config` — administrado en `app_settings` via Back Office
- `marker_state_rules` — administrado en `app_settings` via Back Office
- Contratos visuales V2 — congelados, definidos en código
- Reglas de validación — lógica de dominio

---

## Estructura de Directorios

```
vandits/
├── src/
│   ├── components/              # Componentes React globales
│   │   ├── filters/             # Filtros jerárquicos
│   │   ├── map/                 # Módulos del mapa (popups, icons, layers, routes)
│   │   ├── ui/                  # shadcn/ui
│   │   ├── AdminPanel.tsx
│   │   ├── FloatingToolbar.tsx
│   │   ├── LocationMap.tsx
│   │   ├── RouteBuilder.tsx
│   │   ├── UserMenu.tsx
│   │   └── ...
│   ├── domains/
│   │   ├── content/             # Importación, enriquecimiento, documentos
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── store/
│   │   │   └── types.ts
│   │   ├── discovery/           # Mapa, filtros, galería, búsqueda
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── store/
│   │   │   └── types.ts
│   │   ├── routes/              # Motor de rutas, itinerarios
│   │   ├── identity/            # Auth, permisos
│   │   ├── social/              # Follows, stats
│   │   ├── privacy/             # Visibilidad
│   │   └── v2/                  # Tipos V2, gramática visual, dual-write
│   ├── hooks/                   # Hooks compartidos (proxies a domains)
│   ├── lib/                     # Utilidades (parsers, geocoding, sounds)
│   ├── repositories/            # Acceso directo a DB (V2)
│   ├── services/                # Lógica de negocio (V2)
│   ├── shared/
│   │   └── preferences/         # Sistema de preferencias UX
│   │       ├── components/      # PreferencesPage, PanelRenderer, ScopeSelector
│   │       ├── units/           # Definiciones de unidades UX
│   │       ├── types.ts
│   │       ├── registry.ts
│   │       ├── resolver.ts
│   │       ├── storage.ts
│   │       └── usePreferences.ts
│   ├── store/                   # Zustand stores
│   ├── stores/                  # Stores adicionales (duplicates)
│   ├── contexts/                # React contexts
│   ├── pages/
│   │   ├── Auth.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Index.tsx
│   │   └── ...
│   └── integrations/supabase/
├── supabase/
│   ├── functions/               # 17 Edge Functions
│   └── config.toml
├── docs/
│   └── adr/
│       └── 001-manageable-unit.md  # ADR del sistema de preferencias
└── public/
```

---

## Esquema de Base de Datos

### Tablas Legacy (V1)

#### `profiles`
Perfiles de usuario con configuración personalizada.
```
- id: UUID (FK auth.users)
- username, display_name, avatar_url, bio
- is_private, map_center_mode, home_latitude/longitude/home_name
- duplicate_threshold_meters (default: 250)
- travel_profile, priority_ranking (JSONB)
- route_engine_defaults (JSONB)
- icon_library, measurement_units
- default_location_visibility, default_note_visibility, default_photo_visibility
- hide_home_location
```

#### `documents`
Colecciones de ubicaciones (archivos importados).
```
- id, name, original_filename, original_file_path
- user_id, source_type, status, import_status
- total_waypoints, resolved_count, pending_count, conflict_count
- confirmed_at, metadata (JSONB)
```

#### `locations`
Puntos geográficos con metadatos (legacy, coexiste con V2).
```
- id, document_id (FK documents), name, description
- latitude, longitude, altitude
- continent, country, region, zone, place_type
- visibility ('public'|'followers'|'private')
- enriched_data (JSONB), enrichment_status
- is_approved, personal_category_id
- user_image_url, user_image_visibility
- pioneer_user_id, deleted_at (soft delete)
```

### Tablas V2

#### `places`
Entidad geográfica canónica (independiente del usuario).
```
- id, name, latitude, longitude, altitude
- continent, country, region, zone, place_type
- classification (JSONB), enriched_data (JSONB)
- created_by (UUID)
```

#### `user_places`
Relación personal usuario-lugar.
```
- id, user_id, place_id (FK places)
- visit_status ('not_visited'|'planned'|'visited')
- visited_at, rating, is_favorite, is_saved, is_archived
- origin ('import'|'manual'|'adopted'|'enrichment')
- source_document_id, saved_from_user_id
- visibility
```

#### `collections` / `collection_items`
Agrupaciones personales de cualquier tipo de item.
```
collections: id, user_id, name, description, icon, color, visibility
collection_items: id, collection_id, item_type ('place'|'route'|'document'), item_id, position
```

### Tablas de Preferencias

#### `preference_values`
Almacenamiento centralizado de preferencias UX por scope.
```
- id, unit_key, scope_type, scope_id, values (JSONB)
- UNIQUE(unit_key, scope_type, scope_id)
```

#### `app_settings`
Key-value global para configuración del sistema (Nivel B).
```
- id, key, value (JSONB), description
```

### Tablas de Rutas

```
routes: id, user_id, name, transport_mode, road_preference, status,
        route_geometry, route_preferences, parent_route_id, segment_position,
        total_distance_meters, total_duration_seconds, visibility

route_waypoints: id, route_id, location_id, position, name, lat/lng,
                 transport_mode, segment_geometry, segment_distance/duration

route_stops: id, route_id, name, position, lat/lng, stop_type,
             arrival/departure_estimate, icon, metadata

route_day_stages: id, route_id, day_number, name, start/end coords+names,
                  distance_meters, duration_seconds, overnight_stop_id

route_analyses: id, user_id, route_id, profile_code, weights_snapshot,
                budget_max, time_max_hours, excluded_modes

route_analysis_alternatives: id, analysis_id, name, rank, scores,
                             segments, total_cost/distance/time, modes_used
```

### Tablas de Transporte

```
transport_modes: code, name, category, sub_category, icon,
                 avg_speed_kmh, base_cost, cost_per_km,
                 scores (autonomy, cargo, comfort, flexibility, etc.),
                 is_motorized, requires_booking, requires_schedule,
                 max_range_km, overhead_minutes, setup_time_minutes

transport_mode_costs: transport_mode_id, cost_category_id,
                      base_cost, cost_per_km, api_source, is_estimated

transport_mode_compatibility: carrier_code, carried_code, is_compatible

travel_profiles: code, name, icon, weights (time, cost, comfort, etc.)

cost_categories: code, name, icon, description
```

### Tablas Auxiliares

```
location_notes: id, location_id, user_id, content, visibility
location_photos: id, location_id, user_id, image_url, visibility, is_primary, caption
follows: id, follower_id, following_id, status
follow_category_preferences: id, follow_id, classification_code, visible
user_roles: id, user_id, role
role_permissions: id, role, permission
enrichment_criteria: id, version, min_description_length, description_tone, image_sources, min_tags_count
enrichment_jobs: id, document_id, status, total/processed/error counts
global_enrichment_jobs: id, criteria_version, triggered_by, status, counts
marker_size_config: id, marker_type, marker_shape, fill_color/fill_color_light, base_sizes, hover_size
personal_categories: id, user_id, name, icon, color, description, is_shared
onedrive_photo_index: id, user_id, onedrive_id, name, lat/lng, taken_at, folder_path, thumbnail_url
document_tracks: id, document_id, name, coordinates (JSONB), color, date, metadata
place_merge_history: id, source_place_id, target_place_id, merged_by, reason
airports: id, ident, iata_code, name, lat/lng, type, iso_country
ferry_routes: id, route_name, origin/destination ports+coords, operators, distance_km, duration
user_stats_cache: id, user_id, total_locations, countries/regions/continents, geo_distribution, etc.
user_achievements / achievement_definitions: Logros por métricas (exploración, contenido)
user_map_preferences: id, user_id, context, viewport, visible_layers, active_filters
```

---

## Edge Functions

| Función | Descripción |
|---------|-------------|
| `enrich-location` | Enriquece una ubicación individual con Google Gemini: ficha técnica, etiquetas, imagen Wikimedia, índice de interés (1-5) |
| `batch-enrich` | Procesamiento batch con rate limiting, exponential backoff, progreso en `enrichment_jobs` |
| `batch-geocode` | Geocodificación inversa masiva via Nominatim (1 req/seg) |
| `quick-classify` | Clasificación rápida: categoría, subcategoría, tipo, código jerárquico |
| `semantic-search` | Búsqueda por significado via Lovable AI embeddings |
| `calculate-route` | Cálculo de ruta via OpenRouteService |
| `check-route-services` | Verificación de servicios de ruta disponibles |
| `correct-segment` | Corrección de tramos GPS con saltos detectados |
| `search-flights` | Búsqueda de vuelos via Duffel API |
| `find-intermodal-options` | Detección de alternativas intermodales (ferry/vuelo) |
| `search-nearby-osm` | Búsqueda de contexto cercano via Overpass/OSM |
| `druid-search` | Búsqueda dinámica de puntos por APIs externas |
| `scan-onedrive-geo` | Escaneo de fotos geoetiquetadas en OneDrive |
| `browse-onedrive` | Navegación de carpetas OneDrive |
| `migrate-v2` | Migración de datos legacy a modelo V2 |
| `purge-user` | Eliminación completa de datos de usuario |
| `create-test-users` | Creación de usuarios de prueba |

---

## Componentes Principales

### `LocationMap.tsx`
Mapa interactivo Leaflet con:
- Marcadores diferenciados: catálogo (teardrop azul cielo) vs workspace (círculos gris/naranja)
- Popups enriquecidos con fichas técnicas colapsables
- Clustering de marcadores + vista heatmap
- Temas claro/oscuro
- Micro-offset para marcadores colocados (~3m)
- Centrado sidebar-aware con pan-offset

### `DiscoveryOrchestrator.tsx`
Orquestador del dominio Discovery:
- Monta mapa, filtros, galería, búsqueda, duplicados, capas
- Gestiona estado de discovery-store

### `FloatingToolbar.tsx`
Barra de herramientas flotante con:
- Logo VANDITS + brand gradient
- Contadores de estado por tipo
- Barra de búsqueda
- Controles de mapa y preferencias
- Estadísticas sociales

### `RouteBuilder.tsx`
Constructor de rutas con:
- Jerarquía visual: Origen (A) → Waypoints → Destino (B)
- Edición visual drag & drop en mapa
- Corrección automática de tramos GPS
- Soporte multimodal (tierra, ferry, vuelo)

### `PreferencesPage.tsx`
Panel centralizado de preferencias UX con tabs por familia:
- Apariencia, Layout, Mapa, Audio, Accesibilidad

---

## Hooks Personalizados

### Hooks de dominio (en `domains/`)
| Hook | Dominio | Función |
|------|---------|---------|
| `use-database-sync` | Content | Sincronización bidireccional con DB |
| `use-filtered-locations` | Content | Ubicaciones filtradas por criterios |
| `use-realtime-locations` | Content | Suscripción realtime |
| `use-map-data` | Discovery | Datos del mapa procesados |
| `use-route-calculation` | Routes | Cálculo de rutas ORS |
| `use-route-stops` | Routes | Gestión de paradas |
| `use-travel-advisor` | Routes | Análisis multimodal |

### Hooks compartidos (en `hooks/`)
| Hook | Función |
|------|---------|
| `use-auth` | Autenticación completa (signup, signin, Google OAuth, reset password) |
| `use-permissions` | Verificación RBAC de roles y permisos |
| `use-map-theme` | Tema del mapa (bridge a `ux.appearance.theme`) |
| `use-sound-preferences` | Preferencias de audio (bridge a `ux.audio`) |
| `use-layer-visibility` | Visibilidad de capas (bridge a `ux.map.visibility`) |
| `use-v2-flags` | Feature flags V1/V2 |
| `use-v2-map-bridge` | Bridge entre modelo V2 y mapa |

### Hook de preferencias
```typescript
import { usePreferences } from '@/shared/preferences/usePreferences';

const { values, updateField } = usePreferences('ux.appearance', {
  scopeType: 'user',
  scopeId: userId
});
```

---

## Librerías Utilitarias

### Parsers de Archivos
- `kml-parser.ts` — Archivos KML con soporte de rutas
- `gpx-parser.ts` — Tracks GPS con detección de waypoints internos
- `geojson-parser.ts` — Estándar GeoJSON
- `csv-parser.ts` — Coordenadas en CSV
- `geo-file-parser.ts` — Detector unificado de formato

### Otros
- `duplicate-detection.ts` — Algoritmo Haversine (250m exacto, 1km advertencia)
- `geocoding.ts` — Integración Nominatim
- `route-engine.ts` — Motor de rutas determinístico
- `card-style-tokens.ts` — Tokens visuales compartidos admin/popup
- `icon-utils.tsx` — Resolución de iconos SVG Lucide
- `sounds.ts` — Sistema de audio UI
- `version.ts` — Constantes de versión

---

## Estado Global (Zustand)

### `locations-store.ts`
Estado principal de documentos y ubicaciones legacy.

### `duplicate-store.ts`
Cache de detección de duplicados con cola async y cálculos de proximidad.

### `discovery-store.ts`
Estado del dominio Discovery (filtros, selección, viewport).

---

## Sistema de Autenticación y Permisos

### Roles
| Rol | Descripción |
|-----|-------------|
| `master` | Acceso total, gestión de sistema |
| `admin` | Gestión de usuarios y contenido |
| `supervisor` | Supervisión de moderadores |
| `moderator` | Moderación de contenido |
| `editor` | Edición de ubicaciones |
| `user` | Usuario estándar |

### Permisos
- `manage_users` — Gestión de usuarios
- `manage_criteria` — Configurar criterios de enriquecimiento
- `run_global_enrichment` — Ejecutar enriquecimiento global
- `view_all_locations` — Ver todas las ubicaciones
- `edit_all_locations` — Editar cualquier ubicación
- `delete_any_location` — Eliminar cualquier ubicación
- `manage_documents` — Gestionar documentos
- `view_analytics` — Ver analíticas
- `moderate_content` — Moderar contenido

### RLS (Row Level Security)
- `can_view_location()` — Función de seguridad que determina visibilidad: público siempre visible, privado solo propietario, followers con follow aceptado
- `can_view_deleted_location()` — Soft-delete visible solo al propietario
- `has_role()` — Función `SECURITY DEFINER` que evita recursión RLS en verificación de roles

---

## Funcionalidades Implementadas

### Importación
- KML, GPX, GeoJSON, CSV con detección automática
- Flujo de 2 pasos: Upload + Review/Confirm unificado
- Detección de duplicados integrada (250m)
- Preservación inmutable del archivo original en storage
- Categorías personales asignables

### Enriquecimiento IA
- Fichas técnicas completas via Google Gemini
- Índice de interés (1-5 estrellas)
- Imágenes de Wikimedia Commons (con filtro de coherencia geográfica 50km)
- Clasificación jerárquica + etiquetas
- Procesamiento batch con progreso en tiempo real
- Herencia automática catálogo→workspace para twins

### Mapa Interactivo
- Marcadores diferenciados catálogo vs workspace
- Popups enriquecidos con secciones colapsables
- Clustering / Heatmap
- Temas claro/oscuro (manual + automático)
- Centrado sidebar-aware
- Contexto cercano (100m-2km via OSM)

### Rutas e Itinerarios
- Motor determinístico (ORS tierra, Duffel vuelos, DB ferries)
- Detección automática de obstáculos geográficos
- Corrección de tramos GPS con saltos
- Jerarquía padre-hijo para rutas multimodales
- Edición visual drag & drop
- Análisis de alternativas con scoring

### Sistema Social
- Perfiles públicos/privados
- Seguir/dejar de seguir con aprobación
- Visibilidad granular por nivel (public/followers/private)
- Categorías de follow configurables

### Dashboard BI
- Estética Cyber-Telemetry HUD (oscuro + cyan/amber)
- Estadísticas geográficas, de enriquecimiento y sociales
- Gráficos Recharts

---

## Motor de Rutas

### Arquitectura
- **100% determinístico** — No hay IA para generación de rutas
- **ORS** (OpenRouteService) para rutas terrestres
- **Duffel API** para precios de vuelos en tiempo real
- **DB interna** (`ferry_routes`, `airports`) para ferries y aeropuertos
- Fallback automático: tierra imposible → propuesta ferry/vuelo

### Perfiles de viaje
16 modos de transporte en 5 categorías. Scoring por 9 dimensiones (autonomy, cargo, comfort, flexibility, load, restrictions, risk, scenic, time/cost).

### Validaciones
- Walking: max 500km distancia, max 50km línea recta
- Intermodal: >8km cruce marítimo → buscar ferry/vuelo
- GPS: mediana de distancia × 10 o ángulo < 5° → tramo sospechoso

---

## Sistema Social

- Follows con estados (pending, accepted, rejected)
- Preferencias de categoría por follow
- Estadísticas cacheadas en `user_stats_cache`
- Logros (`achievement_definitions` + `user_achievements`)

---

## Dependencias Principales

| Paquete | Uso |
|---------|-----|
| react 18 | Framework UI |
| leaflet | Mapas interactivos |
| zustand | Estado global |
| @supabase/supabase-js | Backend (Lovable Cloud) |
| framer-motion | Animaciones |
| recharts | Gráficos BI Dashboard |
| exifr | Extracción EXIF |
| lucide-react | Iconos SVG |
| sonner | Notificaciones |
| zod | Validación de schemas |
| @tanstack/react-query | Cache y fetching |
| react-router-dom | Routing |

---

**VANDITS v2.0.0** — Consolidado el 2026-04-16
