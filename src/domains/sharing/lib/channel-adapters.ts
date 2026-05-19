/**
 * channel-adapters — Adaptadores de canal para sharing (PR-SHARE-1 v1).
 *
 * Google Maps / Apple Maps son ADAPTADORES EXTERNOS, no fuente principal.
 * Reciben `GeoLocation` directamente, NO `SharePayload`, porque no
 * comparten la URL pública Vandits.
 */
import type { GeoLocation } from '@/types/location';
import type { SharePayload } from '../types';
import { resolveGoogleMapsUrl, resolveAppleMapsUrl } from './external-maps-url';

function openInNewTab(url: string): void {
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    /* noop */
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallthrough */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

export async function shareNative(payload: SharePayload): Promise<'shared' | 'copied' | 'cancelled'> {
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
  };
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title: payload.title, text: payload.text, url: payload.url });
      return 'shared';
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/abort/i.test(msg)) return 'cancelled';
      // fallthrough to copy
    }
  }
  const ok = await copyToClipboard(payload.url);
  return ok ? 'copied' : 'cancelled';
}

export async function copyLink(payload: SharePayload): Promise<boolean> {
  return copyToClipboard(payload.url);
}

export function shareWhatsApp(payload: SharePayload): void {
  const text = `${payload.title} ${payload.url}`;
  openInNewTab(`https://wa.me/?text=${encodeURIComponent(text)}`);
}

export function shareSMS(payload: SharePayload): void {
  const text = `${payload.title} ${payload.url}`;
  // sms:?&body= es compatible con iOS y Android modernos.
  openInNewTab(`sms:?&body=${encodeURIComponent(text)}`);
}

export function shareFacebook(payload: SharePayload): void {
  openInNewTab(
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(payload.url)}`,
  );
}

export async function shareInstagram(payload: SharePayload): Promise<boolean> {
  // Instagram no acepta URL directa — copiamos enlace y el caller muestra
  // un toast "pega en tu story".
  return copyToClipboard(payload.url);
}

export function openGoogleMaps(
  poi: Pick<GeoLocation, 'coordinates' | 'name' | 'externalRefs'>,
): void {
  const { url } = resolveGoogleMapsUrl(poi);
  if (url) openInNewTab(url);
}

export function openAppleMaps(
  poi: Pick<GeoLocation, 'coordinates' | 'name' | 'externalRefs'>,
): void {
  const { url } = resolveAppleMapsUrl(poi);
  if (url) openInNewTab(url);
}
