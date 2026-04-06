
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
