
## Plan: Sincronizar preferencias de transporte con el motor de rutas

### Estado actual
- El perfil guarda: `travel_profile`, `priority_ranking`, y `user_transport_modes` (con `layer` y `preference`: required/preferred/allowed)
- El RouteBuilder solo usa 2 modos hardcodeados (A pie / Coche) y apenas usa `priority_ranking` para scenic vs fastest
- El TravelAdvisor (score-routes) sí usa weights, excluded_modes y owned_modes — pero está desconectado del RouteBuilder

### Cambios propuestos (mínimos, sin romper nada)

**Paso 1 — Leer preferencias completas en RouteBuilder** (solo lectura, sin tocar lógica existente)
- Cargar `user_transport_modes` con `layer` y `preference` completos
- Cargar `priority_ranking` del perfil
- Almacenar en estado local para uso posterior

**Paso 2 — Ampliar el selector de modo de transporte**
- Reemplazar el array hardcodeado `ALL_TRANSPORT_MODES` por uno dinámico basado en los modos que el usuario tiene activados en su perfil
- Agrupar por las categorías existentes: Autónomo, Vehículo propio, Contratado, Transporte público, Bajo demanda
- Solo mostrar los que el usuario tiene como `is_available = true`

**Paso 3 — Filtrar alternativas según preferencias**
- Al buscar alternativas intermodales (ferry, vuelo), verificar que el usuario las tiene habilitadas en `user_transport_modes`
- Respetar `preference` (required/preferred/allowed) para ordenar las alternativas

**Paso 4 — Ordenar alternativas por priority_ranking**
- Usar el `priority_ranking` del perfil para ponderar y ordenar las alternativas devueltas (coste, tiempo, comodidad, paisaje, flexibilidad, aventura)

### Reglas de seguridad
- NO tocar: `use-routes.ts`, `calculate-route` edge function, `score-routes` edge function, `LocationMap.tsx`
- Cada paso se valida antes de pasar al siguiente
- Si algo falla, se revierte solo ese paso
