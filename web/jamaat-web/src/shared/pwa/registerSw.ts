/// Centralized PWA service-worker registration. Called once from main.tsx at app
/// boot - early registration is required for Chrome's install-criteria heuristic
/// (the SW must be active when the user reaches the page that should prompt).
///
/// The "needs refresh" callback is fanned out via a tiny event-bus so any
/// component can subscribe (UpdateToast does). We avoid global state libs here
/// because the surface area is one boolean.

type Handler = () => void;

const needRefreshHandlers = new Set<Handler>();
let updateFn: ((reload?: boolean) => Promise<void>) | null = null;
let initialised = false;

export function initServiceWorker() {
  if (initialised) return;
  initialised = true;
  // Dynamic import so dev mode (no SW build) and older browsers degrade silently.
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        needRefreshHandlers.forEach((h) => h());
      },
    });
    updateFn = update;
  }).catch(() => {
    /* dev mode without SW build, or unsupported browser - silently ignore. */
  });
}

export function onSwNeedRefresh(handler: Handler): () => void {
  needRefreshHandlers.add(handler);
  return () => needRefreshHandlers.delete(handler);
}

export function applyServiceWorkerUpdate(): Promise<void> {
  return updateFn?.(true) ?? Promise.resolve();
}
