/**
 * Footer indicator for the geocoding (backfill admin FKs) job.
 * Subscribes to the global useGeocodingJobStore so the counter persists
 * even when the user closes the Geography filter panel.
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useGeocodingJobStore } from '@/stores/geocoding-job-store';

export function GeocodingProgressBar() {
  const { running, totalUpdated, remaining, initialPending, stop } = useGeocodingJobStore();

  if (!running) return null;

  const total = initialPending || (totalUpdated + remaining) || 1;
  const pct = Math.min(100, Math.round((totalUpdated / total) * 100));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-[1000]"
      >
        <div className="border-t shadow-lg backdrop-blur-md bg-amber-50/95 dark:bg-amber-950/95 border-amber-200 dark:border-amber-800">
          <div className="h-1 bg-amber-200/50 overflow-hidden">
            <motion.div
              className="h-full bg-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <div className="px-4 py-3">
            <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Globe2 className="w-5 h-5 text-amber-700 dark:text-amber-300 flex-shrink-0" />
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-amber-900 dark:text-amber-100">
                      Geocodificando ubicaciones...
                    </span>
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      {totalUpdated} de {total}
                    </span>
                  </div>
                  <span className="text-xs text-amber-700/80 dark:text-amber-300/80">
                    {remaining} pendientes
                  </span>
                </div>
              </div>

              <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                <div className="w-48">
                  <Progress value={pct} className="h-2 [&>div]:bg-emerald-500" />
                </div>
                <span className="text-xs font-medium tabular-nums w-12 text-right text-amber-900 dark:text-amber-100">
                  {pct}%
                </span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={stop}
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Square className="w-4 h-4" />
                  <span className="hidden sm:inline">Detener</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
