/**
 * Sharing domain types (PR-SHARE-1 v1).
 *
 * Share != Export. Esto es sharing humano/social: URL pública Vandits.
 * Para export técnico (KML/CSV/JSON) ver
 * `src/domains/content/lib/poi-export-eligibility.ts`.
 *
 * Alcance v1: poi | collection | route. Sin /z, sin shares efímeros,
 * sin slugs humanos.
 */
import type { GeoLocation } from '@/types/location';

export type ShareTargetKind = 'poi' | 'collection' | 'route';

export interface ShareTarget {
  kind: ShareTargetKind;
  id: string;
  /** Nombre humano del target (para title/preview). */
  name?: string;
  /** Sólo `kind='poi'`: POI completo para preview/elegibilidad/adapters. */
  poi?: GeoLocation;
  /**
   * Sólo grupo (collection|route): POIs del grupo para counters. Si no se
   * pasa, el ShareSheet asume `totalCount = eligibleCount = 0`.
   */
  locations?: GeoLocation[];
}

export interface SharePayload {
  url: string;
  title: string;
  text: string;
  ogImage?: string;
  eligibleCount: number;
  totalCount: number;
  excludedCount: number;
}

export type ShareChannel =
  | 'native'
  | 'copy'
  | 'whatsapp'
  | 'sms'
  | 'facebook'
  | 'instagram'
  | 'gmaps'
  | 'amaps';
