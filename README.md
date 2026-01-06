# Grocery App (Grocery Price Checker)

A **privacy-first grocery planning toolkit** that helps you compare **real prices** across retailers, normalize inconsistent units, and turn your meal plan into a practical “what to buy” list—**without uploading your shopping data to any server**.

This project started as a personal attempt to reduce the mental effort of grocery shopping: stores present prices in wildly different formats (pack sizes, “$ / oz” vs “$ / lb”, multi-packs, inconsistent units, shifting layouts). The core of this app is a **data normalization + decision-support** pipeline that runs **client-side** inside the user’s browser.

---

## Table of contents

- [Purpose of design](#purpose-of-design)
- [Why this matters in a public-interest context](#why-this-matters-in-a-public-interest-context)
- [System capabilities](#system-capabilities)
- [Portfolio focus](#portfolio-focus)
- [If you’re reviewing this as a portfolio piece](#if-youre-reviewing-this-as-a-portfolio-piece)
- [How it works](#how-it-works)
- [Data storage and privacy](#data-storage-and-privacy)
- [Model assumptions](#model-assumptions)
- [Non-goals](#non-goals)
- [Quick start (Chrome extension)](#quick-start-chrome-extension)
- [Using the app](#using-the-app)
- [Failure modes and mitigations](#failure-modes-and-mitigations)
- [Maintenance and repair tools](#maintenance-and-repair-tools)
- [Repository notes](#repository-notes)


---

## Purpose of design

1. **Reduce consumer cognitive load** caused by inconsistent price formats  
2. **Help users stay well fed** while reducing unnecessary spending  
3. **Save time** both at home and in the grocery store

> **Portfolio framing:** this is a decision-support system. It’s not about predicting markets—it’s about making messy real-world data comparable and usable.

---

## Why this matters in a public-interest context

**This project addresses a common but under-examined consumer burden:** inconsistent pricing and opaque unit comparisons disproportionately impact time-limited, budget-constrained households.

By normalizing user-visible data locally and transparently, the system demonstrates how applied AI and systems design can reduce everyday cognitive load **without surveillance, behavioral manipulation, or centralized data collection**.

---

## System capabilities

- **Collects and normalizes client-side, user-visible website data** for personal reuse  
- **Calculates meal nutrition and cost** using normalized units  
- **Simple click-through features** that reduce repetitive user navigation during shopping

---

## Portfolio focus

This repository is intentionally written and documented to be inspectable as a systems project.

- **Systems design under real-world data constraints**  
  Scraped retail pages are inconsistent, frequently changing, and rarely “data model friendly.”

- **Efficient tradeoff decision-making between accuracy and usability**  
  The app prefers “correct enough + understandable + repairable” over fragile perfection.

- **Responsible handling of user-visible third-party data**  
  The system stores data **locally**, focuses on the user’s browsing session, and avoids server-side collection.

- **Explicit model assumptions and scope boundaries**  
  Assumptions are documented (units, weeks-per-month shortcut, calendar logic) so reviewers can evaluate correctness.

---

### If you’re reviewing this as a portfolio piece

The most important things to look at are:

- the normalization model and tradeoffs
- how assumptions are made explicit
- the failure → mitigation workflow
- local-first storage strategy and repairability
- architecture choices that keep the system understandable as it grows

---

## How it works

At a high level:

1. **User opens a retailer page** for an item (e.g., Stop & Shop)
2. The extension **reads the rendered page the user is already viewing** and extracts product fields (name, price, size/unit, image, link)
3. The app **normalizes units** (e.g., oz, lb, each) so per-unit prices can be compared
4. The user **selects a final product** and the system stores it locally
5. Meal planning and inventory logic convert the plan into **purchase recommendations**

### Role of AI in this solution (accurate framing)

This project is **AI-assisted**, but it is **not dependent on cloud LLM calls** to function.

- **Assists in adapting parsing logic when website layouts change**, reducing manual work  
  - Practical version: when a retailer changes markup, the app fails fast; a developer workflow uses HTML snapshots/diffs to update selectors  
  - Optional enhancement: that workflow can be **assisted** by an LLM *locally* (or offline) to propose selector updates—reviewed by a human before merging

- **Calculates user diet requirements and scoring metrics** for meal options  
  This is a transparent rules/model-based scoring system (with documented assumptions), not a black box.

- **Purchase recommendations ease ordering without removing human agency**  
  The app recommends; the user decides. No autonomous purchasing.

> If you’re reviewing this for an “AI-enabled” role: treat this as **applied AI + decision systems** and **human-in-the-loop tooling**, not “LLM-as-a-product-feature.”

---

## Data storage and privacy

- **All data is a saved user experience** (what the user already saw in their browser)
- Stored **locally** with **no external distribution**
- Data survives upgrades via **stable extension identifiers**
- Backups are **human-readable and repairable**
- **Item website links are reconstructed** using patterns already present in the user’s normal browsing experience

### Important notes (compliance-minded)

This project is built as a **personal-use tool** and is intentionally conservative:

- **No server-side scraping**
- **No automated crawling**
- **No access to data beyond the user’s browsing session**
- No sharing of collected data between households
- No telemetry / analytics / uploads

Retailer Terms of Service vary. If you continue development toward release, the best path is to:
- add store-specific compliance controls (rate limiting, explicit opt-in, clear host permissions)
- prefer official APIs where available
- treat scraping as an interchangeable “data source” behind a clean interface

---

## Model assumptions

- **Every item is normalized to a common home unit** to enable per-unit cost comparison
- **Volume → mass shortcut** (when density data isn’t provided):  
  `1 ml of water = 1 gram of water`
- **Weekly planning needs** use a simple average:  
  `4.33 weeks per month`
- **Rotation assignment** is easier for automating use than manual assignment  
  Both options are useful, but rotation is the default
- **Meal slots can overlap realistically**  
  e.g., a meal could work for lunch or dinner, but not breakfast

---

## Non-goals

- Does **not** manipulate or predict future prices
- Does **not** automatically purchase anything for the user
- Does **not** share data between different households
- Does **not** perform server-side or automated scraping
- Does **not** access data beyond the user’s browsing session

---

## Quick start (Chrome extension)

1. Download or clone this repository
2. Open **Google Chrome** → go to `chrome://extensions`
3. Turn on **Developer mode**
4. Click **Load unpacked**
5. Select the project folder

You should now see the **Grocery Price Checker** extension.

---

## Using the app

This project includes a shell window that hosts multiple tools (Price Checker, Inventory Timeline, Meal Planner, Calendar, etc.).

1. Click the **Grocery Price Checker** icon
2. A standalone shell window opens with a tab bar at the bottom
3. Pick **Price Checker**:
   - Choose an item → choose a store → a retailer tab opens
   - After the page loads, return to the shell to see scraped results
   - Click **Select** to choose a product
4. When ready to shop, click **Commit** → then **Confirm Add** to update pantry/inventory
5. Use inventory tools to edit stock and record consumption

> **Developer note:** The badge opens `shell.html` in a standalone window via `background.js` (no `default_popup`).  
> A legacy launcher (`launcher.html`) remains for debugging but is deprecated.

---

## Failure modes and mitigations

### 1) Retailer layout or format changes → parsing failure
**Failure:** Grocery website layout or formatting changes may break parsing  
**Mitigation:** AI-assisted (human-reviewed) pattern updates based on observed structural changes

### 2) Nutrition valued over diversity → repetitive meals scheduled
**Failure:** Optimizing for nutrition can cluster repeats  
**Mitigation:** Balance **round-robin point distribution** before nutrition distribution to introduce evenness

### 3) Item out of stock
**Failure:** Saved item becomes unavailable  
**Mitigation:** Surface **additional retailers** when equivalent items are already saved elsewhere

### 4) Scraped data bloat over time
**Failure:** Raw scraped catalogs grow and become noisy  
**Mitigation:** Cleanup, deduplication, normalization, and trimming tools are included

---

## Maintenance and repair tools

### Saving your data (Chrome storage)

The add-on keeps inventory, consumption, and shopping selections using `chrome.storage.local`.  
This data lives inside your browser profile and is **tied to the extension ID**.

To preserve data across reloads, the repository includes a `key` field in `manifest.json` so the extension ID remains stable.

### Repairing inflated pack weights

Older Stop & Shop scrapers multiplied pack count into weight. A maintenance tool can repair stored products:

1. Open **Pack Count Repair**
2. Click **Scan and repair products**

### Removing legacy store selections

Store links are generated from `utils/storeCatalog.js`. Older backups can be trimmed:

```bash
node scripts/removeStoreSelections.js "grocery_backup (100).txt"
```

### Cleaning up scraped product data

Scraped catalogs are temporary. The extension keeps only recent results, strips unused fields, and expires cache entries.  
Older backups can be trimmed:

```bash
node scripts/trimScrapedData.js "grocery_backup (100).txt"
```

### Meal math

```
A × (B × C) × 52 = yearly spots for the category
(yearly spots / D) / 12 = monthly spots for a single meal
```

Where:

- **A** = meals per day (category)  
- **B** = number of people eating the category  
- **C** = days/week they eat it  
- **D** = number of meals in that category  

---

## Repository notes

- **Primary UI entry point:** `shell.html`
- **Persistent storage:** `chrome.storage.local`
- **Utilities and constants:** `utils/`
- **Maintenance scripts:** `scripts/`


