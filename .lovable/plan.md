
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

# Plan de mejoras: Rendimiento + Funcionalidad + Mantenibilidad

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
