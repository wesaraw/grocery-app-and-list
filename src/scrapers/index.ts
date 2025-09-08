export { scrapeAmazon } from './amazon.ts';
export { scrapeHannaford } from './hannaford.ts';
export { scrapeRocheBros } from './rochebros.ts';
export { scrapeShaws } from './shaws.ts';
export { scrapeStopAndShop } from './stopandshop.ts';
export { scrapeWalmart } from './walmart.ts';

import { scrapeAmazon } from './amazon.ts';
import { scrapeHannaford } from './hannaford.ts';
import { scrapeRocheBros } from './rochebros.ts';
import { scrapeShaws } from './shaws.ts';
import { scrapeStopAndShop } from './stopandshop.ts';
import { scrapeWalmart } from './walmart.ts';
import './config.ts';

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
