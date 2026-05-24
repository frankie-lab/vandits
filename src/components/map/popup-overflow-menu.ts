/**
 * popup-overflow-menu.ts
 * ----------------------
 * Singleton overflow menu para el footer del popup de POI.
 *
 * Contrato:
 * - Una sola instancia abierta a la vez (`openPopupOverflowMenu` cierra
 *   cualquier menú previo).
 * - Posicionamiento fijo anclado al rect del botón trigger; auto-flip arriba
 *   si no cabe debajo; clamp horizontal al viewport.
 * - Robustez de cierre: click fuera, Escape, scroll/resize, eliminación del
 *   popup de Leaflet (vía MutationObserver sobre el ancestor `.leaflet-popup`).
 * - Cada ítem dispara `popup-action` con `{ action, locationId, locationName }`
 *   y luego cierra el menú. Mismo bus que `popup-action-btn` (consumido por
 *   `usePopupActions`).
 *
 * No usa Radix/Portal — DOM nativo bajo `document.body`. Sin React, sin foco
 * implícito (no roba focus al popup de Leaflet).
 */

export interface OverflowMenuItem {
  action: string;
  label: string;
  icon: string; // SVG inline string
  visible?: boolean; // default true
  destructive?: boolean;
  separatorBefore?: boolean;
}

interface OpenOptions {
  trigger: HTMLElement;
  items: OverflowMenuItem[];
  locationId: string;
  locationName?: string;
}

let currentMenu: HTMLElement | null = null;
let cleanupFns: Array<() => void> = [];

export function closePopupOverflowMenu(): void {
  if (!currentMenu) return;
  for (const fn of cleanupFns) {
    try { fn(); } catch { /* noop */ }
  }
  cleanupFns = [];
  try { currentMenu.remove(); } catch { /* noop */ }
  currentMenu = null;
}

export function openPopupOverflowMenu(opts: OpenOptions): void {
  // Toggle: si el mismo trigger reabre, cierra.
  if (currentMenu && currentMenu.dataset.triggerId === opts.trigger.dataset.locationId) {
    const same = currentMenu.dataset.openedFor === opts.trigger.dataset.locationId;
    closePopupOverflowMenu();
    if (same) return;
  } else {
    closePopupOverflowMenu();
  }

  const visibleItems = opts.items.filter((i) => i.visible !== false);
  if (visibleItems.length === 0) return;

  const menu = document.createElement('div');
  menu.setAttribute('data-popup-overflow-menu', 'v1');
  menu.dataset.openedFor = opts.locationId;
  menu.dataset.triggerId = opts.trigger.dataset.locationId || '';
  menu.style.cssText = [
    'position: fixed',
    'z-index: 1200',
    'min-width: 200px',
    'background: hsl(var(--popover))',
    'color: hsl(var(--popover-foreground))',
    'border: 1px solid hsl(var(--border))',
    'border-radius: 8px',
    'box-shadow: 0 8px 24px hsl(0 0% 0% / 0.18)',
    'padding: 4px',
    'font-size: 12px',
    'opacity: 0',
    'transition: opacity 0.1s ease-out',
  ].join('; ');

  for (const item of visibleItems) {
    if (item.separatorBefore) {
      const sep = document.createElement('div');
      sep.style.cssText = 'height: 1px; margin: 4px 6px; background: hsl(var(--border));';
      menu.appendChild(sep);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.overflowItem = item.action;
    const color = item.destructive ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))';
    btn.style.cssText = [
      'display: flex',
      'align-items: center',
      'gap: 8px',
      'width: 100%',
      'padding: 8px 10px',
      'background: transparent',
      'border: none',
      'border-radius: 6px',
      `color: ${color}`,
      'font-size: 12px',
      'font-weight: 500',
      'cursor: pointer',
      'text-align: left',
      'transition: background 0.1s',
    ].join('; ');
    btn.innerHTML = `${item.icon}<span>${item.label}</span>`;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = item.destructive
        ? 'hsl(var(--destructive) / 0.10)'
        : 'hsl(var(--muted))';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
    });
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const detail = {
        action: item.action,
        locationId: opts.locationId,
        locationName: opts.locationName,
      };
      closePopupOverflowMenu();
      window.dispatchEvent(new CustomEvent('popup-action', { detail }));
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  currentMenu = menu;

  // Posicionamiento (fixed, anclado al trigger).
  const reposition = () => {
    if (!currentMenu) return;
    const rect = opts.trigger.getBoundingClientRect();
    const menuRect = currentMenu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 4;
    // Default: debajo, alineado a la derecha del trigger.
    let top = rect.bottom + gap;
    let left = rect.right - menuRect.width;
    // Flip arriba si no cabe debajo.
    if (top + menuRect.height > vh - 8) {
      top = rect.top - menuRect.height - gap;
    }
    // Clamp horizontal.
    if (left < 8) left = 8;
    if (left + menuRect.width > vw - 8) left = vw - menuRect.width - 8;
    if (top < 8) top = 8;
    currentMenu.style.top = `${top}px`;
    currentMenu.style.left = `${left}px`;
  };
  reposition();
  // Segundo frame: ya tenemos dimensiones reales, hacemos fade-in.
  requestAnimationFrame(() => {
    reposition();
    if (currentMenu) currentMenu.style.opacity = '1';
  });

  // Cleanup listeners.
  const onDocClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!currentMenu) return;
    if (currentMenu.contains(target)) return;
    if (opts.trigger.contains(target)) return;
    closePopupOverflowMenu();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePopupOverflowMenu();
  };
  const onScrollOrResize = () => closePopupOverflowMenu();

  document.addEventListener('mousedown', onDocClick, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onScrollOrResize, true);
  // Scroll en cualquier ancestor (mapa, body, panels).
  document.addEventListener('scroll', onScrollOrResize, true);

  // Cierre si el popup de Leaflet (ancestor) se desmonta.
  const leafletPopup = opts.trigger.closest('.leaflet-popup');
  let observer: MutationObserver | null = null;
  if (leafletPopup && leafletPopup.parentElement) {
    observer = new MutationObserver(() => {
      if (!document.body.contains(opts.trigger)) {
        closePopupOverflowMenu();
      }
    });
    observer.observe(leafletPopup.parentElement, { childList: true, subtree: true });
  }

  cleanupFns.push(
    () => document.removeEventListener('mousedown', onDocClick, true),
    () => document.removeEventListener('keydown', onKey, true),
    () => window.removeEventListener('resize', onScrollOrResize, true),
    () => document.removeEventListener('scroll', onScrollOrResize, true),
    () => observer?.disconnect(),
  );
}
