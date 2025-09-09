# Meal XML Mass Import

The extension supports bulk meal import from XML files, replacing the v1 [`mealImport.js`](../Version%20Old/mealImport.js) script's direct `chrome.storage` writes with the typed `storageService`.

## Legacy differences
- v1 used a `DEFAULT_ITEM` with category `mass import` and wrote straight to `chrome.storage` to seed missing items.
- v2 uses `storageService` helpers and assigns every new item a `version` along with zero stock, an empty consumption plan, and the `Mass Import` category.

## XML format
The importer expects an XML document with this structure:

```xml
<meals>
  <meal>
    <category>lunchDinner</category>
    <name>Sample Meal</name>
    <users>1</users>
    <ingredients>
      <item>
        <name>Sample Item</name>
        <amount>1</amount>
        <unit>kg</unit>
      </item>
    </ingredients>
  </meal>
</meals>
```

`<users>` is a bitmask string where each position corresponds to a user ID. Optional `<image>` tags reference filenames of accompanying image files selected with the XML.

## Default item behavior
Per the upgrade notes (Version 2.0 Upgrade Notes/Grocery App Feature List V1.0.txt lines 243–246), each ingredient missing from inventory is added automatically with its name, unit, zero stock, and placed in a temporary **Mass Import** category. These defaults match the legacy flow but are now stored as versioned objects through the storage service.

## Post‑import actions
After inserting items and meals, `rebuildCalendars()` runs to recalculate meal plans and calendars so schedules reflect the newly imported data.
