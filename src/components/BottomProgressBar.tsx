/**
 * Unified bottom progress shell — Opción C: una sola barra ancha con
 * "carriles" (lanes) independientes. Cada lane representa un job de fondo
 * (enriquecimiento IA, normalización geográfica…) y trae sus propios
 * controles, store y datos. El shell sólo:
 *
 *   1. Apila los lanes que estén activos.
 *   2. Se desmonta cuando ningún lane reporta actividad (no deja sticky-bar
 *      vacía bloqueando el mapa).
 *
 * Añadir un job nuevo = añadir un Lane que use `LaneRow` y reporte su
 * actividad vía `onActiveChange`. Sin tocar el shell.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EnrichmentLane } from '@/shared/progress/EnrichmentLane';
import { GeocodingLane } from '@/shared/progress/GeocodingLane';

export function BottomProgressBar() {
  const [enrichmentActive, setEnrichmentActive] = useState(false);
  const [geocodingActive, setGeocodingActive] = useState(false);

  const anyActive = enrichmentActive || geocodingActive;

  return (
    <>
      {/* Lanes always mounted (they own their own polling/realtime stores)
          but render null when their job is idle. */}
      <div className="hidden">
        <EnrichmentLane onActiveChange={setEnrichmentActive} />
        <GeocodingLane onActiveChange={setGeocodingActive} />
      </div>

      <AnimatePresence>
        {anyActive && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[1000]"
          >
            <div className="border-t shadow-lg backdrop-blur-md bg-background/95 border-border">
              <div className="max-w-screen-2xl mx-auto divide-y divide-border/60">
                <EnrichmentLane onActiveChange={setEnrichmentActive} />
                <GeocodingLane onActiveChange={setGeocodingActive} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
