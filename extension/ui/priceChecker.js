import { get as storageGet, set as storageSet } from '../../src/services/storageService.js';
import { renderItemsWithCategoryHeaders } from './components.js';

document.addEventListener('DOMContentLoaded', async () => {
  const itemsHost = document.getElementById('items');
  const searchBox = document.getElementById('searchBox');
  const storeTotalsBtn = document.getElementById('storeTotalsBtn');

  const items = await storageGet('items');
  const headerState = {};

  function renderList() {
    const query = (searchBox.value || '').toLowerCase();
    const filtered = items.filter(it =>
      (it.name || '').toLowerCase().includes(query)
    );
    renderItemsWithCategoryHeaders(
      itemsHost,
      filtered,
      (parent, it) => {
        const div = document.createElement('div');
        div.textContent = it.name;
        parent.appendChild(div);
      },
      headerState
    );
  }

  searchBox.addEventListener('input', renderList);
  storeTotalsBtn.addEventListener('click', () => {
    window.open('storeTotals.html', '_blank');
  });
  renderList();
});

chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'finalSelection') {
    (async () => {
      const list = await storageGet('lastCommitItems', []);
      list.push({ item: message.item, store: message.store, product: message.product });
      await storageSet('lastCommitItems', list);
    })();
  }
});
