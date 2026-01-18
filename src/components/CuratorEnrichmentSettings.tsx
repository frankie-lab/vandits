import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings2,
  Save,
  RotateCcw,
  FileText,
  Image,
  Link,
  Hash,
  Star,
  MessageSquare,
  Plus,
  X,
  Loader2,
  Search,
  Eye,
  Sparkles,
  MapPin,
  ListChecks,
  RefreshCw,
  Compass,
  CheckSquare,
  Play,
  Pause,
  Phone,
  Target,
  BookOpen,
  Navigation,
  // Lucide icons for curator gallery - Extended collection
  Mountain,
  Trees,
  Waves,
  Sun,
  Landmark,
  Church,
  Castle,
  Building2,
  Home,
  Tent,
  Utensils,
  Wine,
  Coffee,
  Car,
  Fuel,
  Plane,
  Ship,
  Train,
  Footprints,
  Bike,
  Camera,
  Music,
  Palette,
  BookMarked,
  Hotel,
  Hospital,
  Store,
  Info,
  Wifi,
  Plug,
  Anchor,
  Flag,
  Heart,
  Gem,
  Crown,
  Leaf,
  Flower2,
  Shell,
  Fish,
  Bird,
  // Additional icons
  MapPinned,
  Map,
  Globe,
  Globe2,
  Signpost,
  Route,
  Milestone,
  CircleDot,
  LocateFixed,
  Crosshair,
  Bookmark,
  Award,
  Trophy,
  Medal,
  Zap,
  Flame,
  Snowflake,
  CloudSun,
  Moon,
  Sunrise,
  Sunset,
  Rainbow,
  Umbrella,
  Wind,
  Droplets,
  Thermometer,
  MountainSnow,
  TreePine,
  TreeDeciduous,
  Palmtree,
  Shrub,
  Sprout,
  Clover,
  Wheat,
  Apple,
  Cherry,
  Grape,
  Citrus,
  Carrot,
  Banana,
  Salad,
  Beef,
  Egg,
  Croissant,
  Pizza,
  Sandwich,
  Soup,
  IceCream2,
  Cake,
  Cookie,
  Candy,
  CupSoda,
  Beer,
  Martini,
  GlassWater,
  Milk,
  Building,
  Factory,
  Warehouse,
  School,
  GraduationCap,
  Library,
  Theater,
  Clapperboard,
  Tv,
  Radio,
  Mic,
  Headphones,
  Guitar,
  Piano,
  Drum,
  Drama,
  Brush,
  PenTool,
  Scissors,
  Ruler,
  Hammer,
  Wrench,
  HardHat,
  Construction,
  Tractor,
  Truck,
  Bus,
  Ambulance,
  CarTaxiFront,
  Sailboat,
  Rocket,
  Cable,
  TrainFront,
  TrainTrack,
  Forklift,
  // Adventure & sports extras
  Binoculars,
  CableCar,
  Sword,
  Crosshair as CrosshairIcon,
  Bird as BirdIcon,
  Pickaxe,
  FishSymbol,
  PersonStanding,
  Accessibility,
  Baby,
  Dog,
  Cat,
  Rabbit,
  Squirrel,
  Turtle,
  Bug,
  Snail,
  Flower,
  Rat,
  Skull,
  Bone,
  Dna,
  Microscope,
  Telescope,
  Atom,
  FlaskConical,
  TestTube2,
  Pill,
  Syringe,
  Stethoscope,
  HeartPulse,
  Activity,
  Dumbbell,
  Weight,
  Medal as MedalIcon,
  Volleyball,
  Gamepad2,
  Dice5,
  Puzzle,
  ToyBrick,
  Shapes,
  Hexagon,
  Pentagon,
  Triangle,
  Square,
  Circle,
  Diamond,
  Spade,
  Club,
  Coins,
  Banknote,
  CreditCard,
  Receipt,
  ShoppingCart,
  ShoppingBag,
  Gift,
  Package,
  Box,
  Archive,
  Briefcase,
  BriefcaseBusiness,
  Luggage,
  Backpack,
  Watch,
  Clock,
  Timer,
  Hourglass,
  Calendar,
  CalendarDays,
  Bell,
  BellRing,
  Megaphone,
  Mail,
  MessageCircle,
  Quote,
  Newspaper,
  ScrollText,
  FileHeart,
  FileImage,
  FileMusic,
  FileVideo,
  Folder,
  FolderHeart,
  Lock,
  Key,
  KeyRound,
  Shield,
  ShieldCheck,
  BadgeCheck,
  CircleCheck,
  ThumbsUp,
  PartyPopper,
  Laugh as LaughIcon,
  Glasses,
  Shirt,
  Footprints as FootprintsIcon,
  Hand,
  HandHeart,
  Handshake,
  Users,
  UserCircle,
  Smile,
  Laugh,
  Frown,
  Angry,
  Ghost,
  Wand2,
  Sparkle,
  Lightbulb,
  Lamp,
  LampDesk,
  Flashlight,
  Sun as SunIcon,
  SunDim,
  Sunrise as SunriseIcon,
  Power,
  BatteryFull,
  Cpu,
  HardDrive,
  Server,
  Database,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Tornado,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLocationsStore } from '@/store/locations-store';

interface CuratorLocation {
  id: string;
  name: string;
  description?: string;
  enriched_data?: any;
  country?: string;
  region?: string;
}

interface ValidationCandidate {
  name: string;
  distance: number;
  matchScore: number;
  matchReason: string;
  extract?: string;
  url: string;
}

interface ValidationResult {
  validation_required: true;
  location_name: string;
  coordinates: { lat: number; lng: number };
  search_radius: number;
  expected_nature?: string;
  candidates: ValidationCandidate[];
  message: string;
}

interface PendingValidation {
  locationId: string;
  locationName: string;
  validationResult: ValidationResult;
}

interface CuratorEnrichmentSettingsProps {
  curatorId?: string;
  curatorName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CuratorOption {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface EnrichmentPreferences {
  icon: string;
  enrichment_expected_nature: string;
  enrichment_search_radius_meters: number;
  enrichment_include_contact: boolean;
  enrichment_show_sources: boolean;
  enrichment_correct_coordinates: boolean;
  enrichment_tone: string;
  enrichment_min_length: number;
  enrichment_custom_prompt: string | null;
  enrichment_include_image: boolean;
  enrichment_include_web: boolean;
  enrichment_include_tags: boolean;
  enrichment_include_interest_index: boolean;
  enrichment_focus_keywords: string[];
  enrichment_exclude_keywords: string[];
}

// Galería de iconos Lucide organizados por categoría - Colección extendida
const LUCIDE_ICON_GALLERY: Record<string, { name: string; icon: LucideIcon }[]> = {
  general: [
    { name: 'map-pin', icon: MapPin },
    { name: 'map-pinned', icon: MapPinned },
    { name: 'map', icon: Map },
    { name: 'target', icon: Target },
    { name: 'compass', icon: Compass },
    { name: 'navigation', icon: Navigation },
    { name: 'signpost', icon: Signpost },
    { name: 'route', icon: Route },
    { name: 'milestone', icon: Milestone },
    { name: 'globe', icon: Globe },
    { name: 'globe-2', icon: Globe2 },
    { name: 'circle-dot', icon: CircleDot },
    { name: 'locate-fixed', icon: LocateFixed },
    { name: 'crosshair', icon: Crosshair },
    { name: 'star', icon: Star },
    { name: 'flag', icon: Flag },
    { name: 'heart', icon: Heart },
    { name: 'bookmark', icon: Bookmark },
    { name: 'award', icon: Award },
    { name: 'trophy', icon: Trophy },
    { name: 'medal', icon: Medal },
    { name: 'zap', icon: Zap },
    { name: 'sparkles', icon: Sparkles },
    { name: 'sparkle', icon: Sparkle },
    { name: 'lightbulb', icon: Lightbulb },
    { name: 'info', icon: Info },
  ],
  naturaleza: [
    { name: 'mountain', icon: Mountain },
    { name: 'mountain-snow', icon: MountainSnow },
    { name: 'trees', icon: Trees },
    { name: 'tree-pine', icon: TreePine },
    { name: 'tree-deciduous', icon: TreeDeciduous },
    { name: 'palmtree', icon: Palmtree },
    { name: 'shrub', icon: Shrub },
    { name: 'waves', icon: Waves },
    { name: 'droplets', icon: Droplets },
    { name: 'sun', icon: Sun },
    { name: 'sunrise', icon: Sunrise },
    { name: 'sunset', icon: Sunset },
    { name: 'moon', icon: Moon },
    { name: 'cloud-sun', icon: CloudSun },
    { name: 'rainbow', icon: Rainbow },
    { name: 'snowflake', icon: Snowflake },
    { name: 'wind', icon: Wind },
    { name: 'cloud', icon: Cloud },
    { name: 'cloud-rain', icon: CloudRain },
    { name: 'cloud-snow', icon: CloudSnow },
    { name: 'cloud-lightning', icon: CloudLightning },
    { name: 'tornado', icon: Tornado },
    { name: 'umbrella', icon: Umbrella },
    { name: 'thermometer', icon: Thermometer },
    { name: 'flame', icon: Flame },
    { name: 'leaf', icon: Leaf },
    { name: 'sprout', icon: Sprout },
    { name: 'clover', icon: Clover },
    { name: 'flower', icon: Flower },
    { name: 'flower-2', icon: Flower2 },
    { name: 'wheat', icon: Wheat },
    { name: 'shell', icon: Shell },
    { name: 'bird', icon: Bird },
    { name: 'fish', icon: Fish },
    { name: 'bug', icon: Bug },
    { name: 'snail', icon: Snail },
    { name: 'turtle', icon: Turtle },
    { name: 'squirrel', icon: Squirrel },
    { name: 'rabbit', icon: Rabbit },
    { name: 'dog', icon: Dog },
    { name: 'cat', icon: Cat },
  ],
  urbano: [
    { name: 'building', icon: Building },
    { name: 'building-2', icon: Building2 },
    { name: 'landmark', icon: Landmark },
    { name: 'church', icon: Church },
    { name: 'castle', icon: Castle },
    { name: 'home', icon: Home },
    { name: 'hotel', icon: Hotel },
    { name: 'factory', icon: Factory },
    { name: 'warehouse', icon: Warehouse },
    { name: 'school', icon: School },
    { name: 'library', icon: Library },
    { name: 'hospital', icon: Hospital },
    { name: 'store', icon: Store },
    { name: 'anchor', icon: Anchor },
    { name: 'construction', icon: Construction },
    { name: 'lamp', icon: Lamp },
    { name: 'lamp-desk', icon: LampDesk },
    { name: 'power', icon: Power },
    { name: 'plug', icon: Plug },
    { name: 'wifi', icon: Wifi },
  ],
  cultura: [
    { name: 'camera', icon: Camera },
    { name: 'palette', icon: Palette },
    { name: 'brush', icon: Brush },
    { name: 'pen-tool', icon: PenTool },
    { name: 'music', icon: Music },
    { name: 'guitar', icon: Guitar },
    { name: 'piano', icon: Piano },
    { name: 'drum', icon: Drum },
    { name: 'mic', icon: Mic },
    { name: 'headphones', icon: Headphones },
    { name: 'radio', icon: Radio },
    { name: 'tv', icon: Tv },
    { name: 'theater', icon: Theater },
    { name: 'drama', icon: Drama },
    { name: 'clapperboard', icon: Clapperboard },
    { name: 'book', icon: BookMarked },
    { name: 'book-open', icon: BookOpen },
    { name: 'newspaper', icon: Newspaper },
    { name: 'scroll-text', icon: ScrollText },
    { name: 'graduation-cap', icon: GraduationCap },
    { name: 'gem', icon: Gem },
    { name: 'crown', icon: Crown },
    { name: 'diamond', icon: Diamond },
    { name: 'shapes', icon: Shapes },
  ],
  gastronomia: [
    { name: 'utensils', icon: Utensils },
    { name: 'wine', icon: Wine },
    { name: 'martini', icon: Martini },
    { name: 'beer', icon: Beer },
    { name: 'coffee', icon: Coffee },
    { name: 'cup-soda', icon: CupSoda },
    { name: 'glass-water', icon: GlassWater },
    { name: 'milk', icon: Milk },
    { name: 'pizza', icon: Pizza },
    { name: 'sandwich', icon: Sandwich },
    { name: 'soup', icon: Soup },
    { name: 'salad', icon: Salad },
    { name: 'beef', icon: Beef },
    { name: 'egg', icon: Egg },
    { name: 'croissant', icon: Croissant },
    { name: 'cake', icon: Cake },
    { name: 'cookie', icon: Cookie },
    { name: 'candy', icon: Candy },
    { name: 'ice-cream', icon: IceCream2 },
    { name: 'apple', icon: Apple },
    { name: 'cherry', icon: Cherry },
    { name: 'grape', icon: Grape },
    { name: 'citrus', icon: Citrus },
    { name: 'banana', icon: Banana },
    { name: 'carrot', icon: Carrot },
  ],
  transporte: [
    { name: 'car', icon: Car },
    { name: 'car-taxi', icon: CarTaxiFront },
    { name: 'bus', icon: Bus },
    { name: 'truck', icon: Truck },
    { name: 'ambulance', icon: Ambulance },
    { name: 'tractor', icon: Tractor },
    { name: 'forklift', icon: Forklift },
    { name: 'fuel', icon: Fuel },
    { name: 'plane', icon: Plane },
    { name: 'rocket', icon: Rocket },
    { name: 'ship', icon: Ship },
    { name: 'sailboat', icon: Sailboat },
    { name: 'train', icon: Train },
    { name: 'train-front', icon: TrainFront },
    { name: 'train-track', icon: TrainTrack },
    { name: 'cable', icon: Cable },
    { name: 'bike', icon: Bike },
  ],
  aventura: [
    { name: 'campervan', icon: Truck }, // Custom campervan icon - uses Truck as fallback in gallery
    { name: 'footprints', icon: Footprints },
    { name: 'tent', icon: Tent },
    { name: 'flame', icon: Flame },
    { name: 'backpack', icon: Backpack },
    { name: 'luggage', icon: Luggage },
    { name: 'compass', icon: Compass },
    { name: 'binoculars', icon: Binoculars },
    { name: 'mountain', icon: Mountain },
    { name: 'mountain-snow', icon: MountainSnow },
    { name: 'cable-car', icon: CableCar },
    { name: 'truck', icon: Truck },
    { name: 'sailboat', icon: Sailboat },
    { name: 'waves', icon: Waves },
    { name: 'bike', icon: Bike },
    { name: 'snowflake', icon: Snowflake },
    { name: 'pickaxe', icon: Pickaxe },
    { name: 'fish-symbol', icon: FishSymbol },
    { name: 'wind', icon: Wind },
    { name: 'dumbbell', icon: Dumbbell },
    { name: 'weight', icon: Weight },
    { name: 'volleyball', icon: Volleyball },
    { name: 'person-standing', icon: PersonStanding },
    { name: 'trophy', icon: Trophy },
    { name: 'medal', icon: Medal },
    { name: 'timer', icon: Timer },
    { name: 'clock', icon: Clock },
    { name: 'sword', icon: Sword },
    { name: 'target', icon: Target },
    { name: 'crosshair', icon: Crosshair },
    { name: 'gamepad', icon: Gamepad2 },
    { name: 'dice', icon: Dice5 },
    { name: 'puzzle', icon: Puzzle },
    { name: 'toy-brick', icon: ToyBrick },
    { name: 'wand', icon: Wand2 },
    { name: 'party', icon: PartyPopper },
    { name: 'glasses', icon: Glasses },
    { name: 'sun', icon: Sun },
    { name: 'sunrise', icon: Sunrise },
    { name: 'bird', icon: Bird },
    { name: 'zap', icon: Zap },
    { name: 'sparkles', icon: Sparkles },
    { name: 'rocket', icon: Rocket },
    { name: 'flag', icon: Flag },
    { name: 'anchor', icon: Anchor },
  ],
  ciencia: [
    { name: 'microscope', icon: Microscope },
    { name: 'telescope', icon: Telescope },
    { name: 'atom', icon: Atom },
    { name: 'dna', icon: Dna },
    { name: 'flask', icon: FlaskConical },
    { name: 'test-tube', icon: TestTube2 },
    { name: 'pill', icon: Pill },
    { name: 'syringe', icon: Syringe },
    { name: 'stethoscope', icon: Stethoscope },
    { name: 'heart-pulse', icon: HeartPulse },
    { name: 'activity', icon: Activity },
    { name: 'cpu', icon: Cpu },
    { name: 'hard-drive', icon: HardDrive },
    { name: 'server', icon: Server },
    { name: 'database', icon: Database },
  ],
  comercio: [
    { name: 'shopping-cart', icon: ShoppingCart },
    { name: 'shopping-bag', icon: ShoppingBag },
    { name: 'gift', icon: Gift },
    { name: 'package', icon: Package },
    { name: 'box', icon: Box },
    { name: 'archive', icon: Archive },
    { name: 'coins', icon: Coins },
    { name: 'banknote', icon: Banknote },
    { name: 'credit-card', icon: CreditCard },
    { name: 'receipt', icon: Receipt },
    { name: 'watch', icon: Watch },
    { name: 'shirt', icon: Shirt },
  ],
  social: [
    { name: 'users', icon: Users },
    { name: 'user-circle', icon: UserCircle },
    { name: 'person-standing', icon: PersonStanding },
    { name: 'accessibility', icon: Accessibility },
    { name: 'baby', icon: Baby },
    { name: 'hand', icon: Hand },
    { name: 'hand-heart', icon: HandHeart },
    { name: 'handshake', icon: Handshake },
    { name: 'smile', icon: Smile },
    { name: 'thumbs-up', icon: ThumbsUp },
    { name: 'message', icon: MessageCircle },
    { name: 'mail', icon: Mail },
    { name: 'bell', icon: Bell },
    { name: 'megaphone', icon: Megaphone },
    { name: 'quote', icon: Quote },
  ],
  seguridad: [
    { name: 'lock', icon: Lock },
    { name: 'key', icon: Key },
    { name: 'key-round', icon: KeyRound },
    { name: 'shield', icon: Shield },
    { name: 'shield-check', icon: ShieldCheck },
    { name: 'badge-check', icon: BadgeCheck },
    { name: 'circle-check', icon: CircleCheck },
    { name: 'hammer', icon: Hammer },
    { name: 'wrench', icon: Wrench },
    { name: 'hard-hat', icon: HardHat },
    { name: 'scissors', icon: Scissors },
    { name: 'ruler', icon: Ruler },
  ],
  tiempo: [
    { name: 'clock', icon: Clock },
    { name: 'timer', icon: Timer },
    { name: 'hourglass', icon: Hourglass },
    { name: 'calendar', icon: Calendar },
    { name: 'calendar-days', icon: CalendarDays },
    { name: 'bell-ring', icon: BellRing },
    { name: 'ghost', icon: Ghost },
    { name: 'skull', icon: Skull },
    { name: 'bone', icon: Bone },
  ],
};

const NATURE_EXAMPLES = [
  'Lugares de interés turístico general',
  'Monumentos históricos y patrimonio arquitectónico',
  'Espacios naturales, parques y paisajes',
  'Playas, calas y zonas costeras',
  'Restaurantes, bares y gastronomía local',
  'Alojamientos turísticos',
  'Pueblos pintorescos y núcleos rurales',
  'Miradores y puntos panorámicos',
  'Museos y espacios culturales',
  'Iglesias, ermitas y patrimonio religioso',
  'Yacimientos arqueológicos y ruinas',
];

const TONE_OPTIONS = [
  { value: 'tecnico', label: 'Técnico', description: 'Datos precisos, objetivo, enciclopédico', icon: '📊' },
  { value: 'divulgativo', label: 'Divulgativo', description: 'Equilibrio entre datos y narrativa', icon: '📖' },
  { value: 'poetico', label: 'Poético', description: 'Evocador, sensorial, literario', icon: '✨' },
];

// Preview text examples for each tone
const getPreviewText = (tone: string): string => {
  const previews: Record<string, string> = {
    tecnico: 'El Monasterio de San Juan de la Peña, fundado en el siglo X, constituye un ejemplo paradigmático de la arquitectura románica aragonesa. Su claustro, excavado bajo una formación rocosa de arenisca, presenta capiteles historiados con escenas bíblicas datados entre los siglos XII-XIII.',
    divulgativo: 'Escondido bajo un impresionante voladizo rocoso, el Monasterio de San Juan de la Peña es uno de los lugares más mágicos de Aragón. Este antiguo santuario, cuna del reino aragonés, combina historia medieval con un entorno natural espectacular que deja sin aliento a sus visitantes.',
    poetico: 'Donde la piedra abraza al cielo y el tiempo parece detenerse, San Juan de la Peña emerge como un susurro entre montañas. Bajo la caricia del acantilado que lo protege, sus muros centenarios guardan el eco de oraciones antiguas y el latido de un reino que nació entre estas rocas sagradas.',
    formal: 'El Real Monasterio de San Juan de la Peña, declarado Bien de Interés Cultural, representa un hito fundamental en el patrimonio histórico-artístico de la Comunidad Autónoma de Aragón. Su valor arquitectónico y su significación histórica lo convierten en un referente institucional de primer orden.',
    casual: '¿Buscas un lugar que te deje con la boca abierta? San Juan de la Peña es de esos sitios que parece sacado de una película. Imagínate un monasterio medieval metido literalmente dentro de una montaña. Cuando lo veas, entenderás por qué dicen que aquí nació Aragón.',
  };
  return previews[tone] || previews.divulgativo;
};

// Custom Campervan SVG Icon component
const CampervanIcon = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    {/* Main body */}
    <path d="M2 15h20" />
    <path d="M2 11h3l2-4h10l2 4h3" />
    <path d="M5 11v4" />
    <path d="M19 11v4" />
    {/* Cabin window */}
    <rect x="7" y="5" width="4" height="3" rx="0.5" />
    {/* Back window */}
    <rect x="14" y="6" width="3" height="2" rx="0.5" />
    {/* Wheels */}
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
    {/* Water drain waves */}
    <path d="M10 20c.5.5 1 .8 2 .8s1.5-.3 2-.8" />
  </svg>
);

const DEFAULT_PREFERENCES: EnrichmentPreferences = {
  icon: 'map-pin', // Use Lucide icon name, not emoji
  enrichment_expected_nature: 'Lugares de interés turístico general',
  enrichment_search_radius_meters: 500,
  enrichment_include_contact: true,
  enrichment_show_sources: true,
  enrichment_correct_coordinates: false,
  enrichment_tone: 'divulgativo',
  enrichment_min_length: 1500,
  enrichment_custom_prompt: null,
  enrichment_include_image: true,
  enrichment_include_web: true,
  enrichment_include_tags: true,
  enrichment_include_interest_index: true,
  enrichment_focus_keywords: [],
  enrichment_exclude_keywords: [],
};

export function CuratorEnrichmentSettings({
  curatorId: initialCuratorId,
  curatorName: initialCuratorName,
  open,
  onOpenChange,
}: CuratorEnrichmentSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [preferences, setPreferences] = useState<EnrichmentPreferences>(DEFAULT_PREFERENCES);
  const [newFocusKeyword, setNewFocusKeyword] = useState('');
  const [newExcludeKeyword, setNewExcludeKeyword] = useState('');
  const [curatorLocations, setCuratorLocations] = useState<CuratorLocation[]>([]);
  const [selectedPreviewLocation, setSelectedPreviewLocation] = useState<CuratorLocation | null>(null);
  const [activeTab, setActiveTab] = useState('settings');
  
  // Avatar upload state
  const [curatorAvatar, setCuratorAvatar] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  // Wikimedia search state for curator avatar
  const [showWikimediaSearch, setShowWikimediaSearch] = useState(false);
  const [wikimediaQuery, setWikimediaQuery] = useState('');
  const [wikimediaImages, setWikimediaImages] = useState<{title: string; url: string; thumbUrl: string; author?: string; license?: string}[]>([]);
  const [wikimediaLoading, setWikimediaLoading] = useState(false);
  const [selectedWikimediaImage, setSelectedWikimediaImage] = useState<{title: string; url: string; thumbUrl: string; author?: string; license?: string} | null>(null);
  
  // Selection state for batch enrichment
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());
  const [isEnriching, setIsEnriching] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState({ current: 0, total: 0, successCount: 0, errorCount: 0, validationPending: 0 });
  
  // List filter state: 'all' | 'pending' | 'enriched'
  const [listFilter, setListFilter] = useState<'all' | 'pending' | 'enriched'>('all');
  const pauseRef = useRef(false);
  const abortRef = useRef(false);
  const remainingIdsRef = useRef<string[]>([]);
  
  // Validation queue state
  const [pendingValidations, setPendingValidations] = useState<PendingValidation[]>([]);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [currentValidation, setCurrentValidation] = useState<PendingValidation | null>(null);
  
  // Emit event when pending validations count changes
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('pending-validations-updated', {
      detail: { 
        count: pendingValidations.length,
        names: pendingValidations.map(v => v.locationName)
      }
    }));
  }, [pendingValidations]);
  
  // Curator selector state
  const [curators, setCurators] = useState<CuratorOption[]>([]);
  const [selectedCuratorId, setSelectedCuratorId] = useState<string>(initialCuratorId || '');
  const [selectedCuratorName, setSelectedCuratorName] = useState<string>(initialCuratorName || '');
  
  // Get locations from store that belong to curator
  const { getFilteredLocations, updateLocation, updateCuratorInfo } = useLocationsStore();

  // Load all curators on open
  useEffect(() => {
    if (!open) return;

    const fetchCurators = async () => {
      try {
        const { data, error } = await supabase
          .from('curators')
          .select('id, name, icon, color')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        
        if (data && data.length > 0) {
          setCurators(data);
          // If no initial curator, select the first one
          if (!initialCuratorId && data.length > 0) {
            setSelectedCuratorId(data[0].id);
            setSelectedCuratorName(data[0].name);
          } else if (initialCuratorId) {
            setSelectedCuratorId(initialCuratorId);
            const found = data.find(c => c.id === initialCuratorId);
            if (found) setSelectedCuratorName(found.name);
          }
        }
      } catch (error) {
        console.error('Error loading curators:', error);
      }
    };

    fetchCurators();
  }, [open, initialCuratorId]);

  // Auto-switch to preview tab when there are pending validations and dialog opens
  useEffect(() => {
    if (open && pendingValidations.length > 0) {
      setActiveTab('preview');
    }
  }, [open, pendingValidations.length]);

  // Load preferences and curator locations when selected curator changes
  useEffect(() => {
    if (!open || !selectedCuratorId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch preferences including avatar_url
        const { data: prefData, error: prefError } = await supabase
          .from('curators')
          .select('icon, avatar_url, enrichment_expected_nature, enrichment_search_radius_meters, enrichment_include_contact, enrichment_show_sources, enrichment_correct_coordinates, enrichment_tone, enrichment_min_length, enrichment_custom_prompt, enrichment_include_image, enrichment_include_web, enrichment_include_tags, enrichment_include_interest_index, enrichment_focus_keywords, enrichment_exclude_keywords')
          .eq('id', selectedCuratorId)
          .single();

        if (prefError) throw prefError;

        if (prefData) {
          // Set avatar
          setCuratorAvatar(prefData.avatar_url || null);
          setAvatarPreview(null);
          setAvatarFile(null);
          
          setPreferences({
            icon: prefData.icon || DEFAULT_PREFERENCES.icon,
            enrichment_expected_nature: prefData.enrichment_expected_nature || DEFAULT_PREFERENCES.enrichment_expected_nature,
            enrichment_search_radius_meters: prefData.enrichment_search_radius_meters || DEFAULT_PREFERENCES.enrichment_search_radius_meters,
            enrichment_include_contact: prefData.enrichment_include_contact ?? DEFAULT_PREFERENCES.enrichment_include_contact,
            enrichment_show_sources: prefData.enrichment_show_sources ?? DEFAULT_PREFERENCES.enrichment_show_sources,
            enrichment_correct_coordinates: prefData.enrichment_correct_coordinates ?? DEFAULT_PREFERENCES.enrichment_correct_coordinates,
            enrichment_tone: prefData.enrichment_tone || DEFAULT_PREFERENCES.enrichment_tone,
            enrichment_min_length: prefData.enrichment_min_length || DEFAULT_PREFERENCES.enrichment_min_length,
            enrichment_custom_prompt: prefData.enrichment_custom_prompt,
            enrichment_include_image: prefData.enrichment_include_image ?? DEFAULT_PREFERENCES.enrichment_include_image,
            enrichment_include_web: prefData.enrichment_include_web ?? DEFAULT_PREFERENCES.enrichment_include_web,
            enrichment_include_tags: prefData.enrichment_include_tags ?? DEFAULT_PREFERENCES.enrichment_include_tags,
            enrichment_include_interest_index: prefData.enrichment_include_interest_index ?? DEFAULT_PREFERENCES.enrichment_include_interest_index,
            enrichment_focus_keywords: prefData.enrichment_focus_keywords || [],
            enrichment_exclude_keywords: prefData.enrichment_exclude_keywords || [],
          });
        }

        // Fetch curator locations
        const { data: curatorDocs } = await supabase
          .from('curator_documents')
          .select('document_id')
          .eq('curator_id', selectedCuratorId);
        
        if (curatorDocs && curatorDocs.length > 0) {
          const docIds = curatorDocs.map(cd => cd.document_id);
          const { data: locations } = await supabase
            .from('locations')
            .select('id, name, description, enriched_data, country, region')
            .in('document_id', docIds)
            .is('deleted_at', null)
            .order('name');
          
          if (locations) {
            setCuratorLocations(locations);
            // Set first unenriched location as preview
            const unenriched = locations.find(l => !l.enriched_data);
            setSelectedPreviewLocation(unenriched || locations[0] || null);
          }
        } else {
          setCuratorLocations([]);
          setSelectedPreviewLocation(null);
        }
      } catch (error) {
        console.error('Error loading curator data:', error);
        toast.error('Error al cargar datos del curador');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [open, selectedCuratorId]);
  
  // Calculate stats for locations
  const locationStats = useMemo(() => {
    const enriched = curatorLocations.filter(l => l.enriched_data).length;
    const pending = curatorLocations.length - enriched;
    return { total: curatorLocations.length, enriched, pending };
  }, [curatorLocations]);

  // Pending locations for quick selection
  const pendingLocations = useMemo(() => 
    curatorLocations.filter(l => !l.enriched_data),
  [curatorLocations]);

  // Enriched locations for re-enrichment
  const enrichedLocations = useMemo(() => 
    curatorLocations.filter(l => !!l.enriched_data),
  [curatorLocations]);

  // Filtered list based on listFilter state
  const filteredLocations = useMemo(() => {
    switch (listFilter) {
      case 'pending':
        return pendingLocations;
      case 'enriched':
        return enrichedLocations;
      default:
        return curatorLocations;
    }
  }, [curatorLocations, pendingLocations, enrichedLocations, listFilter]);

  // Selection helpers
  const toggleLocationSelection = (id: string) => {
    setSelectedLocationIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    // Select all from currently filtered list
    setSelectedLocationIds(new Set(filteredLocations.map(l => l.id)));
  };

  const clearSelection = () => {
    setSelectedLocationIds(new Set());
  };

  // Pause/Resume handlers
  const handlePause = () => {
    pauseRef.current = true;
    setIsPaused(true);
  };

  const handleResume = () => {
    pauseRef.current = false;
    setIsPaused(false);
    // Continue with remaining IDs
    if (remainingIdsRef.current.length > 0) {
      runEnrichmentLoop(remainingIdsRef.current, enrichmentProgress.successCount, enrichmentProgress.errorCount);
    }
  };

  const handleStop = () => {
    abortRef.current = true;
    pauseRef.current = false;
    setIsPaused(false);
    setIsEnriching(false);
    remainingIdsRef.current = [];
    
    const { successCount, errorCount } = enrichmentProgress;
    if (successCount > 0) {
      toast.success(`${successCount} punto(s) enriquecido(s) correctamente`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} punto(s) con errores`);
    }
  };

  const normalizeEnrichResult = (payload: any): { validation?: ValidationResult; enrichedData?: any } => {
    if (!payload) return {};

    // Validation response (direct)
    if (payload?.validation_required) {
      return { validation: payload as ValidationResult };
    }

    // Some responses return { success: true, data: { ...enriched } }
    if (payload?.success === true && payload?.data) {
      // Defensive: allow nested validation
      if (payload.data?.validation_required) {
        return { validation: payload.data as ValidationResult };
      }
      return { enrichedData: payload.data };
    }

    // Legacy shapes
    if (payload?.enrichedData) return { enrichedData: payload.enrichedData };
    if (payload?.enriched_data) return { enrichedData: payload.enriched_data };
    if (payload?.data?.enrichedData) return { enrichedData: payload.data.enrichedData };

    return {};
  };

  // Core enrichment loop
  const runEnrichmentLoop = async (idsToProcess: string[], startSuccess: number, startError: number) => {
    let successCount = startSuccess;
    let errorCount = startError;
    const totalOriginal = enrichmentProgress.total || idsToProcess.length + startSuccess + startError;

    for (let i = 0; i < idsToProcess.length; i++) {
      // Check for pause
      if (pauseRef.current) {
        remainingIdsRef.current = idsToProcess.slice(i);
        return; // Exit loop, will resume later
      }

      // Check for abort
      if (abortRef.current) {
        abortRef.current = false;
        return;
      }

      const locationId = idsToProcess[i];
      const location = curatorLocations.find(l => l.id === locationId);
      
      if (!location) continue;

      const currentProgress = startSuccess + startError + i + 1;
      setEnrichmentProgress({ current: currentProgress, total: totalOriginal, successCount, errorCount, validationPending: pendingValidations.length });

      try {
        // Get location coordinates from database
        const { data: locData, error: locError } = await supabase
          .from('locations')
          .select('latitude, longitude')
          .eq('id', locationId)
          .single();

        if (locError) throw locError;

        // Call enrichment edge function
        const { data, error } = await supabase.functions.invoke('enrich-location', {
          body: {
            location: {
              name: location.name,
              description: location.description || '',
              coordinates: { lat: locData.latitude, lng: locData.longitude },
            },
            curatorId: selectedCuratorId,
          },
        });

        if (error) throw error;

        const { validation, enrichedData } = normalizeEnrichResult(data);

        // Check if validation is required
        if (validation) {
          console.log('Validation required for:', location.name);
          setPendingValidations(prev => [...prev, {
            locationId,
            locationName: location.name,
            validationResult: validation,
          }]);
          setEnrichmentProgress(prev => ({ ...prev, validationPending: prev.validationPending + 1 }));
        } else if (enrichedData) {
          // Update local state with enriched data
          setCuratorLocations(prev => 
            prev.map(l => l.id === locationId ? { ...l, enriched_data: enrichedData } : l)
          );

          // Update global store (map counters, markers)
          updateLocation(locationId, { enrichedData });

          successCount++;
          setEnrichmentProgress(prev => ({ ...prev, successCount }));
        }
      } catch (err) {
        console.error(`Error enriching ${location.name}:`, err);
        errorCount++;
        setEnrichmentProgress(prev => ({ ...prev, errorCount }));
      }

      // Small delay between requests to avoid rate limiting
      if (i < idsToProcess.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Finished processing all
    setIsEnriching(false);
    setSelectedLocationIds(new Set());
    remainingIdsRef.current = [];
    
    // Show summary
    const validationCount = pendingValidations.length;
    if (successCount > 0) {
      toast.success(`${successCount} punto(s) enriquecido(s) correctamente`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} punto(s) con errores`);
    }
    if (validationCount > 0) {
      toast.info(`${validationCount} punto(s) requieren validación manual`, {
        description: 'Revisa los candidatos sugeridos para cada punto',
        duration: 5000,
      });
    }
  };

  // Handle single location enrichment (inline button)
  const handleEnrichSingle = async (locationId: string) => {
    const location = curatorLocations.find(l => l.id === locationId);
    if (!location) return;

    try {
      // Get location coordinates
      const { data: locData, error: locError } = await supabase
        .from('locations')
        .select('latitude, longitude')
        .eq('id', locationId)
        .single();

      if (locError) throw locError;

      toast.info(`Enriqueciendo "${location.name}"...`);

      const { data, error } = await supabase.functions.invoke('enrich-location', {
        body: {
          location: {
            name: location.name,
            description: location.description || '',
            coordinates: { lat: locData.latitude, lng: locData.longitude },
          },
          curatorId: selectedCuratorId,
        },
      });

      if (error) throw error;

      const { validation, enrichedData } = normalizeEnrichResult(data);

      if (validation) {
        setPendingValidations(prev => [...prev, {
          locationId,
          locationName: location.name,
          validationResult: validation,
        }]);
        toast.info(`"${location.name}" requiere validación manual`);
      } else if (enrichedData) {
        setCuratorLocations(prev => 
          prev.map(l => l.id === locationId ? { ...l, enriched_data: enrichedData } : l)
        );
        updateLocation(locationId, { enrichedData });
        toast.success(`"${location.name}" enriquecido correctamente`);
      }
    } catch (err) {
      console.error(`Error enriching ${location.name}:`, err);
      toast.error(`Error al enriquecer "${location.name}"`);
    }
  };

  // Handle confirmed validation - enrich with user-selected candidate
  const handleConfirmValidation = async (validation: PendingValidation, candidateName?: string) => {
    try {
      // Get location coordinates
      const { data: locData, error: locError } = await supabase
        .from('locations')
        .select('latitude, longitude')
        .eq('id', validation.locationId)
        .single();

      if (locError) throw locError;

      const location = curatorLocations.find(l => l.id === validation.locationId);
      if (!location) throw new Error('Location not found');

      // Call enrichment with skipValidation=true and confirmed candidate
      const { data, error } = await supabase.functions.invoke('enrich-location', {
        body: {
          location: {
            name: candidateName || location.name,
            description: location.description || '',
            coordinates: { lat: locData.latitude, lng: locData.longitude },
          },
          curatorId: selectedCuratorId,
          skipValidation: true,
          confirmedCandidate: candidateName,
        },
      });

      if (error) throw error;

      const { enrichedData } = normalizeEnrichResult(data);

      if (enrichedData) {
        // Update local state
        setCuratorLocations(prev => 
          prev.map(l => l.id === validation.locationId ? { ...l, enriched_data: enrichedData } : l)
        );
        updateLocation(validation.locationId, { enrichedData });
        toast.success(`"${location.name}" enriquecido correctamente`);
      }

      // Remove from pending validations
      setPendingValidations(prev => prev.filter(v => v.locationId !== validation.locationId));
      setCurrentValidation(null);
      setShowValidationDialog(false);
      
    } catch (err) {
      console.error('Error confirming validation:', err);
      toast.error('Error al enriquecer el punto');
    }
  };

  // Skip validation for a location
  const handleSkipValidation = (validation: PendingValidation) => {
    setPendingValidations(prev => prev.filter(v => v.locationId !== validation.locationId));
    setCurrentValidation(null);
    setShowValidationDialog(false);
    toast.info(`"${validation.locationName}" omitido del enriquecimiento`);
  };

  // Open validation dialog for a pending item
  const openValidationDialog = (validation: PendingValidation) => {
    setCurrentValidation(validation);
    setShowValidationDialog(true);
  };

  // Enrichment handler - start new enrichment
  const handleEnrichSelected = async () => {
    if (selectedLocationIds.size === 0) {
      toast.error('Selecciona al menos un punto para enriquecer');
      return;
    }

    // Reset state
    pauseRef.current = false;
    abortRef.current = false;
    setIsPaused(false);
    setIsEnriching(true);
    setPendingValidations([]);
    setEnrichmentProgress({ current: 0, total: selectedLocationIds.size, successCount: 0, errorCount: 0, validationPending: 0 });
    
    const idsToEnrich = Array.from(selectedLocationIds);
    remainingIdsRef.current = idsToEnrich;
    
    await runEnrichmentLoop(idsToEnrich, 0, 0);
  };

  // Wikimedia search function
  const searchWikimediaForAvatar = async (query: string) => {
    if (!query.trim()) return;
    
    setWikimediaLoading(true);
    setWikimediaImages([]);
    
    try {
      const searchUrl = `https://commons.wikimedia.org/w/api.php?` +
        `action=query&format=json&origin=*` +
        `&generator=search&gsrnamespace=6&gsrlimit=20` +
        `&gsrsearch=${encodeURIComponent(query)}` +
        `&prop=imageinfo&iiprop=url|extmetadata|size` +
        `&iiurlwidth=400`;

      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.query?.pages) {
        const results: {title: string; url: string; thumbUrl: string; author?: string; license?: string}[] = [];
        
        for (const page of Object.values(data.query.pages) as any[]) {
          if (page.imageinfo?.[0]) {
            const info = page.imageinfo[0];
            const meta = info.extmetadata || {};
            
            const title = page.title?.toLowerCase() || '';
            const isPhoto = !title.includes('flag') && 
                           !title.includes('logo') && 
                           !title.includes('icon') &&
                           !title.includes('map') &&
                           !title.includes('coat of arms') &&
                           !title.includes('escudo') &&
                           !title.includes('bandera') &&
                           info.width > 200 && 
                           info.height > 150;
            
            if (isPhoto) {
              results.push({
                title: page.title?.replace('File:', '') || 'Sin título',
                url: info.url,
                thumbUrl: info.thumburl || info.url,
                author: meta.Artist?.value?.replace(/<[^>]*>/g, '') || 'Desconocido',
                license: meta.LicenseShortName?.value || 'CC',
              });
            }
          }
        }
        
        setWikimediaImages(results);
        
        if (results.length === 0) {
          toast.info('No se encontraron imágenes');
        }
      }
    } catch (error) {
      console.error('Error searching Wikimedia:', error);
      toast.error('Error al buscar imágenes');
    } finally {
      setWikimediaLoading(false);
    }
  };

  const handleSelectWikimediaImage = async (image: typeof selectedWikimediaImage) => {
    if (!image) return;
    
    setUploadingAvatar(true);
    try {
      // Download image
      const imageResponse = await fetch(image.url);
      const imageBlob = await imageResponse.blob();
      
      // Upload to storage
      const ext = image.url.split('.').pop()?.split('?')[0] || 'jpg';
      const fileName = `curator-${selectedCuratorId}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, imageBlob, {
          upsert: true,
          contentType: imageBlob.type || 'image/jpeg',
        });
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
      
      const finalUrl = `${publicUrl}?t=${Date.now()}`;
      setCuratorAvatar(finalUrl);
      setAvatarPreview(null);
      setAvatarFile(null);
      setShowWikimediaSearch(false);
      setSelectedWikimediaImage(null);
      setWikimediaImages([]);
      
      toast.success('Imagen de Wikimedia aplicada');
    } catch (error) {
      console.error('Error saving wikimedia image:', error);
      toast.error('Error al guardar la imagen');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Upload avatar if a new file was selected
      let avatarUrl = curatorAvatar;
      
      if (avatarFile) {
        setUploadingAvatar(true);
        try {
          const fileExt = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg';
          const fileName = `curator-${selectedCuratorId}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, avatarFile, {
              upsert: true,
              contentType: avatarFile.type || 'image/jpeg',
            });
          
          if (uploadError) throw uploadError;
          
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);
          
          avatarUrl = `${publicUrl}?t=${Date.now()}`;
        } catch (error) {
          console.error('Error uploading avatar:', error);
          toast.error('Error al subir la imagen');
        } finally {
          setUploadingAvatar(false);
        }
      }
      
      const { error } = await supabase
        .from('curators')
        .update({
          icon: preferences.icon,
          avatar_url: avatarUrl,
          enrichment_expected_nature: preferences.enrichment_expected_nature,
          enrichment_search_radius_meters: preferences.enrichment_search_radius_meters,
          enrichment_include_contact: preferences.enrichment_include_contact,
          enrichment_show_sources: preferences.enrichment_show_sources,
          enrichment_correct_coordinates: preferences.enrichment_correct_coordinates,
          enrichment_tone: preferences.enrichment_tone,
          enrichment_min_length: preferences.enrichment_min_length,
          enrichment_custom_prompt: preferences.enrichment_custom_prompt || null,
          enrichment_include_image: preferences.enrichment_include_image,
          enrichment_include_web: preferences.enrichment_include_web,
          enrichment_include_tags: preferences.enrichment_include_tags,
          enrichment_include_interest_index: preferences.enrichment_include_interest_index,
          enrichment_focus_keywords: preferences.enrichment_focus_keywords,
          enrichment_exclude_keywords: preferences.enrichment_exclude_keywords,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedCuratorId);

      if (error) throw error;

      // Update curator info in the store to reflect changes in map markers/popups
      updateCuratorInfo(selectedCuratorId, {
        icon: preferences.icon,
        avatar: avatarUrl || undefined,
      });
      
      // Emit event to trigger map update
      window.dispatchEvent(new CustomEvent('curator-info-updated', {
        detail: { curatorId: selectedCuratorId }
      }));

      toast.success('Preferencias de enriquecimiento guardadas');
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Error al guardar preferencias');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setPreferences(DEFAULT_PREFERENCES);
  };

  const addFocusKeyword = () => {
    if (newFocusKeyword.trim() && !preferences.enrichment_focus_keywords.includes(newFocusKeyword.trim())) {
      setPreferences({
        ...preferences,
        enrichment_focus_keywords: [...preferences.enrichment_focus_keywords, newFocusKeyword.trim()],
      });
      setNewFocusKeyword('');
    }
  };

  const removeFocusKeyword = (keyword: string) => {
    setPreferences({
      ...preferences,
      enrichment_focus_keywords: preferences.enrichment_focus_keywords.filter((k) => k !== keyword),
    });
  };

  const addExcludeKeyword = () => {
    if (newExcludeKeyword.trim() && !preferences.enrichment_exclude_keywords.includes(newExcludeKeyword.trim())) {
      setPreferences({
        ...preferences,
        enrichment_exclude_keywords: [...preferences.enrichment_exclude_keywords, newExcludeKeyword.trim()],
      });
      setNewExcludeKeyword('');
    }
  };

  const removeExcludeKeyword = (keyword: string) => {
    setPreferences({
      ...preferences,
      enrichment_exclude_keywords: preferences.enrichment_exclude_keywords.filter((k) => k !== keyword),
    });
  };

  // Handle curator selection change
  const handleCuratorChange = (newCuratorId: string) => {
    const curator = curators.find(c => c.id === newCuratorId);
    if (curator) {
      setSelectedCuratorId(newCuratorId);
      setSelectedCuratorName(curator.name);
      setPreferences(DEFAULT_PREFERENCES);
      setCuratorLocations([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            Preferencias de enriquecimiento
          </DialogTitle>
          <DialogDescription>
            Configura cómo se generan las fichas IA para cada curador virtual.
          </DialogDescription>
        </DialogHeader>

        {/* Curator Selector */}
        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border">
          <Label className="text-sm font-medium whitespace-nowrap">Curador:</Label>
          <Select value={selectedCuratorId} onValueChange={handleCuratorChange}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Selecciona un curador">
                {selectedCuratorName && (
                  <div className="flex items-center gap-2">
                    {(() => {
                      const curator = curators.find(c => c.id === selectedCuratorId);
                      const iconData = Object.values(LUCIDE_ICON_GALLERY).flat().find(i => i.name === curator?.icon);
                      if (iconData) {
                        const IconComponent = iconData.icon;
                        return <IconComponent className="w-4 h-4" style={{ color: curator?.color || 'currentColor' }} />;
                      }
                      return <MapPin className="w-4 h-4" style={{ color: curator?.color || 'currentColor' }} />;
                    })()}
                    <span>{selectedCuratorName}</span>
                  </div>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {curators.map((curator) => {
                const iconData = Object.values(LUCIDE_ICON_GALLERY).flat().find(i => i.name === curator.icon);
                const IconComponent = iconData?.icon || MapPin;
                return (
                  <SelectItem key={curator.id} value={curator.id}>
                    <div className="flex items-center gap-2">
                      <IconComponent className="w-4 h-4" style={{ color: curator.color || 'currentColor' }} />
                      <span>{curator.name}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-w-0">
            <TabsList className="grid w-full grid-cols-2 mb-4 shrink-0">
              <TabsTrigger value="settings" className="gap-2">
                <Settings2 className="w-4 h-4" />
                Configuración
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-2">
                <ListChecks className="w-4 h-4" />
                Puntos ({locationStats.total})
              </TabsTrigger>
            </TabsList>
            
            {/* Settings Tab */}
            <TabsContent value="settings" className="flex-1 overflow-y-auto space-y-6 mt-0 min-w-0">
            
            {/* ICON SELECTOR */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="w-4 h-4" />
                Icono del curador
              </div>
              <p className="text-xs text-muted-foreground">
                Este icono aparecerá en los marcadores del mapa para identificar los puntos de este curador.
              </p>
              
              {/* Current selection preview */}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  {(() => {
                    if (preferences.icon === 'campervan') {
                      return <CampervanIcon className="w-6 h-6 text-primary" />;
                    }
                    const iconData = Object.values(LUCIDE_ICON_GALLERY).flat().find(i => i.name === preferences.icon);
                    if (iconData) {
                      const IconComponent = iconData.icon;
                      return <IconComponent className="w-6 h-6 text-primary" />;
                    }
                    return <MapPin className="w-6 h-6 text-primary" />;
                  })()}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Icono seleccionado: <span className="text-primary">{preferences.icon}</span></div>
                  <div className="text-xs text-muted-foreground">Haz clic en cualquier icono para cambiarlo</div>
                </div>
              </div>
              
              {/* Icon gallery by category */}
              <div className="space-y-3">
                {Object.entries(LUCIDE_ICON_GALLERY).map(([category, icons]) => (
                  <div key={category} className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground capitalize">{category}</div>
                    <div className="flex flex-wrap gap-1">
                      {icons.map(({ name, icon: IconComponent }) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setPreferences({ ...preferences, icon: name })}
                          className={`w-9 h-9 rounded-md transition-all flex items-center justify-center ${
                            preferences.icon === name 
                              ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 scale-110' 
                              : 'bg-muted hover:bg-muted/80 hover:scale-105'
                          }`}
                          title={name}
                        >
                          {name === 'campervan' ? (
                            <CampervanIcon className="w-4 h-4" />
                          ) : (
                            <IconComponent className="w-4 h-4" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* AVATAR UPLOAD */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Camera className="w-4 h-4" />
                Imagen del curador
              </div>
              <p className="text-xs text-muted-foreground">
                Esta imagen aparecerá como fondo en los popups de todos los puntos de este curador, con el icono superpuesto.
              </p>
              
              <div className="flex items-center gap-4">
                {/* Avatar preview */}
                <div 
                  className="relative w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 overflow-hidden bg-muted/50 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors group"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {(avatarPreview || curatorAvatar) ? (
                    <>
                      <img 
                        src={avatarPreview || curatorAvatar || ''} 
                        alt="Curador" 
                        className="w-full h-full object-cover"
                      />
                      {/* Overlay icon */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                          {(() => {
                            const iconData = Object.values(LUCIDE_ICON_GALLERY).flat().find(i => i.name === preferences.icon);
                            if (iconData) {
                              const IconComponent = iconData.icon;
                              return <IconComponent className="w-5 h-5 text-primary" />;
                            }
                            return <MapPin className="w-5 h-5 text-primary" />;
                          })()}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-primary transition-colors">
                      <Camera className="w-6 h-6" />
                      <span className="text-[10px]">Añadir imagen</span>
                    </div>
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 space-y-2">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setAvatarFile(file);
                        setAvatarPreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => avatarInputRef.current?.click()}
                    className="w-full"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    {curatorAvatar || avatarPreview ? 'Cambiar' : 'Subir imagen'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowWikimediaSearch(true);
                      setWikimediaQuery('');
                      setWikimediaImages([]);
                      setSelectedWikimediaImage(null);
                    }}
                    className="w-full"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Buscar imagen libre
                  </Button>
                  {(curatorAvatar || avatarPreview) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCuratorAvatar(null);
                        setAvatarFile(null);
                        setAvatarPreview(null);
                      }}
                      className="w-full text-destructive hover:text-destructive"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Eliminar
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Wikimedia Search Panel */}
              <AnimatePresence>
                {showWikimediaSearch && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 border-t border-border space-y-3">
                      <form 
                        onSubmit={(e) => {
                          e.preventDefault();
                          searchWikimediaForAvatar(wikimediaQuery);
                        }}
                        className="flex gap-2"
                      >
                        <Input
                          value={wikimediaQuery}
                          onChange={(e) => setWikimediaQuery(e.target.value)}
                          placeholder="Buscar en Wikimedia Commons..."
                          className="flex-1 h-8 text-sm"
                        />
                        <Button 
                          type="submit" 
                          size="sm" 
                          variant="secondary"
                          disabled={wikimediaLoading || !wikimediaQuery.trim()}
                        >
                          {wikimediaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        </Button>
                        <Button 
                          type="button" 
                          size="sm" 
                          variant="ghost"
                          onClick={() => setShowWikimediaSearch(false)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </form>
                      
                      {/* Results grid */}
                      {wikimediaLoading ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                          <Loader2 className="w-6 h-6 animate-spin mr-2" />
                          <span className="text-sm">Buscando...</span>
                        </div>
                      ) : wikimediaImages.length > 0 ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto">
                            {wikimediaImages.map((image, index) => (
                              <button
                                key={index}
                                type="button"
                                onClick={() => setSelectedWikimediaImage(image)}
                                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                                  selectedWikimediaImage === image
                                    ? 'border-primary ring-2 ring-primary/30'
                                    : 'border-transparent hover:border-primary/50'
                                }`}
                              >
                                <img
                                  src={image.thumbUrl}
                                  alt={image.title}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                {selectedWikimediaImage === image && (
                                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                    <CheckSquare className="w-6 h-6 text-primary bg-white rounded p-0.5" />
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                          
                          {selectedWikimediaImage && (
                            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                              <img
                                src={selectedWikimediaImage.thumbUrl}
                                alt=""
                                className="w-10 h-10 rounded object-cover"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{selectedWikimediaImage.title}</p>
                                <p className="text-[10px] text-muted-foreground">{selectedWikimediaImage.license} · {selectedWikimediaImage.author}</p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleSelectWikimediaImage(selectedWikimediaImage)}
                                disabled={uploadingAvatar}
                              >
                                {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Usar'}
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : wikimediaQuery && !wikimediaLoading ? (
                        <p className="text-center text-xs text-muted-foreground py-4">
                          Escribe un término y pulsa buscar
                        </p>
                      ) : null}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* PRIMARY SETTINGS - Nature, Radius, Image, Contact */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Compass className="w-4 h-4" />
                Normas de búsqueda
              </div>
              
              {/* Expected Nature */}
              <div className="space-y-2">
                <Label className="text-sm">Naturaleza esperada de los puntos</Label>
                <Textarea
                  value={preferences.enrichment_expected_nature}
                  onChange={(e) => setPreferences({ ...preferences, enrichment_expected_nature: e.target.value })}
                  placeholder="Describe el tipo de lugares que contiene este conjunto de puntos..."
                  rows={2}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  La IA usará esta descripción para buscar los puntos más próximos respecto al radio de búsqueda para definir el lugar de enriquecimiento.
                </p>
                <div className="flex flex-wrap gap-1">
                  {NATURE_EXAMPLES.slice(0, 4).map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setPreferences({ ...preferences, enrichment_expected_nature: example })}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Search Radius */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm">
                    <Target className="w-4 h-4" />
                    Radio de búsqueda
                  </Label>
                  <span className="text-sm font-bold text-primary">
                    {preferences.enrichment_search_radius_meters >= 1000 
                      ? `${(preferences.enrichment_search_radius_meters / 1000).toFixed(1)} km`
                      : `${preferences.enrichment_search_radius_meters} m`
                    }
                  </span>
                </div>
                <Slider
                  value={[preferences.enrichment_search_radius_meters]}
                  onValueChange={([value]) => setPreferences({ ...preferences, enrichment_search_radius_meters: value })}
                  min={50}
                  max={5000}
                  step={50}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>50 m (preciso)</span>
                  <span>5 km (amplio)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Distancia máxima desde las coordenadas para buscar resultados compatibles
                </p>
              </div>
              
              {/* Quick toggles in grid */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-primary/10">
                <div className="flex items-center justify-between p-2 rounded-md bg-background">
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Imagen</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_include_image}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_include_image: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-2 rounded-md bg-background">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Contacto</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_include_contact}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_include_contact: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-2 rounded-md bg-background">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Fuentes</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_show_sources}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_show_sources: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-2 rounded-md bg-background">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Corregir ubicación</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_correct_coordinates}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_correct_coordinates: checked })
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Si "Corregir ubicación" está activo, la IA puede mover el punto a las coordenadas exactas si detecta discrepancia.
              </p>
            </div>
            
            <Separator />
            
            {/* Tone selection - 3 cards */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Tono de descripción
              </Label>
              <div className="grid grid-cols-3 gap-3">
                {TONE_OPTIONS.map((option) => {
                  const isSelected = preferences.enrichment_tone === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPreferences({ ...preferences, enrichment_tone: option.value })}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        isSelected 
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/20' 
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <div className="text-xl mb-1">{option.icon}</div>
                      <div className={`font-medium text-sm ${isSelected ? 'text-primary' : ''}`}>
                        {option.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground leading-tight mt-1">
                        {option.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Min length */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Longitud mínima de descripción
                </Label>
                <span className="text-sm font-bold text-primary">
                  {preferences.enrichment_min_length.toLocaleString()} caracteres
                </span>
              </div>
              <Slider
                value={[preferences.enrichment_min_length]}
                onValueChange={([value]) => setPreferences({ ...preferences, enrichment_min_length: value })}
                min={500}
                max={5000}
                step={100}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>500 (corto)</span>
                <span>5000 (extenso)</span>
              </div>
            </div>

            <Separator />

            {/* Content toggles */}
            <div className="space-y-4">
              <Label className="text-sm font-medium">Contenido adicional</Label>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Incluir URL de referencia web</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_include_web}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_include_web: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Generar etiquetas/hashtags</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_include_tags}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_include_tags: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Calcular índice de interés (1-5)</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_include_interest_index}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_include_interest_index: checked })
                    }
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Custom prompt */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Instrucciones personalizadas (opcional)
              </Label>
              <Textarea
                value={preferences.enrichment_custom_prompt || ''}
                onChange={(e) =>
                  setPreferences({ ...preferences, enrichment_custom_prompt: e.target.value || null })
                }
                placeholder="Ej: Enfocarse en la historia local, mencionar rutas de senderismo cercanas, destacar la gastronomía de la zona..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Estas instrucciones se añaden al prompt de la IA para personalizar el contenido.
              </p>
            </div>

            <Separator />

            {/* Focus keywords */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Palabras clave a enfatizar</Label>
              <div className="flex gap-2">
                <Input
                  value={newFocusKeyword}
                  onChange={(e) => setNewFocusKeyword(e.target.value)}
                  placeholder="Añadir palabra clave..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFocusKeyword())}
                />
                <Button type="button" size="icon" variant="outline" onClick={addFocusKeyword}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {preferences.enrichment_focus_keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {preferences.enrichment_focus_keywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="gap-1">
                      {keyword}
                      <button
                        type="button"
                        onClick={() => removeFocusKeyword(keyword)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Exclude keywords */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Palabras/temas a evitar</Label>
              <div className="flex gap-2">
                <Input
                  value={newExcludeKeyword}
                  onChange={(e) => setNewExcludeKeyword(e.target.value)}
                  placeholder="Añadir palabra a evitar..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addExcludeKeyword())}
                />
                <Button type="button" size="icon" variant="outline" onClick={addExcludeKeyword}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {preferences.enrichment_exclude_keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {preferences.enrichment_exclude_keywords.map((keyword) => (
                    <Badge key={keyword} variant="outline" className="gap-1 text-destructive border-destructive/50">
                      {keyword}
                      <button
                        type="button"
                        onClick={() => removeExcludeKeyword(keyword)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Preview Section */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Eye className="w-4 h-4" />
                Vista previa del estilo
              </Label>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-xs text-muted-foreground">
                    Ejemplo de cómo se generará el contenido
                  </span>
                </div>
                
                {/* Primary settings summary */}
                <div className="space-y-1 p-2 rounded-md bg-primary/5 border border-primary/10">
                  <div className="text-xs">
                    <span className="text-muted-foreground">Tipo: </span>
                    <span className="font-medium line-clamp-1">{preferences.enrichment_expected_nature || 'Sin definir'}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Radio: </span>
                    <span className="font-medium">
                      {preferences.enrichment_search_radius_meters >= 1000 
                        ? `${(preferences.enrichment_search_radius_meters / 1000).toFixed(1)} km`
                        : `${preferences.enrichment_search_radius_meters} m`
                      }
                    </span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Tono: {TONE_OPTIONS.find(t => t.value === preferences.enrichment_tone)?.label}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {getPreviewText(preferences.enrichment_tone)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {preferences.enrichment_include_image && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Image className="w-3 h-3" /> Imagen
                    </Badge>
                  )}
                  {preferences.enrichment_include_contact && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Phone className="w-3 h-3" /> Contacto
                    </Badge>
                  )}
                  {preferences.enrichment_show_sources && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <BookOpen className="w-3 h-3" /> Fuentes
                    </Badge>
                  )}
                  {preferences.enrichment_correct_coordinates && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Navigation className="w-3 h-3" /> Geo-corrección
                    </Badge>
                  )}
                  {preferences.enrichment_include_web && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Link className="w-3 h-3" /> Web
                    </Badge>
                  )}
                  {preferences.enrichment_include_tags && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Hash className="w-3 h-3" /> Tags
                    </Badge>
                  )}
                  {preferences.enrichment_include_interest_index && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Star className="w-3 h-3" /> Índice
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground pt-1 border-t">
                  Longitud objetivo: ~{preferences.enrichment_min_length.toLocaleString()} caracteres
                  {preferences.enrichment_focus_keywords.length > 0 && (
                    <span className="ml-2">
                      • Enfoque: {preferences.enrichment_focus_keywords.slice(0, 3).join(', ')}
                      {preferences.enrichment_focus_keywords.length > 3 && '...'}
                    </span>
                  )}
                </div>
              </div>
            </div>
            </TabsContent>
            
            {/* Preview/Locations Tab */}
            <TabsContent value="preview" className="flex-1 overflow-hidden mt-0 min-w-0">
              <div className="h-full flex flex-col gap-3 overflow-hidden min-w-0">
                {/* Stats Summary - clickable to filter */}
                <div className="grid grid-cols-3 gap-2 shrink-0 min-w-0">
                  <div 
                    className={`rounded-lg p-2 text-center cursor-pointer transition-all min-w-0 overflow-hidden ${
                      listFilter === 'all' 
                        ? 'bg-primary/10 ring-2 ring-primary' 
                        : 'bg-muted/50 hover:ring-2 ring-muted-foreground/30'
                    }`}
                    onClick={() => setListFilter('all')}
                  >
                    <div className="text-xl font-bold text-foreground truncate">{locationStats.total}</div>
                    <div className="text-[10px] text-muted-foreground truncate">Total puntos</div>
                  </div>
                  <div 
                    className={`rounded-lg p-2 text-center cursor-pointer transition-all min-w-0 overflow-hidden ${
                      listFilter === 'enriched' 
                        ? 'bg-green-100 dark:bg-green-900/40 ring-2 ring-green-500' 
                        : 'bg-green-50 dark:bg-green-900/20 hover:ring-2 ring-green-400/50'
                    }`}
                    onClick={() => setListFilter('enriched')}
                  >
                    <div className="text-xl font-bold text-green-600 truncate">{locationStats.enriched}</div>
                    <div className="text-[10px] text-green-600/80 truncate">Enriquecidos</div>
                  </div>
                  <div 
                    className={`rounded-lg p-2 text-center cursor-pointer transition-all min-w-0 overflow-hidden ${
                      listFilter === 'pending' 
                        ? 'bg-amber-100 dark:bg-amber-900/40 ring-2 ring-amber-500' 
                        : 'bg-amber-50 dark:bg-amber-900/20 hover:ring-2 ring-amber-400/50'
                    }`}
                    onClick={() => setListFilter('pending')}
                  >
                    <div className="text-xl font-bold text-amber-600 truncate">{locationStats.pending}</div>
                    <div className="text-[10px] text-amber-600/80 truncate">Pendientes</div>
                  </div>
                </div>

                {/* Selection Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant={listFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setListFilter('all')}
                    disabled={isEnriching && !isPaused}
                  >
                    <CheckSquare className="w-4 h-4 mr-1" />
                    Todos
                  </Button>
                  <Button
                    type="button"
                    variant={listFilter === 'pending' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setListFilter('pending')}
                    disabled={isEnriching && !isPaused}
                    className={listFilter === 'pending' ? 'bg-amber-500 hover:bg-amber-600' : 'text-amber-600 border-amber-300 hover:bg-amber-50'}
                  >
                    Pendientes ({locationStats.pending})
                  </Button>
                  {locationStats.enriched > 0 && (
                    <Button
                      type="button"
                      variant={listFilter === 'enriched' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setListFilter('enriched')}
                      disabled={isEnriching && !isPaused}
                      className={listFilter === 'enriched' ? 'bg-green-500 hover:bg-green-600' : 'text-green-600 border-green-300 hover:bg-green-50'}
                    >
                      Enriquecidos ({locationStats.enriched})
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    disabled={(isEnriching && !isPaused) || selectedLocationIds.size === 0}
                  >
                    Limpiar
                  </Button>
                </div>

                {/* Progress Bar during enrichment */}
                {isEnriching && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {isPaused ? 'Pausado' : 'Procesando...'} {enrichmentProgress.current}/{enrichmentProgress.total}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">✓ {enrichmentProgress.successCount}</span>
                        {enrichmentProgress.errorCount > 0 && (
                          <span className="text-red-500">✗ {enrichmentProgress.errorCount}</span>
                        )}
                        {enrichmentProgress.validationPending > 0 && (
                          <span className="text-amber-500">⚠ {enrichmentProgress.validationPending}</span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          isPaused 
                            ? 'bg-amber-500' 
                            : 'bg-gradient-to-r from-violet-500 to-purple-600'
                        }`}
                        style={{ width: `${(enrichmentProgress.current / enrichmentProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Pending Validations List - Duplicate-style format */}
                {pendingValidations.length > 0 && !isEnriching && (
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-5 h-5 text-amber-600" />
                        <div>
                          <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
                            {pendingValidations.length} punto(s) requieren validación
                          </div>
                          <div className="text-xs text-amber-600 dark:text-amber-400">
                            No se encontró correlación clara con las coordenadas
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-amber-600 border-amber-400">
                        Pendientes
                      </Badge>
                    </div>

                    {/* Validation Cards */}
                    <ScrollArea className="max-h-[280px]">
                      <div className="space-y-2">
                        {pendingValidations.map((validation, idx) => (
                          <motion.div
                            key={validation.locationId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="border rounded-xl overflow-hidden bg-white/75 dark:bg-slate-900/75 shadow-sm"
                          >
                            {/* Card Header */}
                            <div className="flex items-center gap-3 p-3 bg-muted/50 border-b">
                              <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                                <MapPin className="w-4 h-4 text-amber-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{validation.locationName}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  {validation.validationResult.coordinates.lat.toFixed(5)}, {validation.validationResult.coordinates.lng.toFixed(5)}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {validation.validationResult.candidates.length > 0 && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {validation.validationResult.candidates.length} candidatos
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Candidates Preview */}
                            {validation.validationResult.candidates.length > 0 ? (
                              <div className="p-3 space-y-2">
                                <div className="text-xs text-muted-foreground mb-2">
                                  Selecciona un candidato o usa el nombre original:
                                </div>
                                <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                                  {validation.validationResult.candidates.slice(0, 3).map((candidate) => (
                                    <div
                                      key={candidate.name}
                                      className="flex items-center gap-2 p-2 rounded-lg border hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all"
                                      onClick={() => handleConfirmValidation(validation, candidate.name)}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{candidate.name}</div>
                                        {candidate.extract && (
                                          <p className="text-[10px] text-muted-foreground line-clamp-1">{candidate.extract}</p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <Badge variant="outline" className="text-[9px] px-1.5">
                                          {candidate.distance}m
                                        </Badge>
                                        <Badge 
                                          variant={candidate.matchScore >= 50 ? "default" : "secondary"}
                                          className={`text-[9px] px-1.5 ${candidate.matchScore >= 50 ? 'bg-green-500' : ''}`}
                                        >
                                          {candidate.matchScore}%
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                  {validation.validationResult.candidates.length > 3 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="w-full text-xs text-muted-foreground"
                                      onClick={() => openValidationDialog(validation)}
                                    >
                                      Ver {validation.validationResult.candidates.length - 3} más...
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 text-center text-muted-foreground">
                                <p className="text-xs">No se encontraron candidatos cercanos</p>
                              </div>
                            )}

                            {/* Actions Footer */}
                            <div className="flex items-center justify-end gap-2 p-2 bg-muted/30 border-t">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSkipValidation(validation)}
                                className="text-xs h-7"
                              >
                                Omitir
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleConfirmValidation(validation)}
                                className="text-xs h-7"
                              >
                                Usar nombre original
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                onClick={() => openValidationDialog(validation)}
                                className="text-xs h-7 bg-amber-500 hover:bg-amber-600"
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                Revisar
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
                
                {/* Locations List */}
                <div className="flex-1 overflow-hidden rounded-lg border">
                  <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {listFilter === 'all' && 'Puntos del curador'}
                      {listFilter === 'pending' && 'Puntos pendientes'}
                      {listFilter === 'enriched' && 'Puntos enriquecidos'}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {filteredLocations.length} ubicaciones
                    </Badge>
                  </div>
                  <ScrollArea className="h-[220px]">
                    <div className="divide-y">
                      {filteredLocations.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">
                            {listFilter === 'all' && 'No hay puntos asignados a este curador'}
                            {listFilter === 'pending' && 'No hay puntos pendientes'}
                            {listFilter === 'enriched' && 'No hay puntos enriquecidos'}
                          </p>
                        </div>
                      ) : (
                        filteredLocations.map((location) => {
                          const isEnrichedLoc = !!location.enriched_data;
                          const isSelected = selectedLocationIds.has(location.id);
                          const isPreviewSelected = selectedPreviewLocation?.id === location.id;
                          return (
                            <div
                              key={location.id}
                              className={`p-3 transition-colors hover:bg-muted/50 ${
                                isPreviewSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleLocationSelection(location.id)}
                                  disabled={isEnriching}
                                  className="flex-shrink-0"
                                />
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  isEnrichedLoc ? 'bg-green-500' : 'bg-amber-500'
                                }`} />
                                <div 
                                  className="flex-1 min-w-0 cursor-pointer"
                                  onClick={() => setSelectedPreviewLocation(location)}
                                >
                                  <div className="text-sm font-medium truncate">{location.name}</div>
                                  {(location.region || location.country) && (
                                    <div className="text-xs text-muted-foreground truncate">
                                      {[location.region, location.country].filter(Boolean).join(', ')}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {isEnrichedLoc ? (
                                    <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                      <Sparkles className="w-3 h-3 mr-1" />
                                      IA
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                                      Pendiente
                                    </Badge>
                                  )}
                                  {/* Inline Enrich Button - only when not in batch mode */}
                                  {!isEnriching && !isSelected && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEnrichSingle(location.id);
                                      }}
                                      className="h-7 px-2 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                                      title={isEnrichedLoc ? 'Re-enriquecer' : 'Enriquecer'}
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>
                
                {/* Selected Location Preview */}
                {selectedPreviewLocation && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Eye className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Vista previa: {selectedPreviewLocation.name}</span>
                    </div>
                    {selectedPreviewLocation.enriched_data ? (
                      <div className="space-y-2">
                        <p className="text-sm text-foreground/90 line-clamp-4">
                          {selectedPreviewLocation.enriched_data.descripcion || 
                           selectedPreviewLocation.enriched_data.description ||
                           'Descripción disponible'}
                        </p>
                        {selectedPreviewLocation.enriched_data.hashtags && (
                          <div className="flex flex-wrap gap-1">
                            {(selectedPreviewLocation.enriched_data.hashtags as string[]).slice(0, 5).map((tag: string) => (
                              <Badge key={tag} variant="secondary" className="text-[10px]">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">
                        Este punto aún no ha sido enriquecido. Se generará con el tono "{TONE_OPTIONS.find(t => t.value === preferences.enrichment_tone)?.label}" y una longitud de ~{preferences.enrichment_min_length.toLocaleString()} caracteres.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="gap-2 border-t pt-4">
          {/* Batch enrichment controls - only in preview tab */}
          {activeTab === 'preview' && (
            <div className="flex-1 flex items-center gap-2">
              {isEnriching ? (
                <>
                  {isPaused ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleResume}
                      className="text-green-600 border-green-400"
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Reanudar
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePause}
                      className="text-amber-600 border-amber-400"
                    >
                      <Pause className="w-4 h-4 mr-1" />
                      Pausar
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleStop}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Detener
                  </Button>
                  <span className="text-xs text-muted-foreground ml-2">
                    {enrichmentProgress.current}/{enrichmentProgress.total}
                  </span>
                </>
              ) : (
                selectedLocationIds.size > 1 && (
                  <Button
                    type="button"
                    onClick={handleEnrichSelected}
                    className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {Array.from(selectedLocationIds).some(id => 
                      curatorLocations.find(l => l.id === id)?.enriched_data
                    ) ? 'Re-enriquecer' : 'Enriquecer'} ({selectedLocationIds.size})
                  </Button>
                )
              )}
            </div>
          )}
          
          <Button type="button" variant="outline" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Restaurar predeterminados
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Guardar preferencias
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Validation Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-amber-500" />
              Validación requerida
            </DialogTitle>
            <DialogDescription>
              No se encontró correlación clara para este punto. Selecciona un candidato o enriquece con el nombre original.
            </DialogDescription>
          </DialogHeader>
          
          {currentValidation && (
            <div className="space-y-4">
              {/* Original location info */}
              <div className="p-3 rounded-lg bg-muted/50 border">
                <div className="text-sm font-medium">{currentValidation.locationName}</div>
                <div className="text-xs text-muted-foreground">
                  Coordenadas: {currentValidation.validationResult.coordinates.lat.toFixed(5)}, {currentValidation.validationResult.coordinates.lng.toFixed(5)}
                </div>
                {currentValidation.validationResult.expected_nature && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Naturaleza esperada: {currentValidation.validationResult.expected_nature}
                  </div>
                )}
              </div>

              {/* Message */}
              <div className="text-sm text-muted-foreground italic">
                {currentValidation.validationResult.message}
              </div>

              {/* Candidates list */}
              {currentValidation.validationResult.candidates.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Candidatos cercanos:</Label>
                  <ScrollArea className="max-h-[200px]">
                    <div className="space-y-2">
                      {currentValidation.validationResult.candidates.map((candidate) => (
                        <div
                          key={candidate.name}
                          className="p-3 rounded-lg border hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all"
                          onClick={() => handleConfirmValidation(currentValidation, candidate.name)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{candidate.name}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">
                                {candidate.distance}m
                              </Badge>
                              <Badge 
                                variant={candidate.matchScore >= 50 ? "default" : "secondary"}
                                className={`text-[10px] ${candidate.matchScore >= 50 ? 'bg-green-500' : ''}`}
                              >
                                {candidate.matchScore}%
                              </Badge>
                            </div>
                          </div>
                          {candidate.extract && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{candidate.extract}</p>
                          )}
                          <p className="text-[10px] text-primary/70 mt-1">{candidate.matchReason}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No se encontraron candidatos dentro del radio de búsqueda</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => currentValidation && handleSkipValidation(currentValidation)}
            >
              Omitir
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => currentValidation && handleConfirmValidation(currentValidation)}
            >
              Usar nombre original
            </Button>
            {pendingValidations.length > 1 && (
              <div className="text-xs text-muted-foreground self-center">
                {pendingValidations.findIndex(v => v.locationId === currentValidation?.locationId) + 1} de {pendingValidations.length}
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
