import type { CSSProperties, ReactNode } from 'react';
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
  Route,
  Sailboat,
  Search,
  Shield,
  Ship,
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
  'route': Route,
  'sailboat': Sailboat,
  'search': Search,
  'shield': Shield,
  'ship': Ship,
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

export function normalizeIconKey(raw?: string | null, fallback = 'map-pin') {
  const value = raw?.trim();
  if (!value) return fallback;
  const normalized = EMOJI_ALIASES[value] || value.toLowerCase().replace(/\s+/g, '-');
  return ICON_MAP[normalized] ? normalized : fallback;
}

export function getIconComponent(iconKey?: string | null, fallback = 'map-pin') {
  return ICON_MAP[normalizeIconKey(iconKey, fallback)] || MapPin;
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