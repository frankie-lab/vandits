## Anillo de colección con grosor variable según zoom

### 1. CSS — usar variable
`src/index.css`, `.collection-tint-ring`:
```css
border: var(--collection-ring-width, 2px) solid var(--collection-tint, #ffffff);
```

### 2. Listener de zoom en LocationMap
`src/components/LocationMap.tsx`, justo después de crear `mapRef.current = L.map(...)`:
- Función `applyRingWidth(zoom)` que escribe `document.documentElement.style.setProperty('--collection-ring-width', '<X>px')`.
- Llamarla una vez con `mapRef.current.getZoom()`.
- `mapRef.current.on('zoomend', () => applyRingWidth(mapRef.current.getZoom()))`.
- En el cleanup del efecto: `off('zoomend', ...)`.

### 3. Escala
| Zoom Leaflet | Vista              | Grosor |
|--------------|--------------------|--------|
| ≤ 5          | Mundo / continente | 1px    |
| 6 – 9        | País / región      | 1.5px  |
| 10 – 12      | Provincia / ciudad | 2px    |
| 13 – 15      | Barrio             | 2.5px  |
| ≥ 16         | Calle              | 3px    |

### Ficheros
- `src/index.css`
- `src/components/LocationMap.tsx`

No se toca lógica de markers, paleta, clusters ni el diálogo.
