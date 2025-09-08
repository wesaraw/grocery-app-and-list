# Meal Chooser

Manual meal overrides are based on the legacy implementation in
`Version Old/mealChooser.js` and the requirements outlined in the
"Meal Chooser" section of the upgrade notes
(`Version 2.0 Upgrade Notes/Grocery App Feature List V1.0.txt` lines 164‑171).

## Storage
Overrides persist under the `manual-meal-overrides` key with schema:

```js
{
  week: number,
  users: { [userId]: { [categoryId]: string[] } },
  version: 1
}
```

## UI Flow
1. User buttons select which profile to edit.
2. A category dropdown lists values from `meal-multiplier/constants.js`.
3. Remaining slots display `current / total` per category.
4. Meal buttons append meal IDs until slots are filled.
5. Reset clears the current week's overrides.
