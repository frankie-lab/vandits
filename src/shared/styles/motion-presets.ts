/**
 * Motion presets — VANDITS UX v1
 *
 * Variants y transitions canónicos para framer-motion. Misma curva y duración
 * que los tokens CSS en `tokens/motion.css`, así CSS y JS quedan coherentes.
 *
 * Uso:
 *   import { fadeIn, slideRight, panelEnter } from '@/shared/styles/motion-presets';
 *   <motion.div {...fadeIn} />
 *
 * Si necesitas algo no contemplado, EXTIENDE este archivo — no inventes tu
 * propia transition local.
 *
 * Ver mem://style/tokens/motion-presets.
 */
import type { Transition, Variants } from 'framer-motion';

// Curves and durations (must match `tokens/motion.css`).
export const easing = {
  standard: [0.2, 0, 0, 1] as const,
  emphasized: [0.3, 0, 0, 1] as const,
  decel: [0, 0, 0.2, 1] as const,
  accel: [0.4, 0, 1, 1] as const,
};

export const duration = {
  instant: 0.08,
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
  xslow: 0.48,
};

const baseTransition: Transition = { duration: duration.base, ease: easing.standard };

// ─── Single-use shorthands ──────────────────────────────────────────────
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: baseTransition,
};

export const pop = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { duration: duration.fast, ease: easing.emphasized },
};

export const slideRight = {
  initial: { x: 24, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: 24, opacity: 0 },
  transition: { duration: duration.slow, ease: easing.emphasized },
};

export const slideLeft = {
  initial: { x: -24, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -24, opacity: 0 },
  transition: { duration: duration.slow, ease: easing.emphasized },
};

export const slideUp = {
  initial: { y: 16, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 16, opacity: 0 },
  transition: { duration: duration.base, ease: easing.standard },
};

// ─── Variants reutilizables (para AnimatePresence con `variants=`) ──────
export const panelEnter: Variants = {
  hidden: { x: 24, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: duration.slow, ease: easing.emphasized } },
  exit: { x: 24, opacity: 0, transition: { duration: duration.base, ease: easing.accel } },
};

export const overlayEnter: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.fast, ease: easing.standard } },
  exit: { opacity: 0, transition: { duration: duration.fast, ease: easing.accel } },
};
