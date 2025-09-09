# 📦 Grocery App v2.0

A lightweight, normalized, and modular rewrite of the original grocery tracking extension.

## 🔍 Overview
Grocery App v2.0 is a Chrome extension that tracks:

- Store-specific scraped prices  
- Inventory and stock usage  
- Meal planning and consumption history  

Built with modular utilities, unified schemas, and deduplicated data storage.

## ✨ Key Improvements from v1
- Schema-based data model with versioning  
- Unified scraper utility per store
- Modular UI components
- Deduplicated persistent storage
- Per-item inventory editing with unit and pack quantity inputs
- Week-specific consumption overrides via a dedicated editor
  (ported from v1 `consumed.js` lines 116‑149 and noted in Upgrade
  Notes lines 68‑72)
- Secondary consumption plan editor with linked monthly/yearly fields
  (ported from v1 `editPlan.js` lines 57‑118)
- Coupon manager for % off, $ off, or fixed-price discounts by store and week
  (ported from v1 `coupon.js` lines 1‑80 and noted in Upgrade Notes
  lines 120–130)
- Meal Chooser for per-user weekly overrides
  (ported from v1 `mealChooser.js` and noted in Upgrade Notes
  lines 164‑171)
- Bulk meal import from XML with default inventory creation
  (ported from v1 `mealImport.js` and Upgrade Notes lines 243‑249).
  See [docs/meal-import.md](docs/meal-import.md) for XML format and
  default item behavior.
- Unified storage service with validation, migrations, and optional caching
- Offline-friendly test fixtures
- Import path for v1 legacy data

## 🗃 Directory Structure (early plan)
```
/Version Old/                 ← legacy reference implementation  
/Version 2.0 Upgrade Notes/   ← analysis of schema drift & migration plan  
/extension
  /ui/                 → HTML pages and scripts
  /scrapers/           → Store-specific scraping logic
  /utils/              → Shared converters, formatters
  /storage/            → Unified storage service
  /migrations/         → v1 → v2 conversion helpers
/test/
  /samples/            → HTML pages for tests
  /fixtures/           → JSON backups and stock data
/docs/AGENTS.md        → Developer guidelines
grocery_backup.txt     → Optional test data sample
```

## 🔧 Developer Setup
```bash
git clone <repo-url>
npm install
./scripts/run-tests.sh
```
Run `./scripts/run-tests.sh` to execute tests and lint; output is saved to `logs/test.log`. Review this log before committing:
- fix simple failures in your change.
- open a separate issue or task for complex or unrelated failures.
All tests are offline-safe; fixtures are bundled.

## 🚀 Roadmap
- Phase 1: Analysis ✅
- Phase 2: Core Rewrite  
- Phase 3: Tests, CI, offline bundling  
- Phase 4: UX polish, accessibility, release
