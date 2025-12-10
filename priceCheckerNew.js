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

let cachedSnapshot = null;
const finalSelectionCache = new Map();

function applyThumbnail(container, imageUrl, label, fallbackIcon = '🛒') {
  const fallback = container.querySelector('.image-thumb__fallback');
  const displayLabel = label?.trim() || fallbackIcon;

  if (imageUrl) {
    container.style.backgroundImage = `url("${imageUrl}")`;
    container.classList.add('has-image');
    if (fallback) fallback.textContent = displayLabel.charAt(0).toUpperCase();
  } else {
    container.style.removeProperty('background-image');
    container.classList.remove('has-image');
    if (fallback) fallback.textContent = displayLabel.charAt(0).toUpperCase();
  }
}

function createCategoryCard(category) {
  const fragment = categoryTemplate.content.cloneNode(true);
  const wrapper = fragment.querySelector('.category-block');
  const card = fragment.querySelector('.category-card');
  const children = fragment.querySelector('.category-card__children');
  card.querySelector('.category-card__title').textContent = category.name;
  card.querySelector('.count').textContent = category.items.length;
  const needCount = category.items.filter(item => item.needAmount > 0).length;
  card.querySelector('.need-count').textContent = needCount;

  let hasRenderedChildren = false;

  const renderChildren = () => {
    if (hasRenderedChildren) return;
    children.classList.toggle('show-zero', showAllToggle.checked);
    category.items.forEach(item => {
      const node = createPurchaseCard(item);
      if (node) children.appendChild(node);
    });
    hasRenderedChildren = true;
  };

  const setOpenState = (isOpen) => {
    wrapper.classList.toggle('is-open', isOpen);
    wrapper.classList.toggle('is-collapsed', !isOpen);
    card.classList.toggle('is-open', isOpen);
    children.classList.toggle('is-collapsed', !isOpen);
    card.setAttribute('aria-expanded', String(isOpen));

    if (isOpen) {
      renderChildren();
    }
  };

  setOpenState(false);

  card.addEventListener('click', () => {
    setOpenState(!wrapper.classList.contains('is-open'));
  });
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      card.click();
    }
  });

  const icon = card.querySelector('.category-card__icon');
  const topImage = category.items.find(item => item.productImage);
  applyThumbnail(icon, topImage?.productImage, category.name, '🏷️');

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
  const image = card.querySelector('.purchase-card__image');

  title.textContent = item.name;
  subtitle.textContent = item.homeUnit ? `Tracked in ${item.homeUnit}` : 'Tracked item';
  need.textContent = item.needLabel;
  need.classList.add(`need-${item.needLevel}`);
  amount.textContent = item.needLabel;
  stores.textContent = item.stores.length ? item.stores.join(', ') : 'Not set';

  applyThumbnail(image, item.productImage, item.name, '🛒');

  const viewBtn = card.querySelector('.view-item');
  viewBtn.addEventListener('click', () => {
    openOrFocusWindow(`item.html?item=${encodeURIComponent(item.name)}`);
  });

  return fragment;
}

function normalizeSearchText(value) {
  return (value || '')
    .toString()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchHaystack(item) {
  const tokens = [item.name, item.category, ...(item.stores || [])]
    .filter(Boolean)
    .map(token =>
      token
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
  return tokens.join(' ');
}

async function augmentWithFinalSelections(categories) {
  for (const category of categories) {
    await Promise.all(
      category.items.map(async item => {
        if (finalSelectionCache.has(item.name)) {
          item.productImage = finalSelectionCache.get(item.name);
          return;
        }
        const { product } = await fetchFinalSelection(item.name);
        const image = product?.image;
        if (image) {
          finalSelectionCache.set(item.name, image);
          item.productImage = image;
        }
      })
    );
  }
  return categories;
}

function filterCategories({ includeZero, searchText }) {
  if (!cachedSnapshot) return [];
  const search = normalizeSearchText(searchText);
  return cachedSnapshot.categories
    .map(category => {
      const filteredItems = category.items.filter(item => {
        if (!includeZero && !(item.needAmount > 0)) return false;
        if (!search) return true;
        return item.searchHaystack.includes(search);
      });
      if (!filteredItems.length) return null;
      return { ...category, items: filteredItems };
    })
    .filter(Boolean);
}

function renderFromCache() {
  if (!cachedSnapshot) {
    categoryStack.innerHTML = '<p class="body-text">Loading recommendations…</p>';
    return;
  }

  categoryStack.innerHTML = '';
  const filteredCategories = filterCategories({
    includeZero: showAllToggle.checked,
    searchText: searchInput.value
  });

  if (!filteredCategories.length) {
    categoryStack.innerHTML = '<p class="body-text">No items match this filter.</p>';
    return;
  }

  filteredCategories.forEach(category => {
    categoryStack.appendChild(createCategoryCard(category));
  });
}

async function loadSnapshot() {
  categoryStack.innerHTML = '<p class="body-text">Loading recommendations…</p>';
  const snapshot = await loadPriceCheckerSnapshot({
    includeZero: true,
    searchText: ''
  });
  const categoriesWithFinals = await augmentWithFinalSelections(snapshot.categories);
  cachedSnapshot = {
    generatedAt: snapshot.generatedAt,
    categories: categoriesWithFinals.map(category => ({
      ...category,
      items: category.items.map(item => ({
        ...item,
        searchHaystack: buildSearchHaystack(item)
      }))
    }))
  };

  renderFromCache();
}

function wireEvents() {
  showAllToggle.addEventListener('change', renderFromCache);
  searchInput.addEventListener('input', () => {
    window.clearTimeout(searchInput._searchTimer);
    searchInput._searchTimer = window.setTimeout(renderFromCache, 150);
  });
  openLegacy.addEventListener('click', () => {
    openOrFocusWindow('popup.html');
  });
}

wireEvents();
loadSnapshot();
