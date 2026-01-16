import React, { useState } from 'react';
import { Download, FileJson, FileSpreadsheet, FileCode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocationsStore } from '@/store/locations-store';
import { exportToKML, exportToCSV, exportToJSON } from '@/lib/kml-parser';
import { ExportFormat } from '@/types/location';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

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

export function ExportPanel() {
  const { selectedDocument, selectedLocations, getFilteredLocations } = useLocationsStore();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: ExportFormat, selectedOnly: boolean) => {
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

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedDocument.name}_export.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

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
      <div className="text-sm text-muted-foreground">
        Exporta tus ubicaciones en diferentes formatos.
      </div>
      
      {/* Export filtered */}
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
