## Fix: pérdida de puntos por paginación inestable

**Problema**: Catálogo procesa 2270/2452 porque las queries paginadas con `.range()` no tienen `.order()`, así que PostgREST no garantiza orden estable entre páginas → filas saltadas o duplicadas.

**Cambio único** en `src/domains/content/lib/process-imported-document.ts`: añadir `.order('id', { ascending: true })` a las 3 queries paginadas (geocoding, fk-resolve, catalog-match) antes de `.range(from, to)`.

**Resultado**: los 3 procesos verán los 2452 puntos completos sin huecos.