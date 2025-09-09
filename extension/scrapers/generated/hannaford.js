import { scrapeWithStrategy } from './generic.js';

/**
 * Scrape Hannaford search result tiles.
 */
function scrapeHannaford(root = document) {
    return scrapeWithStrategy('hannaford', root);
}

export { scrapeHannaford as default, scrapeHannaford };
//# sourceMappingURL=hannaford.js.map
