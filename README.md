# VANDITS v1.0.0

<div align="center">

![VANDITS Logo](https://img.shields.io/badge/VANDITS-v1.0.0-blue?style=for-the-badge)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Cloud-3ECF8E?style=flat-square&logo=supabase)

**Gestor de ubicaciones geográficas con enriquecimiento IA**

[Demo](#) · [Documentación](./VANDITS-v1.0-DOCUMENTATION.md) · [Changelog](#changelog)

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

## 📊 Estadísticas del Proyecto

- **14 tablas** en base de datos
- **5 Edge Functions** serverless
- **28 componentes** principales
- **7 hooks** personalizados
- **9 parsers/utilidades**

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

Ver [VANDITS-v1.0-DOCUMENTATION.md](./VANDITS-v1.0-DOCUMENTATION.md) para documentación técnica completa.

## 📝 Changelog

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
