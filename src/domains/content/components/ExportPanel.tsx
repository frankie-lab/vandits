import React, { useState } from 'react';
import { Download, FileJson, FileSpreadsheet, FileCode, Map, Mountain, Clock, AlertCircle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocationsStore } from '@/store/locations-store';
import { exportToKML, exportToCSV, exportToJSON } from '@/lib/kml-parser';
import { ExportFormat } from '@/types/location';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useExportTracking } from '@/hooks/use-export-tracking';

const formatIcons: Record<ExportFormat, React.ReactNode> = {
 kml: <FileCode className="w-4 h-4" />,
 csv: <FileSpreadsheet className="w-4 h-4" />,
 json: <FileJson className="w-4 h-4" />,
};

const formatLabels: Record<ExportFormat, string> = {
 kml: 'KML',
 csv: 'CSV',
 json: 'JSON',
};

type ExportTarget = 'mymaps' | 'gurumaps' | 'general';

const targetInfo: Record<ExportTarget, { icon: React.ReactNode; label: string; description: string }> = {
 mymaps: {
 icon: <Map className="w-5 h-5" />,
 label: 'Google My Maps',
 description: 'KML optimizado para importar en My Maps',
 },
 gurumaps: {
 icon: <Mountain className="w-5 h-5" />,
 label: 'Guru Maps',
 description: 'KML/GPX compatible con Guru Maps',
 },
 general: {
 icon: <Download className="w-5 h-5" />,
 label: 'Exportación General',
 description: 'Todos los formatos disponibles',
 },
};

export function ExportPanel() {
 const { selectedDocument, selectedLocations, getFilteredLocations } = useLocationsStore();
 const [isExporting, setIsExporting] = useState(false);
 const { 
 lastExport, 
 modifiedCount, 
 modifiedSinceExport,
 recordExport, 
 formatLastExportTime 
 } = useExportTracking();

 const handleExport = async (
 format: ExportFormat, 
 selectedOnly: boolean,
 target: ExportTarget = 'general'
 ) => {
 if (!selectedDocument) {
 toast.error('No hay documento seleccionado');
 return;
 }

 setIsExporting(true);

 try {
 const locations = selectedOnly 
 ? selectedDocument.locations.filter(l => selectedLocations.has(l.id))
 : getFilteredLocations();

 if (locations.length === 0) {
 toast.error('No hay ubicaciones para exportar');
 return;
 }

 let content: string;
 let mimeType: string;
 let extension: string;

 switch (format) {
 case 'kml':
 content = exportToKML(locations, selectedDocument.name);
 mimeType = 'application/vnd.google-earth.kml+xml';
 extension = 'kml';
 break;
 case 'csv':
 content = exportToCSV(locations);
 mimeType = 'text/csv';
 extension = 'csv';
 break;
 case 'json':
 content = exportToJSON(locations);
 mimeType = 'application/json';
 extension = 'json';
 break;
 }

      // Add target suffix to filename
 const targetSuffix = target !== 'general' ? `_${target}` : '';
 const timestamp = new Date().toISOString().split('T')[0];

 const blob = new Blob([content], { type: mimeType });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `${selectedDocument.name}${targetSuffix}_${timestamp}.${extension}`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);

      // Record export for tracking
 recordExport(format, target, locations.map(l => l.id));

 toast.success(`Exportado: ${locations.length} ubicaciones en ${format.toUpperCase()}`);
 } catch (error) {
 console.error('Export error:', error);
 toast.error('Error al exportar');
 } finally {
 setIsExporting(false);
 }
 };

 const hasSelection = selectedLocations.size > 0;
 const filteredCount = getFilteredLocations().length;

 return (
 <div className="space-y-4">
 {/* Last export indicator */}
 {lastExport && (
 <motion.div
 initial={{ opacity: 0, y: -10 }}
 animate={{ opacity: 1, y: 0 }}
 className="p-3 rounded-lg bg-muted/50 border border-border/50"
 >
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2 text-sm">
 <Clock className="w-4 h-4 text-muted-foreground" />
 <span className="text-muted-foreground">Última exportación:</span>
 <span className="font-medium">{formatLastExportTime()}</span>
 </div>
 <Badge variant="outline" className="text-xs">
 {lastExport.locationCount} pts
 </Badge>
 </div>
 
 {/* Modified indicator */}
 <AnimatePresence>
 {modifiedCount > 0 && (
 <motion.div
 initial={{ opacity: 0, height: 0 }}
 animate={{ opacity: 1, height: 'auto' }}
 exit={{ opacity: 0, height: 0 }}
 className="mt-2 pt-2 border-t border-border/50"
 >
 <div className="flex items-center gap-2 text-sm">
 <AlertCircle className="w-4 h-4 text-amber-500" />
 <span className="text-amber-600 dark:text-amber-400">
 {modifiedCount} {modifiedCount === 1 ? 'punto modificado' : 'puntos modificados'} desde la última exportación
 </span>
 </div>
 </motion.div>
 )}
 {modifiedCount === 0 && lastExport && (
 <motion.div
 initial={{ opacity: 0, height: 0 }}
 animate={{ opacity: 1, height: 'auto' }}
 exit={{ opacity: 0, height: 0 }}
 className="mt-2 pt-2 border-t border-border/50"
 >
 <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
 <Check className="w-4 h-4" />
 <span>Todo sincronizado</span>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </motion.div>
 )}

 <Separator />

 {/* Quick export for apps */}
 <div className="space-y-3">
 <p className="text-sm font-medium">Exportar para aplicación</p>
 
 <div className="grid gap-2">
 {/* My Maps */}
 <Button
 variant="outline"
 onClick={() => handleExport('kml', false, 'mymaps')}
 disabled={!selectedDocument || isExporting || filteredCount === 0}
 className="justify-start gap-3 h-auto py-3"
 >
 <Map className="w-5 h-5 text-blue-500" />
 <div className="text-left">
 <div className="font-medium">Google My Maps</div>
 <div className="text-xs text-muted-foreground">
 KML optimizado • {filteredCount} puntos
 </div>
 </div>
 {modifiedCount > 0 && (
 <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
 {modifiedCount} cambios
 </Badge>
 )}
 </Button>

 {/* Guru Maps */}
 <Button
 variant="outline"
 onClick={() => handleExport('kml', false, 'gurumaps')}
 disabled={!selectedDocument || isExporting || filteredCount === 0}
 className="justify-start gap-3 h-auto py-3"
 >
 <Mountain className="w-5 h-5 text-emerald-500" />
 <div className="text-left">
 <div className="font-medium">Guru Maps</div>
 <div className="text-xs text-muted-foreground">
 KML compatible • {filteredCount} puntos
 </div>
 </div>
 {modifiedCount > 0 && (
 <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
 {modifiedCount} cambios
 </Badge>
 )}
 </Button>
 </div>
 </div>

 <Separator />

 {/* Export all formats */}
 <div className="space-y-2">
 <p className="text-sm font-medium">Exportar filtrado ({filteredCount})</p>
 <div className="flex flex-wrap gap-2">
 {(['kml', 'csv', 'json'] as ExportFormat[]).map((format) => (
 <Button
 key={format}
 variant="outline"
 size="sm"
 onClick={() => handleExport(format, false)}
 disabled={!selectedDocument || isExporting}
 className="gap-2"
 >
 {formatIcons[format]}
 {formatLabels[format]}
 </Button>
 ))}
 </div>
 </div>

 {/* Export selection */}
 <AnimatePresence>
 {hasSelection && (
 <motion.div
 initial={{ opacity: 0, height: 0 }}
 animate={{ opacity: 1, height: 'auto' }}
 exit={{ opacity: 0, height: 0 }}
 className="space-y-2"
 >
 <p className="text-sm font-medium">Exportar selección ({selectedLocations.size})</p>
 <div className="flex flex-wrap gap-2">
 {(['kml', 'csv', 'json'] as ExportFormat[]).map((format) => (
 <Button
 key={format}
 size="sm"
 onClick={() => handleExport(format, true)}
 disabled={!selectedDocument || isExporting}
 className="gap-2 ocean-gradient"
 >
 {formatIcons[format]}
 {formatLabels[format]}
 </Button>
 ))}
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
}
