// Edge-function mirror of `src/domains/content/lib/location-lifecycle.ts`.
// Mantener SINCRONIZADO con el helper del cliente. Cualquier insert de
// `locations` desde una edge function debe usar `shouldAutoApproveImport`
// en lugar de hardcodear `is_approved`.

export type DocumentSourceType =
  | 'web_import'
  | 'manual'
  | 'kml'
  | 'gpx'
  | 'geojson'
  | 'csv'
  | 'onedrive'
  | string;

const TRUSTED_SOURCES: ReadonlyArray<string | null> = ['web_import', 'manual'];

export function shouldAutoApproveImport(
  sourceType: string | null | undefined,
): boolean {
  return TRUSTED_SOURCES.includes(sourceType ?? null);
}
