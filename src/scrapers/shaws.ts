import scrapeWithStrategy from './generic.ts';

/**
 * Scrape Shaw's supermarket search results.
 */
export function scrapeShaws(root: Document = document) {
  return scrapeWithStrategy('shaws', root);
}

export default scrapeShaws;
