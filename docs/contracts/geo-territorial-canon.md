# Geo-Territorial Canon (v2)

> **Status:** Canon conceptual. v1 (territorial) operativo en helpers existentes; v2 (containment) **declarativo, sin implementación**. No usar para inferir comportamiento operativo.

Dogma:

- **Structure is universal. Labels are local.**
- **Territorial hierarchy says WHERE.**
- **Containment hierarchy says INSIDE WHAT.**
- **Same coordinates do not imply same POI.**

---

## Parte A — Jerarquía territorial (v1, recap)

### A.1 Niveles universales

| Nivel | Código     | SoT actual                           |
| ----- | ---------- | ------------------------------------ |
| 0     | planet     | implícito                            |
| 1     | continent  | `admin_areas` (level=continent)      |
| 2     | country    | `admin_areas` (ISO-3166-1)           |
| 3     | admin1     | `admin_areas` ≈ `locations.region_id`|
| 4     | admin2     | `admin_areas` ≈ `locations.zone_id`  |
| 5     | admin3     | `admin_areas` ≈ `locations.admin3_id`|
| 6     | locality   | `admin_areas` ≈ `locations.locality_id` |
| 7     | sublocality| `admin_areas` ≈ `locations.sublocality_id` |
| 8     | poi        | `locations`                          |

### A.2 Aliases legacy

- `region_id` → `admin1` (comunidad autónoma / state / región)
- `zone_id` → `admin2` (provincia / county / département) **— nombre histórico engañoso, hoy contiene provincia**
- `admin3_id` → `admin3` (comarca / area)
- `locality_id` → `locality` (municipio)
- `sublocality_id` → `sublocality` (barrio / parroquia)

Renombrar columnas queda como deuda; el contrato fija el mapping conceptual.

### A.3 Local labels (resumen)

| País | admin1 | admin2 | admin3 | locality | sublocality |
|------|--------|--------|--------|----------|-------------|
| ES   | Comunidad autónoma | Provincia | Comarca / área | Municipio | Barrio / parroquia |
| FR   | Région | Département | Arrondissement | Commune | Quartier |
| US   | State | County | — | City | Neighborhood |
| UK   | Country/Region | County | District | Town/City | Ward |
| IT   | Regione | Provincia | — | Comune | Frazione |
| DE   | Bundesland | Regierungsbezirk | Landkreis | Gemeinde | Ortsteil |
| PT   | Região | Distrito | Concelho | Freguesia | — |

Helper objetivo: `getAdminLevelLabel(countryCode, level, locale)`. Cualquier país no listado cae al label universal (`admin1`/`admin2`/…) hasta que se modele explícitamente.

### A.4 Editorial vs administrativo

- Áreas editoriales (Costa Brava, Camí de Cavalls, Camino Francés) **NO** son `admin_areas`.
- Viven en `collections` o futuro `editorial_areas`.
- Prohibido mezclar `admin_areas` con identidad editorial.

---

## Parte B — Place containment hierarchy (v2, conceptual)

> **Banner:** Canon conceptual — sin implementación en esta fase. No usar para inferir comportamiento operativo.

### §B.1 Dogma de los dos ejes

- **Territorial** (admin1…sublocality) responde *¿dónde está?*
- **Containment** (site…room) responde *¿dentro de qué está?*
- Los dos ejes coexisten en todo POI; **nunca** mezclarlos: `building` no es un `admin_level_4`, ni `locality` es un `site`.
- Identidad: **mismas coordenadas ≠ mismo POI**. Una catedral, el Pórtico de la Gloria y un confesionario interior comparten lat/lng prácticamente idénticos y son tres POIs distintos.

### §B.2 Niveles universales de contención

| Nivel | Código     | Aliases               | Ejemplos                                  |
| ----- | ---------- | --------------------- | ----------------------------------------- |
| C0    | `site`     | ≡ `complex`           | Recinto Expo, campus, parque temático     |
| C1    | `building` | —                     | Catedral, Pabellón 7, edificio principal  |
| C2    | `entrance` | —                     | Pórtico de la Gloria, Gate B, Acceso Sur  |
| C3    | `floor`    | —                     | Planta 2, Sótano –1, Mezzanine            |
| C4    | `unit`     | ≡ `venue`             | Sala Goya, Local 12, Restaurante interior |
| C5    | `room`     | ≡ `exhibit`           | Vitrina 4, Cámara Santa, Sala VIP         |
| T     | `poi`      | —                     | Target — cierra la jerarquía              |

Reglas:

- **Skipping permitido.** Un POI puede colgar directo de `site` sin `building`, o de `building` sin `floor`.
- `entrance` es **C2 hermano de `floor`/`unit`**, no metadata del building.
- Un POI puede ser **container y child a la vez** (`is_container` lógico): un building es POI propio y a la vez padre de su pórtico.
- `site` y `complex` son **alias del mismo C0** — el discriminador es semántico, no estructural.

### §B.3 Identidad: por qué coords ≠ POI

Discriminadores ordenados:

1. `placeId` (Google) si existe y persistido en `external_refs.maps.google.placeId`.
2. `placeType` (museum, entrance, exhibit, …).
3. `place_container_path` (cadena root→leaf).
4. `name_canonical + author` (firma del POI editorial).

Si **alguno** difiere, son POIs distintos aunque las coordenadas coincidan dentro de tolerancia GPS.

Ejemplo:

```text
Catedral de Santiago         (C1 building, POI)
└─ Pórtico de la Gloria      (C2 entrance, POI distinto)
    └─ Tímpano central       (C5 room/exhibit, POI distinto)
```

### §B.4 `place_container_path`

- **Calculado**, no nivel. No es columna nueva por nivel; se deriva recorriendo `parent_place_id` hasta raíz.
- **No denormalizado** en columna física en esta fase (puede materializarse en read-model futuro, fuera de alcance).
- **No cycles.** Garantía por validación al escribir `parent_place_id`.
- **Profundidad máxima 6** (C0 → C5 → T). Rechazar inserciones que excedan.
- Representación canónica:

  ```ts
  type PlaceContainerPath = Array<{
    placeId: string;
    level: "site" | "building" | "entrance" | "floor" | "unit" | "room";
    nameCanonical: string;
  }>;
  ```

### §B.5 Mapping local labels por contexto

Los códigos universales son fijos; el label humano depende de contexto (país + tipo de site):

| Contexto      | site             | building          | entrance       | floor       | unit                | room               |
|---------------|------------------|-------------------|----------------|-------------|---------------------|--------------------|
| Genérico ES   | Recinto          | Edificio          | Acceso         | Planta      | Local / Sala        | Sala / Vitrina     |
| Genérico EN   | Site             | Building          | Entrance       | Floor       | Unit                | Room               |
| Museo         | Conjunto museístico | Edificio        | Pórtico / Acceso | Planta    | Sala                | Vitrina / Sección  |
| Religioso     | Recinto sacro    | Templo / Catedral | Pórtico        | Nivel       | Capilla             | Altar / Cámara     |
| Comercial     | Centro comercial | Edificio          | Entrada        | Planta      | Local               | Sección            |
| Transporte    | Estación / Aeropuerto | Terminal     | Puerta / Gate  | Nivel       | Andén / Mostrador   | Sala VIP / Lounge  |
| Hotel         | Resort           | Edificio          | Lobby          | Planta      | Habitación          | Suite / Zona       |
| Estadio       | Complejo deportivo | Estadio         | Puerta         | Tribuna     | Grada / Palco       | Asiento / Zona     |

Helper objetivo (futuro, no implementar ahora): `getContainerLevelLabel(siteContext, level, locale)`.

### §B.6 Aliases legacy y soporte actual

| Concepto v2       | Existe hoy en schema | Notas |
|-------------------|----------------------|-------|
| `site` / `complex` | **No**              | Sin columna ni `place_types.code`. |
| `building`        | Parcial              | `place_types.code` cubre algunos tipos (museum, church, …) pero no como nivel de contención. |
| `entrance`        | **No**               | Hard debt. |
| `floor`           | **No**               | Hard debt. |
| `unit` / `venue`  | **No**               | Hard debt. |
| `room` / `exhibit`| **No**               | Hard debt. |
| `parent_place_id` | **No**               | **Hard debt principal.** Sin esta FK el eje no puede materializarse. |
| `is_container`    | **No**               | Derivable de `EXISTS (parent_place_id = self.id)` una vez exista. |
| `external_refs.maps.google.placeId` | Sí (PR Fase A) | Discriminador de identidad disponible. |

### §B.7 Impacto declarativo por superficie

> No implementar en esta fase. Solo dejar registrado el contrato.

- **Popup.** Slot futuro "Dentro de" listando `place_container_path` con local labels (§B.5). **No se renderiza hoy.**
- **Mapa.** Sin cambio. Containment no afecta zoom canon ni health rings.
- **Búsqueda.** Indexar `container_path[].name_canonical` permitirá matches tipo "Cámara Santa Catedral Oviedo". Fuera de alcance.
- **Dedupe.** La regla actual (250m exact / 1km warn) se extiende conceptualmente a `placeId || (placeType + container_path_hash)`. **Implementación operativa se mueve a PR-DEDUPE separado.**
- **Export/share.** KML/GPX/JSON ganarían `<vandits:container_path>` y `<vandits:container_path_local>`. Fuera de alcance.
- **Resolver geográfico.** `resolve-admin-area` permanece intacto: containment no es admin.

### §B.8 Out of scope / deuda futura

Explícitamente **no resueltos** en esta fase:

- Schema (`parent_place_id`, `is_container`, validación de ciclos, índice de profundidad).
- Dedupe operativo basado en `container_path` (queda en PR-DEDUPE).
- Popup "Dentro de" (sin render, sin placeholder).
- Inferencia automática de containers desde Places API / heurísticas.
- Helpers reales de path (`getContainerPath`, `getContainerLevelLabel`).
- Modelado indoor completo (mapas interiores, coords por floor).
- Cache / read-model denormalizado del container path.
- Migración de URLs largas Google CID a `placeId` canónico.

Cualquiera de estos requiere PR propio con su contrato.

---

## Cambios respecto a contratos previos

- **Nuevo:** Parte B completa (eje contención).
- **Aclarado:** `zone_id` = admin2 = provincia (no zona editorial).
- **Aclarado:** áreas editoriales separadas de `admin_areas`.
- **Sin cambio:** pipeline `resolve-coordinates` / `resolve-admin-area` / FKs existentes.
