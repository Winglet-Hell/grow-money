/**
 * A value axis with round ticks ("0 / 100k / 200k") that always includes zero. Charts that pin
 * their y-axis beside a scrolling plot need the same ticks on both halves, so the scale is
 * worked out here instead of being left to Recharts.
 */
export function niceScale(min: number, max: number, targetTicks = 5): { domain: [number, number]; ticks: number[] } {
    const lo = Math.min(0, min);
    const hi = Math.max(0, max);
    if (!isFinite(lo) || !isFinite(hi) || hi === lo) return { domain: [0, 1], ticks: [0, 1] };

    const rough = (hi - lo) / (targetTicks - 1);
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(s => s >= rough) ?? 10 * magnitude;

    const start = Math.floor(lo / step) * step;
    const end = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let i = 0; start + i * step <= end + step / 2; i++) ticks.push(start + i * step);
    return { domain: [start, end], ticks };
}

/**
 * Which points of a time series get a number printed on them: the latest one, then the
 * highest and (optionally) the lowest. A value on every bar turns into a row of overlapping
 * labels past a dozen months — the axis and the tooltip carry the rest. Picks closer than
 * `minGap` points to an earlier pick are skipped, so neighbouring labels can't collide.
 */
export function labelIndices(values: number[], { includeMin = true, minGap = 1 } = {}): Set<number> {
    const picked = new Set<number>();
    if (values.length === 0) return picked;

    let maxIndex = 0;
    let minIndex = 0;
    values.forEach((v, i) => {
        if (v > values[maxIndex]) maxIndex = i;
        if (v < values[minIndex]) minIndex = i;
    });

    const candidates = [values.length - 1, maxIndex, ...(includeMin ? [minIndex] : [])];
    for (const index of candidates) {
        if ([...picked].every(p => Math.abs(p - index) >= minGap)) picked.add(index);
    }
    return picked;
}
