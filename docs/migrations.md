# Schema Migrations

Use this file to track every schema change. Copy the template below when introducing a new version.

## Migration Template

### vCurrent -> vNext
- fields changed:
- migration script:
- notes:

---

The v1 app stored item names using an incrementing ID map (`itemNameMap`) and converted arrays by replacing `name` with `id` while preserving other fields.

> "const NAME_ID_KEY = 'itemNameMap';" — `Version Old/utils/itemStorage.js`

The v1 backup revealed 1,191 top-level `chrome.storage.local` keys including `final_*`, `selected_*`, and `scraped_*` entries, underscoring severe schema drift.

> "The backup contains 1,191 top‑level entries... final_*, selected_*, scraped_*" — `Version 2.0 Upgrade Notes/Storage Schema Reverse-Engineering.txt`

## Migration Map
```ts
import { v1ToV2 } from '../src/migrations';

export const migrations = { 1: v1ToV2 };
```

## v1ToV2
Placeholder migration illustrating how to bump an `Item` to the next version while defaulting missing fields:
```ts
export function v1ToV2(item: Item): Item {
  return { ...item, density: item.density ?? 1, version: 2 };
}
```

## runMigrations
Apply migrations sequentially based on the entity's `version` field:
```ts
export function runMigrations<T extends { version: number }>(entity: T): T {
  let current = { ...entity };
  while (migrations[current.version]) {
    current = migrations[current.version](current);
  }
  return current;
}
```

Extend the migration map as schemas evolve to keep stored data aligned.
