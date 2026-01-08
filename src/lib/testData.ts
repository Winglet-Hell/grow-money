import type { Transaction } from '../types';

const CATEGORIES = [
    'Groceries', 'Dining Out', 'Transport', 'Rent', 'Utilities',
    'Entertainment', 'Shopping', 'Healthcare', 'Education', 'Travel',
    'Salary', 'Freelance', 'Investments', 'Transfers', 'Subscription'
];

export const INITIAL_ACCOUNT_CONFIGS = [
    { name: 'Main Account', type: 'bank', currency: 'RUB', balance: 450000 },
    { name: 'Savings', type: 'bank', currency: 'RUB', balance: 300000 },
    { name: 'Cash', type: 'cash', currency: 'RUB', balance: 15000 },
    { name: 'Bitcoin Wallet', type: 'crypto', currency: 'BTC', balance: 0.45 },
    { name: 'USDT Wallet', type: 'crypto', currency: 'USDT', balance: 5000 },
    { name: 'Credit Card', type: 'card', currency: 'RUB', balance: 0 },
] as const;

const ACCOUNTS = INITIAL_ACCOUNT_CONFIGS.map(a => a.name);

const INITIAL_BALANCES: Record<string, { amount: number, currency: string }> = {};
INITIAL_ACCOUNT_CONFIGS.forEach(acc => {
    INITIAL_BALANCES[acc.name] = { amount: acc.balance, currency: acc.currency };
});

const SAMPLE_NOTES: Record<string, string[]> = {
    'Groceries': ['Whole Foods', 'Trader Joe\'s', 'Local Market', 'Supermarket run'],
    'Dining Out': ['Dinner with friends', 'Lunch', 'Coffee shop', 'Pizza night', 'Date night'],
    'Transport': ['Uber', 'Gas station', 'Subway pass', 'Car maintenance'],
    'Rent': ['Monthly Rent'],
    'Utilities': ['Electric bill', 'Internet', 'Water bill', 'Phone bill'],
    'Entertainment': ['Movie tickets', 'Concert', 'Netflix', 'Spotify', 'Video games'],
    'Shopping': ['Amazon', 'Clothes', 'Electronics', 'Home decor'],
    'Healthcare': ['Pharmacy', 'Doctor visit', 'Gym membership', 'Dentist'],
    'Education': ['Books', 'Online course', 'Tuition'],
    'Travel': ['Flight', 'Hotel', 'Airbnb', 'Souvenirs'],
    'Salary': ['Monthly Salary'],
    'Freelance': ['Project payment', 'Consulting fee'],
    'Investments': ['Stock dividend', 'Interest'],
    'Transfers': ['Credit card payment', 'Savings transfer'],
    'Subscription': ['Netflix', 'Spotify', 'GitHub', 'Adobe Creative Cloud', 'HBO Max']
};

const getRandomElement = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const getRandomAmount = (min: number, max: number, decimals: number = 2): number => {
    return Number((Math.random() * (max - min) + min).toFixed(decimals));
};

const formatDate = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const generateTestData = (): Transaction[] => {
    const transactions: Transaction[] = [];
    const today = new Date();
    // Clone today to not mutate it
    const startDate = new Date(today);
    startDate.setMonth(today.getMonth() - 6); // Generate 6 months of data

    let currentDate = new Date(startDate);

    const generateDailyTransactions = (date: Date) => {
        const numTransactions = Math.floor(Math.random() * 4); // 0-3 transactions per day
        const dateStr = formatDate(date);

        for (let i = 0; i < numTransactions; i++) {
            const category = getRandomElement(CATEGORIES);
            const account = getRandomElement(ACCOUNTS);
            let type: 'expense' | 'income' | 'transfer' = 'expense';
            let amount = 0;

            if (category === 'Salary' || category === 'Freelance' || category === 'Investments') {
                type = 'income';
                if (account !== 'Bitcoin Wallet' && account !== 'USDT Wallet') {
                    amount = category === 'Salary' ? 5000 : getRandomAmount(100, 2000);
                } else if (account === 'USDT Wallet') {
                    amount = getRandomAmount(10, 500); // USDT income
                } else {
                    // Crypto income scaling (BTC)
                    amount = getRandomAmount(0.001, 0.05, 6);
                }
            } else if (category === 'Transfers') {
                type = 'transfer';
                if (account !== 'Bitcoin Wallet' && account !== 'USDT Wallet') {
                    amount = getRandomAmount(100, 1000);
                } else if (account === 'USDT Wallet') {
                    amount = getRandomAmount(5, 50); // USDT Transfer
                } else {
                    amount = getRandomAmount(0.001, 0.05, 6); // BTC Transfer
                }
            } else {
                type = 'expense';
                // Weighted amounts - ONLY for non-crypto accounts to avoid spending 200 BTC on groceries
                if (account !== 'Bitcoin Wallet' && account !== 'USDT Wallet') {
                    if (category === 'Rent') amount = 2000;
                    else if (category === 'Groceries') amount = getRandomAmount(50, 200);
                    else amount = getRandomAmount(5, 150);
                } else if (account === 'USDT Wallet') {
                    amount = getRandomAmount(5, 100); // USDT is like USD, not BTC
                } else {
                    amount = getRandomAmount(0.0001, 0.005, 8); // BTC is high value
                }
            }

            // Skip Salary in random daily loop to make it periodic
            if (category === 'Salary') continue;
            if (category === 'Rent') continue;

            const notes = SAMPLE_NOTES[category] || ['Transaction'];
            const note = getRandomElement(notes);

            transactions.push({
                id: generateUUID(),
                date: dateStr,
                category,
                amount,
                account,
                note,
                type
            });
        }
    };

    // Main loop for daily transactions
    while (currentDate <= today) {
        generateDailyTransactions(currentDate);

        // Monthly recurring transactions
        // Note: JS Date getDate returns 1-31
        if (currentDate.getDate() === 1) {
            const dateStr = formatDate(currentDate);
            // Salary
            transactions.push({
                id: generateUUID(),
                date: dateStr,
                category: 'Salary',
                amount: 5500,
                account: 'Main Account',
                note: 'Monthly Salary',
                type: 'income'
            });
            // Rent
            transactions.push({
                id: generateUUID(),
                date: dateStr,
                category: 'Rent',
                amount: 2200,
                account: 'Main Account',
                note: 'Monthly Rent',
                type: 'expense'
            });
        }

        if (currentDate.getDate() === 15) {
            // Utilities
            transactions.push({
                id: generateUUID(),
                date: formatDate(currentDate),
                category: 'Utilities',
                amount: getRandomAmount(100, 200),
                account: 'Main Account',
                note: 'Utilities Bill',
                type: 'expense'
            });
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort by date desc
    return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const generateTestWishlists = () => {
    return [
        {
            name: "Dream Vacation to Japan",
            costRUB: 450000,
            priority: "High",
            imageURL: "Plane"
        },
        {
            name: "MacBook Pro M3",
            costRUB: 200000,
            priority: "Medium",
            imageURL: "Laptop"
        },
        {
            name: "Emergency Fund",
            costRUB: 100000,
            priority: "High",
            imageURL: "Star"
        },
        {
            name: "New Coffee Machine",
            costRUB: 65000,
            priority: "Low",
            imageURL: "Coffee"
        }
    ];
};
