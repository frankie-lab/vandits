
# Rediseño Motor de Rutas Multimodal

## Fase 1: Schema de Base de Datos

### 1.1 Ampliar `transport_modes`
Añadir campos: `is_motorized`, `requires_schedule`, `allows_cargo`, `supports_sleep`, `requires_booking`, `max_passengers`, `base_flexibility`, `base_autonomy`, `base_comfort`, `base_risk`, `score_restrictions`, `score_load_capacity`.

Añadir modos que faltan:
- `bicycle` (Bicicleta)
- `public_bus` (Autobús público)
- `train` (Tren)
- `camper_van` (Furgoneta camperizada)
- `motorhome` (Autocaravana)
- `car_caravan` (Coche + Caravana)

Eliminar `backpacker` como modo (pasará a ser estilo de viaje).

### 1.2 Crear `cost_categories`
Tabla de referencia para tipos de coste:
- `fuel`, `tolls`, `tickets`, `rental`, `insurance`, `maintenance`, `port_fees`, `airport_fees`, `parking`, `extra_luggage`, `cancellation`

### 1.3 Crear `transport_mode_costs`
Coste estimado por modo y categoría:
- `transport_mode_id`, `cost_category_id`, `cost_per_km`, `base_cost`, `notes`

### 1.4 Crear `route_analyses`
Tabla para guardar análisis del asesor de viaje:
- `id`, `route_id`, `user_id`, `profile_code`, `weights_snapshot`, `created_at`

### 1.5 Crear `route_analysis_alternatives`
Alternativas generadas por análisis:
- `id`, `analysis_id`, `rank`, `name`, `total_cost`, `total_time_hours`, `total_distance_km`, `scores`, `segments`, `explanation`

### 1.6 Actualizar `travel_profiles`
Añadir campos: `priority_load`, `priority_restrictions`. Renombrar "Mochilero" a estilo de viaje con descripción adecuada.

## Fase 2: Edge Function `score-routes` v2

### 2.1 Carga de costes desglosados
Leer `transport_mode_costs` para calcular coste total como suma de categorías.

### 2.2 Nuevas dimensiones de evaluación
- Score de restricciones legales
- Score de capacidad de carga
- Detección de necesidad de licencias/reservas

### 2.3 Generación mejorada de combinaciones
- Más patrones multimodales (tren+bici, bus+taxi, etc.)
- Considerar capacidad de carga entre tramos
- Validar restricciones legales por modo

### 2.4 Tiempo total real
Modelar esperas, embarques, recogida de vehículos como `setup_time` + `overhead_per_segment`.

## Fase 3: Edge Function `explain-routes` v2

### 3.1 Prompt mejorado
Incluir desglose de costes, restricciones, ventajas e inconvenientes de cada alternativa.

### 3.2 Estructura de explicación
Ventajas, inconvenientes, consejos prácticos, advertencias.

## Fase 4: UI del Asesor en RouteBuilder

### 4.1 Desglose de costes visible
Mostrar combustible, peajes, etc. por separado en cada alternativa.

### 4.2 Filtros de medios permitidos
Checkboxes para excluir/incluir modos específicos.

### 4.3 Persistencia de análisis
Guardar análisis en `route_analyses` para consultarlos después.

## Orden de ejecución:
1. Fase 1 (migraciones) — todo junto
2. Fase 2 (score-routes v2)
3. Fase 3 (explain-routes v2)  
4. Fase 4 (UI)
