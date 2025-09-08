import { get as storageGet } from '../../src/services/storageService.js';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const itemParam = params.get('item');
  const store = params.get('store');
  const title = document.getElementById('title');
  title.textContent = store ? `${store} results` : 'Results';

  const items = await storageGet('items', []);
  const item = items.find(it => it.id === itemParam || it.name === itemParam);
  const scraped = item?.options?.scraped || [];
  const rec = scraped.find(s => s.store === store);
  const products = rec?.products || [];

  const container = document.getElementById('products');
  products.forEach(prod => {
    const div = document.createElement('div');
    div.className = 'product';

    const img = document.createElement('img');
    img.src = prod.image || '';
    img.alt = prod.name;
    div.appendChild(img);

    const info = document.createElement('span');
    const price = prod.priceNumber != null ? `$${prod.priceNumber.toFixed(2)}` : prod.price || '';
    info.textContent = `${prod.name} - ${price}`;
    div.appendChild(info);

    const btn = document.createElement('button');
    btn.textContent = 'Select';
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage(
        { type: 'finalSelection', item: itemParam, store, product: prod },
        () => window.close()
      );
    });
    div.appendChild(document.createElement('br'));
    div.appendChild(btn);
    container.appendChild(div);
  });
});
