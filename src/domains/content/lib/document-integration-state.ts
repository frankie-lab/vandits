/**
 * Single source of truth for the document "integration" badge.
 *
 * Replaces the legacy `documents.status` driven badge. The visible state of a
 * document is derived from how many of its locations are actually approved
 * (`is_approved=true`) and therefore visible in the global map / catalog.
 *
 * Used by DocumentsPanel and DocumentFocusView so the badge never lies about
 * whether the document's points are really in the catalog.
 */

export type DocumentIntegrationKind = 'empty' | 'none' | 'partial' | 'full';

export interface DocumentIntegrationState {
  kind: DocumentIntegrationKind;
  label: string;
  /** Tailwind classes for the badge pill. */
  className: string;
  approvedCount: number;
  totalCount: number;
  pendingApproval: number;
}

export function getDocumentIntegrationState(doc: {
  approved_count: number;
  location_count: number;
}): DocumentIntegrationState {
  const total = doc.location_count ?? 0;
  const approved = doc.approved_count ?? 0;
  const pending = Math.max(total - approved, 0);

  if (total === 0) {
    return {
      kind: 'empty',
      label: 'Vacío',
      className: 'bg-muted text-muted-foreground border-border',
      approvedCount: 0,
      totalCount: 0,
      pendingApproval: 0,
    };
  }

  if (approved === 0) {
    return {
      kind: 'none',
      label: 'Sin integrar',
      className: 'bg-muted text-muted-foreground border-border',
      approvedCount: 0,
      totalCount: total,
      pendingApproval: pending,
    };
  }

  if (approved < total) {
    return {
      kind: 'partial',
      label: `Parcial ${approved}/${total}`,
      className:
        'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400 dark:border-amber-500/20',
      approvedCount: approved,
      totalCount: total,
      pendingApproval: pending,
    };
  }

  return {
    kind: 'full',
    label: 'Catálogo',
    className:
      'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400 dark:border-emerald-500/20',
    approvedCount: approved,
    totalCount: total,
    pendingApproval: 0,
  };
}
