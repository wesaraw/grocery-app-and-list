# Storage Service Usage

This module wraps `chrome.storage.local` with validation, migrations, and an optional cache.

## Running migrations

```js
import { init, get } from '../src/services/storageService.js';

// Old v1 keys like `scraped_apple`, `selected_apple`, and `final_apple`
// are automatically merged into the normalized `items` collection on init.
await init();
const items = await get('items');
```

## Handling validation errors

```js
import { set } from '../src/services/storageService.js';

try {
  // Missing `name` will trigger a validation error
  await set('items', [{ id: '1', unit: 'kg', version: 1 }]);
} catch (err) {
  console.error('Write failed:', err.message);
}
```

## Disabling the cache

```js
import { init } from '../src/services/storageService.js';

// Disable caching for tests or low-memory contexts
await init({ useCache: false });
```
