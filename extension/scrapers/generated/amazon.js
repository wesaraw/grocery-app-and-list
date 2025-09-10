import { scrapeWithStrategy } from './generic.js';
import './common.js';

/**
 * Scrape Amazon search results.
 * Selectors and quirks documented in "Scraper Profiling.txt".
 */
function scrapeAmazon(root = document) {
    return scrapeWithStrategy('amazon', root);
}

export { scrapeAmazon as default, scrapeAmazon };
//# sourceMappingURL=amazon.js.map
