import { JSDOM } from 'jsdom';

const MEALIME_PRINT_BASE = 'https://app.mealime.com/recipe_variants';
const NUMERIC_ID_REGEX = /^\d+$/;

export function resolveMealimePrintUrl(idOrUrl) {
  if (!idOrUrl || typeof idOrUrl !== 'string') {
    throw new Error('Mealime id or URL must be a non-empty string');
  }

  const trimmed = idOrUrl.trim();
  if (!trimmed) {
    throw new Error('Mealime id or URL must not be blank');
  }

  if (NUMERIC_ID_REGEX.test(trimmed)) {
    return `${MEALIME_PRINT_BASE}/${trimmed}/print`;
  }

  try {
    const url = new URL(trimmed);
    if (!url.pathname.includes('/recipe_variants/')) {
      throw new Error('Mealime recipe URLs must include /recipe_variants/');
    }
    return url.toString();
  } catch (err) {
    throw new Error('Mealime id or URL is not valid');
  }
}

export async function fetchMealimeRecipePage(idOrUrl, { timeoutMs = 15000 } = {}) {
  const sourceUrl = resolveMealimePrintUrl(idOrUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(sourceUrl, { signal: controller.signal, headers: { 'User-Agent': 'mealime-importer/1.0' } });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request to Mealime timed out');
    }
    throw new Error(`Failed to fetch Mealime recipe: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Mealime responded with status ${response.status}`);
  }

  const html = await response.text();
  return parseMealimeRecipeHtml(html, sourceUrl);
}

export function parseMealimeRecipeHtml(html, sourceUrl = null) {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const warnings = [];

  const result = {
    sourceUrl: sourceUrl || null,
    title: null,
    timeText: null,
    servingsText: null,
    ingredientTexts: [],
    stepTexts: [],
    warnings,
  };

  const titleEl = document.querySelector('h1');
  if (titleEl) {
    result.title = titleEl.textContent.trim();
  } else {
    warnings.push('Could not locate recipe title.');
  }

  if (titleEl) {
    const metaEl = nextMeaningfulElement(titleEl);
    if (metaEl) {
      const { timeText, servingsText } = splitMetaText(metaEl.textContent);
      result.timeText = timeText;
      result.servingsText = servingsText;
    } else {
      warnings.push('Missing metadata element under the title.');
    }
  }

  const ingredientSection = findSectionHeading(document, 'grab ingredients');
  if (ingredientSection) {
    result.ingredientTexts = collectListTextUntilNextHeading(ingredientSection);
  } else {
    warnings.push('Could not find "Grab ingredients" section.');
  }

  const cookSection = findSectionHeading(document, 'cook & enjoy');
  if (cookSection) {
    result.stepTexts = collectStepTextUntilNextHeading(cookSection);
  } else {
    warnings.push('Could not find "Cook & enjoy" section.');
  }

  if (result.ingredientTexts.length === 0) {
    warnings.push('No ingredients were extracted.');
  }

  if (result.stepTexts.length === 0) {
    warnings.push('No instructions were extracted.');
  }

  return result;
}

function nextMeaningfulElement(element) {
  let pointer = element.nextElementSibling;
  while (pointer) {
    if (pointer.textContent && pointer.textContent.trim()) {
      return pointer;
    }
    pointer = pointer.nextElementSibling;
  }
  return null;
}

function splitMetaText(text) {
  if (!text) {
    return { timeText: null, servingsText: null };
  }

  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return { timeText: null, servingsText: null };
  }

  const segments = cleaned.split(/•|\||\n/).map((seg) => seg.trim()).filter(Boolean);
  let timeText = null;
  let servingsText = null;

  for (const segment of segments) {
    if (!servingsText && /serv/i.test(segment)) {
      servingsText = segment;
      continue;
    }
    if (!timeText && /(min|hour|hr)/i.test(segment)) {
      timeText = segment;
      continue;
    }
    if (!timeText) {
      timeText = segment;
    } else if (!servingsText) {
      servingsText = segment;
    }
  }

  return { timeText, servingsText };
}

function findSectionHeading(document, includesText) {
  const headings = Array.from(document.querySelectorAll('h2'));
  const lower = includesText.toLowerCase();
  return headings.find((heading) => heading.textContent && heading.textContent.toLowerCase().includes(lower)) || null;
}

function collectListTextUntilNextHeading(sectionHeading) {
  return collectTextUntilNextHeading(sectionHeading, { preferLists: true });
}

function collectStepTextUntilNextHeading(sectionHeading) {
  return collectTextUntilNextHeading(sectionHeading, { preferLists: false });
}

function collectTextUntilNextHeading(sectionHeading, { preferLists }) {
  const entries = [];
  let node = sectionHeading.nextElementSibling;

  while (node) {
    if (node.tagName && node.tagName.toLowerCase() === 'h2') {
      break;
    }

    if (preferLists) {
      if (isList(node)) {
        entries.push(...extractListItems(node));
      } else if (node.tagName && node.tagName.toLowerCase() === 'li') {
        entries.push(node.textContent.trim());
      }
    } else {
      if (isList(node)) {
        entries.push(...extractListItems(node));
      } else if (node.tagName && node.tagName.toLowerCase() === 'p') {
        const text = node.textContent.trim();
        if (text) {
          entries.push(text);
        }
      } else if (node.textContent) {
        const text = node.textContent.trim();
        if (text) {
          entries.push(text);
        }
      }
    }

    node = node.nextElementSibling;
  }

  return entries.filter((text) => text && text.trim()).map((text) => text.trim());
}

function isList(node) {
  if (!node || !node.tagName) {
    return false;
  }
  const lower = node.tagName.toLowerCase();
  return lower === 'ul' || lower === 'ol';
}

function extractListItems(listNode) {
  return Array.from(listNode.querySelectorAll('li')).map((li) => li.textContent.trim()).filter(Boolean);
}
