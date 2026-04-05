
## Plan: Sistema de Preferencias de Ruta Avanzadas

### Fase 1: Base de datos — Dimensiones de vehículo
- Añadir columnas a `transport_modes`: `width_m`, `height_m`, `length_m`, `weight_kg` (valores por defecto por tipo)
- Añadir columnas a `user_transport_modes`: `custom_width_m`, `custom_height_m`, `custom_length_m`, `custom_weight_kg` (override del usuario)
- Poblar datos realistas para cada modo de transporte

### Fase 2: Componente de Preferencias — `RoutePreferences.tsx`
UI organizada en secciones colapsables dentro del Dialog existente:

**Grupo 1: Vías y Circulación** (activo)
- Prioridad de vía: autopistas peaje, autopistas gratuitas, nacionales, regionales, locales, caminos rurales, vías no motorizadas
- Cada tipo con toggle + peso (slider 0-10)

**Grupo 2: Objetivos de Optimización** (activo → afecta Travel Advisor)
- Minimizar tiempo / coste / consumo / riesgo
- Maximizar comodidad / paisaje
- Sliders de peso relativo

**Grupo 3: Tu Vehículo** (activo)
- Dimensiones del vehículo seleccionado (ancho, largo, alto, peso)
- Valores por defecto de transport_modes, editables por el usuario
- Alertas automáticas si el vehículo excede restricciones

**Grupo 4: Restricciones** (visual, parcialmente activo)
- Evitar peajes ✓
- Evitar autopistas ✓
- Evitar centros urbanos
- ZBE (Zonas Bajas Emisiones) 🔜
- Restricciones altura/peso/longitud (basado en dimensiones del vehículo)

**Grupo 5: Preferencias del Viajero** (activo → alimenta Travel Advisor)
- Preferir rutas escénicas ✓
- Evitar conducción nocturna
- Autonomía y repostaje (intervalo máx. entre paradas)
- Pernocta integrada (camper/autocaravana)

**Grupo 6: Condiciones** (visual, próximamente)
- Tráfico (tiempo real / histórico) 🔜
- Meteorología 🔜
- Estado del firme 🔜
- Terreno (pendiente, sinuosidad) 🔜

**Grupo 7: Costes** (parcialmente activo)
- Peajes
- Combustible estimado
- Ferries
- Aparcamiento 🔜

**Grupo 8: Multimodalidad** (activo)
- Ya implementado: modos aceptados en ruta

**Grupo 9: Experiencia** (activo → Travel Advisor)
- Interés paisajístico
- Densidad de puntos de interés
- Calidad de la experiencia

### Fase 3: Persistencia
- Guardar preferencias globales en `localStorage` (defaults del usuario)
- Guardar preferencias por ruta en columna `route_preferences jsonb` en tabla `routes`

### Notas
- Las secciones marcadas 🔜 se muestran deshabilitadas con badge "Próximamente"
- Las preferencias activas se pasan al motor de cálculo (OSRM) y al Travel Advisor
- Las dimensiones del vehículo generan alertas visuales pero no bloquean
