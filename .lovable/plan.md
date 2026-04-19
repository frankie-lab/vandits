

## Cambios en la welcome card

Archivo único: `src/components/LocationMap.tsx`.

### 1. Saludo personalizado con "no te vemos desde…"

- Aprovechar `session.user.last_sign_in_at` (ya disponible en el `useEffect` de líneas 574-592, sin query extra) y guardarlo en estado `lastSeenAt`.
- Crear helper local `formatRelativeTime(date)` que devuelva en español:
  - <1 min → "hace un momento"
  - <60 min → "hace N minuto(s)"
  - <24 h → "hace N hora(s)"
  - <7 días → "hace N día(s)"
  - <5 semanas → "hace N semana(s)"
  - <12 meses → "hace N mes(es)"
  - resto → "hace N año(s)"
- Renderizado en línea 1635-1637:
  - Si tenemos nombre **y** lastSeenAt válido y >1 min: `Hola, {name}` + segunda línea pequeña `No te vemos desde hace 3 días`.
  - Si nombre pero sin lastSeen útil (primera sesión): `Hola, {name}` + `Bienvenido a Vandits`.
  - Sin nombre: fallback actual `Bienvenido a Vandits`.

### 2. Lógica de pasos restantes correcta

Hoy ya dice "Te queda un paso" cuando solo falta uno, pero el caso "ninguno hecho" dice "Empieza tu mapa con dos pasos rápidos". Ajustar a una lógica única por contador:

- `stepsLeft = (hasHome ? 0 : 1) + (hasImports ? 0 : 1)`
- Texto:
  - 0 → "Todo listo"
  - 1 → "Te queda un paso"
  - 2 → "Te quedan dos pasos"

### 3. Eliminar "Centro inicial del mapa" → reforzar el lugar

En la card de Home (líneas 1668-1676), cuando `hasHome`:
- Quitar el caps "CENTRO INICIAL DEL MAPA".
- Línea principal grande: `{homeName}` (ej. "Barcelona") como título destacado.
- Subtítulo pequeño debajo: `Centro de tu mapa` (sutil, gris), conservando jerarquía pero dando todo el peso visual al nombre del lugar.

### 4. Archivos vs puntos (lógica correcta)

Hoy la card de "Puntos importados" cuenta `locations.length` (puntos) pero la etiqueta de la versión vacía dice "Importar archivos KML/KMZ/GPX/GeoJSON" — incoherente. Aplicar:

- Calcular también `filesCount = documents.length` (archivos importados reales).
- Estado `hasImports` sigue igual (basado en puntos).
- Cuando `hasImports = true`, mostrar dos métricas en la misma fila:
  - Título: `{filesCount} archivo(s)`
  - Subtítulo: `{importedCount} punto(s)`
- Pluralización española (`archivo`/`archivos`, `punto`/`puntos`) con `toLocaleString('es-ES')`.
- Cuando vacío: mantener CTA actual "Importar archivos · KML, KMZ, GPX o GeoJSON…".

### Resumen visual esperado

```text
        [Compass icon]
        Hola, Frankie
   No te vemos desde hace 3 días

[home]  Barcelona
        Centro de tu mapa            →

[up]    Importar archivos
        KML, KMZ, GPX o GeoJSON…     →
```

(O con datos: "12 archivos / 348 puntos".)

### Notas técnicas

- Sin cambios de BBDD ni nuevas queries: `last_sign_in_at` ya viene en el objeto `session.user` de Supabase.
- Sin tocar `useAuth`, ni componentes externos: cambio aislado en `LocationMap.tsx`.
- Sin nuevas dependencias.

