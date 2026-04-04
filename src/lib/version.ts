// VANDITS Application Version
// Consolidated version 1.1.0 - January 2026

export const APP_VERSION = '1.1.0';
export const APP_NAME = 'VANDITS';
export const APP_BUILD_DATE = '2026-01-18';

export const VERSION_INFO = {
 version: APP_VERSION,
 name: APP_NAME,
 buildDate: APP_BUILD_DATE,
 features: [
 'Importación multi-formato (KML, GPX, GeoJSON, CSV)',
 'Enriquecimiento IA con Gemini',
 'Geocodificación automática (Nominatim)',
 'Detección de duplicados configurable',
 'Sistema de visitas verificadas con GPS/EXIF',
 'Grados de relevancia (Veterano, Consolidado, Confirmado, Reciente)',
 'Notas personales por ubicación',
 'Galería de imágenes',
 'Búsqueda semántica',
 'Filtrado jerárquico (geografía, clasificación, etiquetas)',
 'Mapa interactivo con clustering y heatmap',
 'Sistema de seguimiento social',
 'Perfiles de usuario',
 'Panel de administración',
 'Layout unificado de paneles laterales',
 ],
 changelog: `
## v1.1.0 (2026-01-18)
- Layout unificado: buscador superior y paneles (Buscar y Filtrar, Ubicaciones) ahora comparten el mismo ancho
- Búsqueda IA integrada con input a ancho completo
- Mejoras de consistencia visual en paneles laterales
- Posicionamiento dinámico de paneles cuando se muestran juntos

## v1.0.0 (2026-01-17)
- Sistema completo de gestión de ubicaciones geográficas
- Enriquecimiento automático con IA (fichas técnicas, imágenes, índice de interés)
- Verificación de visitas mediante GPS del dispositivo o fotos geoetiquetadas
- Grados de relevancia basados en antigüedad de verificación
- Extracción automática de datos EXIF de fotos
- Interfaz de mapa con popups enriquecidos
- Sistema de filtrado avanzado
- Exportación a múltiples formatos
- Gestión de visibilidad (público/seguidores/privado)
- Panel de administración con roles y permisos
 `,
};

/**
 * Returns a formatted version string for display
 */
export function getVersionDisplay(): string {
 return `${APP_NAME} v${APP_VERSION}`;
}

/**
 * Returns full version info for about dialogs
 */
export function getFullVersionInfo(): string {
 return `${APP_NAME} v${APP_VERSION} (${APP_BUILD_DATE})`;
}
