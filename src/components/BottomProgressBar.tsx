/**
 * Unified bottom progress shell — Opción C: una sola barra ancha con
 * "carriles" (lanes) independientes. Cada lane representa un job de fondo
 * (enriquecimiento IA, normalización geográfica…) y trae sus propios
 * controles, store y datos. El shell sólo:
 *
 *   1. Apila los lanes que estén activos.
 *   2. Se desvanece cuando ningún lane reporta actividad (no deja una
 *      sticky-bar vacía bloqueando el mapa).
 *
 * Añadir un job nuevo = añadir un Lane que use `LaneRow` y reporte su
 * actividad vía `onActiveChange`. Sin tocar el shell.
 *
 * Importante: los lanes se montan UNA sola vez (sus stores/polls viven en
 * ellos), por eso no usamos AnimatePresence al borrarlos — sólo escondemos
 * el chrome exterior cuando ningún lane está activo.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { EnrichmentLane } from '@/shared/progress/EnrichmentLane';
import { GeocodingLane } from '@/shared/progress/GeocodingLane';

export function BottomProgressBar() {
  const [enrichmentActive, setEnrichmentActive] = useState(false);
  const [geocodingActive, setGeocodingActive] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  const anyActive = enrichmentActive || geocodingActive;

  // Publish bar height as a global CSS variable so full-viewport overlays
  // (dialogs, sheets, admin panels) can reserve space and not be obscured.
  // Consumed by `:root { --bottom-progress-h }` rule in index.css.
  useEffect(() => {
    const root = document.documentElement;
    if (!anyActive) {
      root.style.setProperty('--bottom-progress-h', '0px');
      return;
    }
    const measure = () => {
      const h = barRef.current?.offsetHeight ?? 0;
      root.style.setProperty('--bottom-progress-h', `${h}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (barRef.current) ro.observe(barRef.current);
    return () => {
      ro.disconnect();
      root.style.setProperty('--bottom-progress-h', '0px');
    };
  }, [anyActive]);
  const [enrichmentActive, setEnrichmentActive] = useState(false);
  const [geocodingActive, setGeocodingActive] = useState(false);

  const anyActive = enrichmentActive || geocodingActive;

  return (
    <motion.div
      initial={false}
      animate={{ y: anyActive ? 0 : 120, opacity: anyActive ? 1 : 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed bottom-0 left-0 right-0 z-[1000] pointer-events-none"
      aria-hidden={!anyActive}
    >
      <div
        className={
          anyActive
            ? 'pointer-events-auto border-t shadow-lg backdrop-blur-md bg-background/95 border-border'
            : 'pointer-events-none'
        }
      >
        <div className="max-w-screen-2xl mx-auto divide-y divide-border/60">
          <EnrichmentLane onActiveChange={setEnrichmentActive} />
          <GeocodingLane onActiveChange={setGeocodingActive} />
        </div>
      </div>
    </motion.div>
  );
}
