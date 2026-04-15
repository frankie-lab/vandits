

# Plan: Verificar y corregir la estructura del itinerario "SS24 Avila Nevando"

## Diagnostico

La ruta "SS24 Avila Nevando" **no se creo como itinerario**. Es una ruta plana sin estructura padre-hijo:

```text
Galicia (correcto):
  Parent: "2020 - Carnavales - Galicia" (multimodal)
    Child 0: Ruta 13 (driving)
    Child 1: Ruta 13 (driving)
    ... 6 segmentos con segment_position

SS24 Avila (problema):
  Standalone: "SS24 Avila Nevando" (driving, 2 waypoints)
  Sin parent_route_id, sin hijos, sin segment_position
```

Esto ocurre porque la ruta fue importada directamente desde el GeoJSON como ruta individual, no a traves del flujo "Anadir como itinerario" del DocumentFocusView.

Para que funcione igual que Galicia, hay que ejecutar el flujo de "Anadir como itinerario" desde el documento del SS24. Esto:
1. Creara un parent route (contenedor multimodal)
2. Vinculara la ruta existente como child con `segment_position: 0`
3. Creara waypoints para cada ubicacion del documento
4. Ejecutara el auto-enriquecimiento si esta activo

## Opciones

**Opcion A — Manual**: Abrir el documento "SS24 Avila Nevando" en el panel lateral, usar el boton "Anadir como itinerario" para crear la estructura correcta.

**Opcion B — Automatizar**: Modificar el codigo para que al importar un documento con rutas, siempre se cree automaticamente un itinerario padre, incluso si solo hay una ruta. Esto garantizaria paridad con Galicia en todas las futuras importaciones.

## Cambios para Opcion B (recomendada)

### 1. `src/domains/content/components/DocumentFocusView.tsx`
- En `handleAddAsItinerary`, el flujo ya crea un parent y vincula rutas hijas (linea 703-711)
- El problema no esta en el codigo actual sino en que esta ruta se creo **antes** de que existiera este flujo, o se importo sin pasar por el
- No se requiere cambio de codigo; el flujo actual ya es correcto para nuevas importaciones

### 2. Reparar la ruta existente (migracion puntual)
- Ejecutar una operacion en BD para crear un parent itinerary para "SS24 Avila Nevando" y vincularla como child
- O bien: eliminar la ruta actual y reimportar el documento usando "Anadir como itinerario"

## Resultado esperado

- Todas las rutas importadas desde documentos tendran estructura padre-hijo con `segment_position`
- El panel de Itinerarios mostrara el desplegable con segmentos numerados
- La ruta SS24 tendra la misma estructura que Galicia

