// НДФЛ (Russian personal income tax) on a tax resident's pay. Since 2025 it is
// progressive: each rate covers only the part of the year's income inside its
// band, counted from January 1. Every employer withholds on its own payments
// only; when several together cross a band, the tax office bills the rest
// after the year ends.
const BANDS: { upTo: number; rate: number }[] = [
    { upTo: 2_400_000, rate: 0.13 },
    { upTo: 5_000_000, rate: 0.15 },
    { upTo: 20_000_000, rate: 0.18 },
    { upTo: 50_000_000, rate: 0.2 },
    { upTo: Infinity, rate: 0.22 },
];

// Tax on `gross` earned since January 1.
export const ndflOn = (gross: number): number => {
    let tax = 0;
    let from = 0;
    for (const { upTo, rate } of BANDS) {
        if (gross <= from) break;
        tax += (Math.min(gross, upTo) - from) * rate;
        from = upTo;
    }
    return tax;
};

// The year-to-date gross that leaves `net` once ndflOn(gross) is withheld —
// turns what reached the account back into what the employer paid out.
export const grossOfNet = (net: number): number => {
    if (net <= 0) return 0;
    let from = 0;
    let netFrom = 0;
    for (const { upTo, rate } of BANDS) {
        const netUpTo = netFrom + (upTo - from) * (1 - rate);
        if (net <= netUpTo) return from + (net - netFrom) / (1 - rate);
        from = upTo;
        netFrom = netUpTo;
    }
    return from; // not reached: the last band is open-ended
};
