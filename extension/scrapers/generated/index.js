import { scrapeAmazon } from './amazon.js';
import { scrapeHannaford } from './hannaford.js';
import { scrapeRocheBros } from './rochebros.js';
import { scrapeShaws } from './shaws.js';
import { scrapeStopAndShop } from './stopandshop.js';
import { scrapeWalmart } from './walmart.js';
import './config.js';
import './generic.js';
import './common.js';

const scrapers = {
    amazon: scrapeAmazon,
    hannaford: scrapeHannaford,
    'roche-bros': scrapeRocheBros,
    shaws: scrapeShaws,
    'stop-and-shop': scrapeStopAndShop,
    walmart: scrapeWalmart,
};
function scrape(store, root = document) {
    return scrapers[store](root);
}

export { scrape, scrapeAmazon, scrapeHannaford, scrapeRocheBros, scrapeShaws, scrapeStopAndShop, scrapeWalmart, scrapers };
//# sourceMappingURL=index.js.map
