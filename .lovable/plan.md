## Contexto

Al filtrar por **Explorador Alpha** desde `UsersSidebar`, el mapa muestra 0 marcadores aunque la BD confirma que tiene **7 POIs publicables** (5 `followers` + 2 `public`, todos en Sevilla `~37.39,-5.98`, enriquecidos, geo `ok`, `is_approved=true`). Las RLS (`can_view_location`, `can_view_user_documents`) permiten al seguidor leer tanto el documento como las locations. Por tanto el cuello de botella no está en BD ni RLS, está en el cliente, y necesitamos saber **en qué paso del pipeline se quedan**.

Como tú no quieres pegar snippets en consola, propongo que sea Lovable quien añada una traza temporal y autoexplicativa que se imprima sola al activar el filtro. Tú solo abres la consola del preview y me lees una línea.

## Cambio propuesto

**`src/domains/content/store/locations-store.ts` — `getFilteredLocations`**

Cuando `filters.filterByUserId` esté activo, imprimir UNA sola línea agrupada (`console.groupCollapsed`) con el embudo:

```
[user-filter funnel] uid=ec870c6b… (Explorador Alpha)
  documents_total: N
  documents_of_uid: N        ← ¿llega su documento?
  annotated_total: N
  annotated_of_uid_via_owner: N      ← match por loc.ownerUserId
  annotated_of_uid_via_doc: N        ← match por _docUserId (fallback legacy)
  passed_visibility_global: N        ← isLocationVisibleInGlobalMap
  passed_shareable_boundary: N       ← isShareablePoi (gate seguidos)
  final_filtered: N                  ← lo que pinta el mapa
```

La traza:
- Se ejecuta solo si `filterByUserId !== null` (no contamina log normal).
- No cambia ningún comportamiento, solo lee las mismas estructuras que ya usa el matcher.
- Es **temporal**: pensada para esta sesión de debugging; la quitaremos cuando confirmemos la causa.

## Cómo lo usarás

1. Aplica el cambio.
2. En el preview, abre la consola (F12 → Consola).
3. Aplica el filtro por Explorador Alpha en la sidebar de usuarios.
4. Verás una línea "[user-filter funnel]…" — pégamela aquí.

Con esos números sabré inmediatamente si el problema es:
- **A.** Su documento no se descarga (`documents_of_uid: 0`) → bug de RLS o realtime.
- **B.** El doc llega pero sin POIs (`annotated_of_uid_via_*: 0`) → mismatch entre `loc.document_id` y `doc.id`, o `doc.userId` mal mapeado.
- **C.** Llegan pero se caen en visibilidad (`passed_visibility_global` baja a 0) → `isLocationVisibleInGlobalMap` los descarta (típicamente `is_approved=false`, pero en BD están `true`).
- **D.** Llegan pero se caen en `isShareablePoi` (`passed_shareable_boundary: 0`) → bug en el mapeo de `enrichedData.descripcion`, `geoHealth` o `visibility` desde `dbLocationToGeoLocation`.
- **E.** Pasan todo pero `final_filtered: 0` → bug en el step `filterByUserId` del matcher (resolver de owner roto).

## Por qué este enfoque y no otro

- **No tocamos lógica de filtrado** — solo añadimos lectura/log. Cero riesgo de regresión.
- **No requiere que tú pegues nada** — solo leer una línea.
- **Es transversal** — funciona para cualquier usuario que filtres, no solo Alpha.
- Una vez identificada la causa exacta, la siguiente iteración será un fix quirúrgico al paso concreto que falle (probablemente B o D — son los más frecuentes en este tipo de pipeline).

## Detalles técnicos

- Archivo único modificado: `src/domains/content/store/locations-store.ts`.
- Inserción ~10 líneas dentro de `getFilteredLocations`, justo al inicio cuando `filterByUserId` está set, usando los arrays intermedios ya existentes (`source` antes y después de cada filter).
- Sin nuevas dependencias, sin migraciones, sin cambios en UI.
- Sin memoria a actualizar (es debugging puntual, no una norma del producto).
