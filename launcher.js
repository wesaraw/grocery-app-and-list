function openWindow(path) {
  const url = chrome.runtime.getURL(path);
  chrome.windows.create({ url, type: 'popup', width: 400, height: 600 });
}

document.getElementById('open-price-checker').addEventListener('click', () => {
  openWindow('popup.html');
});

document.getElementById('open-inventory-timeline').addEventListener('click', () => {
  openWindow('inventoryTimeline.html');
});
