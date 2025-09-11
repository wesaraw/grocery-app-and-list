export const schemas = {
  items: {
    $id: 'items',
    type: 'array',
    items: {
      type: 'object',
      required: [
        'id',
        'name',
        'category',
        'uom',
        'volumeWeightRatio',
        'treatAsWholeUnit',
        'shelfLifeWeeks',
        'seasonRanges',
        'currentStockByWeek',
        'consumptionPlan',
        'version'
      ],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        category: { type: 'string' },
        uom: { type: 'string' },
        volumeWeightRatio: { type: 'number' },
        treatAsWholeUnit: { type: 'boolean' },
        shelfLifeWeeks: { type: 'number' },
        seasonRanges: {
          type: 'array',
          items: {
            type: 'object',
            required: ['start', 'end'],
            properties: {
              start: { type: 'number' },
              end: { type: 'number' }
            },
            additionalProperties: false
          }
        },
        currentStockByWeek: {
          type: 'object',
          patternProperties: {
            '^\\d+$': { type: 'number' }
          },
          additionalProperties: false
        },
        consumptionPlan: {
          type: 'object',
          required: ['monthly', 'yearly'],
          properties: {
            monthly: { type: 'number' },
            yearly: { type: 'number' }
          },
          additionalProperties: false
        },
        version: { type: 'integer' }
      },
      additionalProperties: false
    }
  },
  coupons: {
    $id: 'coupons',
    type: 'array',
    items: {
      type: 'object',
      required: ['itemId', 'type', 'value', 'startWeek', 'endWeek', 'store', 'version'],
      properties: {
        itemId: { type: 'string' },
        type: { type: 'string', enum: ['percent', 'fixedOff', 'fixedPrice'] },
        value: { type: 'number' },
        startWeek: { type: 'integer' },
        endWeek: { type: 'integer' },
        store: { type: 'string' },
        version: { type: 'integer' }
      },
      additionalProperties: false
    }
  },
  stores: {
    $id: 'stores',
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'name', 'version'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        location: { type: 'string', nullable: true },
        logoUrl: { type: 'string', nullable: true },
        defaultScraper: { type: 'string', nullable: true },
        version: { type: 'integer' }
      },
      additionalProperties: true
    }
  },
  meals: {
    $id: 'meals',
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'name', 'type', 'ingredients', 'flags', 'weight', 'recipeBook', 'version'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string' },
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'amount', 'unit'],
            properties: {
              name: { type: 'string' },
              amount: { type: 'number' },
              unit: { type: 'string' },
              cost: { type: 'number', nullable: true }
            },
            additionalProperties: false
          }
        },
        flags: {
          type: 'object',
          properties: {
            prepared: { type: 'boolean', nullable: true },
            prepAhead: { type: 'boolean', nullable: true },
            group: { type: 'boolean', nullable: true }
          },
          additionalProperties: false
        },
        weight: { type: 'number', nullable: true },
        recipeBook: { type: 'string', nullable: true },
        users: { type: 'array', nullable: true },
        image: { type: 'string', nullable: true },
        totalCost: { type: 'number', nullable: true },
        version: { type: 'integer' }
      },
      additionalProperties: false
    }
  },
  users: {
    $id: 'users',
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'name', 'version'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        version: { type: 'integer' },
      },
      additionalProperties: true,
    },
  },
  'user-category-days': {
    $id: 'user-category-days',
    type: 'array',
    items: {
      type: 'object',
      required: ['userId', 'schedule', 'version'],
      properties: {
        userId: { type: 'string' },
        schedule: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        version: { type: 'integer' },
      },
      additionalProperties: false,
    },
  },
  'cooking-days': {
    $id: 'cooking-days',
    type: 'object',
    required: ['categories', 'prepDay', 'version'],
    properties: {
      categories: {
        type: 'object',
        additionalProperties: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      prepDay: { type: ['string', 'null'] },
      version: { type: 'integer' },
    },
    additionalProperties: false,
  },
  'meal-per-day': {
    $id: 'meal-per-day',
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'mealsPerDay', 'version'],
      properties: {
        id: { type: 'string' },
        mealsPerDay: { type: 'number' },
        version: { type: 'integer' }
      },
      additionalProperties: false
    }
  },
  'meal-plan': {
    $id: 'meal-plan',
    type: 'object',
    required: ['monthly', 'yearly', 'version'],
    properties: {
      monthly: {
        type: 'array',
        items: {
          type: 'object',
          required: ['mealId', 'monthlySpots'],
          properties: {
            mealId: { type: 'string' },
            monthlySpots: { type: 'number' }
          },
          additionalProperties: false
        }
      },
      yearly: {
        type: 'array',
        items: {
          type: 'object',
          required: ['mealId', 'yearlySpots'],
          properties: {
            mealId: { type: 'string' },
            yearlySpots: { type: 'number' }
          },
          additionalProperties: false
        }
      },
      version: { type: 'integer' }
    },
    additionalProperties: false
  },
  'prepared-meals-calendar': {
    $id: 'prepared-meals-calendar',
    type: 'object',
    required: ['calendar', 'version'],
    properties: {
      calendar: { type: 'object' },
      version: { type: 'integer' }
    },
    additionalProperties: false
  },
  'what-to-eat-calendar': {
    $id: 'what-to-eat-calendar',
    type: 'object',
    required: ['calendar', 'version'],
    properties: {
      calendar: { type: 'object' },
      version: { type: 'integer' }
    },
    additionalProperties: false
  },
  'manual-meal-overrides': {
    $id: 'manual-meal-overrides',
    type: 'object',
    required: ['week', 'users', 'version'],
    properties: {
      week: { type: 'integer' },
      users: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      },
      version: { type: 'integer' }
    },
    additionalProperties: false
  },
  metadata: {
    $id: 'metadata',
    type: 'object',
    properties: {
      storageVersion: { type: 'integer' }
    },
    required: ['storageVersion'],
    additionalProperties: true
  }
};

