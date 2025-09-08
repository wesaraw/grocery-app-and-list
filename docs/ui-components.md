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

## Grocery Price Checker window
Displays all items that need pricing, grouped by category with collapsible headers.
- Search box filters items by name.
- Layout modeled after `Version Old/popup.html`.
- Requirements noted under “Grocery Price Checker” in `../Version 2.0 Upgrade Notes/Grocery App Feature List V1.0.txt`.

## Hide Zero Quantities toggle
The inventory timeline and price checker expose a **Hide Zero Qty** button, which switches to **Show Zero Qty** when active.

- **Timeline** – skips items when `computeWeeklyNeed(item) <= 0`.
- **Price checker** – omits committed entries with `amount <= 0`.
- **Legacy reference** – `Version Old/popup.js` lines 1122‑1132.
- **Upgrade note** – “Hide Zero Quantities” in `../Version 2.0 Upgrade Notes/Grocery App Feature List V1.0.txt`.

