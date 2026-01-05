// Maps specific categories to Global Groups
export const GLOBAL_CATEGORY_MAP: Record<string, string> = {
    // Housing
    'Rent': 'Housing',
    'Utility bills': 'Housing',
    'Services': 'Housing', // Often household services

    // Food & Dining
    'Cafe': 'Food & Dining',
    'Groceries': 'Food & Dining',
    'Food delivery': 'Food & Dining',
    'Market delivery': 'Food & Dining',

    // Travel
    'Hotels & flighsts': 'Travel', // sic: user typo
    'Hotels & flights': 'Travel',
    'Excursions': 'Travel',
    'Trip expenses': 'Travel',
    'Study & visa': 'Travel', // Context implies relocation/travel docs

    // Shopping & Lifestyle
    'Tech': 'Shopping',
    'Marketplace': 'Shopping',
    'Clothing & shoes': 'Shopping',
    'Retail': 'Shopping',
    'Beauty': 'Shopping',
    'Gifts': 'Shopping',
    'Leisure': 'Entertainment',
    'Subscriptions': 'Entertainment',

    // Transport
    'Transport': 'Transport',

    // Obligations
    'Taxes': 'Obligations',
    'Health': 'Health', // Could be its own or Obligations/Services

    // Other
    'Other': 'Other'
};

// Helper for case-insensitive lookup
export const getGlobalCategory = (category: string): string => {
    if (!category) return 'Other';

    // 1. Try Exact Match
    if (GLOBAL_CATEGORY_MAP[category]) {
        return GLOBAL_CATEGORY_MAP[category];
    }

    // 2. Try Case-Insensitive Match
    const lowerInput = category.toLowerCase().trim();
    for (const [key, group] of Object.entries(GLOBAL_CATEGORY_MAP)) {
        if (key.toLowerCase() === lowerInput) {
            return group;
        }
    }

    // 3. Keyword Heuristics (Fallback if new categories appear)
    if (lowerInput.includes('taxi') || lowerInput.includes('uber') || lowerInput.includes('metro') || lowerInput.includes('bus')) return 'Transport';
    if (lowerInput.includes('food') || lowerInput.includes('restaurant') || lowerInput.includes('dining')) return 'Food & Dining';
    if (lowerInput.includes('hotel') || lowerInput.includes('airbnb') || lowerInput.includes('flight') || lowerInput.includes('airline')) return 'Travel';
    if (lowerInput.includes('subscription') || lowerInput.includes('netflix') || lowerInput.includes('spotify')) return 'Entertainment';
    if (lowerInput.includes('shop') || lowerInput.includes('store') || lowerInput.includes('amazon')) return 'Shopping';
    if (lowerInput.includes('doctor') || lowerInput.includes('pharmacy') || lowerInput.includes('clinic')) return 'Health';

    return 'Other';
};
