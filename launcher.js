import {
  openPriceChecker,
  openInventoryTimeline
} from './utils/windowLayout.js';

document.getElementById('open-price-checker').addEventListener('click', () => {
  const url = chrome.runtime.getURL('popup.html');
  openPriceChecker(url);
});

document
  .getElementById('open-inventory-timeline')
  .addEventListener('click', () => {
    const url = chrome.runtime.getURL('inventoryTimeline.html');
    openInventoryTimeline(url);
  });
