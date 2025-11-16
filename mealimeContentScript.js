const MEALIME_CONTEXT_KEY = "mealimeImportContext";

async function loadParser() {
  if (!window.__mealimeParserPromise) {
    window.__mealimeParserPromise = import(chrome.runtime.getURL("mealime/pageParser.js"));
  }
  return window.__mealimeParserPromise;
}

function whenDocumentReady() {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    document.addEventListener("DOMContentLoaded", resolve, { once: true });
  });
}

async function getImportContext() {
  if (!chrome?.storage?.local) return null;
  try {
    const data = await chrome.storage.local.get(MEALIME_CONTEXT_KEY);
    return data?.[MEALIME_CONTEXT_KEY] ?? null;
  } catch (error) {
    console.warn("Mealime importer: unable to read storage", error);
    return null;
  }
}

async function clearImportContext() {
  try {
    await chrome.storage.local.remove(MEALIME_CONTEXT_KEY);
  } catch (error) {
    console.warn("Mealime importer: unable to clear storage", error);
  }
}

async function runMealimeScraper() {
  await whenDocumentReady();
  const context = await getImportContext();
  if (!context) {
    console.debug("Mealime importer inactive; skipping scrape");
    return;
  }
  const currentUrl = window.location.href;
  if (context.expectedUrl && context.expectedUrl !== currentUrl) {
    console.debug("Mealime importer: URL mismatch", context.expectedUrl, currentUrl);
    return;
  }
  const { parseMealimeDocument } = await loadParser();
  const payload = parseMealimeDocument(document, { sourceUrl: currentUrl });
  if (context.requestId) {
    payload.requestId = context.requestId;
  }
  await clearImportContext();
  try {
    await chrome.runtime.sendMessage({ type: "mealimePageParsed", payload });
  } catch (error) {
    console.error("Mealime importer: failed to send message", error);
  }
}

runMealimeScraper();
