import scrapeWithStrategy from './generic';

/**
 * Scrape Roche Bros product tiles.
 */
export function scrapeRocheBros(root: Document = document) {
  return scrapeWithStrategy('roche-bros', root);
}

export default scrapeRocheBros;
