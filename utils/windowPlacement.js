export function openOverPriceChecker(url, defaultWidth = 400, defaultHeight = 600) {
  chrome.storage.local.get('priceCheckerBounds', data => {
    const b = data.priceCheckerBounds;
    const opts = { url, type: 'popup', width: defaultWidth, height: defaultHeight };
    if (b) {
      opts.left = b.left;
      opts.top = b.top;
      opts.width = b.width;
      opts.height = b.height;
    }
    chrome.windows.create(opts);
  });
}
