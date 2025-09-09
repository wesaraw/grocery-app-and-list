import scrapeWithStrategy from './generic';

/**
 * Scrape Amazon search results.
 * Selectors and quirks documented in "Scraper Profiling.txt".
 */
export function scrapeAmazon(root: Document = document) {
  return scrapeWithStrategy('amazon', root);
}

export default scrapeAmazon;
