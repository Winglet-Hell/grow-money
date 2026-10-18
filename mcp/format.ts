// JSON for the model to read: nested objects indented, every list of plain values and every
// table row on one line. The AI export's toPrettyJson does the same, except that it unfolds a row
// holding a list (a rate series, a trip's top categories) into one cell per line.

export function formatJson(value: unknown, indent = 2): string {
    const pad = (depth: number) => ' '.repeat(depth * indent);
    const walk = (v: unknown, depth: number, key?: string): string => {
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
        if (typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
        if (Array.isArray(v)) {
            if (v.length === 0) return '[]';
            if (v.every(x => x === null || typeof x !== 'object')) return JSON.stringify(v);
            const line = (x: unknown) => (key === 'rows' ? JSON.stringify(x) : walk(x, depth + 1));
            return `[\n${v.map(x => pad(depth + 1) + line(x)).join(',\n')}\n${pad(depth)}]`;
        }
        const entries = Object.entries(v as Record<string, unknown>).filter(([, val]) => val !== undefined);
        if (entries.length === 0) return '{}';
        return `{\n${entries.map(([k, val]) => `${pad(depth + 1)}${JSON.stringify(k)}: ${walk(val, depth + 1, k)}`).join(',\n')}\n${pad(depth)}}`;
    };
    return walk(value, 0);
}
