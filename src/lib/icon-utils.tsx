import type { CSSProperties, ReactNode } from 'react';
import { icons as allLucideIcons } from 'lucide-react';
import {
  Anchor,
  Backpack,
  BadgeDollarSign,
  Bike,
  Bird,
  BookOpen,
  BusFront,
  Camera,
  Car,
  CarFront,
  Caravan,
  Castle,
  CheckCircle2,
  Church,
  CircleParking,
  CircleX,
  Clock,
  Coffee,
  Compass,
  Crown,
  DollarSign,
  Droplets,
  Fish,
  Flag,
  Flower2,
  Footprints,
  Fuel,
  Gem,
  Globe2,
  Heart,
  Home,
  KeyRound,
  Landmark,
  Leaf,
  LucideIcon,
  Luggage,
  Map,
  MapPin,
  Mountain,
  Music,
  Palette,
  PenLine,
  Plane,
  Plug,
  Route,
  Sailboat,
  Search,
  Shield,
  Ship,
  ShoppingCart,
  Shuffle,
  Shell,
  Sofa,
  Sparkles,
  Star,
  Sunrise,
  Sun,
  Tags,
  Target,
  Tent,
  Ticket,
  Train,
  TreePine,
  UtensilsCrossed,
  Waves,
  Wine,
  Wrench,
  Zap,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  'anchor': Anchor,
  'backpack': Backpack,
  'badge-dollar-sign': BadgeDollarSign,
  'bike': Bike,
  'bird': Bird,
  'book': BookOpen,
  'book-open': BookOpen,
  'bus-front': BusFront,
  'camera': Camera,
  'car': Car,
  'car-front': CarFront,
  'caravan': Caravan,
  'castle': Castle,
  'check-circle-2': CheckCircle2,
  'church': Church,
  'circle-parking': CircleParking,
  'circle-x': CircleX,
  'clock': Clock,
  'coffee': Coffee,
  'compass': Compass,
  'crown': Crown,
  'dollar-sign': DollarSign,
  'droplets': Droplets,
  'fish': Fish,
  'flag': Flag,
  'flower': Flower2,
  'flower-2': Flower2,
  'footprints': Footprints,
  'fuel': Fuel,
  'gem': Gem,
  'globe': Globe2,
  'globe-2': Globe2,
  'heart': Heart,
  'home': Home,
  'key-round': KeyRound,
  'landmark': Landmark,
  'leaf': Leaf,
  'luggage': Luggage,
  'map': Map,
  'map-pin': MapPin,
  'mountain': Mountain,
  'music': Music,
  'palette': Palette,
  'pen-line': PenLine,
  'plane': Plane,
  'plug': Plug,
  'route': Route,
  'sailboat': Sailboat,
  'search': Search,
  'shield': Shield,
  'ship': Ship,
  'shopping-cart': ShoppingCart,
  'shuffle': Shuffle,
  'shell': Shell,
  'sofa': Sofa,
  'sparkles': Sparkles,
  'star': Star,
  'sun': Sun,
  'sunrise': Sunrise,
  'tags': Tags,
  'target': Target,
  'tent': Tent,
  'ticket': Ticket,
  'train': Train,
  'trees': TreePine,
  'tree-pine': TreePine,
  'utensils': UtensilsCrossed,
  'waves': Waves,
  'wine': Wine,
  'wrench': Wrench,
  'zap': Zap,
};

const EMOJI_ALIASES: Record<string, string> = {
  '🏷️': 'tags',
  '🏷': 'tags',
  '📍': 'map-pin',
  '⭐': 'star',
  '✨': 'sparkles',
  '🌍': 'globe',
  '🏛️': 'landmark',
  '🏛': 'landmark',
  '✍️': 'pen-line',
  '✍': 'pen-line',
  '📸': 'camera',
  '🏴': 'flag',
  '✅': 'check-circle-2',
  '✈️': 'plane',
  '✈': 'plane',
  '❌': 'circle-x',
  '🧳': 'luggage',
  '⛽': 'fuel',
  '🛡️': 'shield',
  '🛡': 'shield',
  '🔧': 'wrench',
  '🅿️': 'circle-parking',
  '🅿': 'circle-parking',
  '⚓': 'anchor',
  '🔑': 'key-round',
  '🎫': 'ticket',
  '🛣️': 'map',
  '🛣': 'map',
  '🎒': 'backpack',
  '🚲': 'bike',
  '🚐': 'caravan',
  '🚗🏕️': 'caravan',
  '🚗🏕': 'caravan',
  '⛴️': 'ship',
  '⛴': 'ship',
  '🏠': 'home',
  '⛵': 'sailboat',
  '🚗': 'car-front',
  '🏍️': 'bike',
  '🏍': 'bike',
  '🛩️': 'plane',
  '🛩': 'plane',
  '🚌': 'bus-front',
  '🚤': 'sailboat',
  '🚙': 'car-front',
  '🛵': 'bike',
  '🚂': 'train',
  '🚶': 'footprints',
  '🏔️': 'mountain',
  '🏔': 'mountain',
  '🛋️': 'sofa',
  '🛋': 'sofa',
  '💰': 'badge-dollar-sign',
  '⚡': 'zap',
  '🌅': 'sunrise',
};

const TRANSPORT_CODE_ALIASES: Record<string, string> = {
  walking: 'footprints',
  bicycle: 'bike',
  own_motorcycle: 'bike',
  motorcycle: 'bike',
  rental_motorcycle: 'bike',
  own_car: 'car-front',
  rental_car: 'car-front',
  camper_van: 'caravan',
  car_caravan: 'caravan',
  public_bus: 'bus-front',
  train: 'train',
  own_boat: 'sailboat',
  rental_boat: 'sailboat',
  ferry: 'ship',
  airline: 'plane',
  private_plane: 'plane',
  backpacker: 'backpack',
  driving: 'car-front',
  flight: 'plane',
};

const PROFILE_CODE_ALIASES: Record<string, string> = {
  adventure: 'mountain',
  backpacker: 'backpack',
  comfortable: 'sofa',
  economic: 'badge-dollar-sign',
  fast: 'zap',
  scenic: 'sunrise',
};

const COST_CODE_ALIASES: Record<string, string> = {
  airport_fees: 'plane',
  cancellation: 'circle-x',
  extra_luggage: 'luggage',
  fuel: 'fuel',
  insurance: 'shield',
  maintenance: 'wrench',
  parking: 'circle-parking',
  port_fees: 'anchor',
  rental: 'key-round',
  tickets: 'ticket',
  tolls: 'map',
};

const ACHIEVEMENT_CODE_ALIASES: Record<string, string> = {
  classifier: 'tags',
  contributor: 'map-pin',
  curator: 'star',
  enricher: 'sparkles',
  explorer: 'globe',
  mayor: 'landmark',
  narrator: 'pen-line',
  photographer: 'camera',
  pioneer: 'flag',
  visitor: 'check-circle-2',
};

/** All available icon keys with human-readable Spanish labels */
export const ICON_CATALOG: { key: string; label: string }[] = [
  { key: 'map-pin', label: 'Marcador' },
  { key: 'mountain', label: 'Montaña' },
  { key: 'tent', label: 'Camping' },
  { key: 'home', label: 'Alojamiento' },
  { key: 'utensils', label: 'Comida' },
  { key: 'coffee', label: 'Café' },
  { key: 'camera', label: 'Mirador' },
  { key: 'star', label: 'Favorito' },
  { key: 'heart', label: 'Especial' },
  { key: 'anchor', label: 'Puerto' },
  { key: 'landmark', label: 'Monumento' },
  { key: 'church', label: 'Religioso' },
  { key: 'castle', label: 'Castillo' },
  { key: 'tree-pine', label: 'Naturaleza' },
  { key: 'fish', label: 'Pesca' },
  { key: 'waves', label: 'Playa' },
  { key: 'droplets', label: 'Agua' },
  { key: 'fuel', label: 'Gasolinera' },
  { key: 'shopping-cart', label: 'Compras' },
  { key: 'target', label: 'Objetivo' },
  { key: 'flag', label: 'Hito' },
  { key: 'compass', label: 'Explorar' },
  { key: 'music', label: 'Música' },
  { key: 'gem', label: 'Joya' },
  { key: 'backpack', label: 'Mochila' },
  { key: 'bike', label: 'Bicicleta' },
  { key: 'bird', label: 'Aves' },
  { key: 'book-open', label: 'Libro' },
  { key: 'car-front', label: 'Coche' },
  { key: 'caravan', label: 'Caravana' },
  { key: 'circle-parking', label: 'Parking' },
  { key: 'crown', label: 'Corona' },
  { key: 'flower', label: 'Flor' },
  { key: 'footprints', label: 'Sendero' },
  { key: 'globe', label: 'Mundo' },
  { key: 'key-round', label: 'Llave' },
  { key: 'leaf', label: 'Hoja' },
  { key: 'luggage', label: 'Equipaje' },
  { key: 'map', label: 'Mapa' },
  { key: 'palette', label: 'Arte' },
  { key: 'pen-line', label: 'Escritura' },
  { key: 'plane', label: 'Avión' },
  { key: 'plug', label: 'Electricidad' },
  { key: 'route', label: 'Ruta' },
  { key: 'sailboat', label: 'Velero' },
  { key: 'shield', label: 'Seguridad' },
  { key: 'ship', label: 'Barco' },
  { key: 'shell', label: 'Concha' },
  { key: 'sofa', label: 'Confort' },
  { key: 'sparkles', label: 'Destacado' },
  { key: 'sun', label: 'Sol' },
  { key: 'sunrise', label: 'Amanecer' },
  { key: 'tags', label: 'Etiquetas' },
  { key: 'ticket', label: 'Entrada' },
  { key: 'train', label: 'Tren' },
  { key: 'wine', label: 'Vino' },
  { key: 'wrench', label: 'Taller' },
  { key: 'zap', label: 'Energía' },
];

// Convert kebab-case to PascalCase for lucide-react icons object lookup
function toPascal(kebab: string): string {
  return kebab.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

export function normalizeIconKey(raw?: string | null, fallback = 'map-pin') {
  const value = raw?.trim();
  if (!value) return fallback;
  const normalized = EMOJI_ALIASES[value] || value.toLowerCase().replace(/\s+/g, '-');
  // Check hardcoded map first, then full lucide library
  if (ICON_MAP[normalized]) return normalized;
  const pascal = toPascal(normalized);
  if (pascal in allLucideIcons) return normalized;
  return fallback;
}

export function getIconComponent(iconKey?: string | null, fallback = 'map-pin') {
  const key = normalizeIconKey(iconKey, fallback);
  // Check hardcoded map first
  if (ICON_MAP[key]) return ICON_MAP[key];
  // Then try full lucide library
  const pascal = toPascal(key);
  if (pascal in allLucideIcons) return (allLucideIcons as any)[pascal] as LucideIcon;
  return MapPin;
}

export function renderLineIcon(
  iconKey?: string | null,
  options?: { className?: string; color?: string; fallback?: string; style?: CSSProperties }
) {
  const Icon = getIconComponent(iconKey, options?.fallback);
  return <Icon className={options?.className} color={options?.color} style={options?.style} />;
}

export function getTransportModeIconKey(code?: string | null, icon?: string | null) {
  return TRANSPORT_CODE_ALIASES[code || ''] || normalizeIconKey(icon, 'car-front');
}

export function renderTransportModeIcon(code?: string | null, icon?: string | null, className = 'w-4 h-4') {
  return renderLineIcon(getTransportModeIconKey(code, icon), { className, fallback: 'car-front' });
}

export function getTravelProfileIconKey(code?: string | null, icon?: string | null) {
  return PROFILE_CODE_ALIASES[code || ''] || normalizeIconKey(icon, 'compass');
}

export function renderTravelProfileIcon(code?: string | null, icon?: string | null, className = 'w-4 h-4') {
  return renderLineIcon(getTravelProfileIconKey(code, icon), { className, fallback: 'compass' });
}

export function getCostCategoryIconKey(code?: string | null, icon?: string | null) {
  return COST_CODE_ALIASES[code || ''] || normalizeIconKey(icon, 'ticket');
}

export function renderCostCategoryIcon(code?: string | null, icon?: string | null, className = 'w-3 h-3') {
  return renderLineIcon(getCostCategoryIconKey(code, icon), { className, fallback: 'ticket' });
}

export function getAchievementIconKey(code?: string | null, icon?: string | null) {
  return ACHIEVEMENT_CODE_ALIASES[code || ''] || normalizeIconKey(icon, 'trophy');
}

export function renderAchievementIcon(code?: string | null, icon?: string | null, className = 'w-5 h-5') {
  const key = ACHIEVEMENT_CODE_ALIASES[code || ''] || normalizeIconKey(icon, 'star');
  return renderLineIcon(key, { className, fallback: 'star' });
}

export function renderCuratorIcon(icon?: string | null, color?: string, className = 'w-4 h-4') {
  return renderLineIcon(icon, { className, color, fallback: 'map-pin' });
}

export function normalizeTransportModeIcon(code?: string | null, icon?: string | null) {
  return getTransportModeIconKey(code, icon);
}

export function normalizeTravelProfileIcon(code?: string | null, icon?: string | null) {
  return getTravelProfileIconKey(code, icon);
}

export function normalizeAchievementIcon(code?: string | null, icon?: string | null) {
  return ACHIEVEMENT_CODE_ALIASES[code || ''] || normalizeIconKey(icon, 'star');
}

export function withIconLabel(icon: ReactNode, label: ReactNode) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span>{label}</span>
    </span>
  );
}

// ── Stop type icon mapping (route stops on the map) ──

const STOP_TYPE_ICON_KEYS: Record<string, string> = {
  overnight: 'home',
  port: 'anchor',
  airport: 'plane',
  refuel: 'fuel',
  rest: 'coffee',
  scenic: 'camera',
  custom: 'map-pin',
};

export function getStopTypeIconKey(stopType: string, customIcon?: string | null): string {
  if (customIcon) return normalizeIconKey(customIcon, 'map-pin');
  return STOP_TYPE_ICON_KEYS[stopType] || 'map-pin';
}

// ── Lucide SVG string renderer for Leaflet divIcon (no React) ──

/** SVG path data for common Lucide icons used on the map */
const LUCIDE_SVG_PATHS: Record<string, string> = {
  'anchor': '<circle cx="12" cy="5" r="3"/><line x1="12" x2="12" y1="22" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>',
  'plane': '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  'ship': '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10v4"/><path d="M12 2v3"/>',
  'fuel': '<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  'coffee': '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/>',
  'camera': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  'home': '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  'footprints': '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5 10 7.93 8 10.5 8 12v4"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 2.43 2 4.87 2 6.5v4"/>',
  'car-front': '<path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.354a2 2 0 0 0-1.854 1.3L5 10 3 8"/><path d="M21 12H3"/><path d="M21 16H3"/><path d="M5 20a2 2 0 0 1-2-2v-4h18v4a2 2 0 0 1-2 2Z"/><circle cx="7" cy="16" r="1"/><circle cx="17" cy="16" r="1"/>',
  'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  'bed': '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
};

/**
 * Returns an SVG string for a Lucide icon key — for use in Leaflet divIcon HTML.
 * Falls back to map-pin if the icon key is not found.
 */
export function getLucideSvgString(
  iconKey: string,
  options?: { size?: number; color?: string; strokeWidth?: number }
): string {
  const size = options?.size ?? 16;
  const color = options?.color ?? 'currentColor';
  const sw = options?.strokeWidth ?? 2;
  const paths = LUCIDE_SVG_PATHS[iconKey] || LUCIDE_SVG_PATHS['map-pin'] || '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/**
 * Returns a full HTML string for a Leaflet divIcon with a Lucide SVG icon
 * inside a colored circle. No emojis.
 */
export function getMapMarkerHtml(
  iconKey: string,
  bgColor: string,
  options?: { size?: number; iconSize?: number; borderColor?: string }
): string {
  const sz = options?.size ?? 28;
  const iconSz = options?.iconSize ?? 14;
  const border = options?.borderColor ?? 'white';
  const svg = getLucideSvgString(iconKey, { size: iconSz, color: 'white', strokeWidth: 2.5 });
  return `<div style="
    display:flex;align-items:center;justify-content:center;
    width:${sz}px;height:${sz}px;border-radius:50%;
    background:${bgColor};border:2px solid ${border};
    box-shadow:0 2px 6px rgba(0,0,0,0.35);
  ">${svg}</div>`;
}