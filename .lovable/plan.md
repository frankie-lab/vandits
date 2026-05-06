## Objetivo

Alinear los dos flujos de OneDrive con las normas transversales del resto de la app:

1. **Hero/foto** desde OneDrive — debe permitir elegir visibilidad (Privada / Seguidores / Pública), igual que `LocationPhotoUpload`. Hoy se hard-codea `private`.
2. **Validador de visitas** — debe usar el umbral transversal de 250 m (coherente con la regla "Deduplication: 250 m exact match"), no 500 m.

Sin tocar comportamiento de "no crea puntos nuevos".

---

## 1. Hero foto OneDrive con visibilidad

**Archivo:** `src/components/OneDrivePhotoBrowser.tsx`

Estado actual:
- Modo usuario: `update({ user_image_url, user_image_visibility: 'private' })` + `location_photos.insert({ visibility: 'private' })`.
- Modo admin: actualiza `enriched_data.imagen` (imagen oficial pública para todos). Sin selector porque ya es pública por definición.

Cambios:

- Añadir un `Select` (Privada / Seguidores / Pública) al pie del diálogo, **solo visible cuando `isAdminMode === false`**. Reutilizar el patrón visual y los tres valores de `LocationPhotoUpload` (líneas 430-445).
- Inicializar el valor por defecto leyendo `profiles.default_photo_visibility` del usuario (helper ya disponible en el flujo actual de fotos). Fallback `'private'`.
- En `handleSelect`, sustituir el `'private'` literal por el valor seleccionado tanto en `locations.update({ user_image_visibility: <value> })` como en `location_photos.insert({ visibility: <value> })`.
- Texto explicativo bajo el select igual al de `LocationPhotoUpload` ("Solo tú…", "Tus seguidores…", "Cualquiera…").
- Sin cambios en modo admin: la imagen oficial (`enriched_data.imagen`) sigue siendo pública sin selector.

Resultado: la ficha del punto mostrará la imagen Hero **oficial** (visible para todos) y, encima/aparte, la imagen del usuario respetando su visibilidad — exactamente igual que el flujo de subida directa.

---

## 2. Validador de visitas a 250 m

**Archivo:** `src/components/OneDriveVisitValidator.tsx`

Cambios:

- Reemplazar la constante `500` (radio de match) por `250`. Tres ubicaciones a revisar:
  - lógica de matching (~línea 175 donde compara `dist`),
  - copy "radio 500m" en líneas 338 y 471,
  - mensaje "sin coincidencias dentro de 500m" en línea 201.
- Leer el umbral del helper transversal: `profiles.duplicate_threshold_meters` (default 250). Si no se quiere acoplar al campo de duplicados, dejar `250` literal pero documentar en un comentario que se alinea con la norma "Deduplication 250m".

Sin cambios en el resto del flujo (`custom_data.visited`, eventos, etc.).

---

## 3. QA

- Smoke en el browser: abrir punto → "Foto desde OneDrive" → comprobar que aparece el selector de visibilidad y que al guardar se persiste `user_image_visibility` correctamente.
- Validador: reescanear y confirmar que solo aparecen matches a ≤250 m y los textos reflejan el nuevo radio.

---

## Fuera de alcance

- No se crea documento ni se importan fotos como puntos (OneDrive sigue actuando solo sobre puntos existentes).
- No se toca el panel `OneDrivePhotosPanel` (índice/explorar) — no hay foto-→-punto que requiera visibilidad ahí.
- No se añade `CollectionPicker`: confirmado que OneDrive no genera nuevos puntos.
