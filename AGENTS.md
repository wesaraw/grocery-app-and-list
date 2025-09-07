# Contributor Guide
- Run `./scripts/run-tests.sh` before committing changes.
- Review `logs/test.log`; fix straightforward failures in the same commit.
- For unrelated or complex failures, open a separate issue or task instead of committing a partial fix.

# Feature Deployment Rules

## Storage and Schema
- Never reintroduce old v1 keys or formats.
- Use only the services, schema types, and patterns defined below.
- Do not bypass `storageService` or directly mutate `chrome.storage`.
- Modules introducing a schema must declare a `version`.
- Never call `chrome.storage.local.get()` directly; use typed helpers such as `getItems()` or `updateItemById(id, patch)`.
- Use versioned schema objects and upgrade via the migration map.
- Every persistent object must include a `version` number.
- Add new schema versions under `migrations/*.js`; old objects are auto-upgraded via `storageService`.
- Do not back-port logic to v1 or support legacy key formats.
- Storage keys use `kebab-case` (e.g., `item-data`, `meal-plan`).
- Schema fields use Title Case.
- All items and stores must have `id` fields; never rely on names as keys.
- Prefer `data-` attributes over raw class names for UI selectors.

## Canonical Schemas

### Item
```js
{
  id: string,
  name: string,
  category: string,
  uom: string,
  volumeWeightRatio: number,
  treatAsWholeUnit: boolean,
  shelfLifeWeeks: number,
  seasonRanges: { start: number, end: number }[],
  currentStockByWeek: Record<weekNumber, number>,
  consumptionPlan: {
    monthly: number,
    yearly: number
  },
  version: number
}
```

### StoreProduct
```js
{
  itemId: string,
  store: string,
  url: string,
  scrapedAt: timestamp,
  price: number,
  unitCost: number,
  image: string,
  version: number
}
```

## DO
- Use `storageService` for all data persistence.
- Render components using declarative `render()` functions.
- Normalize units with `unitNormalize()` from `utils`.
- Use schema-defined types for every object.
- Validate version compatibility before loading a schema.

## DON'T
- Write to `chrome.storage` directly.
- Add unnamed or floating keys.
- Repeat parsing logic in each scraper.
- Use untyped or implicit objects.
- Leave fields undefined—prefer explicit `null` or default values.
