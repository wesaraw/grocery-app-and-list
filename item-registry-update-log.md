# Item Registry Integration Log

## users.js
- Replaced direct `chrome.storage` meal loading with `loadArrayWithFallback` from `itemRegistry` to ensure meals are resolved through the centralized item registry.
- Converted nested `ingredients` arrays to use `convertArrayToNames` so UI receives human-readable names instead of numeric IDs.

## utils/mealData.js
- Introduced `loadArray`/`saveArray` helpers from `itemRegistry` for reading and writing `mealCategories`.
- Added initialization of newly created meal category storage using `saveArray` to ensure future meal lists store numeric item IDs.

## utils/mealNeedsCalculator.js
- Replaced manual `chrome.storage` access with `loadArrayWithFallback` for retrieving meals.
- Converted each meal's `ingredients` via `convertArrayToNames` so need calculations use readable item names.

## popup.js
- Switched meal loading to `loadArrayWithFallback` and translated ingredient IDs with `convertArrayToNames` before price computations.

## storeTotals.js
- Applied the same meal-loading and ingredient conversion helpers to ensure store totals operate on named items.

*Equivalent updates were mirrored in the Android asset copies of these modules.*

These changes further centralize meal and category persistence through the item registry, reducing reliance on string-based item names and preparing modules for ID-based storage.
