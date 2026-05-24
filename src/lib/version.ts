// VANDITS Application Version — thin re-export.
//
// The canonical Single Source of Truth (SoT) lives in
// `src/lib/app-version.ts`. This module re-exports it and provides
// static metadata (app name, build date, feature list) consumed by
// About dialogs and diagnostics.
//
// IMPORTANT — do NOT add a hardcoded `changelog` field here. The
// changelog SoT is `docs/releases/version-history.md`. The CI parity
// test (`src/test/version-parity.test.ts`) fails the build if any
// `vX.Y.Z` literal reappears in this file.

export { APP_VERSION, APP_VERSION_LABEL } from './app-version';
import { APP_VERSION } from './app-version';

export const APP_NAME = 'VANDITS';
export const APP_BUILD_DATE = '2026-05-24';

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
    'Notas personales por ubicación',
    'Galería de imágenes',
    'Búsqueda semántica',
    'Filtrado jerárquico (geografía, clasificación, etiquetas)',
    'Mapa interactivo con clustering y heatmap',
    'Sistema de seguimiento social',
    'Perfiles de usuario',
    'Panel de administración',
    'Rutas e itinerarios',
    'Curación POI canónica (POI-0 … POI-10)',
  ],
};

/** Returns a formatted version string for display. */
export function getVersionDisplay(): string {
  return `${APP_NAME} v${APP_VERSION}`;
}

/** Returns full version info for about dialogs. */
export function getFullVersionInfo(): string {
  return `${APP_NAME} v${APP_VERSION} (${APP_BUILD_DATE})`;
}
