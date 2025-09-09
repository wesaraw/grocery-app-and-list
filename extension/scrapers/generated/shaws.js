import { scrapeWithStrategy } from './generic.js';

/**
 * Scrape Shaw's supermarket search results.
 */
function scrapeShaws(root = document) {
    return scrapeWithStrategy('shaws', root);
}

export { scrapeShaws as default, scrapeShaws };
//# sourceMappingURL=shaws.js.map
