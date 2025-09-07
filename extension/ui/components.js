// Shared UI components for the extension pages.
// Each component exposes a `render` method and dispatches custom events so
// page scripts can react without being tightly coupled to the DOM structure.

// ---------------------------------------------------------------------------
// <item-list> – renders a collection of items and notifies on selection or
// inline quantity updates.
// Legacy shopping list grouped committed items by store before rendering; see
// `Version Old/shoppingList.js` lines 27‑107 for an example of that logic.
//
// Example grouping logic from the legacy file:
//
// const byStore = {};
// items.forEach(it => {
//   const store = it.store || 'Unknown';
//   (byStore[store] ||= []).push(it);
// });
// Object.keys(byStore).sort().forEach(store => {
//   // render grouped items for each store
// });
// ---------------------------------------------------------------------------

const BaseElement = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;
const canDefine = typeof customElements !== 'undefined';

/**
 * `<item-list>` displays items and emits events when users interact.
 *
 * **Events**
 * - `item-selected` — fired when a row is clicked. `detail` is the item.
 * - `item-updated` — fired when quantity input changes.
 *   `detail` is `{ item, value }`.
 */
class ItemListElement extends BaseElement {
  /**
   * Render a list of items.
   * @param {Array} items - Array of item objects or strings.
   * @param {Object} [options] - Optional render configuration.
   */
  render(items = [], { groupBy } = {}) {
    this.innerHTML = '';

    const renderRow = (parent, it) => {
      const row = document.createElement('div');
      row.textContent = it.name || it;
      row.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('item-selected', { detail: it }));
      });

      const input = document.createElement('input');
      input.type = 'number';
      input.value = it.quantity ?? 0;
      input.addEventListener('change', () => {
        this.dispatchEvent(
          new CustomEvent('item-updated', {
            detail: { item: it, value: parseFloat(input.value) }
          })
        );
      });
      row.appendChild(input);
      parent.appendChild(row);
    };

    if (groupBy === 'store') {
      const byStore = items.reduce((map, it) => {
        const store = it.store || 'Unknown';
        (map[store] ||= []).push(it);
        return map;
      }, {});

      Object.keys(byStore)
        .sort()
        .forEach(store => {
          const section = document.createElement('div');
          const h = document.createElement('h2');
          h.textContent = store;
          section.appendChild(h);
          byStore[store].forEach(it => renderRow(section, it));
          this.appendChild(section);
        });
    } else {
      items.forEach(it => renderRow(this, it));
    }
  }
}

if (canDefine) customElements.define('item-list', ItemListElement);

/** Factory for `<item-list>` elements. */
export function createItemList() {
  return typeof document !== 'undefined' ? document.createElement('item-list') : {};
}

export { ItemListElement as ItemList };

// ---------------------------------------------------------------------------
// <price-entry> – captures price or pack quantity information for an item.
// The v1 inventory script converted pack quantities to units before emitting
// updates; see `Version Old/inventory.js` lines 137‑199.
//
// Example pack conversion from the legacy file:
//
// const { count } = getPackInfo(product, new Map(), name);
// const newTotal = packQty * count; // convert packs to unit count
// ---------------------------------------------------------------------------

/**
 * `<price-entry>` exposes fields for price and optional pack quantity.
 *
 * **Events**
 * - `price-changed` — fired when the price input changes. `detail` is
 *   `{ item, value }`.
 * - `pack-qty-entered` — fired when pack quantity changes. `detail` is
 *   `{ item, value }`.
 */
class PriceEntryElement extends BaseElement {
  /**
   * Render price inputs for an item.
   * @param {Object} item - Item metadata.
   */
  render(item = {}) {
    this.innerHTML = '';

    const price = document.createElement('input');
    price.type = 'number';
    price.step = '0.01';
    price.placeholder = 'Price';
    price.addEventListener('change', () => {
      this.dispatchEvent(
        new CustomEvent('price-changed', {
          detail: { item, value: parseFloat(price.value) }
        })
      );
    });

    const pack = document.createElement('input');
    pack.type = 'number';
    pack.placeholder = 'Pack qty';
    pack.addEventListener('change', () => {
      this.dispatchEvent(
        new CustomEvent('pack-qty-entered', {
          detail: { item, value: parseFloat(pack.value) }
        })
      );
    });

    const final = document.createElement('span');
    final.className = 'final-price';

    this.setFinalPrice = value => {
      final.textContent =
        Number.isFinite(value) && value >= 0 ? `Final: $${value.toFixed(2)}` : '';
    };

    this.append(price, pack, final);
  }
}

if (canDefine) customElements.define('price-entry', PriceEntryElement);

/** Factory for `<price-entry>` elements. */
export function createPriceEntry() {
  return typeof document !== 'undefined' ? document.createElement('price-entry') : {};
}

export { PriceEntryElement as PriceEntry };

// ---------------------------------------------------------------------------
// <meal-plan-view> – simple renderer for meal plan data.
// ---------------------------------------------------------------------------

/**
 * `<meal-plan-view>` lists meals and announces selection changes.
 *
 * **Events**
 * - `meal-plan-change` — fired when a meal entry is clicked. `detail` is
 *   the selected entry.
 */
class MealPlanViewElement extends BaseElement {
  /**
   * Render a meal plan.
   * @param {Array} plan - Array of meal entries.
   */
  render(plan = []) {
    this.innerHTML = '';
    plan.forEach(entry => {
      const div = document.createElement('div');
      div.textContent = entry.name || entry;
      div.addEventListener('click', () => {
        this.dispatchEvent(
          new CustomEvent('meal-plan-change', { detail: entry })
        );
      });
      this.appendChild(div);
    });
  }
}

if (canDefine) customElements.define('meal-plan-view', MealPlanViewElement);

/** Factory for `<meal-plan-view>` elements. */
export function createMealPlanView() {
  return typeof document !== 'undefined' ? document.createElement('meal-plan-view') : {};
}

export { MealPlanViewElement as MealPlanView };


/** Sort items by category then name. */
export function sortItemsByCategory(items = []) {
  return items.slice().sort((a, b) => {
    const catA = (a.category || '').toLowerCase();
    const catB = (b.category || '').toLowerCase();
    if (catA === catB) return (a.name || '').localeCompare(b.name || '');
    return catA.localeCompare(catB);
  });
}

/**
 * Render items grouped by category with collapsible headers.
 * @param {HTMLElement} container
 * @param {Array} items
 * @param {Function} renderItem
 * @param {Object} [headerState={}] remembers toggle states
 */
export function renderItemsWithCategoryHeaders(
  container,
  items = [],
  renderItem,
  headerState = {}
) {
  container.innerHTML = '';
  let currentCat = null;
  let section;
  let body;
  sortItemsByCategory(items).forEach(it => {
    const cat = it.category || 'Other';
    if (cat !== currentCat) {
      currentCat = cat;
      section = document.createElement('div');
      const header = document.createElement('h2');
      header.textContent = cat;
      header.style.cursor = 'pointer';
      body = document.createElement('div');
      const hidden = headerState[cat];
      body.style.display = hidden ? 'none' : '';
      header.addEventListener('click', () => {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? '' : 'none';
        headerState[cat] = !isHidden;
      });
      section.append(header, body);
      container.appendChild(section);
    }
    renderItem(body, it);
  });
}

