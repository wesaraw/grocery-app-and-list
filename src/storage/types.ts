export interface Item {
  id: string;
  name: string;
  category: string;
  uom: string;
  volumeWeightRatio: number;
  treatAsWholeUnit: boolean;
  shelfLifeWeeks: number;
  seasonRanges: { start: number; end: number }[];
  currentStockByWeek: Record<number, number>;
  consumptionPlan: {
    monthly: number;
    yearly: number;
  };
  version: number;
}

export interface StoreProduct {
  itemId: string;
  store: string;
  url: string;
  scrapedAt: number;
  price: number;
  unitCost: number;
  image: string;
  version: number;
}
