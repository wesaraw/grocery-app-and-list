import {
  fetchFinalSelection,
  loadPriceCheckerSnapshot
} from './utils/priceCheckerData.js';
import { openOrFocusWindow } from './utils/windowUtils.js';

const categoryStack = document.getElementById('categoryStack');
const categoryTemplate = document.getElementById('categoryCardTemplate');
const purchaseTemplate = document.getElementById('purchaseCardTemplate');
const showAllToggle = document.getElementById('showAllToggle');
const searchInput = document.getElementById('search');
const openLegacy = document.getElementById('openLegacy');

function createCategoryCard(category) {
  const fragment = categoryTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.category-card');
  const children = fragment.querySelector('.category-card__children');
  card.querySelector('.category-card__title').textContent = category.name;
  card.querySelector('.count').textContent = category.items.length;
  const needCount = category.items.filter(item => item.needAmount > 0).length;
  card.querySelector('.need-count').textContent = needCount;
  card.classList.add('is-open');

  card.addEventListener('click', () => {
    card.classList.toggle('is-open');
  });
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      card.click();
    }
  });

  const topImage = category.items.find(item => item.productImage);
  if (topImage?.productImage) {
    const icon = card.querySelector('.category-card__icon');
    icon.innerHTML = `<img src="${topImage.productImage}" alt="${category.name}" />`;
  }

  const grid = children;
  grid.classList.toggle('show-zero', showAllToggle.checked);
  category.items.forEach(item => {
    const node = createPurchaseCard(item);
    if (node) grid.appendChild(node);
  });

  return fragment;
}

function createPurchaseCard(item) {
  const fragment = purchaseTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.purchase-card');
  if (!(item.needAmount > 0)) {
    card.classList.add('is-zero');
  }

  const title = card.querySelector('.purchase-card__title');
  const subtitle = card.querySelector('.purchase-card__subtitle');
  const need = card.querySelector('.purchase-card__need');
  const amount = card.querySelector('.recommended-amount');
  const stores = card.querySelector('.store-list');
  const image = card.querySelector('.purchase-card__image img');

  title.textContent = item.name;
  subtitle.textContent = item.homeUnit ? `Tracked in ${item.homeUnit}` : 'Tracked item';
  need.textContent = item.needLabel;
  need.classList.add(`need-${item.needLevel}`);
  amount.textContent = item.needLabel;
  stores.textContent = item.stores.length ? item.stores.join(', ') : 'Not set';

  if (item.productImage) {
    image.src = item.productImage;
    image.alt = item.name;
  } else {
    image.removeAttribute('src');
    image.alt = '';
  }

  const viewBtn = card.querySelector('.view-item');
  viewBtn.addEventListener('click', () => {
    openOrFocusWindow(`item.html?item=${encodeURIComponent(item.name)}`);
  });

  return fragment;
}

async function augmentWithFinalSelections(categories) {
  for (const category of categories) {
    await Promise.all(
      category.items.map(async item => {
        const { product } = await fetchFinalSelection(item.name);
        if (product?.image) {
          item.productImage = product.image;
        }
      })
    );
  }
  return categories;
}

async function renderSnapshot() {
  categoryStack.innerHTML = '<p class="body-text">Loading recommendations…</p>';
  const snapshot = await loadPriceCheckerSnapshot({
    includeZero: showAllToggle.checked,
    searchText: searchInput.value
  });
  snapshot.categories = await augmentWithFinalSelections(snapshot.categories);

  categoryStack.innerHTML = '';
  if (!snapshot.categories.length) {
    categoryStack.innerHTML = '<p class="body-text">No items match this filter.</p>';
    return;
  }

  snapshot.categories.forEach(category => {
    categoryStack.appendChild(createCategoryCard(category));
  });
}

function wireEvents() {
  showAllToggle.addEventListener('change', renderSnapshot);
  searchInput.addEventListener('input', () => {
    window.clearTimeout(searchInput._searchTimer);
    searchInput._searchTimer = window.setTimeout(renderSnapshot, 150);
  });
  openLegacy.addEventListener('click', () => {
    openOrFocusWindow('popup.html');
  });
}

wireEvents();
renderSnapshot();
