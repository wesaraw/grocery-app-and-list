const TEXT_NODE = 3;

function ensureDocument(input) {
  if (!input) {
    throw new Error("Mealime parser requires a Document or HTML string");
  }
  if (typeof input.querySelector === "function") {
    return input;
  }
  if (typeof input === "string") {
    if (typeof DOMParser === "undefined") {
      throw new Error("DOMParser is not available in this environment");
    }
    const parser = new DOMParser();
    return parser.parseFromString(input, "text/html");
  }
  throw new Error("Unsupported input type for Mealime parser");
}

function cleanText(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function getNextContentElement(node) {
  if (!node) return null;
  let cursor = node.nextSibling;
  while (cursor) {
    if (cursor.nodeType === TEXT_NODE && cursor.textContent.trim()) {
      return cursor;
    }
    if (cursor.nodeType === 1) {
      if (cursor.textContent.trim()) {
        return cursor;
      }
    }
    cursor = cursor.nextSibling;
  }
  return null;
}

function extractTimeAndServings(text, warnings) {
  const result = { time: null, servings: null };
  if (!text) {
    return result;
  }
  const parts = text.split("|").map(part => cleanText(part)).filter(Boolean);
  const timePart = parts.find(part => /min|hour|hr|prep|cook/i.test(part));
  if (timePart) {
    result.time = timePart;
  }
  const servingsPart = parts.find(part => /serv/i.test(part));
  if (servingsPart) {
    const match = servingsPart.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      result.servings = Number(match[1]);
    } else {
      result.servings = servingsPart;
      warnings.push("Could not parse servings count");
    }
  }
  return result;
}

function findHeading(document, text) {
  const lowerText = text.toLowerCase();
  return Array.from(document.querySelectorAll("h2"))
    .find(h2 => cleanText(h2.textContent).toLowerCase().includes(lowerText));
}

function extractListItemsFromHeading(heading) {
  if (!heading) return [];
  let list = heading.nextElementSibling;
  while (list && list.tagName !== "UL") {
    list = list.nextElementSibling;
  }
  if (!list) {
    list = heading.parentElement?.querySelector("ul");
  }
  if (!list) return [];
  return Array.from(list.querySelectorAll("li"));
}

function extractIngredients(document) {
  const heading = findHeading(document, "grab ingredients");
  const items = extractListItemsFromHeading(heading);
  return items.map(li => cleanText(li.textContent)).filter(Boolean);
}

function extractSteps(document) {
  const heading = findHeading(document, "cook & enjoy");
  const items = extractListItemsFromHeading(heading);
  return items.map(li => {
    const primary = li.querySelector(".primary");
    const secondary = li.querySelector(".secondary");
    const secondaryText = secondary ? cleanText(secondary.textContent) : "";
    const primaryText = primary ? cleanText(primary.textContent) : cleanText(li.textContent);
    return secondaryText ? `${primaryText}\n${secondaryText}` : primaryText;
  }).filter(Boolean);
}

export function parseMealimeDocument(input, options = {}) {
  const warnings = [];
  const document = ensureDocument(input);
  const sourceUrl = options.sourceUrl || (document?.location?.href ?? "");
  const titleElement = document.querySelector("h1");
  const title = cleanText(titleElement?.textContent ?? "");
  let metadataText = "";
  if (titleElement) {
    const scopedDescription = titleElement.parentElement?.querySelector(".description");
    if (scopedDescription) {
      metadataText = cleanText(scopedDescription.textContent);
    }
  }
  if (!metadataText) {
    const globalDescription = document.querySelector(".description");
    if (globalDescription) {
      metadataText = cleanText(globalDescription.textContent);
    }
  }
  if (!metadataText && titleElement) {
    const metadataNode = getNextContentElement(titleElement);
    metadataText = metadataNode ? cleanText(metadataNode.textContent) : "";
  }
  const { time, servings } = extractTimeAndServings(metadataText, warnings);
  const rawIngredients = extractIngredients(document);
  const rawSteps = extractSteps(document);
  if (!title) {
    warnings.push("Missing recipe title");
  }
  if (!rawIngredients.length) {
    warnings.push("No ingredients found");
  }
  if (!rawSteps.length) {
    warnings.push("No instructions found");
  }
  return {
    sourceUrl,
    title,
    time,
    servings,
    rawIngredients,
    rawSteps,
    warnings,
  };
}

export default {
  parseMealimeDocument,
};
