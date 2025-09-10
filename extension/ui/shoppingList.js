import { get as storageGet, set as storageSet, remove as storageRemove } from '../storageService.js';

// Placeholder image used when a product thumbnail is missing.
const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><rect width='100%' height='100%' fill='%23ccc'/></svg>";

let hideZeroItems = false;

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('list');
  const search = document.getElementById('searchBox');
  const toggleZero = document.getElementById('toggleZero');
  const confirmBtn = document.getElementById('confirmAdd');
  const addItemBtn = document.getElementById('addItem');

  const [commitItems, pendingWeek] = await Promise.all([
    storageGet('lastCommitItems', []),
    storageGet('pendingCommitWeek')
  ]);

  if (!commitItems.length) {
    container.textContent = 'No items committed.';
    return;
  }

  const itemsNodes = [];
  const byStore = commitItems.reduce((map, it) => {
    const store = it.store || 'Unknown';
    (map[store] ||= []).push(it);
    return map;
  }, {});

  Object.keys(byStore)
    .sort()
    .forEach(store => {
      const h = document.createElement('h2');
      h.textContent = store;
      container.appendChild(h);

      const ul = document.createElement('ul');
      byStore[store].forEach(it => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';

        const img = new Image();
        img.src = it.product?.image || PLACEHOLDER_IMG;
        img.alt = it.product?.name || '';
        img.width = 50;
        img.height = 50;
        li.appendChild(img);

        const span = document.createElement('span');
        span.style.marginLeft = '0.5em';
        const pStr =
          it.product?.priceNumber != null
            ? `$${it.product.priceNumber.toFixed(2)}`
            : it.product?.price || '';
        const qStr =
          it.product?.convertedQty != null
            ? `${it.product.convertedQty.toFixed(2)} ${
                it.product.unitType || 'oz'
              }`
            : it.product?.size || '';
        const uStr =
          it.product?.pricePerUnit != null
            ? `$${it.product.pricePerUnit.toFixed(2)}/${
                it.product.unitType || 'oz'
              }`
            : it.product?.unit || '';
        const packStr =
          it.packs != null ? `${it.packs} pack${it.packs > 1 ? 's' : ''}` : '';
        const amtStr =
          it.amount != null ? `${it.amount.toFixed(2)} ${it.unit || ''}` : '';
        span.textContent = `${it.item} - ${it.product?.name || ''} - ${pStr} - ${qStr} - ${uStr} - ${packStr} - ${amtStr}`;
        li.appendChild(span);

        if (it.product?.link) {
          const btn = document.createElement('button');
          btn.textContent = 'View';
          btn.addEventListener('click', () => {
            window.open(it.product.link, '_blank');
          });
          li.appendChild(btn);
        }

        ul.appendChild(li);
        itemsNodes.push({ el: li, name: it.item, qty: it.amount ?? 0 });
      });
      container.appendChild(ul);
    });

  function applyFilter() {
    const text = (search?.value || '').trim().toLowerCase();
    itemsNodes.forEach(({ el, name, qty }) => {
      const matches =
        (!text || name.toLowerCase().includes(text)) &&
        (!hideZeroItems || qty > 0);
      el.style.display = matches ? 'flex' : 'none';
    });
  }

  if (search) search.addEventListener('input', applyFilter);

  if (toggleZero) {
    toggleZero.addEventListener('click', () => {
      hideZeroItems = !hideZeroItems;
      toggleZero.textContent = hideZeroItems ? 'Show Zero Qty' : 'Hide Zero Qty';
      applyFilter();
    });
    toggleZero.textContent = 'Hide Zero Qty';
  }

  if (addItemBtn) {
    addItemBtn.addEventListener('click', () => {
      window.open('addItem.html', '_blank', 'width=400,height=600');
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (pendingWeek == null) {
        window.close();
        return;
      }
      const items = await storageGet('items');
      for (const entry of commitItems) {
        const target = items.find(
          it => it.name === entry.item || it.id === entry.item
        );
        if (!target) continue;
        target.purchases = Array.isArray(target.purchases)
          ? target.purchases
          : [];
        target.purchases.push({
          purchase_week: pendingWeek,
          quantity_purchased: entry.amount
        });
      }
      await storageSet('items', items);
      await storageRemove('pendingCommitWeek');
      window.close();
    });
  }
});

