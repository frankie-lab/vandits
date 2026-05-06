# Plan: validar y corregir visibilidad real de colecciones en el mapa

## Objetivo
Asegurar que, si una colección tiene el ojo apagado en el panel, sus puntos no sigan apareciendo en el mapa global, y confirmar además que el anillo/color de colección solo se aplique a colecciones visibles.

## Qué voy a hacer
1. **Verificar la cadena completa de visibilidad**
   - Revisar dónde el panel cambia el estado del ojo.
   - Confirmar cómo ese cambio fuerza el recálculo de los puntos visibles del mapa.
   - Detectar si el problema está en el filtrado de datos o solo en el render de marcadores ya montados.

2. **Corregir el punto exacto donde se rompe**
   - Si el store no recalcula correctamente, ajustar el disparador central.
   - Si el mapa conserva marcadores antiguos aunque el filtro cambie, corregir la sincronización de markers/layers.
   - Mantener la lógica transversal actual: catálogo visible por defecto, privadas ocultas por defecto, persistencia solo por sesión.

3. **Validar color y ocultación juntos**
   - Confirmar que una colección visible sí puede teñir el anillo de sus puntos.
   - Confirmar que una colección oculta no aporta ni visibilidad ni color.
   - Verificar que el color base del centro del marcador no cambie.

## Resultado esperado
- Ojo apagado: los puntos exclusivos de esa colección desaparecen del mapa global.
- Ojo encendido: reaparecen solo para esa sesión.
- El color/anillo de colección solo aparece cuando esa colección está visible.
- No se alteran las reglas existentes de aprobación, catálogo ni paleta base de estado.

## Detalles técnicos
- Archivos candidatos principales:
  - `src/domains/content/lib/collection-visibility.ts`
  - `src/domains/content/lib/document-visibility.ts`
  - `src/domains/content/store/locations-store.ts`
  - `src/components/LocationMap.tsx`
- Mantendré el enfoque transversal ya definido en memoria: helper central, sin parches puntuales por componente.