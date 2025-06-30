export function initScrollRestoration() {
  const key = 'scroll:' + window.location.pathname + window.location.search;
  const saved = sessionStorage.getItem(key);
  if (saved) {
    try {
      const pos = JSON.parse(saved);
      if (typeof pos.x === 'number' && typeof pos.y === 'number') {
        requestAnimationFrame(() => window.scrollTo(pos.x, pos.y));
      }
    } catch (e) {
      // ignore invalid JSON
    }
  }
  window.addEventListener('beforeunload', () => {
    const data = { x: window.scrollX, y: window.scrollY };
    try {
      sessionStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      // ignore storage errors
    }
  });
}

export function reloadPreservingScroll() {
  const key = 'scroll:' + window.location.pathname + window.location.search;
  const data = { x: window.scrollX, y: window.scrollY };
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    // ignore storage errors
  }
  location.reload();
}

// Auto-initialize when loaded as a module
initScrollRestoration();
