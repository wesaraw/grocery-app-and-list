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
* Can create a shopping list. When you press **Comit**, the list opens and you
  press **Confirm Add** to update your pantry.
* Allows you to edit your pantry and how much you have used.
* Lets you add new grocery items to track.
* Lets you set seasons for each item so meal plans only use ingredients when
  they are available.

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
8. When you are ready to shop, click **Comit**. This opens a shopping list.
   Press **Confirm Add** to update your pantry.
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

### Repairing inflated pack weights

Older versions of the Stop & Shop scraper multiplied a product’s pack count into its
weight (for example, a single 26.7 oz bag of treats was stored as 854.4 oz when the
bag contained 32 sticks). After updating to the fixed scrapers, run the maintenance
tool to shrink any saved products back to their real size:

1. Open the extension popup and click **Pack Count Repair**.
2. Press **Scan and repair products**. The tool reviews every `final_product_*`
   record in `chrome.storage.local` and rewrites the inflated weights only when the
   unit price confirms the total should be smaller.
3. Repeat the scan after importing an older backup so those items are repaired too.

Backups exported before this fix still contain the inflated numbers. You can update
them in place with Node.js:

```bash
node scripts/repairPackCountWeights.js "grocery_backup (100).txt" # add more files if needed
```

The script rewrites each file only when it finds entries to repair and prints a
summary of the affected products.

### Removing legacy store selections

Store links (Stop & Shop, Walmart, etc.) are now generated on the fly from
`utils/storeCatalog.js`, so they no longer need to be stored with each item. The
popup automatically deletes the obsolete `storeSelections` key from Chrome
storage and backups omit it as well. If you have older backup files you can
shrink them in place with:

```bash
node scripts/removeStoreSelections.js "grocery_backup (100).txt"
```

Run the script for each file you want to trim. It rewrites the file only when it
finds the legacy key.

### Cleaning up scraped product data

Scraped store catalogs are temporary: the extension now keeps only the 20 most
recent results for each item/store pair, strips unused fields, and expires the
cache after 14 days. Backups automatically drop every `scraped_*` key so the
exports stay lean. Older backup files can be rewritten the same way with:

```bash
node scripts/trimScrapedData.js "grocery_backup (100).txt"
```

Run the command for each backup you want to shrink. The script only rewrites the
file when it finds at least one `scraped_*` entry.

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

### Cooking Days

The **Cooking Days** page lets you pick which weekdays are prep days for each
meal category. Prepared meals rotate through these days when building the
Prepared Meal Calendar. You can open this page from the Meal Planner or the
inventory tracker.

Any changes to cooking days, user schedules, or meal lists automatically
regenerate the prepared and personal calendars so the inventory math always
reflects the latest plan.

### Prepared Meal Calendar

Meals can now be tagged as **prepared**. Admins define cooking days for each
category (for example, lunches on Monday, Wednesday, and Friday). The app
rotates prepared meals across those days using a round‑robin assignment and
saves the results in a `PreparedMealsCalendar` map. User calendars pull from
this schedule to decide what meal to eat on a given day.

### What to Eat When Calendar

Each user picks the exact weekdays they eat each meal category. The app uses
those selections together with the prepared meal schedule to build a personal
`WhatToEatCalendar`. For cooking days, the calendar checks the prepared schedule
first. If the user is subscribed to that meal it is assigned; otherwise a
non‑prepped meal from their subscriptions is rotated in. On non‑cooking days a
non‑prepared meal is chosen. These calendars drive the meal math so ingredient
needs reflect the actual days users plan to eat.

Non‑prepared **lunch/dinner** meals now rotate using a **shared index**. The first
subscriber's list defines the ordering. Each day the meal at this shared index
is attempted for all users and the index advances. Users missing that meal (or
priced out by their personal limit) fall back to their own rotation without
changing the shared index. Other categories keep their own per‑user rotation, so
breakfasts and snacks still vary individually. This keeps everyone aligned for
the main meal while preserving personal cycles elsewhere.

You can view this schedule by opening the **Meal Planner** (from the popup or
the inventory timeline) and clicking **Calendar**. A new window lets you pick a
user and date range to see what meals they will eat each day.

The calendar shows a column for each individual meal spot. Column headers
reflect the current meal multipliers (for example "Drink 1", "Snack 2", etc.).
When multipliers are changed, the layout expands or contracts from the ends of
the day toward the center so meals stay evenly distributed.

### Purchase Recommendations

The purchase calculator now also looks at this calendar. Ingredient amounts are
summed by week based on the `WhatToEatCalendar`, so the suggested shopping list
matches the upcoming meal plan.

If you already rely on this calendar you can ignore the yearly meal-plan totals
by passing `false` for the `useMealPlanTotals` option when calling the purchase
calculator. This avoids double-counting meals and lets the calendar drive the
entire recommendation.

### Item Seasons

Item season data is stored in an `itemSeasons` object. Each key is the exact
item name and maps to an array of objects with `start` and `end` properties
representing the beginning and ending month (1–12):

```json
{
  "Tomatoes": [
    { "start": 6, "end": 9 }
  ]
}
```

Use **Edit Seasons** from the extension menu to modify these ranges. Meal
calendars skip ingredients when the selected date falls outside all of their
season ranges.

### XML Meal Import

The Meal Planner window includes an **Import Meals** button. This lets you load
multiple meals from a single XML file. Each meal follows this structure:

```xml
<meals>
  <meal>
    <category>lunchDinner</category>
    <name>Meal Name</name>
    <recipeBook>Book Name</recipeBook>
    <image>image_name.jpg</image>
    <users>11011</users>
    <prepared>false</prepared>
    <group>false</group>
    <weight>1</weight>
    <ingredients>
      <item>
        <name>Ingredient</name>
        <amount>1</amount>
        <unit>oz</unit>
      </item>
    </ingredients>
  </meal>
  <!-- more meals -->
</meals>
```

`recipeBook` is optional and stores the cookbook or other source for the meal.
`users` is a series of 1s and 0s matching the user order on the **Users** page.
Each `<meal>` element is imported one at a time. Every ingredient is added to
the inventory with default values (zero stock and the category `mass import`).
A blank template named `meal_import_blank.xml` is included in the repository for
convenience. The `<image>` tag is optional and should match the name of an image
file selected during import. When using the **Import Meals** button, choose the
XML file **and** any image files at the same time. Images referenced by the
`<image>` tag will be attached to the meal if a file with that name is
selected. If no matching file is found the meal will import without an image.

## Building the Android app

The Android source under `android/` can be compiled with Gradle. All of the
extension files are copied into `android/app/src/main/assets`, so keep that
folder in sync with the rest of the project whenever you update the extension.
Make sure the **Required for grocery app** directory is also copied there or the
APK will not include the default data files.

### Debug build

1. From the `android` directory run:

   ```bash
   ./gradlew assembleDebug
   ```

   The APK will be written to
   `android/app/build/outputs/apk/debug/app-debug.apk`. Install this file on a
   device or emulator to test the app.

### Release build

To sign a release build you must generate your own keystore and keep the
credentials outside of version control.

1. Create a keystore on your machine:

   ```bash
   keytool -genkeypair -v -keystore my-release-key.keystore \
       -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Save the keystore path and passwords in `android/keystore.properties`:

   ```
   storeFile=/absolute/path/to/my-release-key.keystore
   storePassword=YOUR_STORE_PASSWORD
   keyAlias=my-key-alias
   keyPassword=YOUR_KEY_PASSWORD
   ```

   This file is ignored by Git (see `.gitignore`).

3. Run `./gradlew assembleRelease` from the `android` directory. The signed APK
   will be located at
   `android/app/build/outputs/apk/release/app-release.apk`.
