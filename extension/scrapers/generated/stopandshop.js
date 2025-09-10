import { scrapeWithStrategy } from './generic.js';
import './common.js';

/**
 * Scrape Stop & Shop product tiles.
 */
function scrapeStopAndShop(root = document) {
    return scrapeWithStrategy('stop-and-shop', root);
}

export { scrapeStopAndShop as default, scrapeStopAndShop };
//# sourceMappingURL=stopandshop.js.map
