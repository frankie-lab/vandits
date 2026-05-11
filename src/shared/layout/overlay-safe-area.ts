const bottomInsetSources = new Map<string, number>();

function getRoot() {
  return typeof document !== 'undefined' ? document.documentElement : null;
}

function normalizeInset(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.ceil(value)) : 0;
}

function publishBottomInsets() {
  const root = getRoot();
  if (!root) return;

  const bottomProgress = normalizeInset(bottomInsetSources.get('progress') ?? 0);
  const bottomFooter = normalizeInset(bottomInsetSources.get('footer') ?? 0);
  const bottomOverlaySafe = Math.max(bottomProgress, bottomFooter);

  root.style.setProperty('--bottom-progress-h', `${bottomProgress}px`);
  root.style.setProperty('--bottom-footer-h', `${bottomFooter}px`);
  root.style.setProperty('--bottom-overlay-safe-h', `${bottomOverlaySafe}px`);
}

export function setBottomSafeInset(source: string, value: number) {
  bottomInsetSources.set(source, normalizeInset(value));
  publishBottomInsets();
}

export function clearBottomSafeInset(source: string) {
  bottomInsetSources.delete(source);
  publishBottomInsets();
}