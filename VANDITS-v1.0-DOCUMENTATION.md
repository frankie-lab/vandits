# VANDITS v1.0.0 - Documentación Técnica Completa

**Fecha de consolidación:** 2026-01-17  
**Versión:** 1.0.0  
**Stack:** React 18 + TypeScript + Vite + Tailwind CSS + Supabase (Lovable Cloud)

---

## 📋 Índice

1. [Descripción General](#descripción-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Estructura de Directorios](#estructura-de-directorios)
4. [Esquema de Base de Datos](#esquema-de-base-de-datos)
5. [Edge Functions](#edge-functions)
6. [Componentes Principales](#componentes-principales)
7. [Hooks Personalizados](#hooks-personalizados)
8. [Librerías Utilitarias](#librerías-utilitarias)
9. [Estado Global (Zustand)](#estado-global-zustand)
10. [Sistema de Autenticación y Permisos](#sistema-de-autenticación-y-permisos)
11. [Funcionalidades Implementadas](#funcionalidades-implementadas)
12. [Sistema de Visitas Verificadas](#sistema-de-visitas-verificadas)
13. [Enriquecimiento IA](#enriquecimiento-ia)
14. [Sistema Social](#sistema-social)
15. [Dependencias](#dependencias)

---

## 📖 Descripción General

**VANDITS** es un gestor de ubicaciones geográficas con capacidades de enriquecimiento mediante IA. Permite importar, gestionar, enriquecer y compartir puntos de interés desde múltiples formatos de archivo.

### Características principales:
- Importación multi-formato (KML, GPX, GeoJSON, CSV)
- Enriquecimiento automático con IA (Google Gemini)
- Geocodificación inversa automática
- Verificación de visitas mediante GPS o fotos geoetiquetadas
- Sistema de grados de relevancia (antigüedad de verificación)
- Notas personales por ubicación
- Sistema social (seguimiento de usuarios)
- Panel de administración con roles y permisos
- Exportación a múltiples formatos

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
├─────────────────────────────────────────────────────────────────┤
│  Pages          │  Components        │  Hooks                   │
│  - Index        │  - LocationMap     │  - useAuth               │
│  - Auth         │  - FloatingToolbar │  - useDatabaseSync       │
│  - Terms        │  - FilterBar       │  - useRealtimeLocations  │
│  - DuplicatePolicy │ - BatchEnrichment │ - usePermissions       │
├─────────────────────────────────────────────────────────────────┤
│                     STATE (Zustand Store)                        │
│  locations-store.ts - Estado global de documentos y ubicaciones  │
├─────────────────────────────────────────────────────────────────┤
│                      SUPABASE CLIENT                             │
│  - Auth          │  - Realtime        │  - Storage              │
│  - Database      │  - Edge Functions  │                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     LOVABLE CLOUD (Supabase)                     │
├─────────────────────────────────────────────────────────────────┤
│  TABLES (14)                                                     │
│  - documents, locations, profiles, follows                       │
│  - location_notes, location_photos                               │
│  - enrichment_jobs, enrichment_criteria, global_enrichment_jobs │
│  - user_roles, role_permissions                                  │
│  - user_achievements, achievement_definitions                    │
│  - follow_category_preferences                                   │
├─────────────────────────────────────────────────────────────────┤
│  EDGE FUNCTIONS (5)                                              │
│  - enrich-location    │  - batch-enrich                         │
│  - batch-geocode      │  - quick-classify                       │
│  - semantic-search                                               │
├─────────────────────────────────────────────────────────────────┤
│  STORAGE BUCKETS (2)                                             │
│  - avatars (public)   │  - location-photos (public)             │
├─────────────────────────────────────────────────────────────────┤
│  REALTIME                                                        │
│  - locations table subscription                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Estructura de Directorios

```
vandits/
├── src/
│   ├── components/           # Componentes React
│   │   ├── filters/          # Componentes de filtrado
│   │   │   ├── ClassificationTree.tsx
│   │   │   ├── GeographyTree.tsx
│   │   │   ├── PlaceTypeFilter.tsx
│   │   │   └── TagsTree.tsx
│   │   ├── ui/               # Componentes shadcn/ui
│   │   ├── AdminPanel.tsx
│   │   ├── BatchEnrichmentPanel.tsx
│   │   ├── DuplicatesList.tsx
│   │   ├── ExportPanel.tsx
│   │   ├── FileUploadZone.tsx
│   │   ├── FilterBar.tsx
│   │   ├── FloatingToolbar.tsx
│   │   ├── GalleryView.tsx
│   │   ├── LocationList.tsx
│   │   ├── LocationMap.tsx
│   │   ├── LocationPhotoUpload.tsx
│   │   ├── NotesEditor.tsx
│   │   ├── SemanticSearch.tsx
│   │   ├── UserMenu.tsx
│   │   └── UserProfileEditor.tsx
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   ├── use-database-sync.ts
│   │   ├── use-mobile.tsx
│   │   ├── use-permissions.ts
│   │   ├── use-realtime-locations.ts
│   │   └── use-social-stats.ts
│   ├── lib/
│   │   ├── csv-parser.ts
│   │   ├── duplicate-detection.ts
│   │   ├── geo-file-parser.ts
│   │   ├── geocoding.ts
│   │   ├── geojson-parser.ts
│   │   ├── gpx-parser.ts
│   │   ├── kml-parser.ts
│   │   ├── sounds.ts
│   │   ├── utils.ts
│   │   └── version.ts
│   ├── pages/
│   │   ├── Auth.tsx
│   │   ├── DuplicatePolicy.tsx
│   │   ├── Index.tsx
│   │   ├── NotFound.tsx
│   │   └── Terms.tsx
│   ├── store/
│   │   └── locations-store.ts
│   ├── types/
│   │   └── location.ts
│   └── integrations/supabase/
│       ├── client.ts
│       └── types.ts
├── supabase/
│   ├── functions/
│   │   ├── batch-enrich/
│   │   ├── batch-geocode/
│   │   ├── enrich-location/
│   │   ├── quick-classify/
│   │   └── semantic-search/
│   └── config.toml
└── public/
```

---

## 🗄️ Esquema de Base de Datos

### Tablas Principales

#### `profiles`
Perfiles de usuario con configuración personalizada.
```sql
- id: UUID (FK auth.users)
- username: TEXT (unique)
- display_name: TEXT
- avatar_url: TEXT
- bio: TEXT
- is_private: BOOLEAN (default: false)
- map_center_mode: TEXT ('auto' | 'home' | 'all')
- home_latitude, home_longitude, home_name
- duplicate_threshold_meters: INTEGER (default: 250)
- default_photo_visibility: TEXT
```

#### `documents`
Colecciones de ubicaciones (archivos importados).
```sql
- id: UUID
- name: TEXT
- original_filename: TEXT
- user_id: UUID (FK profiles)
- created_at, updated_at: TIMESTAMPTZ
```

#### `locations`
Puntos geográficos con metadatos.
```sql
- id: UUID
- document_id: UUID (FK documents)
- name: TEXT
- description: TEXT
- latitude, longitude: FLOAT
- altitude: FLOAT
- continent, country, region, zone: TEXT
- place_type: TEXT
- visibility: TEXT ('public' | 'followers' | 'private')
- enriched_data: JSONB
- custom_data: JSONB
- user_image_url, user_image_visibility: TEXT
- pioneer_user_id: UUID
- created_at, updated_at: TIMESTAMPTZ
```

#### `location_notes`
Notas personales por ubicación.
```sql
- id: UUID
- location_id: UUID (FK locations)
- user_id: UUID
- content: TEXT
- visibility: TEXT
```

#### `location_photos`
Fotos de ubicaciones subidas por usuarios.
```sql
- id: UUID
- location_id: UUID (FK locations)
- user_id: UUID
- image_url: TEXT
- visibility: TEXT
- is_primary: BOOLEAN
- caption: TEXT
```

#### `follows`
Sistema de seguimiento entre usuarios.
```sql
- id: UUID
- follower_id: UUID (FK profiles)
- following_id: UUID (FK profiles)
- status: ENUM ('pending' | 'accepted' | 'rejected')
```

#### `user_roles` / `role_permissions`
Sistema RBAC de roles y permisos.
```sql
Roles: master, admin, supervisor, moderator, editor, user
Permisos: manage_users, manage_criteria, run_global_enrichment, 
          view_all_locations, edit_all_locations, delete_any_location,
          manage_documents, view_analytics, moderate_content, 
          upload_files, add_locations
```

#### `enrichment_jobs` / `global_enrichment_jobs`
Gestión de procesos de enriquecimiento batch.

#### `enrichment_criteria`
Criterios configurables para enriquecimiento.

---

## ⚡ Edge Functions

### `enrich-location`
Enriquece una ubicación individual usando Google Gemini.
- Genera ficha técnica con descripción, punto destacado, etiquetas
- Busca imágenes en Wikimedia Commons
- Calcula índice de interés (1-5 estrellas)
- Valida URLs de referencia

### `batch-enrich`
Procesa múltiples ubicaciones en lote.
- Gestiona rate limiting con exponential backoff
- Actualiza progreso en `enrichment_jobs`
- Soporta pausar/reanudar

### `batch-geocode`
Geocodificación inversa masiva usando Nominatim.
- Obtiene continente, país, región, zona desde coordenadas
- Rate-limited (1 req/seg)

### `quick-classify`
Clasificación rápida de ubicaciones.
- Asigna categoría, subcategoría, tipo específico
- Genera código jerárquico

### `semantic-search`
Búsqueda semántica en ubicaciones.
- Usa embeddings para búsqueda por significado
- Integración con Lovable AI

---

## 🧩 Componentes Principales

### `LocationMap.tsx` (~2300 líneas)
Mapa interactivo Leaflet con:
- Marcadores coloreados por estado (Verde/Azul/Gris/Naranja)
- Popups enriquecidos con fichas técnicas
- Clustering de marcadores
- Vista heatmap
- Temas claro/oscuro
- Animaciones de celebración al enriquecer

### `FloatingToolbar.tsx` (~965 líneas)
Barra de herramientas flotante con:
- Logo + versión
- Contador de estados (Final/Pendiente/Importado/Nuevo)
- Barra de búsqueda
- Controles de mapa
- Estadísticas sociales
- Menú de usuario

### `FilterBar.tsx`
Panel de filtros con:
- Geografía (árbol jerárquico)
- Etiquetas (temáticas + geográficas)
- Clasificación
- Estado de enriquecimiento

### `BatchEnrichmentPanel.tsx`
Gestión de enriquecimiento masivo:
- Selección por estado
- Progreso en tiempo real
- Pausar/reanudar/cancelar

### `DuplicatesList.tsx`
Detección y resolución de duplicados:
- Comparación lado a lado
- Acciones: mantener ambos, mantener uno, eliminar

### `LocationPhotoUpload.tsx`
Subida de fotos con:
- Extracción EXIF (GPS, fecha)
- Validación de proximidad (500m)
- Auto-verificación de visita

---

## 🪝 Hooks Personalizados

### `use-auth.ts`
Gestión completa de autenticación Supabase.

**Funciones principales:**
- `signUp(email, password, username)` - Registro de nuevo usuario
- `signIn(email, password)` - Inicio de sesión con email/password
- `signInWithGoogle()` - Autenticación OAuth con Google
- `signOut()` - Cierre de sesión
- `resetPassword(email)` - Envía email de recuperación de contraseña
- `updatePassword(newPassword)` - Actualiza contraseña (tras reset)
- `updateProfile(updates)` - Actualiza datos del perfil
- `refreshProfile()` - Refresca datos del perfil desde BD

**Estados expuestos:**
- `user` - Usuario autenticado de Supabase
- `session` - Sesión activa
- `profile` - Datos del perfil (UserProfile)
- `loading` - Estado de carga inicial

**Sistema de Recuperación de Contraseña:**
1. Usuario hace clic en "¿Olvidaste tu contraseña?" en `/auth`
2. Introduce su email y solicita el enlace
3. `resetPassword()` llama a `supabase.auth.resetPasswordForEmail()`
4. Usuario recibe email con enlace a `/auth?mode=reset`
5. La página detecta `mode=reset` y muestra formulario de nueva contraseña
6. `updatePassword()` llama a `supabase.auth.updateUser({ password })`
7. Usuario es redirigido a la app principal

### `use-database-sync.ts`
Sincronización bidireccional con base de datos.
- Carga inicial de documentos/ubicaciones
- Funciones CRUD

### `use-realtime-locations.ts`
Suscripción a cambios en tiempo real.
- Actualiza marcadores instantáneamente

### `use-permissions.ts`
Verificación de roles y permisos RBAC.

### `use-social-stats.ts`
Estadísticas de seguidores/siguiendo.

---

## 📚 Librerías Utilitarias

### Parsers de Archivos
- `kml-parser.ts` - Archivos KML
- `gpx-parser.ts` - Tracks GPS
- `geojson-parser.ts` - Estándar GeoJSON
- `csv-parser.ts` - Coordenadas en CSV
- `geo-file-parser.ts` - Detector unificado

### `duplicate-detection.ts`
Algoritmo de detección de duplicados basado en distancia Haversine.

### `geocoding.ts`
Integración con Nominatim para geocodificación inversa.

### `version.ts`
Constantes de versión y changelog.

---

## 🗃️ Estado Global (Zustand)

### `locations-store.ts`
```typescript
interface LocationsState {
  documents: KMLDocument[];
  selectedDocument: string | null;
  selectedLocations: Set<string>;
  focusedLocationId: string | null;
  filters: FilterCriteria;
  
  // Actions
  addDocument, updateDocument, deleteDocument
  updateLocation, addLocation, deleteLocation
  setFilters, toggleLocationSelection
  getFilteredLocations, getAllLocations
  getLocationOwnership
}
```

---

## 🔐 Sistema de Autenticación y Permisos

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
- `manage_users` - Gestión de usuarios
- `manage_criteria` - Configurar criterios de enriquecimiento
- `run_global_enrichment` - Ejecutar enriquecimiento global
- `view_all_locations` - Ver todas las ubicaciones
- `edit_all_locations` - Editar cualquier ubicación
- `delete_any_location` - Eliminar cualquier ubicación

---

## ✅ Funcionalidades Implementadas

### Importación
- [x] KML, GPX, GeoJSON, CSV
- [x] Validación de coordenadas GPS
- [x] Condiciones de subida (visibilidad, términos)
- [x] Detección automática de formato

### Enriquecimiento IA
- [x] Fichas técnicas completas
- [x] Índice de interés (1-5 ★)
- [x] Imágenes de Wikimedia Commons
- [x] Clasificación jerárquica
- [x] Etiquetas temáticas y geográficas
- [x] Procesamiento batch con progreso

### Mapa Interactivo
- [x] Marcadores coloreados por estado
- [x] Popups enriquecidos
- [x] Clustering / Heatmap
- [x] Temas claro/oscuro (manual + automático)
- [x] Centrado en ubicación base

### Verificación de Visitas
- [x] Check-in por GPS del dispositivo (500m)
- [x] Verificación por foto geoetiquetada (EXIF)
- [x] Grados de relevancia por antigüedad
- [x] Badge visual en popups

### Sistema Social
- [x] Perfiles de usuario
- [x] Seguir/dejar de seguir
- [x] Perfiles públicos/privados
- [x] Visibilidad por niveles

### Administración
- [x] Panel de roles y permisos
- [x] Criterios de enriquecimiento configurables
- [x] Gestión de usuarios

---

## 🏆 Sistema de Visitas Verificadas

### Métodos de Verificación
1. **GPS del dispositivo**: Estar a menos de 500m del punto
2. **Foto geoetiquetada**: Subir foto con datos EXIF GPS válidos

### Grados de Relevancia
| Grado | Antigüedad | Badge |
|-------|------------|-------|
| 🥇 Veterano | > 3 años | Oro |
| 🥈 Consolidado | 1-3 años | Plata |
| 🥉 Confirmado | 3 meses - 1 año | Bronce |
| 🆕 Reciente | < 3 meses | Verde |

### Datos Almacenados (custom_data)
```json
{
  "visited": "true",
  "visited_verified_at": "2026-01-17T...",
  "verified_visit_photo": "true",
  "visit_photo_distance_m": "127",
  "oldest_geotagged_photo_date": "2024-05-15T..."
}
```

---

## 📦 Dependencias Principales

| Paquete | Versión | Uso |
|---------|---------|-----|
| react | 18.3.1 | Framework UI |
| leaflet | 1.9.4 | Mapas interactivos |
| zustand | 5.0.10 | Estado global |
| @supabase/supabase-js | 2.90.1 | Backend |
| framer-motion | 12.26.2 | Animaciones |
| exifr | 7.1.3 | Extracción EXIF |
| lucide-react | 0.462.0 | Iconos |
| sonner | 1.7.4 | Notificaciones |
| suncalc | 1.9.0 | Cálculos solares |
| zod | 3.25.76 | Validación |

---

## 🚀 Próximos Pasos (v1.1+)

- [ ] Filtro por grado de visita
- [ ] Galería de fotos verificadas
- [ ] Estadísticas de visitas en perfil
- [ ] Notificaciones de nuevas versiones
- [ ] Diálogo "Acerca de"
- [ ] Soporte KMZ
- [ ] PWA / modo offline

---

**VANDITS v1.0.0** - Consolidado el 2026-01-17
