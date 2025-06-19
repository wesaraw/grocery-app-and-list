function loadCommitItems() {
  return new Promise(resolve => {
    chrome.storage.local.get('lastCommitItems', data => {
      resolve(data.lastCommitItems || []);
    });
  });
}

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><rect width='100%' height='100%' fill='%23ccc'/></svg>";

const STORE_LINKS = {
  'Roche Bros': name =>
    `https://shopping.rochebros.com/search?search_term=${name.replace(/ /g, '%20')}`
};

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('list');
  const items = await loadCommitItems();
  if (items.length === 0) {
    container.textContent = 'No items committed.';
    return;
  }
  const byStore = {};
  items.forEach(it => {
    const store = it.store || 'Unknown';
    if (!byStore[store]) byStore[store] = [];
    byStore[store].push(it);
  });
  Object.keys(byStore)
    .sort()
    .forEach(store => {
      const h = document.createElement('h2');
      h.textContent = store;
      container.appendChild(h);
      const ul = document.createElement('ul');
      byStore[store].forEach(it => {
        const li = document.createElement('li');
        const img = new Image();
        img.src = (it.product && it.product.image) || PLACEHOLDER_IMG;
        img.alt = it.product?.name || '';
        li.appendChild(img);
        const span = document.createElement('span');
        let pStr = it.product?.priceNumber != null ? `$${it.product.priceNumber.toFixed(2)}` : it.product?.price || '';
        let qStr =
          it.product?.convertedQty != null
            ? `${it.product.convertedQty.toFixed(2)} ${it.product.unitType || 'oz'}`
            : it.product?.size || '';
        let uStr =
          it.product?.pricePerUnit != null
            ? `$${it.product.pricePerUnit.toFixed(2)}/${it.product.unitType || 'oz'}`
            : it.product?.unit || '';
        const amt = it.amount != null ? `${it.amount.toFixed(2)} ${it.unit}` : '';
        span.textContent = `${it.item} - ${it.product?.name || ''} - ${pStr} - ${qStr} - ${uStr} - ${amt}`;
        li.appendChild(span);
        const storeName = (it.store || '').toLowerCase().replace(/\./g, '').trim();
        if (
          (storeName.startsWith('roche bros') || storeName.startsWith('roche brothers')) &&
          it.product?.addToCartId
        ) {
          const btn = document.createElement('button');
          btn.textContent = 'Add to Cart';
          btn.addEventListener('click', () => {
            chrome.runtime.sendMessage(
              {
                type: 'openStoreTab',
                url: STORE_LINKS['Roche Bros'](it.item),
                item: it.item,
                store: 'Roche Bros'
              },
              response => {
                const tabId = response.tabId;
                setTimeout(() => {
                  chrome.tabs.sendMessage(tabId, {
                    type: 'simulateClick',
                    selector: `#${it.product.addToCartId}`
                  });
                }, 3000);
              }
            );
          });
          li.appendChild(btn);
        } else if (it.product && it.product.link) {
          const btn = document.createElement('button');
          btn.textContent = 'View';
          btn.addEventListener('click', () => {
            chrome.windows.create({ url: it.product.link, type: 'popup', width: 800, height: 800 });
          });
          li.appendChild(btn);
        }
        ul.appendChild(li);
      });
      container.appendChild(ul);
    });
});
