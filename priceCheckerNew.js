import {
  fetchFinalSelection,
  loadPriceCheckerSnapshot
} from './utils/priceCheckerData.js';
import { applyImageThumb, resolveItemImage } from './utils/imageThumbnail.js';
import { openOrFocusWindow } from './utils/windowUtils.js';

const categoryStack = document.getElementById('categoryStack');
const categoryTemplate = document.getElementById('categoryCardTemplate');
const purchaseTemplate = document.getElementById('purchaseCardTemplate');
const showAllToggle = document.getElementById('showAllToggle');
const searchInput = document.getElementById('search');
const openLegacy = document.getElementById('openLegacy');

let cachedSnapshot = null;
const finalSelectionCache = new Map();

function deriveCategoryThumbnail(items = [], fallback = null) {
  for (const item of items) {
    const image = resolveItemImage(item, fallback);
    if (image) return image;
  }
  return fallback;
}

function createCategoryCard(category) {
  const fragment = categoryTemplate.content.cloneNode(true);
  const wrapper = fragment.querySelector('.category-block');
  const card = fragment.querySelector('.category-card');
  const header = fragment.querySelector('.category-card__header');
  const chevron = fragment.querySelector('.category-card__chevron');
  const children = fragment.querySelector('.category-card__children');
  const icon = card.querySelector('.category-card__image');
  const totalCount = category.itemCount ?? category.items.length;
  const needCount = category.needCount ?? category.items.filter(item => item.needAmount > 0).length;

  card.querySelector('.category-card__title').textContent = category.name;
  card.querySelector('.count').textContent = totalCount;
  card.querySelector('.need-count').textContent = needCount;

  let hasRenderedChildren = false;
  let hasLoadedImages = false;

  const ensureImagesForItems = async items => {
    if (hasLoadedImages) return items;
    await Promise.all(
      items.map(async item => {
        if (item.productImage) return item;
        if (finalSelectionCache.has(item.name)) {
          item.productImage = finalSelectionCache.get(item.name);
          return item;
        }
        const { product } = await fetchFinalSelection(item.name);
        const image = product?.image;
        if (image) {
          item.productImage = image;
          item.finalProduct = product;
          finalSelectionCache.set(item.name, image);
        }
        return item;
      })
    );
    hasLoadedImages = true;
    return items;
  };

  const renderChildren = async () => {
    if (hasRenderedChildren) return;
    const hydratedItems = await ensureImagesForItems(category.items);
    children.classList.toggle('show-zero', showAllToggle.checked);
    hydratedItems.forEach(item => {
      const node = createPurchaseCard(item);
      if (node) children.appendChild(node);
    });
    const categoryImage = deriveCategoryThumbnail(hydratedItems);
    applyImageThumb(icon, categoryImage, category.name, '🏷️');
    hasRenderedChildren = true;
  };

  const setOpenState = async (isOpen) => {
    wrapper.classList.toggle('is-open', isOpen);
    wrapper.classList.toggle('is-collapsed', !isOpen);
    card.classList.toggle('is-open', isOpen);
    children.classList.toggle('is-collapsed', !isOpen);
    header.setAttribute('aria-expanded', String(isOpen));
    chevron.textContent = isOpen ? '▾' : '▸';

    if (isOpen) {
      await renderChildren();
    }
  };

  setOpenState(false);

  header.addEventListener('click', () => {
    setOpenState(!wrapper.classList.contains('is-open'));
  });
  header.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      header.click();
    }
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
  const image = card.querySelector('.purchase-card__image');

  title.textContent = item.name;
  subtitle.textContent = item.homeUnit ? `Tracked in ${item.homeUnit}` : 'Tracked item';
  need.textContent = item.needLabel;
  need.classList.add(`need-${item.needLevel}`);
  amount.textContent = item.needLabel;
  stores.textContent = item.stores.length ? item.stores.join(', ') : 'Not set';

  applyImageThumb(image, resolveItemImage(item), item.name, '🛒');

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
  cachedSnapshot = {
    generatedAt: snapshot.generatedAt,
    categories: snapshot.categories.map(category => {
      const needCount = category.items.filter(item => item.needAmount > 0).length;
      return {
        ...category,
        itemCount: category.items.length,
        needCount,
        items: category.items.map(item => ({
          ...item,
          searchHaystack: buildSearchHaystack(item)
        }))
      };
    })
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
