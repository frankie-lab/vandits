## Problema

El documento `Web import — www.atlasobscura.com` tiene 18 puntos en BBDD (la tarjeta los cuenta correctamente) pero al hacer "Ver en mapa" no aparece nada. El scraper inserta puntos en background en `public.locations`, pero el cliente solo escucha eventos UPDATE de realtime, no INSERT — así que el store nunca recibe los puntos nuevos hasta que se recarga la página.

## Cambios

### 1. `src/hooks/use-realtime-locations.ts` — añadir handler INSERT
- Suscribir también a `event: 'INSERT'` en cada canal por `document_id`.
- Mapear el registro vía `dbLocationToGeoLocation` y añadirlo al doc correspondiente con `updateDocumentLocations` (idempotente: ignorar si el id ya está).
- Disparar `location-realtime-update` para refrescar mapa/contadores.

### 2. `src/hooks/use-realtime-locations.ts` — canal global de documentos
- Caso clave: cuando el scraper crea un **documento nuevo** durante la sesión, no está en `documentIds` y la suscripción por-doc no lo cubre.
- Añadir un canal único suscrito a `INSERT` en `documents` filtrado por `user_id=eq.<currentUser>`.
- Al recibir un nuevo doc → despachar `reload-locations` (cubierto ya por `useDatabaseSync`).
- Esto resuelve también futuras integraciones (OneDrive, otros scrapers).

### 3. Fallback en `DocumentsPanel.handleViewOnMap`
- Tras hacer `select count` de locations del doc: si `locations.length > 0` pero el store no contiene puntos para ese `docId` (`getAllLocations().filter(l => l._docId === docId).length === 0`), despachar `reload-locations` y esperar antes de hacer `fitBounds` + dispatch del evento de focus.
- Defensa por si el realtime se ha perdido (canal cerrado, reconexión, etc.).

### 4. Memoria
- Actualizar memoria existente sobre realtime para reflejar que ahora se cubren INSERT + nuevos documentos.

## Verificación
- Abrir el doc Atlas Obscura existente (18 puntos): los markers aparecen sin recargar.
- Lanzar un nuevo scrape: el doc aparece en la lista y los puntos se van pintando en vivo.
- Ningún cambio en RLS ni edge functions.