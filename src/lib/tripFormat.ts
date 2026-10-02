import { getCurrencyMeta } from './currencies';

// Number and date formats shared by the trip screens.

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatRub = (n: number) => rub.format(n);

/** "3.4k", "128k", "1.2M" — for chart labels and tight columns. */
export function formatRubCompact(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 10_000) return `${Math.round(n / 1000)}k`;
    if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(Math.round(n));
}

/** "+12 340 ₽" / "−1 200 ₽" — a difference, signed either way. */
export const formatRubSigned = (n: number) => `${n >= 0.5 ? '+' : n <= -0.5 ? '−' : ''}${rub.format(Math.abs(n))}`;

/** "2 Sep" — a day on a chart axis. "2.9" read like a decimal. */
export const formatDayShort = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1] ?? ''}`;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Wed 2 Sep", or "Wed 2 Sep 2026" with the year. */
export const formatDayWithWeekday = (day: string, withYear = false) =>
    `${WEEKDAYS[new Date(day).getUTCDay()]} ${formatDayShort(day)}${withYear ? ` ${day.slice(0, 4)}` : ''}`;

/** An amount in the currency it was paid in, written like the rubles beside it: "738 ฿", "1 431,88 USDT". */
export function formatNative(amount: number, currency: string): string {
    if (getCurrencyMeta(currency).kind === 'fiat') {
        try {
            return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
        } catch {
            // Not a code Intl accepts — fall through to the suffixed form.
        }
    }
    // Coins keep their decimals (0.0005 BTC must not read as 0): the number, then the code.
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: Math.abs(amount) >= 1 ? 2 : 8 }).format(amount)} ${currency}`;
}

const dmy = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

/** "02.09 – 01.10.2026", "28.12.2025 – 03.01.2026", or one day "13.05.2026". */
export function formatTripRange(start: string, end: string): string {
    if (start === end) return dmy(start);
    if (start.slice(0, 4) === end.slice(0, 4)) return `${start.slice(8, 10)}.${start.slice(5, 7)} – ${dmy(end)}`;
    return `${dmy(start)} – ${dmy(end)}`;
}

export const pluralDays = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
