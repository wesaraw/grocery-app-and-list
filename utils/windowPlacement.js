const PRICE_CHECKER_WIDTH = 400;

function getActiveDisplay(mainWin, displays) {
  return (
    displays.find(
      d =>
        mainWin.left >= d.bounds.left &&
        mainWin.left < d.bounds.left + d.bounds.width &&
        mainWin.top >= d.bounds.top &&
        mainWin.top < d.bounds.top + d.bounds.height
    ) || displays[0]
  );
}

function saveLayout(info) {
  chrome.storage.local.set({ layoutInfo: info });
}

export function openPriceChecker() {
  const url = chrome.runtime.getURL('popup.html');
  chrome.windows.getCurrent({ populate: false }, mainWin => {
    chrome.system.display.getInfo(displays => {
      const display = getActiveDisplay(mainWin, displays);
      const area = display.workArea || display.bounds;
      const left = mainWin.left + mainWin.width;
      const top = area.top;
      const height = area.height;
      chrome.windows.create(
        {
          url,
          type: 'popup',
          left,
          top,
          width: PRICE_CHECKER_WIDTH,
          height
        },
        () => {
          saveLayout({ left, top, height, lastPopupTop: 0 });
        }
      );
    });
  });
}

export function openInventoryTimeline() {
  const url = chrome.runtime.getURL('inventoryTimeline.html');
  chrome.storage.local.get('layoutInfo', data => {
    chrome.windows.getCurrent({ populate: false }, mainWin => {
      chrome.system.display.getInfo(displays => {
        const display = getActiveDisplay(mainWin, displays);
        const area = display.workArea || display.bounds;
        const info = data.layoutInfo || {};
        const baseLeft = (info.left ?? mainWin.left + mainWin.width) +
          PRICE_CHECKER_WIDTH;
        const width = Math.max(200, area.width - (baseLeft - area.left));
        chrome.windows.create({
          url,
          type: 'popup',
          left: baseLeft,
          top: area.top,
          width,
          height: info.height ?? area.height
        });
      });
    });
  });
}

export function openOverPriceChecker(url, defaultWidth = 400, defaultHeight = 800) {
  chrome.storage.local.get('layoutInfo', data => {
    const info = data.layoutInfo || {};
    const left = info.left ?? 0;
    const top = (info.top ?? 0) + (info.lastPopupTop || 0);
    const availHeight = info.height ?? screen.availHeight;
    chrome.windows.create({
      url,
      type: 'popup',
      left,
      top,
      width: defaultWidth,
      height: defaultHeight
    }, () => {
      const nextTop = ((info.lastPopupTop || 0) + 60) % availHeight;
      saveLayout({ ...info, left, top: info.top ?? 0, height: availHeight, lastPopupTop: nextTop });
    });
  });
}

export { PRICE_CHECKER_WIDTH };
