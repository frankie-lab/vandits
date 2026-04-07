import L from 'leaflet';
import { GeoLocation } from '@/types/location';
import { CriteriaStatus, CRITERIA_STORAGE_KEY } from './map-constants';

// ── Criteria & enrichment helpers ──

export function loadCriteriaTimestamp(): number {
  try {
    const stored = localStorage.getItem(CRITERIA_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed._updatedAt || 0;
    }
  } catch (e) {}
  return 0;
}

export function meetsEnrichmentCriteria(location: GeoLocation, criteriaTimestamp: number): boolean {
  if (!location.enrichedData?.descripcion) return false;
  if (criteriaTimestamp === 0) return true;
  const locationUpdatedAt = location.updatedAt instanceof Date
    ? location.updatedAt.getTime()
    : new Date(location.updatedAt).getTime();
  return locationUpdatedAt >= criteriaTimestamp;
}

export const getCriteriaColor = (
  location: GeoLocation,
  criteriaTimestamp: number
): { color: string; gradient: string; status: CriteriaStatus } => {
  if (location.enrichedData?.descripcion) {
    if (meetsEnrichmentCriteria(location, criteriaTimestamp)) {
      return {
        color: 'hsl(142, 76%, 36%)',
        gradient: 'linear-gradient(135deg, hsl(142, 76%, 42%), hsl(142, 71%, 32%))',
        status: 'current',
      };
    }
    return {
      color: 'hsl(217, 91%, 60%)',
      gradient: 'linear-gradient(135deg, hsl(217, 91%, 65%), hsl(217, 91%, 50%))',
      status: 'previous',
    };
  }

  if (location.description && location.description.trim().length > 0) {
    return {
      color: 'hsl(220, 9%, 46%)',
      gradient: 'linear-gradient(135deg, hsl(220, 9%, 56%), hsl(220, 9%, 40%))',
      status: 'unknown',
    };
  }

  return {
    color: 'hsl(24, 95%, 53%)',
    gradient: 'linear-gradient(135deg, hsl(24, 95%, 58%), hsl(24, 95%, 45%))',
    status: 'new',
  };
};

// ── Color helpers ──

export function getUserHue(userId?: string): number {
  if (!userId) return 217;
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const normalizedHash = Math.abs(hash) % 160;
  return normalizedHash < 100 ? 180 + normalizedHash : 200 + normalizedHash;
}

export function getOwnerInitials(ownerName?: string): string {
  if (!ownerName) return '?';
  const parts = ownerName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return ownerName.slice(0, 2).toUpperCase();
}

export function adjustHslLightness(color: string, amount: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    const newL = Math.min(100, Math.max(0, l * 100 + amount));
    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(newL)}%)`;
  }
  const hslMatch = color.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)/i);
  if (hslMatch) {
    const hVal = parseInt(hslMatch[1]);
    const sVal = parseInt(hslMatch[2]);
    const lVal = parseInt(hslMatch[3]);
    const newL = Math.min(100, Math.max(0, lVal + amount));
    return `hsl(${hVal}, ${sVal}%, ${newL}%)`;
  }
  return color;
}

// ── Distance / geo helpers ──

export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function toLeafletLatLng(coord: L.LatLngExpression): L.LatLng {
  if (Array.isArray(coord)) return L.latLng(coord[0], coord[1]);
  return L.latLng((coord as L.LatLng).lat, (coord as L.LatLng).lng);
}

export function createFlightArcCoords(map: L.Map, coords: L.LatLngExpression[]): L.LatLngExpression[] {
  if (coords.length < 2) return coords;
  const start = toLeafletLatLng(coords[0]);
  const end = toLeafletLatLng(coords[coords.length - 1]);
  const startPoint = map.project(start);
  const endPoint = map.project(end);
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const distancePx = Math.hypot(dx, dy);
  if (!Number.isFinite(distancePx) || distancePx < 24) return [start, end];

  let perpX = -dy / distancePx;
  let perpY = dx / distancePx;
  if (perpY > 0) { perpX *= -1; perpY *= -1; }

  const arcHeight = Math.min(140, Math.max(36, distancePx * 0.22));
  const controlPoint = L.point(
    (startPoint.x + endPoint.x) / 2 + perpX * arcHeight,
    (startPoint.y + endPoint.y) / 2 + perpY * arcHeight,
  );

  const steps = Math.min(48, Math.max(24, Math.round(distancePx / 18)));
  const arcCoords: L.LatLngExpression[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const oneMinusT = 1 - t;
    const x = oneMinusT * oneMinusT * startPoint.x + 2 * oneMinusT * t * controlPoint.x + t * t * endPoint.x;
    const y = oneMinusT * oneMinusT * startPoint.y + 2 * oneMinusT * t * controlPoint.y + t * t * endPoint.y;
    const point = map.unproject(L.point(x, y));
    arcCoords.push([point.lat, point.lng]);
  }
  return arcCoords;
}

export function calculateSegmentBearing(from: L.LatLngExpression, to: L.LatLngExpression): number {
  const s = toLeafletLatLng(from);
  const e = toLeafletLatLng(to);
  const dLng = (e.lng - s.lng) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(e.lat * Math.PI / 180);
  const x = Math.cos(s.lat * Math.PI / 180) * Math.sin(e.lat * Math.PI / 180) -
    Math.sin(s.lat * Math.PI / 180) * Math.cos(e.lat * Math.PI / 180) * Math.cos(dLng);
  return Math.atan2(y, x) * 180 / Math.PI;
}

// ── Visit relevance ──

export interface VisitRelevanceInfo {
  grade: 'oro' | 'plata' | 'bronce' | 'reciente';
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  daysAgo: number;
  verificationType: 'checkin' | 'photo';
}

export function calculateVisitRelevance(
  visitedVerifiedAt?: string,
  oldestPhotoDate?: string
): VisitRelevanceInfo | null {
  if (!visitedVerifiedAt && !oldestPhotoDate) return null;

  const checkinDate = visitedVerifiedAt ? new Date(visitedVerifiedAt) : null;
  const photoDate = oldestPhotoDate ? new Date(oldestPhotoDate) : null;

  let verificationDate: Date;
  let verificationType: 'checkin' | 'photo';

  if (checkinDate && photoDate) {
    if (checkinDate <= photoDate) { verificationDate = checkinDate; verificationType = 'checkin'; }
    else { verificationDate = photoDate; verificationType = 'photo'; }
  } else if (checkinDate) { verificationDate = checkinDate; verificationType = 'checkin'; }
  else if (photoDate) { verificationDate = photoDate; verificationType = 'photo'; }
  else return null;

  const daysAgo = Math.floor((Date.now() - verificationDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysAgo >= 1095) {
    return { grade: 'oro', label: 'Veterano', color: '#b45309', bgColor: 'linear-gradient(135deg, #fef3c7, #fcd34d)', borderColor: '#f59e0b', daysAgo, verificationType };
  } else if (daysAgo >= 365) {
    return { grade: 'plata', label: 'Consolidado', color: '#475569', bgColor: 'linear-gradient(135deg, #f1f5f9, #cbd5e1)', borderColor: '#94a3b8', daysAgo, verificationType };
  } else if (daysAgo >= 90) {
    return { grade: 'bronce', label: 'Confirmado', color: '#9a3412', bgColor: 'linear-gradient(135deg, #fed7aa, #fdba74)', borderColor: '#fb923c', daysAgo, verificationType };
  } else {
    return { grade: 'reciente', label: '🆕 Reciente', color: '#166534', bgColor: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', borderColor: '#86efac', daysAgo, verificationType };
  }
}

export function formatTimeAgo(daysAgo: number): string {
  if (daysAgo >= 365) { const y = Math.floor(daysAgo / 365); return `hace ${y} año${y > 1 ? 's' : ''}`; }
  else if (daysAgo >= 30) { const m = Math.floor(daysAgo / 30); return `hace ${m} mes${m > 1 ? 'es' : ''}`; }
  else if (daysAgo >= 7) { const w = Math.floor(daysAgo / 7); return `hace ${w} semana${w > 1 ? 's' : ''}`; }
  else if (daysAgo > 0) return `hace ${daysAgo} día${daysAgo > 1 ? 's' : ''}`;
  return 'hoy';
}

// ── Popup filter helpers ──

export function createFilterLink(value: string, type: 'zone' | 'region' | 'country' | 'continent'): string {
  return `<a href="#" class="filter-link" data-filter-type="${type}" data-filter-value="${value}" style="color: #6b7280; text-decoration: none; transition: color 0.15s;" onmouseover="this.style.color='#0ea5e9';this.style.textDecoration='underline'" onmouseout="this.style.color='#6b7280';this.style.textDecoration='none'">${value}</a>`;
}

export function parseLocalizacionToLinks(localizacion: string, location: GeoLocation): string {
  const parts: string[] = [];
  if (location.zone) parts.push(createFilterLink(location.zone, 'zone'));
  if (location.region) parts.push(createFilterLink(location.region, 'region'));
  if (location.country) parts.push(createFilterLink(location.country, 'country'));
  if (location.continent) parts.push(createFilterLink(location.continent, 'continent'));
  return parts.length > 0 ? parts.join(', ') : localizacion;
}
