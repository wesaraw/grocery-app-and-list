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
npm run test
```
All tests are offline-safe; fixtures are bundled.

## 🚀 Roadmap
- Phase 1: Analysis ✅
- Phase 2: Core Rewrite  
- Phase 3: Tests, CI, offline bundling  
- Phase 4: UX polish, accessibility, release
