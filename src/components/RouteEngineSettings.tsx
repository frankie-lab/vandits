import React from 'react';
import {
  Gauge, Route as RouteIcon, Plane, Ship, Car, Footprints,
  Clock, Navigation, Globe, Anchor, Search, Ruler, Sparkles,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EngineConfig } from '@/lib/route-engine';

interface RouteEngineSettingsProps {
  config: EngineConfig;
  onChange: (config: Partial<EngineConfig>) => void;
}

export function RouteEngineSettings({ config, onChange }: RouteEngineSettingsProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Gauge className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">Motor de rutas</h4>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto">v1.0</Badge>
      </div>

      <Separator />

      {/* Intermodal search */}
      <div className="space-y-3">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Búsqueda intermodal</p>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Ship className="w-3.5 h-3.5 text-cyan-500" />
            <div>
              <p className="text-xs font-medium">Buscar ferries</p>
              <p className="text-[10px] text-muted-foreground">Proponer alternativas marítimas</p>
            </div>
          </div>
          <Switch checked={config.searchFerries} onCheckedChange={v => onChange({ searchFerries: v })} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Plane className="w-3.5 h-3.5 text-purple-500" />
            <div>
              <p className="text-xs font-medium">Buscar vuelos</p>
              <p className="text-[10px] text-muted-foreground">Proponer alternativas aéreas</p>
            </div>
          </div>
          <Switch checked={config.searchFlights} onCheckedChange={v => onChange({ searchFlights: v })} />
        </div>
      </div>

      <Separator />

      {/* Thresholds */}
      <div className="space-y-3">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Umbrales de activación</p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Search className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs">Alternativas desde</span>
            </div>
            <span className="text-xs font-mono font-semibold text-primary">{config.alternativeSearchThresholdKm} km</span>
          </div>
          <Slider
            value={[config.alternativeSearchThresholdKm]}
            onValueChange={([v]) => onChange({ alternativeSearchThresholdKm: v })}
            min={5} max={200} step={5}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Plane className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs">Vuelos desde</span>
            </div>
            <span className="text-xs font-mono font-semibold text-primary">{config.flightSearchThresholdKm} km</span>
          </div>
          <Slider
            value={[config.flightSearchThresholdKm]}
            onValueChange={([v]) => onChange({ flightSearchThresholdKm: v })}
            min={50} max={500} step={25}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <RouteIcon className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs">Máx. alternativas</span>
            </div>
            <span className="text-xs font-mono font-semibold text-primary">{config.maxAlternatives}</span>
          </div>
          <Slider
            value={[config.maxAlternatives]}
            onValueChange={([v]) => onChange({ maxAlternatives: v })}
            min={1} max={10} step={1}
          />
        </div>
      </div>

      <Separator />

      {/* Speed assumptions */}
      <div className="space-y-3">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Velocidades estimadas</p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Car className="w-3 h-3 text-blue-500" />
              <span className="text-xs">Coche</span>
            </div>
            <span className="text-xs font-mono font-semibold text-primary">{config.carSpeedKmh} km/h</span>
          </div>
          <Slider
            value={[config.carSpeedKmh]}
            onValueChange={([v]) => onChange({ carSpeedKmh: v })}
            min={40} max={130} step={5}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Ship className="w-3 h-3 text-cyan-500" />
              <span className="text-xs">Ferry</span>
            </div>
            <span className="text-xs font-mono font-semibold text-primary">{config.ferrySpeedKmh} km/h</span>
          </div>
          <Slider
            value={[config.ferrySpeedKmh]}
            onValueChange={([v]) => onChange({ ferrySpeedKmh: v })}
            min={10} max={60} step={5}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Plane className="w-3 h-3 text-purple-500" />
              <span className="text-xs">Vuelo</span>
            </div>
            <span className="text-xs font-mono font-semibold text-primary">{config.flightSpeedKmh} km/h</span>
          </div>
          <Slider
            value={[config.flightSpeedKmh]}
            onValueChange={([v]) => onChange({ flightSpeedKmh: v })}
            min={400} max={1000} step={50}
          />
        </div>
      </div>

      <Separator />

      {/* Segment AI action thresholds */}
      <div className="space-y-3">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Acciones IA por tramo</p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs">Jornadas desde</span>
            </div>
            <span className="text-xs font-mono font-semibold text-primary">{config.segmentPlannerMinHours}h</span>
          </div>
          <Slider
            value={[config.segmentPlannerMinHours]}
            onValueChange={([v]) => onChange({ segmentPlannerMinHours: v })}
            min={1} max={12} step={1}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs">Paradas / Optimizar desde</span>
            </div>
            <span className="text-xs font-mono font-semibold text-primary">{config.segmentStopsMinKm} km</span>
          </div>
          <Slider
            value={[config.segmentStopsMinKm]}
            onValueChange={([v]) => onChange({ segmentStopsMinKm: v })}
            min={10} max={1000} step={10}
          />
        </div>
      </div>

      <Separator />

      {/* Detection parameters */}
      <div className="space-y-3">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Detección de obstáculos</p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Anchor className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs">Radio búsqueda puertos</span>
            </div>
            <span className="text-xs font-mono font-semibold text-primary">{(config.portSearchRadiusM / 1000).toFixed(1)} km</span>
          </div>
          <Slider
            value={[config.portSearchRadiusM]}
            onValueChange={([v]) => onChange({ portSearchRadiusM: v })}
            min={500} max={10000} step={500}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Ruler className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs">Máx. segmento recto (fallback)</span>
            </div>
            <span className="text-xs font-mono font-semibold text-primary">{(config.maxFallbackSegmentM / 1000).toFixed(1)} km</span>
          </div>
          <Slider
            value={[config.maxFallbackSegmentM]}
            onValueChange={([v]) => onChange({ maxFallbackSegmentM: v })}
            min={200} max={5000} step={200}
          />
        </div>
      </div>
    </div>
  );
}
