function applyWindowWidth(windowId, contentWidth, minWidth = 0, padding = 24) {
  if (!chrome?.windows?.update) {
    return;
  }

  const padded = Math.ceil(contentWidth + padding);
  const screenWidth = typeof screen !== 'undefined' ? screen.availWidth : undefined;
  let targetWidth = Math.max(padded, minWidth || 0);

  if (typeof screenWidth === 'number' && screenWidth > 0) {
    targetWidth = Math.min(targetWidth, screenWidth);
  }

  try {
    chrome.windows.update(windowId, { width: targetWidth });
  } catch (_) {
    // ignore failures when the window can no longer be updated
  }
}

function executeResize(tabId, windowId, minWidth, padding) {
  if (!chrome?.scripting?.executeScript) {
    return;
  }

  const injection = chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const measure = () => {
        const doc = document.documentElement;
        const body = document.body;
        const targets = [
          doc,
          body,
          ...Array.from(document.querySelectorAll('table, .grid'))
        ].filter(Boolean);

        const states = targets.map(el => ({
          el,
          style: el.getAttribute('style')
        }));

        try {
          for (const { el } of states) {
            el.style.setProperty('width', 'max-content', 'important');
            el.style.setProperty('max-width', 'none', 'important');
            el.style.setProperty('min-width', 'max-content', 'important');
          }

          const docWidth = doc ? doc.scrollWidth : 0;
          const bodyWidth = body ? body.scrollWidth : 0;
          return Math.max(docWidth, bodyWidth);
        } finally {
          for (const state of states) {
            if (state.style === null) {
              state.el.removeAttribute('style');
            } else {
              state.el.setAttribute('style', state.style);
            }
          }
        }
      };

      const first = measure();
      const scheduler = typeof requestAnimationFrame === 'function'
        ? cb => requestAnimationFrame(() => cb())
        : cb => setTimeout(cb, 50);

      return new Promise(resolve => {
        scheduler(() => {
          try {
            const second = measure();
            resolve(Math.max(first, second));
          } catch (_) {
            resolve(first);
          }
        });
      });
    }
  });

  const handleResult = results => {
    const width = Array.isArray(results) && results.length > 0 ? results[0].result : null;
    if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
      applyWindowWidth(windowId, width, minWidth, padding);
    }
  };

  if (injection && typeof injection.then === 'function') {
    injection.then(handleResult).catch(() => {});
  }
}

export function resizeWindowToContent(options = {}) {
  try {
    const {
      windowId: providedWindowId,
      tabId: providedTabId,
      minWidth = 0,
      padding = 24
    } = options;

    const performResize = (windowId, tabId) => {
      if (!windowId || !tabId) return;
      executeResize(tabId, windowId, minWidth, padding);
    };

    if (providedWindowId && providedTabId) {
      performResize(providedWindowId, providedTabId);
      return;
    }

    if (chrome?.tabs?.getCurrent) {
      chrome.tabs.getCurrent(tab => {
        if (tab && typeof tab.id === 'number' && typeof tab.windowId === 'number') {
          performResize(tab.windowId, tab.id);
        }
      });
      return;
    }

    if (chrome?.windows?.getCurrent && chrome?.tabs?.query) {
      chrome.windows.getCurrent(win => {
        if (!win || typeof win.id !== 'number') return;
        chrome.tabs.query({ windowId: win.id, active: true }, tabs => {
          const tab = tabs && tabs.length ? tabs[0] : null;
          if (tab && typeof tab.id === 'number') {
            performResize(win.id, tab.id);
          }
        });
      });
    }
  } catch (_) {
    // ignore when chrome APIs are unavailable
  }
}

export function openOrFocusWindow(path, width = 400, height = 600) {
  try {
    const url = chrome.runtime.getURL(path);
    if (chrome?.windows?.getAll) {
      chrome.windows.getAll({ populate: true }, wins => {
        const existing = wins.find(w => w.tabs && w.tabs.some(t => t.url === url));
        if (existing) {
          const tab = existing.tabs.find(t => t.url === url);
          if (chrome?.windows?.update) {
            chrome.windows.update(existing.id, { focused: true }, () => {
              if (tab && chrome?.tabs?.update) {
                chrome.tabs.update(tab.id, { active: true });
              }
            });
          }
        } else if (chrome?.windows?.create) {
          chrome.windows.create({ url, type: 'popup', width, height }, created => {
            if (!created) return;
            const createdTab = created.tabs && created.tabs.length ? created.tabs[0] : null;
            if (!createdTab || !chrome?.tabs?.onUpdated) return;

            const tabId = createdTab.id;
            const windowId = created.id;
            const listener = (updatedTabId, changeInfo) => {
              if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
                return;
              }
              chrome.tabs.onUpdated.removeListener(listener);
              resizeWindowToContent({ windowId, tabId, minWidth: width });
            };

            chrome.tabs.onUpdated.addListener(listener);
          });
        }
      });
    } else if (chrome?.windows?.create) {
      chrome.windows.create({ url, type: 'popup', width, height });
    } else {
      window.location.href = path;
    }
  } catch (_) {
    window.location.href = path;
  }
}
