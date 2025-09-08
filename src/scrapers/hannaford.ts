import scrapeWithStrategy from './generic.ts';

/**
 * Scrape Hannaford search result tiles.
 */
export function scrapeHannaford(root: Document = document) {
  return scrapeWithStrategy('hannaford', root);
}

export default scrapeHannaford;
