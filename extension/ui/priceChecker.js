import { get as storageGet } from '../../src/services/storageService.js';
import { renderItemsWithCategoryHeaders } from './components.js';

document.addEventListener('DOMContentLoaded', async () => {
  const itemsHost = document.getElementById('items');
  const searchBox = document.getElementById('searchBox');

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
  renderList();
});
