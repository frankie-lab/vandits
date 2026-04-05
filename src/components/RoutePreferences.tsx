import React, { useState, useEffect, useCallback } from 'react';
import {
  Car, Footprints, Globe, Compass, Navigation, Clock, Shield,
  Fuel, Mountain, Cloud, MapPin, Shuffle, Palette, ChevronDown,
  ChevronRight, AlertTriangle, Ruler, Weight, ArrowUpDown,
  Gauge, DollarSign, Eye, Zap, Ban, Info, Route as RouteIcon,
  Train, Plane, Ship,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import { renderTransportModeIcon } from '@/lib/icon-utils';

// ---------- Types ----------
export interface RoadTypePreference {
  code: string;
  label: string;
  enabled: boolean;
  weight: number; // 0-10
}

export interface OptimizationGoal {
  code: string;
  label: string;
  weight: number; // 0-10
}

export interface VehicleDimensions {
  width_m: number | null;
  height_m: number | null;
  length_m: number | null;
  weight_kg: number | null;
}

export interface RouteRestrictions {
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidCityCenters: boolean;
  avoidUnpavedRoads: boolean;
  avoidNightDriving: boolean;
  maxStopIntervalKm: number;
  preferScenic: boolean;
  preferOvernightCapable: boolean;
}

export interface RoutePreferencesData {
  roadTypes: RoadTypePreference[];
  optimizationGoals: OptimizationGoal[];
  vehicleDimensions: VehicleDimensions;
  restrictions: RouteRestrictions;
  trafficAware: boolean;
  weatherAware: boolean;
  terrainAware: boolean;
  experienceMode: 'speed' | 'balanced' | 'discovery';
}

// ---------- Icon maps (render-time only) ----------
const ROAD_TYPE_ICONS: Record<string, React.ReactNode> = {
  toll_highway: <Car className="w-3.5 h-3.5" />,
  free_highway: <Car className="w-3.5 h-3.5" />,
  national: <RouteIcon className="w-3.5 h-3.5" />,
  regional: <RouteIcon className="w-3.5 h-3.5" />,
  local: <MapPin className="w-3.5 h-3.5" />,
  rural: <Mountain className="w-3.5 h-3.5" />,
  non_motorized: <Footprints className="w-3.5 h-3.5" />,
};

const GOAL_ICONS: Record<string, React.ReactNode> = {
  time: <Clock className="w-3.5 h-3.5" />,
  cost: <DollarSign className="w-3.5 h-3.5" />,
  comfort: <Gauge className="w-3.5 h-3.5" />,
  scenic: <Eye className="w-3.5 h-3.5" />,
  risk: <Shield className="w-3.5 h-3.5" />,
  fuel: <Fuel className="w-3.5 h-3.5" />,
};

// ---------- Defaults ----------
const DEFAULT_ROAD_TYPES: RoadTypePreference[] = [
  { code: 'toll_highway', label: 'Autopistas de peaje', enabled: true, weight: 5 },
  { code: 'free_highway', label: 'Autopistas gratuitas / autovías', enabled: true, weight: 8 },
  { code: 'national', label: 'Carreteras nacionales', enabled: true, weight: 7 },
  { code: 'regional', label: 'Carreteras regionales', enabled: true, weight: 5 },
  { code: 'local', label: 'Carreteras locales', enabled: true, weight: 3 },
  { code: 'rural', label: 'Caminos rurales / pistas', enabled: false, weight: 1 },
  { code: 'non_motorized', label: 'Vías no motorizadas', enabled: false, weight: 0 },
];

const DEFAULT_OPTIMIZATION_GOALS: OptimizationGoal[] = [
  { code: 'time', label: 'Minimizar tiempo', weight: 7 },
  { code: 'cost', label: 'Minimizar coste', weight: 5 },
  { code: 'comfort', label: 'Maximizar comodidad', weight: 5 },
  { code: 'scenic', label: 'Maximizar paisaje', weight: 3 },
  { code: 'risk', label: 'Minimizar riesgo', weight: 4 },
  { code: 'fuel', label: 'Minimizar consumo', weight: 3 },
];

const DEFAULT_RESTRICTIONS: RouteRestrictions = {
  avoidTolls: false,
  avoidHighways: false,
  avoidCityCenters: false,
  avoidUnpavedRoads: true,
  avoidNightDriving: false,
  maxStopIntervalKm: 400,
  preferScenic: false,
  preferOvernightCapable: false,
};

const DEFAULT_DIMENSIONS: VehicleDimensions = {
  width_m: null,
  height_m: null,
  length_m: null,
  weight_kg: null,
};

export function getDefaultPreferences(): RoutePreferencesData {
  return {
    roadTypes: DEFAULT_ROAD_TYPES.map(r => ({ ...r })),
    optimizationGoals: DEFAULT_OPTIMIZATION_GOALS.map(g => ({ ...g })),
    vehicleDimensions: { ...DEFAULT_DIMENSIONS },
    restrictions: { ...DEFAULT_RESTRICTIONS },
    trafficAware: false,
    weatherAware: false,
    terrainAware: false,
    experienceMode: 'balanced',
  };
}

// ---------- Collapsible Section ----------
function PreferenceSection({
  title,
  icon,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-medium flex-1">{title}</span>
        {badge && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground border-muted-foreground/30">
            {badge}
          </Badge>
        )}
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Coming Soon overlay ----------
function ComingSoon({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="opacity-40 pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <Badge className="bg-muted text-muted-foreground border-border text-[10px]">
          <Zap className="w-3 h-3 mr-1" /> Próximamente
        </Badge>
      </div>
    </div>
  );
}

// ---------- Main Component ----------
interface RoutePreferencesProps {
  preferences: RoutePreferencesData;
  onChange: (prefs: RoutePreferencesData) => void;
  vehicleCode?: string;
  defaultDimensions?: VehicleDimensions;
  acceptedModes: Set<string>;
  onAcceptedModesChange: (modes: Set<string>) => void;
  allTransportModes: { code: string; name: string; icon: string; sub_category: string; is_complementary: boolean; category: string }[];
  hirableGroups: { label: string; codes: string[] }[];
}

export function RoutePreferences({
  preferences,
  onChange,
  vehicleCode,
  defaultDimensions,
  acceptedModes,
  onAcceptedModesChange,
  allTransportModes,
  hirableGroups,
}: RoutePreferencesProps) {
  // Update dimensions when vehicle changes
  useEffect(() => {
    if (defaultDimensions && vehicleCode) {
      onChange({
        ...preferences,
        vehicleDimensions: {
          width_m: preferences.vehicleDimensions.width_m ?? defaultDimensions.width_m,
          height_m: preferences.vehicleDimensions.height_m ?? defaultDimensions.height_m,
          length_m: preferences.vehicleDimensions.length_m ?? defaultDimensions.length_m,
          weight_kg: preferences.vehicleDimensions.weight_kg ?? defaultDimensions.weight_kg,
        },
      });
    }
  }, [vehicleCode]);

  const updateRoadType = (code: string, field: 'enabled' | 'weight', value: any) => {
    onChange({
      ...preferences,
      roadTypes: preferences.roadTypes.map(r =>
        r.code === code ? { ...r, [field]: value } : r
      ),
    });
  };

  const updateGoal = (code: string, weight: number) => {
    onChange({
      ...preferences,
      optimizationGoals: preferences.optimizationGoals.map(g =>
        g.code === code ? { ...g, weight } : g
      ),
    });
  };

  const updateRestriction = (key: keyof RouteRestrictions, value: any) => {
    onChange({
      ...preferences,
      restrictions: { ...preferences.restrictions, [key]: value },
    });
  };

  const updateDimension = (key: keyof VehicleDimensions, value: number | null) => {
    onChange({
      ...preferences,
      vehicleDimensions: { ...preferences.vehicleDimensions, [key]: value },
    });
  };

  // Check for dimension warnings
  const dimWarnings: string[] = [];
  const d = preferences.vehicleDimensions;
  if (d.width_m && d.width_m > 2.5) dimWarnings.push(`Ancho ${d.width_m}m: restricción en calles estrechas y centros urbanos`);
  if (d.height_m && d.height_m > 3.0) dimWarnings.push(`Alto ${d.height_m}m: cuidado con puentes y túneles bajos`);
  if (d.length_m && d.length_m > 8.0) dimWarnings.push(`Largo ${d.length_m}m: dificultad en giros cerrados y aparcamiento`);
  if (d.weight_kg && d.weight_kg > 3500) dimWarnings.push(`Peso ${d.weight_kg}kg: restricción en puentes con límite de carga`);

  return (
    <div className="space-y-2">
      {/* 1. ROAD TYPES */}
      <PreferenceSection title="Prioridad de vías" icon={<RouteIcon className="w-4 h-4" />} defaultOpen>
        <p className="text-[10px] text-muted-foreground">Selecciona y pondera qué tipos de vía prefieres.</p>
        <div className="space-y-2">
          {preferences.roadTypes.map(rt => (
            <div key={rt.code} className="space-y-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateRoadType(rt.code, 'enabled', !rt.enabled)}
                  className={`flex items-center gap-1.5 flex-1 text-left px-2 py-1.5 rounded-md text-xs transition-colors ${
                    rt.enabled
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'bg-muted/30 text-muted-foreground border border-transparent'
                  }`}
                >
                  {ROAD_TYPE_ICONS[rt.code]}
                  <span className="truncate">{rt.label}</span>
                </button>
                {rt.enabled && (
                  <span className="text-[10px] font-mono font-semibold text-primary w-6 text-right">{rt.weight}</span>
                )}
              </div>
              {rt.enabled && (
                <Slider
                  value={[rt.weight]}
                  onValueChange={([v]) => updateRoadType(rt.code, 'weight', v)}
                  min={0} max={10} step={1}
                  className="w-full"
                />
              )}
            </div>
          ))}
        </div>
      </PreferenceSection>

      {/* 2. OPTIMIZATION GOALS */}
      <PreferenceSection title="Objetivos de optimización" icon={<Compass className="w-4 h-4" />}>
        <p className="text-[10px] text-muted-foreground">¿Qué debe priorizar el motor de rutas?</p>
        <div className="space-y-2">
          {preferences.optimizationGoals.map(goal => (
            <div key={goal.code} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-primary">{GOAL_ICONS[goal.code]}</span>
                <span className="text-xs flex-1">{goal.label}</span>
                <span className="text-[10px] font-mono font-semibold text-primary w-6 text-right">{goal.weight}</span>
              </div>
              <Slider
                value={[goal.weight]}
                onValueChange={([v]) => updateGoal(goal.code, v)}
                min={0} max={10} step={1}
                className="w-full"
              />
            </div>
          ))}
        </div>
      </PreferenceSection>

      {/* 3. VEHICLE DIMENSIONS */}
      <PreferenceSection title="Tu vehículo" icon={<Ruler className="w-4 h-4" />}>
        <p className="text-[10px] text-muted-foreground">
          Dimensiones de tu vehículo. Afectan las restricciones de acceso.
          {vehicleCode && <span className="text-primary ml-1">(basado en {vehicleCode})</span>}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> Ancho (m)</Label>
            <Input
              type="number" step="0.1" min="0"
              value={d.width_m ?? ''}
              onChange={(e) => updateDimension('width_m', e.target.value ? Number(e.target.value) : null)}
              className="h-7 text-xs"
              placeholder="—"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> Alto (m)</Label>
            <Input
              type="number" step="0.1" min="0"
              value={d.height_m ?? ''}
              onChange={(e) => updateDimension('height_m', e.target.value ? Number(e.target.value) : null)}
              className="h-7 text-xs"
              placeholder="—"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] flex items-center gap-1"><Ruler className="w-3 h-3" /> Largo (m)</Label>
            <Input
              type="number" step="0.1" min="0"
              value={d.length_m ?? ''}
              onChange={(e) => updateDimension('length_m', e.target.value ? Number(e.target.value) : null)}
              className="h-7 text-xs"
              placeholder="—"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] flex items-center gap-1"><Weight className="w-3 h-3" /> Peso (kg)</Label>
            <Input
              type="number" step="50" min="0"
              value={d.weight_kg ?? ''}
              onChange={(e) => updateDimension('weight_kg', e.target.value ? Number(e.target.value) : null)}
              className="h-7 text-xs"
              placeholder="—"
            />
          </div>
        </div>
        {dimWarnings.length > 0 && (
          <div className="space-y-1 pt-1">
            {dimWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </PreferenceSection>

      {/* 4. RESTRICTIONS */}
      <PreferenceSection title="Restricciones y evitaciones" icon={<Ban className="w-4 h-4" />}>
        <div className="space-y-2.5">
          {[
            { key: 'avoidTolls' as const, label: 'Evitar peajes', desc: 'Prioriza vías gratuitas' },
            { key: 'avoidHighways' as const, label: 'Evitar autopistas', desc: 'Prefiere carreteras secundarias' },
            { key: 'avoidCityCenters' as const, label: 'Evitar centros urbanos', desc: 'Circunvalaciones y variantes' },
            { key: 'avoidUnpavedRoads' as const, label: 'Evitar caminos sin asfaltar', desc: 'Solo vías pavimentadas' },
            { key: 'avoidNightDriving' as const, label: 'Evitar conducción nocturna', desc: 'Planifica paradas antes del anochecer' },
            { key: 'preferScenic' as const, label: 'Preferir rutas escénicas', desc: 'Maximiza interés paisajístico' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium">{item.label}</p>
                <p className="text-[10px] text-muted-foreground">{item.desc}</p>
              </div>
              <Switch
                checked={preferences.restrictions[item.key] as boolean}
                onCheckedChange={(v) => updateRestriction(item.key, v)}
              />
            </div>
          ))}

          <Separator />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">Intervalo máx. entre paradas</p>
                <p className="text-[10px] text-muted-foreground">Autonomía / repostaje</p>
              </div>
              <span className="text-xs font-mono font-semibold text-primary">{preferences.restrictions.maxStopIntervalKm} km</span>
            </div>
            <Slider
              value={[preferences.restrictions.maxStopIntervalKm]}
              onValueChange={([v]) => updateRestriction('maxStopIntervalKm', v)}
              min={50} max={800} step={25}
              className="w-full"
            />
          </div>

          <Separator />

          <ComingSoon>
            <div className="space-y-2">
              <p className="text-xs font-medium">Zonas de Bajas Emisiones (ZBE)</p>
              <p className="text-xs font-medium">Restricciones altura / peso / longitud</p>
              <p className="text-xs font-medium">Normativa local (residentes)</p>
            </div>
          </ComingSoon>
        </div>
      </PreferenceSection>

      {/* 5. MULTIMODALITY (accepted modes) */}
      <PreferenceSection title="Multimodalidad en ruta" icon={<Shuffle className="w-4 h-4" />}>
        <p className="text-[10px] text-muted-foreground">Medios que contratarías durante el viaje.</p>
        {hirableGroups.map(group => {
          const modesInGroup = group.codes
            .map(code => allTransportModes.find(m => m.code === code))
            .filter(Boolean) as typeof allTransportModes;
          if (modesInGroup.length === 0) return null;
          return (
            <div key={group.label} className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground">{group.label}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {modesInGroup.map(mode => {
                  const isAccepted = acceptedModes.has(mode.code);
                  return (
                    <button key={mode.code}
                      onClick={() => {
                        const next = new Set(acceptedModes);
                        if (next.has(mode.code)) next.delete(mode.code);
                        else next.add(mode.code);
                        onAcceptedModesChange(next);
                      }}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-colors ${
                        isAccepted
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border bg-card hover:bg-muted/50 text-foreground'
                      }`}
                    >
                      {renderTransportModeIcon(mode.code, mode.icon, 'w-3.5 h-3.5')}
                      <span className="truncate text-[11px]">{mode.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </PreferenceSection>

      {/* 6. COSTS */}
      <PreferenceSection title="Costes" icon={<DollarSign className="w-4 h-4" />}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs">Peajes incluidos en cálculo</p>
            <Badge variant={preferences.restrictions.avoidTolls ? 'destructive' : 'secondary'} className="text-[9px]">
              {preferences.restrictions.avoidTolls ? 'Evitados' : 'Permitidos'}
            </Badge>
          </div>
          <ComingSoon>
            <div className="space-y-2">
              <p className="text-xs">Estimación de combustible</p>
              <p className="text-xs">Coste de aparcamiento</p>
              <p className="text-xs">Ferries y peajes marítimos</p>
            </div>
          </ComingSoon>
        </div>
      </PreferenceSection>

      {/* 7. TRAFFIC & WEATHER & TERRAIN */}
      <PreferenceSection title="Condiciones en ruta" icon={<Cloud className="w-4 h-4" />} badge="Próximamente">
        <ComingSoon>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium">🚦 Tráfico</p>
              <p className="text-[10px] text-muted-foreground">Tiempo real · Histórico · Obras · Incidentes</p>
            </div>
            <div>
              <p className="text-xs font-medium">🌧️ Meteorología</p>
              <p className="text-[10px] text-muted-foreground">Lluvia · Nieve/hielo · Viento · Visibilidad</p>
            </div>
            <div>
              <p className="text-xs font-medium">⛰️ Terreno</p>
              <p className="text-[10px] text-muted-foreground">Pendiente · Sinuosidad · Altitud · Tipo de firme</p>
            </div>
            <div>
              <p className="text-xs font-medium">🛡️ Seguridad</p>
              <p className="text-[10px] text-muted-foreground">Índice de accidentes · Iluminación · Zonas conflictivas</p>
            </div>
          </div>
        </ComingSoon>
      </PreferenceSection>

      {/* 8. EXPERIENCE */}
      <PreferenceSection title="Experiencia del viaje" icon={<Eye className="w-4 h-4" />}>
        <p className="text-[10px] text-muted-foreground">¿Qué tipo de experiencia buscas?</p>
        <div className="flex gap-1.5">
          {[
            { code: 'speed' as const, label: 'Velocidad', desc: 'Llegar rápido' },
            { code: 'balanced' as const, label: 'Equilibrado', desc: 'Tiempo + interés' },
            { code: 'discovery' as const, label: 'Descubrimiento', desc: 'Maximizar experiencia' },
          ].map(mode => (
            <button key={mode.code}
              onClick={() => onChange({ ...preferences, experienceMode: mode.code })}
              className={`flex-1 text-center px-2 py-2 rounded-lg text-xs transition-all ${
                preferences.experienceMode === mode.code
                  ? 'bg-primary text-primary-foreground shadow-sm font-medium'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              <div className="font-medium">{mode.label}</div>
              <div className="text-[9px] opacity-70 mt-0.5">{mode.desc}</div>
            </button>
          ))}
        </div>
        <ComingSoon>
          <div className="space-y-1">
            <p className="text-xs">Densidad de puntos de interés en ruta</p>
            <p className="text-xs">Tiempos ocultos (embarques, aparcamiento, accesos)</p>
          </div>
        </ComingSoon>
      </PreferenceSection>
    </div>
  );
}
