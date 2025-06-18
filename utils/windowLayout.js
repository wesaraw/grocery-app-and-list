export const PRICE_CHECKER_WIDTH = 400;

export async function computeLayout() {
  const mainWin = await chrome.windows.getCurrent({ populate: false });
  const displays = await new Promise(resolve => {
    chrome.system.display.getInfo(info => resolve(info));
  });

  let display = displays.find(d => {
    const b = d.bounds;
    return (
      mainWin.left >= b.left &&
      mainWin.left < b.left + b.width &&
      mainWin.top >= b.top &&
      mainWin.top < b.top + b.height
    );
  });
  if (!display) display = displays[0];

  const total = display.workArea || display.bounds;
  const priceCheckerLeft = mainWin.left + mainWin.width;
  const availableWidth = total.width - (priceCheckerLeft - total.left);
  const inventoryWidth = Math.max(0, availableWidth - PRICE_CHECKER_WIDTH);

  const layout = {
    priceCheckerLeft,
    inventoryLeft: priceCheckerLeft + PRICE_CHECKER_WIDTH,
    inventoryWidth,
    totalTop: total.top,
    availableHeight: total.height,
    lastPopupTop: 0
  };
  await chrome.storage.local.set({ windowLayout: layout });
  return layout;
}

export async function getLayout() {
  return new Promise(resolve => {
    chrome.storage.local.get('windowLayout', data => {
      if (data.windowLayout) {
        resolve(data.windowLayout);
      } else {
        computeLayout().then(resolve);
      }
    });
  });
}

export async function openPriceChecker(url) {
  const layout = await computeLayout();
  return chrome.windows.create({
    url,
    type: 'popup',
    top: layout.totalTop,
    left: layout.priceCheckerLeft,
    width: PRICE_CHECKER_WIDTH,
    height: layout.availableHeight
  });
}

export async function openInventoryTimeline(url) {
  const layout = await getLayout();
  return chrome.windows.create({
    url,
    type: 'popup',
    top: layout.totalTop,
    left: layout.inventoryLeft,
    width: layout.inventoryWidth,
    height: layout.availableHeight
  });
}

export async function openInPriceCheckerArea(url, height = 600) {
  const layout = await getLayout();
  const top = layout.lastPopupTop || 0;
  const newTop = (top + 60) % layout.availableHeight;
  await chrome.storage.local.set({ windowLayout: { ...layout, lastPopupTop: newTop } });
  return chrome.windows.create({
    url,
    type: 'popup',
    top: layout.totalTop + top,
    left: layout.priceCheckerLeft,
    width: PRICE_CHECKER_WIDTH,
    height
  });
}
