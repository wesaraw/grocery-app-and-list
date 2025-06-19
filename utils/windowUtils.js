export function openOrFocusWindow(path, width = 400, height = 600) {
  try {
    const url = chrome.runtime.getURL(path);
    chrome.windows.getAll({ populate: true }, wins => {
      const existing = wins.find(w =>
        w.tabs && w.tabs.some(t => t.url === url)
      );
      if (existing) {
        const tab = existing.tabs.find(t => t.url === url);
        chrome.windows.update(existing.id, { focused: true }, () => {
          if (tab) chrome.tabs.update(tab.id, { active: true });
        });
      } else {
        chrome.windows.create({ url, type: 'popup', width, height });
      }
    });
  } catch (_) {
    // ignore if chrome API is unavailable
  }
}
