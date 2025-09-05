# UI Components

Shared extension elements used by the inventory and shopping list pages.

## `<item-list>`
- **Method**: `render(items, options)`
  - `items`: array of item objects
  - `options.groupBy`: e.g., `"store"`
- **Events**
  - `item-selected` – detail `{ item }`
  - `item-updated` – detail `{ item, value }`
- Legacy store-grouping example: `Version Old/shoppingList.js` lines 27-107

## `<price-entry>`
- **Method**: `render(item)`
- **Events**
  - `price-changed` – detail `{ item, value }`
  - `pack-qty-entered` – detail `{ item, value }`
- Pack conversion logic referenced from `Version Old/inventory.js` lines 137-199

## `<meal-plan-view>`
- **Method**: `render(plan)`
- **Events**
  - `meal-plan-change` – detail `{ entry }`

