const DEFAULT_WIDTH = 1024;

export function openOrFocusWindow(path, width, height = 600) {
  try {
    const url = chrome.runtime.getURL(path);
    const widthWasProvided = typeof width === 'number' && width > 0;
    const desiredWidth = widthWasProvided ? width : DEFAULT_WIDTH;
    const screenWidth = typeof screen !== 'undefined' ? screen.availWidth : undefined;
    const targetWidth = typeof screenWidth === 'number' && screenWidth > 0
      ? Math.min(desiredWidth, screenWidth)
      : desiredWidth;
    if (chrome.windows && chrome.windows.getAll) {
      chrome.windows.getAll({ populate: true }, wins => {
        const existing = wins.find(w =>
          w.tabs && w.tabs.some(t => t.url === url)
        );
        if (existing) {
          const tab = existing.tabs.find(t => t.url === url);
          if (chrome.windows.update) {
            const existingWidth = typeof existing.width === 'number' ? existing.width : undefined;
            const shouldApplyWidth = widthWasProvided || (typeof existingWidth === 'number' && existingWidth < targetWidth);
            const updateOptions = shouldApplyWidth
              ? { focused: true, width: targetWidth }
              : { focused: true };
            chrome.windows.update(existing.id, updateOptions, () => {
              if (tab && chrome.tabs && chrome.tabs.update) {
                chrome.tabs.update(tab.id, { active: true });
              }
            });
          }
        } else if (chrome.windows.create) {
          chrome.windows.create({ url, type: 'popup', width: targetWidth, height });
        }
      });
    } else if (chrome.windows && chrome.windows.create) {
      chrome.windows.create({ url, type: 'popup', width: targetWidth, height });
    } else {
      window.location.href = path;
    }
  } catch (_) {
    window.location.href = path;
  }
}
