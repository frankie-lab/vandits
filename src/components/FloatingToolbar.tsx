import React from 'react';
import { motion } from 'framer-motion';
import { 
  Filter, 
  List, 
  Download, 
  Sparkles, 
  Globe2, 
  FileUp,
  RotateCcw,
  Trash2,
  Menu,
  MapPin,
  CheckCircle,
  RefreshCw,
  FileText,
  CircleOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLocationsStore } from '@/store/locations-store';

interface FloatingToolbarProps {
  onToggleFilters: () => void;
  onToggleLocations: () => void;
  onToggleExport: () => void;
  onToggleBatchEnrich: () => void;
  onUploadClick: () => void;
  filtersOpen: boolean;
  locationsOpen: boolean;
  activeFilterCount: number;
}

export function FloatingToolbar({
  onToggleFilters,
  onToggleLocations,
  onToggleExport,
  onToggleBatchEnrich,
  onUploadClick,
  filtersOpen,
  locationsOpen,
  activeFilterCount,
}: FloatingToolbarProps) {
  const { 
    documents, 
    selectedDocument, 
    selectDocument, 
    removeDocument,
    clearAllDocuments,
    getFilteredLocations,
    getEnrichedStats,
  } = useLocationsStore();

  const locationCount = getFilteredLocations().length;
  const totalCount = selectedDocument?.locations.length || 0;
  const stats = getEnrichedStats();

  // Criteria stats with colors
  const criteriaStats = [
    { 
      key: 'current' as const, 
      count: stats.byCriteria.current, 
      label: 'Actual', 
      color: 'bg-green-500', 
      textColor: 'text-green-600',
      bgColor: 'bg-green-50 hover:bg-green-100 border-green-200',
      icon: CheckCircle,
      description: 'Fichas con criterio actual (descripción extendida)'
    },
    { 
      key: 'previous' as const, 
      count: stats.byCriteria.previous, 
      label: 'Anterior', 
      color: 'bg-blue-500', 
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      icon: RefreshCw,
      description: 'Fichas con criterio anterior (actualizable)'
    },
    { 
      key: 'original' as const, 
      count: stats.byCriteria.original, 
      label: 'Original', 
      color: 'bg-orange-500', 
      textColor: 'text-orange-600',
      bgColor: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      icon: FileText,
      description: 'Fichas con descripción original sin enriquecer'
    },
    { 
      key: 'empty' as const, 
      count: stats.byCriteria.empty, 
      label: 'Vacío', 
      color: 'bg-red-500', 
      textColor: 'text-red-600',
      bgColor: 'bg-red-50 hover:bg-red-100 border-red-200',
      icon: CircleOff,
      description: 'Fichas sin ningún contenido'
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-1"
    >
      {/* Main toolbar */}
      <div className="flex items-center gap-2 bg-background/95 backdrop-blur-md rounded-full shadow-2xl border border-border/50 px-3 py-2">
        {/* Logo */}
        <div className="flex items-center gap-2 pr-3 border-r border-border/50">
          <div className="p-1.5 ocean-gradient rounded-lg">
            <Globe2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-sm hidden sm:inline">GeoData</span>
        </div>

        {/* Document selector */}
        {documents.length > 0 && (
          <div className="flex items-center gap-1 pr-3 border-r border-border/50">
            <Select
              value={selectedDocument?.id || ''}
              onValueChange={(value) => selectDocument(value)}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs border-0 bg-transparent">
                <SelectValue placeholder="Documento" />
              </SelectTrigger>
              <SelectContent className="z-[1001]">
                {documents.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[80px]">{doc.name}</span>
                      <Badge variant="secondary" className="text-[10px] h-4">
                        {doc.locations.length}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Criteria Stats - Compact Badges */}
        {selectedDocument && (
          <div className="flex items-center gap-1 pr-3 border-r border-border/50">
            {criteriaStats.map((stat) => (
              <DropdownMenu key={stat.key}>
                <DropdownMenuTrigger asChild>
                  <button 
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors ${stat.bgColor} ${stat.textColor}`}
                  >
                    <div className={`w-2 h-2 rounded-full ${stat.color}`} />
                    <span>{stat.count}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-56 z-[1001]">
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <stat.icon className={`w-4 h-4 ${stat.textColor}`} />
                    {stat.label} ({stat.count})
                  </DropdownMenuLabel>
                  <p className="px-2 pb-2 text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                  <DropdownMenuSeparator />
                  {stat.key !== 'current' && stat.count > 0 && (
                    <DropdownMenuItem 
                      onClick={onToggleBatchEnrich}
                      className="cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
                      Actualizar {stat.count} fichas
                    </DropdownMenuItem>
                  )}
                  {stat.key === 'current' && (
                    <DropdownMenuItem 
                      onClick={onToggleBatchEnrich}
                      className="cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4 mr-2 text-green-500" />
                      Regenerar todas
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem 
                    onClick={onToggleFilters}
                    className="cursor-pointer"
                  >
                    <Filter className="w-4 h-4 mr-2 text-primary" />
                    Filtrar por este estado
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>
        )}

        {/* Filtered count indicator */}
        {selectedDocument && locationCount !== totalCount && (
          <div className="flex items-center gap-1 pr-3 border-r border-border/50 text-xs">
            <span className="text-muted-foreground">Mostrando</span>
            <span className="font-bold text-primary">{locationCount}</span>
            <span className="text-muted-foreground">de {totalCount}</span>
          </div>
        )}

        {/* Quick access buttons */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={filtersOpen ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 relative"
                onClick={onToggleFilters}
              >
                <Filter className="w-4 h-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filtros</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={locationsOpen ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={onToggleLocations}
              >
                <List className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Lista de ubicaciones</TooltipContent>
          </Tooltip>

          {/* Main Menu Burger */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 z-[1001]">
              <DropdownMenuLabel className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Gestión de Puntos
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              {/* Enrichment Section */}
              <DropdownMenuItem onClick={onToggleBatchEnrich} className="cursor-pointer">
                <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
                <div className="flex flex-col flex-1">
                  <span>Enriquecimiento IA</span>
                  <span className="text-xs text-muted-foreground">
                    {stats.byCriteria.current} actualizadas / {stats.total} total
                  </span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Datos</DropdownMenuLabel>
              
              <DropdownMenuItem onClick={onUploadClick} className="cursor-pointer">
                <FileUp className="w-4 h-4 mr-2 text-blue-500" />
                Subir archivo KML
              </DropdownMenuItem>
              
              <DropdownMenuItem onClick={onToggleExport} className="cursor-pointer">
                <Download className="w-4 h-4 mr-2 text-green-500" />
                Exportar datos
              </DropdownMenuItem>

              {documents.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Documento actual</DropdownMenuLabel>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem 
                        onSelect={(e) => e.preventDefault()}
                        className="cursor-pointer text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Eliminar "{selectedDocument?.name}"
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="z-[2001]">
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminará "{selectedDocument?.name}" con todas sus ubicaciones.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => selectedDocument && removeDocument(selectedDocument.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem 
                        onSelect={(e) => e.preventDefault()}
                        className="cursor-pointer text-destructive focus:text-destructive"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reiniciar todo
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="z-[2001]">
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Volver al inicio?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminarán todos los documentos y ubicaciones.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={clearAllDocuments}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Reiniciar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.div>
  );
}
