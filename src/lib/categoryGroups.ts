// Everything the app knows about category names lives here: the group each one rolls up to,
// and which are planned payments, home bills, travel bookings or subscriptions. Rename a
// category in the source app and this file (plus the icons) is what needs to follow.
// Names are compared case-insensitively; the parser stores them in sentence case.
import { formatTags } from './utils';

// Maps specific categories to Global Groups
export const GLOBAL_CATEGORY_MAP: Record<string, string> = {
    // Housing
    'Rent': 'Housing',
    'Utilities': 'Housing',
    'Phone & internet': 'Housing',
    'Services': 'Housing', // Often household services

    // Food & Dining
    'Eating out': 'Food & Dining',
    'Groceries': 'Food & Dining',
    'Food delivery': 'Food & Dining',
    'Grocery delivery': 'Food & Dining',

    // Travel
    'Accommodation': 'Travel',
    'Intercity transport': 'Travel',
    'Travel packages': 'Travel',
    'Sightseeing': 'Travel',
    'Visas & documents': 'Travel', // Context implies relocation/travel docs

    // Shopping & Lifestyle
    'Electronics': 'Shopping',
    'Household': 'Shopping',
    'Other goods': 'Shopping',
    'Clothing & shoes': 'Shopping',
    'Personal care': 'Shopping',
    'Gifts & donations': 'Shopping',
    'Leisure': 'Entertainment',
    'Digital services': 'Entertainment',

    // Transport
    'Local transport': 'Transport',

    // Obligations
    'Taxes': 'Obligations',
    'Fees': 'Obligations',

    // Health & Insurance
    'Health': 'Health',
    'Insurance': 'Health',
    'Страховка': 'Health',

    // Other
    'Other': 'Other',

    // Names from before the categories were reorganised in October 2026. A device keeps the
    // statement it last imported, so these stay until every device has imported a newer one.
    'Utility bills': 'Housing',
    'Cafe': 'Food & Dining',
    'Market delivery': 'Food & Dining',
    'Hotels & flighsts': 'Travel', // sic: user typo
    'Hotels & flights': 'Travel',
    'Excursions': 'Travel',
    'Trip expenses': 'Travel',
    'Study & visa': 'Travel',
    'Tech': 'Shopping',
    'Marketplace': 'Shopping',
    'Retail': 'Shopping',
    'Beauty': 'Shopping',
    'Gifts': 'Shopping',
    'Subscriptions': 'Entertainment',
    'Transport': 'Transport',
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
    if (lowerInput.includes('doctor') || lowerInput.includes('pharmacy') || lowerInput.includes('clinic') || lowerInput.includes('insur') || lowerInput.includes('страхов') || lowerInput.includes('assurance')) return 'Health';

    return 'Other';
};

const nameSet = (names: string[]) => new Set(names.map(c => c.toLowerCase()));
const inSet = (set: Set<string>, category: string) => set.has((category || '').toLowerCase().trim());

// Big planned payments — rent, flights and hotels, electronics, visas, insurance, taxes. They land
// on a few days and dwarf everyday spending, so views of spending habits can leave them out.
const PLANNED_PAYMENT_CATEGORIES = nameSet([
    'Rent', 'Accommodation', 'Intercity transport', 'Travel packages', 'Electronics', 'Visas & documents', 'Insurance', 'Страховка',
    'Taxes',
    'Hotels & flighsts', 'Hotels & flights', 'Tech', 'Study & visa', // before October 2026
]);

export const isPlannedPayment = (category: string): boolean => inSet(PLANNED_PAYMENT_CATEGORIES, category);

// Phone & internet holds the plan at home and the SIM cards bought for trips. The cards are
// tagged "Travel internet" or "eSIM" and belong to the journey, as they did under Trip expenses.
export const isTravelSim = (category: string, tags?: string[] | string): boolean =>
    (category || '').toLowerCase().trim() === 'phone & internet' && /travel|e-?sim/i.test(formatTags(tags));

// Bills that keep running at home while you're away. A trip is what the journey cost, so these
// stay out of it unless switched back on by hand.
const HOME_BILL_CATEGORIES = nameSet([
    'Rent', 'Utilities', 'Phone & internet', 'Digital services', 'Insurance', 'Страховка',
    'Utility bills', 'Subscriptions', // before October 2026
]);

export const isHomeBill = (category: string, tags?: string[] | string): boolean =>
    inSet(HOME_BILL_CATEGORIES, category) && !isTravelSim(category, tags);

// Where a trip sleeps and how it gets there: big payments, often made weeks ahead.
export const isTravelBooking = (category: string): boolean =>
    /accommodation|intercity|travel package|hotel|flight|flighst/i.test(category || '');

// Income from selling one's own things second-hand. The Resale page pairs each such sale
// with the purchase whose comment names the same item.
const RESALE_CATEGORIES = nameSet(['Resale']);

export const isResaleIncome = (category: string): boolean => inSet(RESALE_CATEGORIES, category);

// Gadgets: the Resale page lists them as still in use until a sale of the same item turns up.
const GADGET_CATEGORIES = nameSet([
    'Electronics',
    'Tech', // before October 2026
]);

export const isGadget = (category: string): boolean => inSet(GADGET_CATEGORIES, category);

// What the user files as subscriptions — kept on the Recurring page even on a loose rhythm.
export const isSubscriptionCategory = (category: string): boolean =>
    /digital services|subscri|подпис/i.test(category || '');
