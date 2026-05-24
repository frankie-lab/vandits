/**
 * ExportPanel — wrapper inline del Export Resolver (PR-EXPORT-3).
 *
 * Esta pantalla vive dentro de paneles laterales y reutiliza el
 * componente canónico `<ExportResolverBody>`. Toda la lógica visual y
 * de pipeline vive en `ExportResolver.tsx`; aquí sólo resolvemos el
 * `source` (explicit > selection > filtered) y se lo pasamos.
 *
 * Ver `docs/contracts/poi-export-canon.md` § PR-EXPORT-3.
 */
import React, { useMemo } from 'react';
import { useLocationsStore } from '@/domains/content';
import type { GeoLocation } from '@/types/location';
import {
  resolveExportCandidates,
  describeExportOrigin,
} from '@/domains/content/lib/export-source-resolver';
import {
  ExportResolverBody,
  type ExportResolverSource,
  type ExportResolverSourceKind,
} from '@/domains/content/components/ExportResolver';
import type { PoiExportScope } from '@/domains/content/lib/poi-export-record';

export interface ExportPanelSource {
  locations: GeoLocation[];
  label?: string;
  initialScope?: PoiExportScope;
}

export interface ExportPanelProps {
  source?: ExportPanelSource | null;
}

function originToKind(origin: string): ExportResolverSourceKind {
  if (origin === 'selection') return 'selection';
  if (origin === 'explicit') return 'explicit';
  return 'filters';
}

export function ExportPanel({ source = null }: ExportPanelProps = {}) {
  const documents = useLocationsStore((s) => s.documents);
  const selectedDocument = useLocationsStore((s) => s.selectedDocument);
  const selectedLocations = useLocationsStore((s) => s.selectedLocations);
  const getFilteredLocations = useLocationsStore((s) => s.getFilteredLocations);

  const resolution = useMemo(
    () =>
      resolveExportCandidates({
        explicitLocations: source?.locations ?? null,
        selectedIds: selectedLocations,
        documents,
        getFiltered: getFilteredLocations,
      }),
    [source, selectedLocations, documents, getFilteredLocations],
  );

  const resolverSource: ExportResolverSource = useMemo(
    () => ({
      kind: originToKind(resolution.origin),
      label:
        source?.label ??
        describeExportOrigin(resolution.origin, resolution.locations.length),
      locations: resolution.locations,
      documentName: source?.label || selectedDocument?.name,
    }),
    [resolution, source?.label, selectedDocument?.name],
  );

  return (
    <ExportResolverBody
      source={resolverSource}
      initialScope={source?.initialScope ?? 'internal'}
    />
  );
}
