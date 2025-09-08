import scrapeWithStrategy from './generic.ts';

/**
 * Scrape Walmart search results using the shared generic scraper.
 */
export function scrapeWalmart(root: Document = document) {
  return scrapeWithStrategy('walmart', root);
}

export default scrapeWalmart;
