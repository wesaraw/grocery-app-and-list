import scrapeWithStrategy from './generic';

/**
 * Scrape Stop & Shop product tiles.
 */
export function scrapeStopAndShop(root: Document = document) {
  return scrapeWithStrategy('stop-and-shop', root);
}

export default scrapeStopAndShop;
