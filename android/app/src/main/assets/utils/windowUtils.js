const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 600;

const WINDOW_SIZE_OVERRIDES = {
  'backup.html': { width: 420, height: 420 },
  'uomChange.html': { width: 400 },
  'mealNutritionInfo.html': { width: 520, height: 640 },
  'nutritionTargets.html': { width: 520, height: 640 },
  'mergeItems.html': { width: 720, height: 640 }
};

function resolveWindowSize(path, width, height) {
  const basePath = path.split('?')[0];
  const override = WINDOW_SIZE_OVERRIDES[basePath];
  const finalWidth =
    width !== undefined ? width : override?.width ?? DEFAULT_WIDTH;
  const finalHeight =
    height !== undefined ? height : override?.height ?? DEFAULT_HEIGHT;
  return { width: finalWidth, height: finalHeight };
}

export function openOrFocusWindow(path, width, height) {
  const { width: finalWidth, height: finalHeight } = resolveWindowSize(
    path,
    width,
    height
  );
  try {
    const url = chrome.runtime.getURL(path);
    const windowOptions = { url, type: 'popup', width: finalWidth, height: finalHeight };
    if (chrome.windows && chrome.windows.getAll) {
      chrome.windows.getAll({ populate: true }, wins => {
        const existing = wins.find(w =>
          w.tabs && w.tabs.some(t => t.url === url)
        );
        if (existing) {
          const tab = existing.tabs.find(t => t.url === url);
          if (chrome.windows.update) {
            chrome.windows.update(existing.id, { focused: true }, () => {
              if (tab && chrome.tabs && chrome.tabs.update) {
                chrome.tabs.update(tab.id, { active: true });
              }
            });
          }
        } else if (chrome.windows.create) {
          chrome.windows.create(windowOptions);
        }
      });
    } else if (chrome.windows && chrome.windows.create) {
      chrome.windows.create(windowOptions);
    } else {
      window.location.href = path;
    }
  } catch (_) {
    window.location.href = path;
  }
}
