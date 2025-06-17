function storageKey(type, item, store) {
  return `${type}_${encodeURIComponent(item)}_${encodeURIComponent(store)}`;
}

function loadProducts(item, store) {
  return new Promise(resolve => {
    const key = storageKey('scraped', item, store);
    chrome.storage.local.get([key], data => resolve(data[key] || []));
  });
}

function saveSelected(item, store, product) {
  return new Promise(resolve => {
    const key = storageKey('selected', item, store);
    chrome.storage.local.set({ [key]: product }, () => resolve());
  });
}

function nameMatchesProduct(productName, itemName) {
  const itemWords = itemName
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const prod = productName.toLowerCase();
  return itemWords.some(w => prod.includes(w));
}

const params = new URLSearchParams(location.search);
const item = params.get('item');
const store = params.get('store');

const title = document.getElementById('title');
const container = document.getElementById('products');

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='100%' height='100%' fill='%23ccc'/></svg>";

title.textContent = `${item} - ${store}`;

loadProducts(item, store).then(products => {
  const filtered = products.filter(p => nameMatchesProduct(p.name, item));
  if (filtered.length === 0) {
    container.textContent = 'No products found.';
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    const aPrice = a.pricePerUnit ?? Infinity;
    const bPrice = b.pricePerUnit ?? Infinity;
    return aPrice - bPrice;
  });

  sorted.forEach(prod => {
    const div = document.createElement('div');
    div.className = 'product';

    const img = document.createElement('img');
    img.src = prod.image || PLACEHOLDER_IMG;
    img.width = 200;
    img.height = 200;
    img.alt = prod.name;
    img.onerror = () => {
      img.src = PLACEHOLDER_IMG;
    };
    div.appendChild(img);

    let pStr = prod.priceNumber != null ? `$${prod.priceNumber.toFixed(2)}` : prod.price;
    let qStr = prod.convertedQty != null ? `${prod.convertedQty.toFixed(2)} oz` : prod.size;
    let uStr = prod.pricePerUnit != null ? `$${prod.pricePerUnit.toFixed(2)}/oz` : prod.unit;
    const info = document.createElement('span');
    info.textContent = `${prod.name} - ${pStr} - ${qStr} - ${uStr}`;
    div.appendChild(info);

    const btn = document.createElement('button');
    btn.textContent = 'Select';
    btn.addEventListener('click', async () => {
      await saveSelected(item, store, prod);
      chrome.runtime.sendMessage(
        {
          type: 'selectedItem',
          item,
          store,
          product: prod
        },
        () => {
          // Close only after the message is sent
          window.close();
        }
      );
    });
    div.appendChild(document.createElement('br'));
    div.appendChild(btn);
    container.appendChild(div);
  });
});
