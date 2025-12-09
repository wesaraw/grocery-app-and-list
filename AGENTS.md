# Agent Instructions

- Default focus: prioritize Chrome extension and web workflows for this project.
- Android scope: Android app work is deferred unless explicitly requested. If someone asks for Android changes, route the request back to stakeholders for approval before touching the code.
- Reference only: Android build/setup notes live in the repository README, but Android work is currently out of scope.
- UX styling: include the shared `styles.css` in all HTML entry points and follow its design-system tokens (brand/semantic palette, typography, spacing) and components (buttons, cards, tables, navigation, layout patterns).
- Action hierarchy: group actions as primary (solid), secondary (outline), and tertiary (text) buttons; keep contextual actions close to the data they modify.
- Color usage: apply color meaningfully—use semantic tones sparingly to highlight anomalies or status, and favor neutral surfaces for baseline content.
- Layout guidance: use the provided layout classes for Price Checker grids, Inventory Timeline tables, Meal Planner two-column views, and What-To-Eat calendar cards. Prefer card/grid layouts for product and meal surfaces.
- Preserve window logic: keep existing window/backend handling intact—the new CSS provides the UI uplift without rewriting existing window logic.
