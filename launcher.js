const PRICE_WIDTH = 400;

function openWindow(path) {
  const url = chrome.runtime.getURL(path);
  chrome.windows.getCurrent(current => {
    const screenWidth = screen.availWidth;
    const screenHeight = screen.availHeight;
    const baseLeft = current.left + current.width;
    const options = { url, type: 'popup' };
    if (path === 'popup.html') {
      options.width = PRICE_WIDTH;
      options.height = screenHeight;
      options.left = baseLeft;
      options.top = current.top;
      chrome.windows.create(options, win => {
        chrome.storage.local.set({
          priceCheckerBounds: {
            left: win.left,
            top: win.top,
            width: win.width,
            height: win.height
          }
        });
      });
    } else if (path === 'inventoryTimeline.html') {
      const remaining = Math.max(200, screenWidth - baseLeft - PRICE_WIDTH);
      options.width = remaining;
      options.height = screenHeight;
      options.left = baseLeft + PRICE_WIDTH;
      options.top = current.top;
      chrome.windows.create(options);
    } else {
      options.width = 400;
      options.height = 600;
      chrome.windows.create(options);
    }
  });
}

document.getElementById('open-price-checker').addEventListener('click', () => {
  openWindow('popup.html');
});

document.getElementById('open-inventory-timeline').addEventListener('click', () => {
  openWindow('inventoryTimeline.html');
});
