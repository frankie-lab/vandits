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
  Settings2,
  MapPin,
  Wand2,
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

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-background/95 backdrop-blur-md rounded-full shadow-2xl border border-border/50 px-3 py-2"
    >
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
            <SelectTrigger className="h-8 w-[140px] text-xs border-0 bg-transparent">
              <SelectValue placeholder="Documento" />
            </SelectTrigger>
            <SelectContent className="z-[1001]">
              {documents.map((doc) => (
                <SelectItem key={doc.id} value={doc.id}>
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[100px]">{doc.name}</span>
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

      {/* Stats */}
      {selectedDocument && (
        <div className="flex items-center gap-1 pr-3 border-r border-border/50 text-xs">
          <span className="font-bold text-primary">{locationCount}</span>
          {locationCount !== totalCount && (
            <span className="text-muted-foreground">/ {totalCount}</span>
          )}
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
              <div className="flex flex-col">
                <span>Enriquecimiento IA</span>
                <span className="text-xs text-muted-foreground">
                  {stats.enriched}/{stats.total} enriquecidos
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
    </motion.div>
  );
}
