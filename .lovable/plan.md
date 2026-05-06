# Persistencia "sesión = login" para visibilidad de colecciones + arreglo del anillo

## Problemas a resolver

### 1. Visibilidad se pierde al refrescar
Hoy `state.visible` vive solo en memoria (`src/domains/content/lib/collection-visibility.ts`). Cualquier `F5` la reinicia. Definimos: **sesión = login**, debe sobrevivir al refresh y reiniciarse solo al cerrar sesión.

### 2. El anillo de la colección tapa el marcador
En `src/index.css:317-324` la regla `.collection-tint-ring` usa `inset: 0` con `border: 2px`. Sobre un marcador de ~14 px el borde se dibuja DENTRO del SVG y oculta el centro (paleta de estado). Por eso en la captura "todo se ve morado" en vez de centro verde/gris/naranja con anillo morado.

## Cambios

### A. Persistir visibilidad en localStorage por usuario
En `src/domains/content/lib/collection-visibility.ts`:
- Añadir clave `vandits.collection-visibility.v1.<userId>` en localStorage que guarda `string[]` con los IDs de colecciones VISIBLES (no las apagadas, para no inflar al crear nuevas).
- En `initSessionCollectionVisibility(userId)`:
  - Si existe la clave: hidratar `state.visible` solo con las colecciones presentes en la lista persistida.
  - Si NO existe (primer login en este dispositivo): inicializar TODAS visibles (comportamiento actual) y guardar.
- Tras cualquier `toggleCollectionVisibility` / `clearAllCollectionVisibility`: persistir el array actualizado.
- En `resetSessionCollectionVisibility()` (que se llama en logout): borrar también la clave del usuario actual.
- Nuevas colecciones creadas tras la hidratación: añadirlas como visibles por defecto y persistir (mantiene la regla "todas inician visibles").

### B. Anillo POR FUERA del marcador
En `src/index.css`:
```css
.collection-tint-ring {
  position: absolute;
  inset: -4px;
  border-radius: 9999px;
  border: 2px solid var(--collection-tint, #6b7280);
  pointer-events: none;
  box-sizing: border-box;
}
```
Esto deja intacto el centro del SVG (paleta de estado) y dibuja el anillo del color de la colección alrededor.

### C. Verificación
1. Encender/apagar varios ojos, refrescar (F5) → la visibilidad se mantiene exactamente igual.
2. Cerrar sesión y volver a entrar → todas las colecciones aparecen visibles.
3. Crear nueva colección → nace visible y persiste.
4. Con varias colecciones encendidas, los marcadores muestran centro coloreado por estado y anillo del color de su colección.

## Fuera de alcance
- No tocamos `isLocationVisibleInGlobalMap` ni la lógica de membresía catálogo.
- No cambiamos rutas (su tint ya funciona).
- Si un punto pertenece a varias colecciones visibles, se mantiene el comportamiento actual (un único anillo del primer color). Si quisieras N anillos concéntricos lo planteamos en una iteración aparte.

## Memoria a actualizar
`mem://logic/collections/visibility-and-styling`: añadir "Persistencia: localStorage por userId, sobrevive a refresh, se limpia en logout".
