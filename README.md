# VANDITS v1.2.8

<div align="center">

![VANDITS Logo](https://img.shields.io/badge/VANDITS-v1.2.8-blue?style=for-the-badge)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Cloud-3ECF8E?style=flat-square&logo=supabase)

**Gestor de ubicaciones geográficas con enriquecimiento IA**

[Demo](#) · [Documentación](./VANDITS-v2.0-DOCUMENTATION.md) · [Changelog](#changelog)

</div>

---

## ✨ Características

- 🗺️ **Mapa interactivo** con Leaflet, clustering y heatmap
- 🤖 **Enriquecimiento IA** con Google Gemini (fichas técnicas, imágenes, índice de interés)
- 📍 **Verificación de visitas** por GPS o fotos geoetiquetadas
- 🏆 **Grados de relevancia** basados en antigüedad de verificación
- 📁 **Multi-formato** (KML, GPX, GeoJSON, CSV)
- 👥 **Sistema social** con seguimiento de usuarios
- 🔒 **Control de visibilidad** (público/seguidores/privado)
- 🛡️ **Panel de administración** con roles y permisos

## 🚀 Inicio Rápido

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/vandits.git
cd vandits

# Instalar dependencias
npm install

# Iniciar desarrollo
npm run dev
```

## 🏗️ Stack Tecnológico

| Categoría | Tecnología |
|-----------|------------|
| Frontend | React 18, TypeScript, Vite |
| Estilos | Tailwind CSS, shadcn/ui |
| Estado | Zustand |
| Mapas | Leaflet, leaflet.markercluster |
| Backend | Supabase (Lovable Cloud) |
| IA | Google Gemini via Lovable AI |
| Animaciones | Framer Motion |

## 📊 Estado actual

Proyecto en evolución activa. En lugar de contar tablas, componentes o edge functions —cifras frágiles que envejecen mal entre PRs—, mantenemos una foto cualitativa:

- Arquitectura por dominios (Identity, Content, Privacy, Social Graph, Routes, Discovery).
- Backend gestionado vía Lovable Cloud (Supabase) con RLS y edge functions desplegadas automáticamente.
- BackOffice con sidebar agrupado por dominio y matriz RBAC canónica por capability × rol.
- Mapa con pipeline POI canónico (`resolvePoiSource → … → createCustomIcon`) y popup canónico único.
- Importación multi-formato (KML/GPX/GeoJSON/CSV + scrapers) con lifecycle por canal.

Para detalle vivo ver `docs/audits/` y las memorias del proyecto. Para deuda técnica priorizada ver [`docs/tech-debt.md`](./docs/tech-debt.md).

## 🔐 Sistema de Visitas Verificadas

| Método | Descripción |
|--------|-------------|
| 📍 GPS | Check-in estando a menos de 500m |
| 📷 EXIF | Subir foto con geolocalización |

### Grados de Relevancia
- 🥇 **Veterano**: > 3 años
- 🥈 **Consolidado**: 1-3 años
- 🥉 **Confirmado**: 3 meses - 1 año
- 🆕 **Reciente**: < 3 meses

## 📄 Documentación

Ver [VANDITS-v2.0-DOCUMENTATION.md](./VANDITS-v2.0-DOCUMENTATION.md) para documentación técnica completa.

### Documentación de gobernanza

- [Política de versionado](./docs/versioning.md)
- [Histórico reconstruido de versiones](./docs/releases/version-history.md)
- [Deuda técnica priorizada](./docs/tech-debt.md)

## 📝 Changelog

### v1.2.8 (2026-05-19)
- ✅ Segunda tanda de eventos globales tipados de bajo riesgo.
- ✅ Migración de `duplicate-threshold-changed`, `icon-library-changed` y `personal-categories:reload`.
- ✅ Deuda de eventos globales continúa en progreso con cobertura ampliada.

### v1.2.7 (2026-05-19)
- ✅ Helper tipado inicial para eventos globales (`src/lib/global-events.ts`).
- ✅ Migración de hooks extraídos de `Index.tsx` al helper tipado.
- ✅ Deuda de eventos globales pasa a estado en progreso.

### v1.2.6 (2026-05-19)
- ✅ Tercera extracción incremental de orquestación desde `Index.tsx` (`useIndexGlobalEvents` + `useRoutePanelBridge`).
- ✅ Deuda técnica de responsabilidad de `Index.tsx` marcada como resuelta.

### v1.2.5 (2026-05-19)
- ✅ Segunda extracción incremental de orquestación desde Index.tsx (`usePendingValidationEvents`).

### v1.2.4 (2026-05-19)
- ✅ Primera extracción incremental de orquestación desde Index.tsx (`useWelcomeCardEvents`).

### v1.2.3 (2026-05-19)
- ✅ Tests unitarios para gramática visual de puntos (enriched/imported/empty).
- ✅ Deuda técnica de point visual state marcada como resuelta.

### v1.2.2 (2026-05-19)
- ✅ Gobernanza de versiones formalizada.
- ✅ Política SemVer propia de Vandits añadida en `docs/versioning.md`.
- ✅ Árbol histórico reconstruido añadido en `docs/releases/version-history.md`.
- ✅ Deuda técnica de versionado actualizada.
- ✅ Se establece que cada PR debe declarar impacto de versión: none, patch, minor o major.

### v1.2.1 (2026-04-06)
- ✅ Refinamiento de rutas e itinerarios.
- ✅ Mejoras de alternativas intermodales.
- ✅ Persistencia de configuración de itinerarios, paradas y jornadas.
- ✅ Mejoras de selección de rutas en mapa.
- ✅ Agrupación padre/hijo de rutas.
- ✅ Skeleton de carga para itinerarios guardados.

### v1.2.0 (2026-04-04)
- ✅ Sistema de rutas e itinerarios.
- ✅ `RouteBuilder` y `RoutesListPanel`.
- ✅ Schema de rutas y waypoints.
- ✅ Edge function `calculate-route`.
- ✅ Renderizado de rutas en mapa mediante eventos.
- ✅ Alternativas intermodales iniciales.

### v1.1.1 (2026-04-19)
- ✅ Welcome card adaptativa: onboarding para usuarios nuevos · resumen para usuarios con catálogo
- ✅ Resumen con 4 cifras: Mi catálogo · Total accesible · Seguidos · Seguidores
- ✅ Saludo personalizado con fecha y hora del último acceso
- ✅ Cierre por click fuera de la tarjeta
- ✅ Fix: el conteo de catálogo ya no se ve afectado por filtros del mapa

### v1.1.0 (2026-01-18)
- ✅ Layout unificado de paneles laterales y buscador IA
- ✅ Posicionamiento dinámico de paneles
- ✅ Mejoras de consistencia visual

### v1.0.0 (2026-01-17)
- ✅ Sistema completo de gestión de ubicaciones
- ✅ Enriquecimiento automático con IA
- ✅ Verificación de visitas (GPS + EXIF)
- ✅ Grados de relevancia por antigüedad
- ✅ Sistema social (seguimiento)
- ✅ Panel de administración RBAC
- ✅ Exportación multi-formato
- ✅ Mapa interactivo con popups enriquecidos

## 🛠️ Desarrollo Local

### Requisitos
- Node.js 18+
- npm o bun

### Comandos

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Build de producción
npm run test     # Ejecutar tests
npm run lint     # Linter
```

## 📜 Licencia

Proyecto privado. Todos los derechos reservados.

---

<div align="center">
  <sub>Construido con ❤️ usando <a href="https://lovable.dev">Lovable</a></sub>
</div>
