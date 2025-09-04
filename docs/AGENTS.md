# Developer Manual

## Naming Conventions
- Use `camelCase` for variables and functions.
- Use `PascalCase` for classes.
- Storage keys are plural (e.g., `items`, `stores`).

## Schema Definitions
- **Item**: `{ id, name, quantity, unit, storeId }`
- **Purchase**: `{ id, itemId, storeId, price, date }`
- **Store**: `{ id, name, location }`

## File Purpose Conventions
- Scrapers only emit `ScrapedProduct` objects.
- Storage modules handle versioned schemas.
- Migrations adapt v1 data from `/Version Old/` according to `/Version 2.0 Upgrade Notes/`.

*(Expand this document as modules and conventions evolve.)*
