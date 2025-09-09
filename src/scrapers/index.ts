export { scrapeAmazon } from './amazon';
export { scrapeHannaford } from './hannaford';
export { scrapeRocheBros } from './rochebros';
export { scrapeShaws } from './shaws';
export { scrapeStopAndShop } from './stopandshop';
export { scrapeWalmart } from './walmart';

import { scrapeAmazon } from './amazon';
import { scrapeHannaford } from './hannaford';
import { scrapeRocheBros } from './rochebros';
import { scrapeShaws } from './shaws';
import { scrapeStopAndShop } from './stopandshop';
import { scrapeWalmart } from './walmart';
import './config';

export const scrapers = {
  amazon: scrapeAmazon,
  hannaford: scrapeHannaford,
  'roche-bros': scrapeRocheBros,
  shaws: scrapeShaws,
  'stop-and-shop': scrapeStopAndShop,
  walmart: scrapeWalmart,
};

export type ScraperId = keyof typeof scrapers;

export function scrape(store: ScraperId, root: Document = document) {
  return scrapers[store](root);
}
