
## Motor de Recomendación de Rutas Multimodales

### Arquitectura (5 módulos separados)

#### 1. **Modelo de datos de modos de transporte**
- Tabla de referencia `transport_modes` con los 10+ modos (mochilero, moto propia, moto alquiler, coche propio, coche alquiler, barco propio, barco alquiler, ferry, avión línea, avión privado)
- Cada modo con datos base: velocidad media, coste/km, confort, flexibilidad, autonomía, riesgo, etc.
- Tabla `travel_profiles` con perfiles predefinidos (económico, rápido, aventura, escénico, etc.)

#### 2. **Motor de scoring (Edge Function `score-routes`)**
- Recibe: origen, destino, etapas intermedias, preferencias del usuario (pesos de cada criterio)
- Genera combinaciones de modos viables para cada tramo
- Calcula para cada combinación:
  - Coste total estimado (combustible, peajes, billetes, alquiler, seguros, etc.)
  - Tiempo total real (trayecto + esperas + accesos + transbordos)
  - Puntuación de flexibilidad, autonomía, comodidad, riesgo
- Aplica scoring ponderado según las prioridades del usuario
- Devuelve ranking ordenado

#### 3. **Módulo de explicación IA (Edge Function `explain-routes`)**
- Recibe el ranking del motor de scoring
- Usa Lovable AI (Gemini) para generar explicación razonada en lenguaje natural
- Compara ventajas/inconvenientes de cada alternativa
- Adapta la explicación al perfil de viaje del usuario

#### 4. **UI: Panel de Recomendaciones (nuevo componente)**
- Formulario: origen, destino, etapas, duración máx, presupuesto máx
- Sliders para ponderar criterios (coste, tiempo, libertad, comodidad, aventura)
- Perfiles rápidos predefinidos (botones: "Económico", "Rápido", "Aventurero", etc.)
- Cards de resultados con scoring visual (radar chart), desglose de costes y tiempos
- Explicación IA desplegable en cada card

#### 5. **Integración con Route Builder existente**
- Botón "Analizar alternativas" en el Route Builder actual
- Al pulsarlo, toma los waypoints actuales y lanza el análisis
- Permite aplicar una alternativa directamente al itinerario

### Fases de implementación

1. **Fase A**: Tablas de referencia + tipos TypeScript + Edge Function `score-routes` con datos estimados
2. **Fase B**: Edge Function `explain-routes` con Lovable AI
3. **Fase C**: Panel UI de recomendaciones
4. **Fase D**: Integración con Route Builder + radar charts

### Preparado para futuro
- Los datos de referencia por modo son editables (tablas en BD)
- Estructura preparada para inyectar datos reales de APIs externas
- Sistema de pesos completamente configurable
