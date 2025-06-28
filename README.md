# Grocery Price Checker

This is a simple browser add-on that helps you find and compare prices for grocery items.
It is written for people who are new to computers, so the instructions below are very
step‑by‑step.

## What this add-on does

* Shows a list of groceries you may want to buy.
* Lets you open a store page to see prices (for example, "Stop & Shop").
* After the page opens, the add-on collects product information so you can pick the
  option you prefer.
* Remembers which store you chose for each item.
* Shows how much you might need to buy next to each item.
* Lets you save the final product you want with its picture and price.
* Can create a shopping list and update your pantry when you press **Commit**.
* Allows you to edit your pantry and how much you have used.
* Lets you add new grocery items to track.

## Installing the add-on

1. Download this folder to your computer and remember where you saved it.
2. Open **Google Chrome**.
3. In the address bar at the top, type `chrome://extensions` and press **Enter**.
4. At the top right of the page, turn on **Developer mode** (click the small switch).
5. Click the **Load unpacked** button.
6. Select the folder you downloaded in step 1.
7. You should now see a new icon called **Grocery Price Checker** near the top of Chrome.

## Using the add-on

1. Click the **Grocery Price Checker** icon.
2. A small window appears showing a list of grocery items. Each item may also show
   how much you need to buy.
3. Click the button for any item. Another small window opens listing the stores
   where you can look for that item.
4. Click a store’s button. A new tab opens with the store’s web site. Wait for the
   page to load.
5. When the page finishes loading, switch back to the small window. You will see a
   list of products from that store. Click **Select** next to the product you want.
6. After selecting items from the stores you like, choose the final store for
   the item. The add-on remembers your choice.
7. Repeat these steps for each grocery item you wish to check.
8. When you are ready to shop, click **Commit**. A shopping list will appear and
   your pantry amounts are updated.
9. Use **Edit Inventory** to change what you have on hand.
10. Use **Edit Consumption** to record how much you used this year.
11. Use **Edit Consumption Plan** to adjust monthly or yearly targets.
12. Click **Add Item** if you want to track something new.
13. Click **Remove Item** to delete an item you no longer want to track.
14. Click **Coupons** to manage temporary discounts for each item.

That’s it! You can close the windows when you are done. The add-on keeps the
information so you can refer to it later.

## Saving your data

The add-on keeps track of your inventory, consumption, and shopping list selections using Chrome's `chrome.storage.local` API. This means the data lives inside your browser profile, not inside the extension files themselves. When you update or reload the extension, your information stays intact.

Example code from the extension:

```javascript
// Save purchases
chrome.storage.local.set({ purchases: map }, () => {
  console.log('Inventory saved');
});

// Load purchases
chrome.storage.local.get('purchases', data => {
  console.log('Inventory loaded:', data.purchases);
});
```

Chrome stores this data in a database under your profile directory. **It is tied to the extension ID**, so the ID must remain the same across updates. This repository includes a `key` field in `manifest.json` that keeps the ID constant even if you reload the extension from a fresh checkout. If you remove or change this key, Chrome will treat it as a brand new extension and any saved data will not be loaded.

### Weeks per Month

Several calculations convert monthly amounts to weekly values. The extension uses `4.33` weeks per month (stored in `utils/constants.js` as `WEEKS_PER_MONTH`) as a simple average.

### Meal Lists

Lunch and dinner meals share the same list. The app refers to this combined list
as **Lunch/Dinner**, so plan your weekly meal counts accordingly. For example,
there are typically 14 lunch/dinner spots in a week (7 lunches and 7 dinners),
and the combined list covers all of them.

### Meal Math

Meal planning uses the following formula to determine how many times a meal is prepared:

`A × (B × C) × 52` = yearly spots for the category

`(yearly spots / D) / 12` = monthly spots for a single meal

where:
- `A` is the number of meals of that category served **per day**
- `B` is the number of people eating that category
- `C` is the number of days per week they eat it
- `D` is the number of different meals in the category

Multiply the monthly spots by an ingredient's serving size to get the monthly amount needed.

The file `utils/mealMath.js` exposes helpers and a `DEFAULT_MEALS_PER_DAY` object. Lunch and dinner share the `lunchDinner` key. Its default value is `2` (two meals each day), but you can adjust these counts per person in the future.

Use the **Meal Multiplier** button in the inventory tracker to change how many
times each meal category is eaten per day. The popup shows the current numbers
for Breakfast, Lunch/Dinner, Snacks, and Desserts. Enter a new value and click
**Save** to update the multiplier used by the meal math calculations.
