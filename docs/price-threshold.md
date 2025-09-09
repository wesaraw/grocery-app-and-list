# Price Threshold and Calendar Rebuild

Per-user Price Thresholds cap the cost of scheduled meals. The legacy planner exposed these controls in `Version Old/mealPlanner.html` lines 20-25, where each user could set a `priceThreshold` and trigger a rebuild.

During `rebuildCalendars()`, the planner filters out meals whose `totalCost` exceeds `priceThresholds.default`. If no meal fits under the cap, the function chooses the cheapest option so every slot has an assignment.

Run the Rebuild Calendars button after changing thresholds or meal data. It recomputes assignments and dispatches a `calendars-updated` event so `CalendarView` instances refresh automatically.

> Source: [Upgrade Notes lines 250-259](../Version%202.0%20Upgrade%20Notes/Grocery%20App%20Feature%20List%20V1.0.txt#L250-L259) describing the original Price Threshold and Rebuild Calendar features.
