# Arquitectura actual de Vandits

Estado: documentación inicial — 2026-05-19  

Versión de referencia: v1.2.3

## Objetivo

Describir la arquitectura actual de Vandits como foto operativa del sistema, no como arquitectura ideal.

Este documento no propone refactors ni autoriza cambios estructurales. Sirve como referencia para futuras decisiones sobre eventos globales, `Index.tsx`, `LocationMap.tsx`, popups, rutas, Supabase y dominios.

## Resumen ejecutivo

Vandits es una aplicación React/TypeScript para gestionar ubicaciones geográficas con enriquecimiento IA, verificación de visitas, rutas/itinerarios, importación multi-formato, sistema social y backoffice.

La arquitectura actual combina:

- dominios funcionales bajo `src/domains/**`;
- orquestación principal en `src/pages/Index.tsx`;
- mapa centralizado en `src/components/LocationMap.tsx`;
- estado cliente con Zustand y hooks;
- backend gestionado por Supabase/Lovable Cloud;
- comunicación transversal mediante eventos globales sobre `window`;
- contratos documentados para popups y versionado.

## Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS / shadcn-ui
- Zustand
- Leaflet / leaflet.markercluster
- Supabase / Lovable Cloud
- Google Gemini vía Lovable AI
- Vitest

## Dominios principales

### Identity

Responsable de autenticación, perfil de usuario, preferencias y datos asociados al usuario.

Incluye:

- sesión/autenticación;
- perfil;
- preferencias;
- unidades de medida;
- identidad visual/social.

### Content

Responsable de ubicaciones, documentos, colecciones, enriquecimiento y gramática visual de puntos.

Incluye:

- locations / POIs;
- documentos importados;
- colecciones;
- enriquecimiento IA;
- estado visual `enriched`, `imported`, `empty`.

Referencia:

- `src/domains/content/lib/point-visual-state.ts`
- `src/test/point-visual-state.test.ts`

### Privacy

Responsable de visibilidad, acceso y reglas de exposición de datos.

Incluye:

- privado;
- seguidores;
- público;
- reglas de visibilidad cruzadas con social graph.

### Social Graph

Responsable de usuarios visibles, follow/unfollow, sidebar social y filtros por usuario.

Incluye:

- seguimiento;
- seguidores;
- filtros por usuario;
- identidad visual de owners.

### Routes

Responsable de rutas, itinerarios, waypoints, alternativas intermodales y persistencia de configuración.

Incluye:

- `RouteBuilder`;
- `RoutesListPanel`;
- rutas padre/hijo;
- stages/jornadas;
- alternativas driving/ferry/flight;
- integración con mapa mediante eventos.

### Discovery

Responsable de exploración, filtros, búsqueda, tags, geografía y descubrimiento de puntos.

Incluye:

- filtros;
- tags;
- búsqueda;
- contexto cercano;
- navegación por mapa y catálogo.

## Orquestación principal

`src/pages/Index.tsx` actúa como hub de orquestación de muchos subsistemas.

Responsabilidades actuales:

- coordinar paneles principales;
- abrir/cerrar flujos;
- conectar toolbar, mapa, rutas, importación, perfil y admin;
- escuchar o emitir eventos globales;
- enrutar acciones de popup como `popup-action`.

Riesgo:

`Index.tsx` concentra demasiada coordinación transversal.

Deuda asociada:

- `docs/tech-debt.md` ítem 5.

Criterio futuro:

Extraer progresivamente orquestación a hooks o domain shells. No reescribir de golpe.

## Mapa

`src/components/LocationMap.tsx` concentra la mayor parte de la lógica de mapa.

Responsabilidades actuales:

- instancia Leaflet;
- markers;
- clusters;
- popups;
- capas;
- rutas;
- overlays temporales;
- previews;
- realtime;
- geolocalización;
- cámara/vista;
- eventos de mapa;
- interacción con itinerarios;
- preservación de markers/popup abierto.

Riesgo:

Es el nodo técnico de mayor riesgo. Cualquier refactor debe ser incremental.

Deuda asociada:

- `docs/tech-debt.md` ítem 6.

Criterio futuro:

No abordar como reescritura. Extraer piezas pequeñas manteniendo contratos existentes.

## Popups

El popup de POI tiene contrato canónico documentado.

Referencia:

- `docs/contracts/popup-contract.md`

Principios:

- `LocationMap` es owner de `openPopupLocationId`;
- el handler `popupclose` debe ser único a nivel de mapa;
- `keepIds` preserva marker enfocado o con popup abierto;
- el popup canónico usa slots editoriales y markers DOM estables;
- `popup-action` es el canal global para acciones emitidas desde HTML de popup.

Riesgo:

`popup-action` es un bus crítico. Cambios nuevos deben respetar el contrato de popup.

## Eventos globales

Vandits usa eventos globales sobre `window` como bus transversal.

Referencia:

- `docs/architecture/global-events.md`

Estado actual:

- inventario inicial de unos 75 eventos únicos;
- unos 453 hits relacionados con `dispatchEvent`, `addEventListener`, `removeEventListener` o `CustomEvent`;
- payloads sin tipado central;
- strings inline duplicados;
- prefijos inconsistentes;
- catch-alls como `store-updated` y `reload-locations`.

Riesgo:

Cambiar un evento o su payload puede romper consumidores sin error de compilación.

Deuda asociada:

- `docs/tech-debt.md` ítem 2.

Criterio futuro:

Introducir tipado o wrapper incremental antes de renombrar o eliminar eventos.

## Estado cliente

Vandits usa Zustand y hooks de dominio para estado cliente.

Áreas relevantes:

- locations;
- documentos;
- rutas;
- preferencias;
- filtros;
- realtime;
- visibilidad de capas.

Riesgo:

Parte del estado se propaga por stores y parte por eventos globales. Esto crea duplicidad de canales.

Criterio futuro:

No sustituir eventos por stores de golpe. Primero documentar contratos y migrar por dominio.

## Supabase / Lovable Cloud

Supabase/Lovable Cloud sostiene backend y persistencia.

Responsabilidades:

- auth;
- base de datos;
- RLS;
- edge functions;
- realtime;
- datos de rutas;
- datos de ubicaciones;
- enriquecimiento y procesos auxiliares.

Riesgo:

Los flujos de realtime se traducen a eventos `window`, especialmente en locations.

Criterio futuro:

Mantener clara la frontera entre evento de backend, store cliente y evento global UI.

## Importación y documentos

Vandits soporta importación multi-formato.

Formatos:

- KML;
- GPX;
- GeoJSON;
- CSV;
- scrapers / fuentes externas cuando aplique.

Responsabilidades:

- cargar documentos;
- extraer puntos;
- deduplicar;
- mostrar previews;
- vincular puntos a colecciones;
- enriquecer datos;
- actualizar mapa/listas.

Riesgo:

Importación toca documentos, locations, mapa, colecciones y eventos globales.

## Versionado y release management

La versión canónica actual es v1.2.3.

Referencias:

- `docs/versioning.md`
- `docs/releases/version-history.md`
- `src/lib/app-version.ts`
- `package.json`
- README

Reglas:

- cada PR debe declarar `Version impact`;
- si hay release real, actualizar package, README, UX version y version history juntos;
- las versiones estables deben tener tags Git reales para rollback.

Pendiente operativo:

- tags Git reales para rollback anchors.

## Deuda técnica vigente

Según `docs/tech-debt.md`, tras v1.2.3:

Resuelto:

- versionado y documentación de estado;
- tests de gramática visual de puntos.

Pendiente operativo:

- materializar rollback anchors con tags Git.

Abierto:

- tipado y racionalización de eventos globales;
- foto de arquitectura actual;
- reducción de responsabilidad de `Index.tsx`;
- reducción de responsabilidad de `LocationMap.tsx`.

## No-objetivos

Este documento no:

- propone una arquitectura ideal;
- autoriza refactors;
- sustituye contratos existentes;
- cambia runtime;
- modifica eventos;
- modifica stores;
- modifica `Index.tsx`;
- modifica `LocationMap.tsx`.

## Próximos pasos recomendados

1. Materializar tags Git reales para rollback.
2. Pasar eventos globales de inventario a contrato tipado inicial.
3. Extraer una pieza pequeña de orquestación desde `Index.tsx`.
4. Solo después iniciar extracciones incrementales de `LocationMap.tsx`.
