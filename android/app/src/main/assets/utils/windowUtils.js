const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 600;

const WINDOW_SIZE_OVERRIDES = {
  'addItem.html': { width: 420 },
  'addMeal.html': { width: 480 },
  'backup.html': { width: 420, height: 420 },
  'consumed.html': { width: 420 },
  'cookingDays.html': { width: 420 },
  'coupon.html': { width: 420 },
  'densityRatios.html': { width: 480 },
  'editCategory.html': { width: 420 },
  'editPlan.html': { width: 420 },
  'editSeason.html': { width: 420 },
  'expiration.html': { width: 420 },
  'inventory.html': { width: 420 },
  'item.html': { width: 420 },
  'mealChooser.html': { width: 420 },
  'mealListSelect.html': { width: 420 },
  'mealPlanner.html': { width: 420 },
  'mealMultiplier.html': { width: 420 },
  'popup.html': { width: 420 },
  'removeItem.html': { width: 420 },
  'renameItem.html': { width: 420 },
  'scrapeResults.html': { width: 420 },
  'shoppingList.html': { width: 420 },
  'storeTotals.html': { width: 420 },
  'uomChange.html': { width: 480 },
  'users.html': { width: 420 },
  'whatToCookWhen.html': { width: 500 },
  'whatToEatCalendar.html': { width: 440 }
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
