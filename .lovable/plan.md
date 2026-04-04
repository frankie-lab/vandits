
## Rediseño: Itinerario basado en etapas editables

### Concepto nuevo
El itinerario se compone de:
1. **Punto de salida** y **punto de regreso** (pueden ser el mismo = ida y vuelta)
2. **Etapas** creadas por el usuario, cada una con:
   - Punto de inicio (automático: fin de la etapa anterior o punto de salida)
   - Punto de fin
   - Paradas intermedias opcionales (reordenables con drag & drop)
   - Límite de horas diarias de desplazamiento propio (a pie, bici, coche) — NO aplica a transportes con horario (bus, avión, ferry)
   - Modo de transporte por tramo

### Flujo del usuario
1. **Setup**: Elige vehículo, punto de salida y punto de regreso
2. **Crear etapas**: Botón "+ Etapa" que crea una nueva etapa vacía
3. **Dentro de cada etapa**: Añadir destinos/paradas, reordenar, definir horas máximas de conducción propia
4. **Cada etapa es un bloque visual** colapsable con su resumen (distancia, duración, paradas)
5. El sistema calcula la ruta de cada etapa por separado
6. Si las horas de una etapa superan el límite, avisa al usuario

### Cambios técnicos
- **RouteBuilder.tsx**: Refactorizar para usar estructura `Stage[]` con waypoints dentro
- **Tipo Stage**: `{ id, name, waypoints[], maxDrivingHours, transportMode }`
- **UI**: Lista de etapas colapsables, cada una con sus waypoints editables
- **Cálculo**: Por etapa, no global
- **Mapa**: Cada etapa con color/label diferenciado

### Lo que se elimina
- Auto-split de etapas por horas (el usuario las crea manualmente)
- Tabs ida/vuelta (todo es secuencial: etapa 1, 2, 3...)
- El concepto "round trip" se reemplaza por: si salida = regreso, la última etapa vuelve al origen
