import { scrapeWithStrategy } from './generic.js';
import './common.js';

/**
 * Scrape Roche Bros product tiles.
 */
function scrapeRocheBros(root = document) {
    return scrapeWithStrategy('roche-bros', root);
}

export { scrapeRocheBros as default, scrapeRocheBros };
//# sourceMappingURL=rochebros.js.map
