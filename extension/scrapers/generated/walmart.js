import { scrapeWithStrategy } from './generic.js';

/**
 * Scrape Walmart search results using the shared generic scraper.
 */
function scrapeWalmart(root = document) {
    return scrapeWithStrategy('walmart', root);
}

export { scrapeWalmart as default, scrapeWalmart };
//# sourceMappingURL=walmart.js.map
