# Storage Service Architecture Plan

## Legacy patterns
- `Version Old/utils/itemStorage.js` maintained a name-to-id map under `itemNameMap` and lazily generated incremental IDs, persisting through `chrome.storage.local` with minimal error handling.
- `Version Old/utils/purchaseStorage.js` converted purchase objects between item names and IDs before persisting the `purchases` object in `chrome.storage.local`.

## Observed schema drift
- Backups contained 1,191 keys, including 294 `final_*`, 409 `selected_*`, and 450 `scraped_*` entries, illustrating a fragmented per-item structure.

## Normalized schema outline
- **items**: `{ id, name, unit, brand?, density?, options: { scraped: ScrapedProduct[], selected: SelectedProduct?, finalStore: FinalStore? }, stock?: StockEntry[], consumption?: ConsumptionEvent[], purchases?: Purchase[] }`
- **stores**: `{ id, name, location, logoUrl?, defaultScraper?, version }`
- **meals**: `{ id, name, type, people, ingredients, users, prepared, totalCost, version }`
- **users**: `{ id, name, priceThresholds, categoryDays, version }`
- **metadata**: `{ storageVersion }` root key tracking schema version across collections.

All stored objects carry a `version` field. The service maintains a `storageVersion` key used to trigger migrations when the bundled `CURRENT_VERSION` increases.

The first migration consolidates legacy `scraped_*`, `selected_*`, and `final_*` keys into the `items` collection, eliminating the scattered per-item records observed in backup files.

## Planned API surface
- `init({ migrations, useCache })`: ensure `storageVersion` is current and optionally seed an in-memory cache.
- `get(key)`: load and validate a value from `chrome.storage.local` (using cache when enabled).
- `set(key, value)`: validate against the schema and persist, updating the cache.
- `remove(key)`: delete a key and drop related cache entries.
- `registerMigration(version, fn)`: allow modules to append migration functions executed during `init`.

Modules will import this service and call `await storage.get('items')` or `await storage.set('purchases', data)`, keeping all persistence logic centralized.
