# VANDITS v1.5.0

<!--
  ┌──────────────────────────────────────────────────────────────┐
  │ VERSION SoT: src/lib/app-version.ts (APP_VERSION).           │
  │ The title above, the badge below, and the top changelog      │
  │ entry MUST match APP_VERSION exactly. CI parity test:        │
  │ `src/test/version-parity.test.ts`. Use                       │
  │ `bun scripts/release/bump-version.ts <patch|minor|major>`    │
  │ to roll a release — never edit by hand.                      │
  └──────────────────────────────────────────────────────────────┘
-->

<div align="center">

![VANDITS Logo](https://img.shields.io/badge/VANDITS-v1.5.0-blue?style=for-the-badge)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Cloud-3ECF8E?style=flat-square&logo=supabase)

**Gestor de ubicaciones geográficas con enriquecimiento IA**

[Documentación](./docs/) · [Histórico completo de versiones](./docs/releases/version-history.md) · [Política de versionado](./docs/versioning.md)

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

Ver [`docs/`](./docs/) para documentación técnica completa.

### Documentación de gobernanza

- [Política de versionado](./docs/versioning.md)
- [Histórico completo de versiones](./docs/releases/version-history.md) (fuente única de verdad del changelog)
- [Deuda técnica priorizada](./docs/tech-debt.md)

## 📝 Changelog (últimas 5 versiones)

> El changelog canónico vive en
> [`docs/releases/version-history.md`](./docs/releases/version-history.md).
> Esta sección es un extracto cronológico estrictamente inverso de las 5
> versiones más recientes, sincronizado por
> `scripts/release/bump-version.ts` y verificado por
> `src/test/version-parity.test.ts`.

### v1.5.0 (2026-05-24)
- PR-IDENTITY-ROOT-PERSIST-1: persistencia A/B/C/D en locations (columna identity_root_status + identity_skip_reason + trigger BEFORE INSERT/UPDATE + backfill 5447 filas + índice parcial). Mirror SQL del clasificador Deno/cliente con paridad de orden de decisión y canon ISO2.

### v1.4.6 (2026-05-24)
- PR-IDENTITY-ROOT-DOC-1: contract A/B/C/D doc DRAFT→ACTIVE reflejando runtime ya materializado (Deno SoT + cliente espejo + fixtures + parity test + filtro UI + partición salud)

### v1.4.5 (2026-05-24)
- Versioning hardening: SoT única en `src/lib/app-version.ts`, parity test en CI
  (`src/test/version-parity.test.ts`), script `scripts/release/bump-version.ts`,
  archivado de doc legacy `VANDITS-v2.0-DOCUMENTATION.md`.
- Eliminado el campo `changelog` hardcodeado de `src/lib/version.ts` que
  hacía que agentes externos (Claude, Copilot) leyeran `v1.1.1` como versión
  actual. Causa raíz del despiste cerrada.
- NO toca runtime, schema, RBAC, popups, mapa, edge functions.

### v1.4.4 (2026-05-22)
- PR-INLINE-3.1 — el footer de "Con deuda" deja de abrir
  `HealthRepairPreviewDialog` cuando `repairableCount=0`. Primary dinámico:
  Reparar N / Geo Maintenance (B + capability) / Exportar.
- "Más acciones": Abrir en mapa (`requestSubsetFit`), Geo Maintenance subgrupo B,
  Exportar no reparables.

### v1.4.3 (2026-05-22)
- PR-INLINE-3 — Mantener → Con deuda opera inline; "Resolver deuda" abre
  directamente el modal de confirmación. `DebtResolutionPanel` sale del flujo
  principal.

### v1.4.2 (2026-05-22)
- DebtResolutionPanel Fase 1 — subvista lateral "Resolver deuda" en Buscar y
  Filtrar; el modal queda como fallback/confirmación.

### v1.4.1 (2026-05-22)
- Root Status B → Geo Maintenance scoped — bridge UX/operativo entre el
  triage y el panel de mantenimiento; sin escritura desde el modal.

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
