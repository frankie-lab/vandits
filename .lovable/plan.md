
## Fase 1: Selección inteligente de transporte (no requiere cambios en el modelo)
- Crear edge function `ai-route-advisor` que, dado un segmento A→B, use Lovable AI para recomendar el mejor modo de transporte según: distancia, geografía (¿hay mar?), perfil del viajero, y modos disponibles.
- Integrar en el flujo de cálculo actual como paso previo o posterior.

## Fase 2: Planificación por jornadas ✅ (completada)
- Edge function `ai-journey-planner` que divide viajes largos en jornadas diarias realistas.
- Componente `JourneyPlanner` integrado en RouteBuilder, visible automáticamente en viajes > 4h de conducción.
- Sugiere paradas para dormir, comer, puntos de interés y tipo de alojamiento adaptado al perfil.

## Fase 3: Sugerir paradas intermedias (requiere ampliar modelo A→B)
- Ampliar el modelo de rutas para soportar waypoints intermedios opcionales.
- La IA sugiere POIs interesantes entre A y B según el perfil (aventurero, cultural, gastronómico...).
- El usuario puede aceptar/rechazar cada sugerencia.

## Fase 4: Optimizar orden de paradas
- Cuando hay múltiples waypoints, la IA resuelve el orden óptimo.
- Tiene en cuenta no solo distancia sino también horarios, jornadas, y preferencias.

---

**Tecnología:** Lovable AI (Gemini Flash) para todas las fases. Sin API keys adicionales.

**¿Empezamos por la Fase 1 (selección inteligente de transporte)?**
