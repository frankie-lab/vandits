
# Regla OBLIGATORIA: Iconografía del proyecto

## Prohibido usar emojis como iconos

Queda **estrictamente prohibido** usar emojis (🔥, ✨, 📂, 🌍, etc.) como elementos visuales en la interfaz, marcadores del mapa, listas, paneles o cualquier componente UI.

### Qué usar en su lugar
- **Siempre** usar iconos SVG de la librería configurada globalmente en `app_settings.icon_library` (por defecto: Lucide).
- Consultar `src/contexts/IconLibraryContext.tsx` para obtener la librería activa.
- Para renderizar iconos en el mapa, usar las utilidades de `src/lib/icon-utils.tsx`.
- Para componentes React, importar directamente de `lucide-react` (o la librería activa).

### Ejemplos correctos
```tsx
// ✅ Correcto
import { Sparkles, FileUp, Globe } from 'lucide-react';
<Sparkles className="w-4 h-4 text-muted-foreground" />

// ❌ Incorrecto
icon: '✨'
<span>📂</span>
```

### Aplica a:
- Marcadores del mapa (puertos, aeropuertos, paradas, POIs)
- Listas y paneles de configuración
- Menús y barras de herramientas
- Definiciones de datos (SOUND_ACTIONS, configuraciones, etc.)
- Cualquier elemento visual sin excepción

---

# Reglas UX invariables del RouteBuilder

## Estructura visual OBLIGATORIA del panel de ruta

El panel de edición de rutas SIEMPRE debe mostrar esta estructura, sin excepciones:

```
┌─ A (Origen) ──────────────── ✏️ ─┐
│                                   │
│            (+) añadir WP          │
│                                   │
│  ┌─ 1 (Waypoint) ──── ✏️  ✕ ─┐  │
│  │            (+) añadir WP   │  │
│  └────────────────────────────┘  │
│                                   │
│  ┌─ 2 (Waypoint) ──── ✏️  ✕ ─┐  │
│  │            (+) añadir WP   │  │
│  └────────────────────────────┘  │
│                                   │
│  ── Desglose de segmentos ──     │
│  │ COCHE: A → 1  (xx km)    │   │
│  │ COCHE: 1 → 2  (xx km)    │   │
│  │ COCHE: 2 → B  (xx km)    │   │
│                                   │
│            (+) añadir WP          │
│                                   │
└─ B (Destino) ─────────────── ✏️ ─┘
```

### Reglas:
1. **A y B siempre visibles** — nunca se ocultan, ni siquiera con ruta activa
2. **Botón (+) entre TODOS los puntos** — antes del primer WP, entre cada WP, y justo antes de B
3. **Cada WP es editable (✏️) y eliminable (✕)**
4. **El desglose de segmentos** aparece entre los WPs y B, mostrando info de TODOS los tramos
5. **Al añadir/editar/eliminar un WP** → se recalcula toda la ruta automáticamente
6. **Al editar una ruta guardada** → se restauran los waypoints intermedios desde DB
7. **Los (+) del desglose de segmentos están DESACTIVADOS** — solo se usan los (+) de las tarjetas

---

# Plan: Sistema de Capas Reales en el Mapa

## Problema actual
Todos los marcadores (~miles) se añaden directamente al mapa. El "Single Arbiter" itera **todos** los marcadores en cada cambio de zoom o toggle para ajustar opacidad. Esto es ineficiente y no aprovecha las capacidades nativas de Leaflet.

## Solución: LayerGroups reales por tipo

### Fase A — Crear estructura de capas (`map-layer-groups.ts`)
Nuevo módulo que gestiona LayerGroups separados:

| Capa | LayerGroup | Descripción |
|------|-----------|-------------|
| `own` | `ownLayerGroup` | Puntos propios del usuario |
| `followed:<userId>` | `followedLayerGroups[userId]` | Puntos de cada usuario seguido (uno por usuario) |
| `curator:<curatorId>` | `curatorLayerGroups[curatorId]` | Puntos de cada curador virtual |
| `druid:<druidId>` | `druidLayerGroups[druidId]` | Puntos de cada druida |
| `photos` | `photoLayerGroup` | Fotos OneDrive (ya existe) |
| `routes` | Polilíneas | Rutas (ya gestionado aparte) |

### Fase B — Refactorizar `LocationMap.tsx`
- Al crear cada marcador, añadirlo al `LayerGroup` correspondiente en vez de directamente al mapa.
- Cada LayerGroup se añade/quita del mapa con `addTo(map)` / `removeFrom(map)`.
- Eliminar la iteración marcador-por-marcador del arbiter actual.

### Fase C — Refactorizar `useLayerVisibility`
- En vez de iterar todos los marcadores y cambiar opacidad individual:
  - Toggle OFF → `map.removeLayer(layerGroup)` (instantáneo, O(1))
  - Toggle ON → `layerGroup.addTo(map)` (instantáneo)
- El `minVisibilityZoom` se gestiona por grupo: al hacer zoom, solo añadir/quitar los grupos que cruzan su umbral.
- Mantener la lógica de "ocultar entidad específica" (ej: ocultar un curador concreto) operando sobre su LayerGroup individual.

### Fase D — Integrar con FloatingToolbar
- Los toggles existentes (propios, seguidos, curadores, druidas, fotos) ahora controlan LayerGroups reales.
- Sin cambios en la UI, solo mejora interna.

## Beneficios
- **Rendimiento**: Ocultar/mostrar una capa es O(1) en vez de O(n) iterando marcadores.
- **Memoria**: Leaflet no renderiza marcadores de capas ocultas en el DOM.
- **Claridad**: Cada tipo de contenido tiene su grupo bien definido.
- **Extensibilidad**: Fácil añadir nuevas capas (ej: favoritos, visitados).

## Riesgos y mitigaciones
- **Regresión visual**: Verificar que la opacidad diferenciada (enriquecido vs vacío) sigue funcionando dentro de cada capa.
- **Popups**: Asegurar que los popups siguen abriéndose correctamente al cambiar de capa.
- **Cluster**: Evaluar si MarkerCluster se mantiene por capa o global (actualmente no está activo).

## Archivos afectados
- `src/components/map/map-layer-groups.ts` — **nuevo**
- `src/components/LocationMap.tsx` — refactor mayor
- `src/hooks/use-layer-visibility.ts` — simplificación
- `src/components/FloatingToolbar.tsx` — sin cambios visuales, solo conexión

---

# Plan de mejoras previo: Rendimiento + Funcionalidad + Mantenibilidad

## Fase 6: Rendimiento (Carga paralela + Memoización + Lazy loading)

### 6.1 — Carga paralela por dominio en use-database-sync
- Cargar documentos propios primero (renderizar inmediato)
- Cargar documentos de seguidos y curadores en paralelo en segundo plano
- Mostrar skeleton/spinner solo para datos pendientes

### 6.2 — Memoización selectiva en el store
- Extraer `getFilteredLocations` a un hook con `useMemo` que dependa solo de `documents` + `filters`
- Evitar recálculos innecesarios en cada render del mapa

### 6.3 — Lazy loading de dominios pesados
- `React.lazy()` para RouteBuilder, AdminPanel, CuratorEnrichmentSettings, DruidSettings
- Solo se cargan cuando el usuario los abre

## Fase 7: Funcionalidad (Eventos tipados + Cache + Offline hints)

### 7.1 — Bus de eventos tipados entre dominios
- Crear `src/domains/events.ts` con tipos de eventos (follow, unfollow, location-updated, route-changed)
- Reemplazar `window.dispatchEvent` con CustomEvent por un bus tipado
- Eliminar dependencias cruzadas directas

### 7.2 — Cache por dominio con invalidación inteligente
- Usar `staleTime` en las queries existentes
- Separar cache de Content vs Social vs Routes
- Invalidar solo el dominio afectado cuando hay cambios

### 7.3 — Indicadores de sincronización
- Mostrar estado de sync (cargando datos de seguidos, actualizando rutas, etc.)
- Feedback visual cuando los datos están parcialmente cargados

## Fase 8: Mantenibilidad (Tests + Documentación)

### 8.1 — Tests unitarios por dominio
- Test para enrichment-helpers (meetsCriteria, getLocationEnrichmentStatus)
- Test para db-transformers (dbLocationToGeoLocation)
- Test para duplicates-helpers (localStorage persistence)
- Test para route-engine (cálculos de distancia/duración)

### 8.2 — Barrel exports y documentación
- Asegurar que cada dominio tiene un `index.ts` limpio como API pública
- Añadir JSDoc a las funciones exportadas principales

---

# Reglas de Puntos Especiales en Itinerarios

## 🏠 Punto Casa (Home)
- **Único en todo el sistema**: Solo puede existir un punto casa por usuario.
- **Origen**: Se define exclusivamente en Preferencias del perfil (`profiles.home_latitude`, `home_longitude`, `home_name`).
- **No se puede crear manualmente** como marcador ni desde importación.
- **En itinerarios**: Se puede usar como origen o destino, pero siempre referencia el definido en preferencias.

## 🚩 Punto Meta / Destino
- **Lo establece el usuario manualmente**, nunca la lógica automática.
- Ni siquiera en rutas circulares se asigna automáticamente un destino.
- El usuario decide explícitamente cuál es su meta/destino en cada itinerario.

## Flujo al abrir Itinerarios sin Meta
- Si el usuario abre el panel de itinerarios y **no hay un destino definido**, el sistema debe:
  1. Mostrar un aviso/sugerencia para establecer un destino.
  2. **No bloquear** el flujo — el campo destino es opcional.
  3. Permitir al usuario trabajar con origen + waypoints sin destino fijo.

---

# Protocolo de Reconciliación de Puntos (Importación)

## Principio fundamental
**Nunca enriquecer antes de reconciliar.** El orden obligatorio es:
```
1. IMPORTAR → 2. RECONCILIAR → 3. ENRIQUECER
```

## Paso 1 — Importar
- Parsear el archivo (KML, GPX, CSV, GeoJSON)
- Crear locations de trabajo (`is_approved=false`) en el documento

## Paso 2 — Reconciliar (antes de cualquier enriquecimiento)
Para cada punto importado, buscar coincidencias en el catálogo existente:

### Match exacto (automático, sin intervención)
- **Criterio**: Mismo nombre (normalizado) + distancia < 250m
- **Acción**: Vincular automáticamente (`location_id` → punto de catálogo)
- **Enriquecimiento**: Heredar datos del catálogo. No llamar a la IA.

### Match parcial (requiere decisión del usuario)
- **Criterio**: Nombre similar (uno contiene al otro) + distancia < 1000m, O mismas coordenadas (<250m) pero nombre diferente
- **Acción**: Mostrar en panel de conflictos con opciones:
  - "Vincular a [punto catálogo]" → hereda datos
  - "Crear como nuevo" → se enriquecerá independientemente
  - "Ignorar" → no se añade al catálogo

### Sin match (punto nuevo)
- **Criterio**: Sin coincidencias en el catálogo dentro de 1000m
- **Acción**: Marcar como nuevo punto a enriquecer

## Paso 3 — Enriquecer
Solo se enriquecen:
- Puntos nuevos (sin match en catálogo)
- Puntos de catálogo vinculados que aún no estén enriquecidos
- **Nunca** enriquecer copias de trabajo que ya tienen un gemelo enriquecido en catálogo

## Filtro de coherencia geográfica (en enrich-location)
- Wikipedia: Si el artículo encontrado por texto tiene coordenadas a >50km del punto, se descarta
- Wikidata: Si la entidad tiene P625 a >50km del punto, se descarta
- Prompt IA: Instrucción explícita de ignorar fuentes geográficamente incoherentes

## Archivos implicados
- `src/domains/content/components/DocumentFocusView.tsx` — lógica de reconciliación al integrar/crear itinerario
- `supabase/functions/batch-enrich/index.ts` — herencia de enriquecimiento de gemelos
- `supabase/functions/enrich-location/index.ts` — filtro geográfico de fuentes

---

# Rutas importadas: solo lectura

Las rutas que provienen de archivos GPS importados (GPX, KML con tracks, etc.) son **inmutables**:
- Se identifican por tener `sourceDocumentId` (campo `route_preferences.documentId`)
- **No** se pueden editar en el Route Builder
- **No** se muestran botones de edición (Pencil) — se muestra un icono de candado (Lock)
- Se muestra un badge "GPS" para distinguirlas visualmente
- Sí se pueden **reordenar** dentro de un itinerario
- Sí se pueden **eliminar**
- Sí se pueden **mostrar/ocultar** en el mapa
- Al hacer clic en una ruta importada desde el mapa, solo se selecciona visualmente (no abre el builder)
