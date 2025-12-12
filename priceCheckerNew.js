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
const categoryItemsCache = new Map();
const categoryThumbCache = new Map();

async function fetchCategoryItems(categoryName, { includeZero, searchText }) {
  const normalizedSearch = normalizeSearchText(searchText);
  const cacheKey = `${categoryName}|${includeZero ? 'all' : 'need'}|${normalizedSearch}`;
  if (categoryItemsCache.has(cacheKey)) {
    return categoryItemsCache.get(cacheKey);
  }

  const { categories } = await loadPriceCheckerSnapshot({
    includeZero,
    searchText: normalizedSearch,
    includeItems: true,
    categoryNames: [categoryName]
  });

  const category = categories.find(cat => cat.name === categoryName);
  const items = (category?.items || []).map(item => ({
    ...item,
    searchHaystack: buildSearchHaystack(item)
  }));
  categoryItemsCache.set(cacheKey, items);
  return items;
}

function createCategoryCard(category) {
  const fragment = categoryTemplate.content.cloneNode(true);
  const wrapper = fragment.querySelector('.category-block');
  const card = fragment.querySelector('.category-card');
  const header = fragment.querySelector('.category-card__header');
  const chevron = fragment.querySelector('.category-card__chevron');
  const children = fragment.querySelector('.category-card__children');
  const icon = card.querySelector('.category-card__image');
  const totalCount = category.itemCount ?? 0;
  const needCount = category.needCount ?? 0;
  let headerImage = categoryThumbCache.get(category.name) || null;

  card.querySelector('.category-card__title').textContent = category.name;
  card.querySelector('.count').textContent = totalCount;
  card.querySelector('.need-count').textContent = needCount;

  let lastRenderKey = '';

  applyImageThumb(icon, headerImage, category.name, '🏷️');

  const hydrateItemImages = async items => {
    const imageTargets = new Map(
      Array.from(children.querySelectorAll('.purchase-card'))
        .map(node => [node.dataset.itemName, node.querySelector('.purchase-card__image')])
    );

    let derivedHeaderImage = headerImage;

    await Promise.all(
      items.map(async item => {
        let image = item.productImage || finalSelectionCache.get(item.name);
        if (!image) {
          const { product } = await fetchFinalSelection(item.name);
          image = product?.image || null;
          if (image) {
            item.productImage = image;
            item.finalProduct = product;
            finalSelectionCache.set(item.name, image);
          }
        }

        const target = imageTargets.get(item.name);
        if (target) applyImageThumb(target, image, item.name, '🛒');
        if (!derivedHeaderImage && image) derivedHeaderImage = image;
      })
    );

    if (derivedHeaderImage) {
      categoryThumbCache.set(category.name, derivedHeaderImage);
      headerImage = derivedHeaderImage;
      applyImageThumb(icon, headerImage, category.name, '🏷️');
    }
  };

  const renderChildren = async () => {
    const search = normalizeSearchText(searchInput.value);
    const includeZero = showAllToggle.checked;
    const renderKey = `${includeZero}|${search}`;
    if (lastRenderKey === renderKey) return;

    const baseItems = await fetchCategoryItems(category.name, { includeZero, searchText: search });
    const filtered = baseItems.filter(item => {
      if (!includeZero && !(item.needAmount > 0)) return false;
      if (!search) return true;
      return item.searchHaystack.includes(search);
    });

    children.textContent = '';
    if (!filtered.length) {
      children.innerHTML = '<p class="body-text muted">No matches in this category.</p>';
      lastRenderKey = renderKey;
      return;
    }

    children.classList.toggle('show-zero', includeZero);
    filtered.forEach(item => {
      const node = createPurchaseCard(item);
      if (node) children.appendChild(node);
    });
    lastRenderKey = renderKey;

    hydrateItemImages(filtered);
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
  card.dataset.itemName = item.name;
  if (!(item.needAmount > 0)) {
    card.classList.add('is-zero');
  }

  const title = card.querySelector('.purchase-card__title');
  const subtitle = card.querySelector('.purchase-card__subtitle');
  const need = card.querySelector('.purchase-card__need');
  const amount = card.querySelector('.recommended-amount');
  const stores = card.querySelector('.store-list');
  const image = card.querySelector('.purchase-card__image');
  const weeklyUse = card.querySelector('.weekly-use');
  const scheduledNeed = card.querySelector('.scheduled-need');

  title.textContent = item.name;
  subtitle.textContent = item.homeUnit ? `Tracked in ${item.homeUnit}` : 'Tracked item';
  need.textContent = item.needLabel;
  need.classList.add(`need-${item.needLevel}`);
  const recommendedLabel =
    item.needAmount && item.needAmount > 0
      ? item.needLabel
      : item.scheduledNeedLabel || item.weeklyUseLabel || item.needLabel;
  amount.textContent = recommendedLabel;
  stores.textContent = item.stores.length ? item.stores.join(', ') : 'Not set';

  weeklyUse.textContent = item.weeklyUseLabel || '—';
  scheduledNeed.textContent = item.scheduledNeedLabel || '—';

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
  return cachedSnapshot.categories.filter(category => {
    if (!includeZero && !(category.needCount > 0)) return false;
    if (!search) return true;
    return (category.searchHaystack || '').includes(search);
  });
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
    includeZero: showAllToggle.checked,
    searchText: normalizeSearchText(searchInput.value),
    includeItems: false
  });
  cachedSnapshot = {
    generatedAt: snapshot.generatedAt,
    categories: snapshot.categories.map(category => ({
      name: category.name,
      itemCount: category.itemCount || 0,
      needCount: category.needCount || 0,
      searchHaystack: category.searchHaystack || ''
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
