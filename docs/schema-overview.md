# Schema Overview

The app stores normalized, versioned records for inventory, pricing, and planning. Each object carries a `version` field so stored data can be upgraded as the schema evolves. The current schema version is `SCHEMA_VERSION = 1`.

## Item
Represents a purchasable product.

Fields: `id`, `name`, `unit`, `brand`, `density`, optional `storeId`, `version`.

Legacy v1 code maintained a name-to-id map under the `itemNameMap` key and generated incrementing string IDs when saving new items (see Version Old/utils/itemStorage.js). Backups show items tracked with `amount`, `name`, and textual `unit` values (see Version Old/grocery_backup (75).txt).

## Store
Stores information about a vendor.

Fields: `id`, `name`, `logoUrl`, `defaultScraper`, `version`.

## Purchase
Records buying history for an item.

Fields: `itemId`, `date`, `quantity`, `price`, `version`.

In v1, purchases were persisted under the `purchases` key, mapping item IDs back to item names when loaded (see Version Old/utils/purchaseStorage.js).

## MealPlan
Tracks planned meals and their item requirements.

Fields: `date`, `mealType`, `items`, `version`.

## Why versioning?
A review of legacy storage revealed more than a thousand top-level keys and numerous `final_*`, `selected_*`, and `scraped_*` entries, underscoring heavy schema drift in v1 (see Version 2.0 Upgrade Notes/Storage Schema Reverse-Engineering.txt). Embedding versions in each object lets the app migrate data predictably and avoid future drift.

## Extending the schema
See [migrations](./migrations.md) for the migration map and helper. To add fields:

1. Bump `SCHEMA_VERSION`.
2. Extend the relevant interface with new properties.
3. Add a migration function and entry in the map to transform existing data.

Following this process keeps stored records aligned across app upgrades.
