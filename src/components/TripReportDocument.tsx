import { Document, Image, Line, Page, Rect, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import { CalendarClock, House, MapPin, Plane, Wallet, type LucideIcon } from 'lucide-react';
import { getCategoryColor, getCategoryIcon } from '../lib/categoryIcons';
import { canDrawEmoji, emojiPicture, iconPicture } from '../lib/pdfPictures';
import { describeBudget, formatDayShort, formatRubCompact, formatTripRangeLong, pluralDays } from '../lib/tripFormat';
import { BOOKED_AHEAD } from '../lib/tripStats';
import {
    currencyName, currencySign, describeRate, reportMoney,
    type ReportParts, type ReportPayment, type ReportSection, type TripReport,
} from '../lib/tripReport';

// The pages of a trip report (lib/tripReport says what goes in, lib/tripReportPdf makes the file):
// A4, in the app's font and colours, the summary first and every payment after it.

type Money = (n: number) => string;

const C = {
    ink: '#111827',
    text: '#374151',
    muted: '#6b7280',
    faint: '#9ca3af',
    line: '#e5e7eb',
    hairline: '#f3f4f6',
    panel: '#f9fafb',
    brand: '#047857',
    day: '#10b981',
    booked: '#3b82f6',
    onTrip: '#a855f7',
    home: '#fb923c',
    over: '#dc2626',
    warn: '#d97706',
};

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

function Icon({ icon, color, size }: { icon: LucideIcon; color: string; size: number }) {
    return <Image src={iconPicture(icon, color)} style={{ width: size, height: size }} />;
}

// The chip behind a category's icon: the app's chip colour where the look names one, else the ink at 14% on white.
function chipColor(category: string): { chip: string; ink: string } {
    const color = getCategoryColor(category);
    const named = /#([0-9a-f]{6})\]?$|gm-chip-([0-9a-f]{6})$/i.exec(color.bg);
    if (named) return { chip: `#${named[1] ?? named[2]}`, ink: color.hex };
    const tint = [1, 3, 5].map(i => Math.round(255 - 0.14 * (255 - parseInt(color.hex.slice(i, i + 2), 16))));
    return { chip: `#${tint.map(c => c.toString(16).padStart(2, '0')).join('')}`, ink: color.hex };
}

function CategoryChip({ category, size }: { category: string; size: number }) {
    const { chip, ink } = chipColor(category);
    return (
        <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: chip, alignItems: 'center', justifyContent: 'center' }}>
            <Icon icon={getCategoryIcon(category)} color={ink} size={size * 0.6} />
        </View>
    );
}


// ------------------------------------------------------------------ layout

const s = StyleSheet.create({
    page: { paddingTop: 34, paddingBottom: 50, paddingHorizontal: MARGIN, fontFamily: 'Inter', fontSize: 9, color: C.text },
    num: { fontFeatureSettings: ['tnum'] },

    // Placed from the top: the page number is laid out again on every page, and placed from the
    // bottom it came out of some page breaks with no position at all, failing the whole file.
    footerRule: { position: 'absolute', left: MARGIN, right: MARGIN, top: PAGE_HEIGHT - 35, height: 0.5, backgroundColor: C.line },
    footerText: { position: 'absolute', top: PAGE_HEIGHT - 29, fontSize: 7, lineHeight: 1, color: C.faint },

    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    iconBox: {
        width: 46, height: 46, borderRadius: 12, borderWidth: 0.75, borderColor: C.line, alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    kicker: { fontSize: 7, fontWeight: 600, color: C.brand, letterSpacing: 1.2, marginBottom: 2 },
    title: { fontSize: 21, fontWeight: 700, color: C.ink, lineHeight: 1.15 },
    subtitle: { fontSize: 9.5, color: C.muted, marginTop: 3 },
    status: { fontSize: 7, fontWeight: 600, color: C.brand },

    tiles: { flexDirection: 'row', gap: 8 },
    tile: { flex: 1, borderWidth: 0.75, borderColor: C.line, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10 },
    tileHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    tileTitle: { fontSize: 7.5, fontWeight: 600, color: C.muted },
    tileValue: { fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.2 },
    tileSub: { fontSize: 7, color: C.faint, marginTop: 3 },
    currencyNote: { fontSize: 7, color: C.faint, marginTop: 7 },

    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 20, marginBottom: 7 },
    sectionTitle: { fontSize: 11.5, fontWeight: 700, color: C.ink },
    sectionNote: { fontSize: 7.5, color: C.faint },
    footnote: { fontSize: 7, color: C.faint, marginTop: 6 },

    budget: { borderWidth: 0.75, borderColor: C.line, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10, marginTop: 10 },
    budgetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    track: { height: 5, borderRadius: 2.5, backgroundColor: C.hairline, overflow: 'hidden' },

    tableHead: { flexDirection: 'row', paddingBottom: 3, borderBottomWidth: 0.5, borderBottomColor: C.line, fontSize: 6.5, fontWeight: 600, color: C.faint, letterSpacing: 0.6 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: C.hairline },

    dayBand: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', backgroundColor: C.panel, borderRadius: 4,
        paddingVertical: 4, paddingHorizontal: 6, marginTop: 8,
    },
    // One line a payment where its note allows: what was paid in another money sits beside the amount, not under it.
    payment: { flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.hairline },
    dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 3, marginRight: 7 },
    paymentTitle: { fontSize: 8, fontWeight: 600, color: C.ink },
    paymentNote: { fontSize: 7, color: C.muted, maxLines: 2, textOverflow: 'ellipsis' },
    paymentCategory: { width: 100, fontSize: 7, color: C.muted, paddingTop: 1, paddingLeft: 6 },
    paymentPaid: { width: 66, fontSize: 7, color: C.faint, textAlign: 'right', paddingTop: 1, fontFeatureSettings: ['tnum'] },
    paymentAmount: { width: 72, fontSize: 8, fontWeight: 600, color: C.ink, textAlign: 'right', fontFeatureSettings: ['tnum'] },
    amount: { fontSize: 8.5, fontWeight: 600, color: C.ink, fontFeatureSettings: ['tnum'] },
    paid: { fontSize: 7, color: C.faint, fontFeatureSettings: ['tnum'] },
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const signed = (money: Money, n: number) => `${n >= 0.5 ? '+' : n <= -0.5 ? '−' : ''}${money(Math.abs(n))}`;
const shareLabel = (share: number) => (share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`);
const dayWithYear = (day: string) => `${formatDayShort(day)} ${day.slice(0, 4)}`;

function Footer({ report, range }: { report: TripReport; range: string }) {
    return (
        <>
            <View style={s.footerRule} fixed />
            <Text style={[s.footerText, { left: MARGIN, width: CONTENT_WIDTH * 0.55 }]} fixed>{report.name} · {range}</Text>
            <Text
                style={[s.footerText, { left: MARGIN + CONTENT_WIDTH * 0.45, width: CONTENT_WIDTH * 0.55, textAlign: 'right' }]}
                fixed
                render={({ pageNumber, totalPages }) => `Made with Grow Money on ${dayWithYear(report.madeOn)} · ${pageNumber} / ${totalPages}`}
            />
        </>
    );
}

function Header({ report, range }: { report: TripReport; range: string }) {
    const m = report.metrics;
    const status = report.status === 'ongoing' && report.dayOfTrip !== null
        ? `In progress · day ${report.dayOfTrip} of ${m.days}`
        : report.status === 'upcoming' ? 'Upcoming' : null;
    return (
        <View style={s.header}>
            <View style={s.iconBox}>
                {report.icon && canDrawEmoji
                    ? <Image src={emojiPicture(report.icon)} style={{ width: 28, height: 28 }} />
                    : <Icon icon={Plane} color={C.day} size={22} />}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={s.kicker}>TRIP REPORT</Text>
                <Text style={s.title}>{report.name}</Text>
                <Text style={s.subtitle}>
                    {range} · {pluralDays(m.days)}
                    {status && <Text style={s.status}>{'   '}{status.toUpperCase()}</Text>}
                </Text>
            </View>
        </View>
    );
}

function Tile({ title, value, sub, icon, color }: { title: string; value: string; sub: string; icon: LucideIcon; color: string }) {
    return (
        <View style={s.tile}>
            <View style={s.tileHead}>
                <Text style={s.tileTitle}>{title}</Text>
                <Icon icon={icon} color={color} size={11} />
            </View>
            <Text style={[s.tileValue, s.num]}>{value}</Text>
            <Text style={s.tileSub}>{sub}</Text>
        </View>
    );
}

function Totals({ report, money, withHome }: { report: TripReport; money: Money; withHome: boolean }) {
    const m = report.metrics;
    return (
        <View style={s.tiles}>
            <Tile
                title="Total"
                value={money(m.total)}
                sub={`${m.perDay !== null ? `${money(m.perDay)} a day · ` : ''}${plural(report.paymentCount, 'payment')}`}
                icon={Wallet}
                color={C.day}
            />
            <Tile
                title="Booked ahead"
                value={money(m.bookedAhead)}
                sub={m.bookedAheadCount > 0 ? `${plural(m.bookedAheadCount, 'payment')} before ${formatDayShort(report.startDate)}` : 'nothing paid before the trip'}
                icon={CalendarClock}
                color={C.booked}
            />
            <Tile
                title="On the trip"
                value={money(m.onTrip)}
                sub={m.onTripPerDay !== null
                    ? `${money(m.onTripPerDay)} a day${m.daysCovered < m.days ? ` over ${pluralDays(m.daysCovered)} so far` : ''}`
                    : 'the trip hasn\'t started'}
                icon={MapPin}
                color={C.onTrip}
            />
            {withHome && (
                <Tile
                    title="vs. staying home"
                    value={m.extraVsHome === null ? '—' : signed(money, m.extraVsHome)}
                    sub={m.home ? `beyond ${money(m.home.perDay)} a day of everyday spending at home` : 'not enough history before the trip to compare'}
                    icon={House}
                    color={C.home}
                />
            )}
        </View>
    );
}

function CurrencyNote({ report }: { report: TripReport }) {
    const { currency } = report;
    if (currency.code === 'RUB') return null;
    const name = currencyName(currency.code);
    const when = currency.rateDay ? `, the rate of ${dayWithYear(currency.rateDay)}` : '';
    return (
        <Text style={s.currencyNote}>
            Amounts in {name} ({currencySign(currency.code)}). Payments made in it are shown as paid; the rest is converted from rubles at {describeRate(currency)}{when}.
        </Text>
    );
}

function Budget({ report, money }: { report: TripReport; money: Money }) {
    const b = report.budget!;
    const over = b.left < 0;
    const overPace = b.projected !== null && b.projected > b.budget;
    const { line, pace } = describeBudget(b, money);
    return (
        <View style={s.budget} wrap={false}>
            <View style={s.budgetHead}>
                <Text style={{ fontSize: 9, fontWeight: 600, color: C.ink }}>
                    Budget <Text style={{ fontWeight: 400, color: C.muted }}>· {money(b.spent)} of {money(b.budget)}</Text>
                </Text>
                <Text style={[{ fontSize: 9, fontWeight: 700, color: over ? C.over : C.muted }, s.num]}>{Math.round(b.share * 100)}%</Text>
            </View>
            <View style={[s.track, { marginTop: 5 }]}>
                <View style={{ height: 5, borderRadius: 2.5, width: `${Math.min(100, b.share * 100)}%`, backgroundColor: over ? C.over : b.share > 0.9 || overPace ? C.warn : C.day }} />
            </View>
            <Text style={{ fontSize: 8, marginTop: 5, color: over ? C.over : C.text }}>{line}</Text>
            {pace && <Text style={{ fontSize: 7.5, color: overPace && !over ? C.warn : C.muted, marginTop: 1 }}>{pace}</Text>}
        </View>
    );
}

// The parts below are fragments, so that their heads and rows are siblings on the page: react-pdf
// keeps a head with what follows it (minPresenceAhead) only for an element with siblings before it.
function SectionHead({ title, note, newPage = false }: { title: string; note?: string; newPage?: boolean }) {
    return (
        <View style={[s.sectionHead, newPage ? { marginTop: 0 } : {}]} minPresenceAhead={56} break={newPage}>
            <Text style={s.sectionTitle}>{title}</Text>
            {note && <Text style={s.sectionNote}>{note}</Text>}
        </View>
    );
}

// ------------------------------------------------------------------ the day-by-day chart

const CHART_HEIGHT = 150;
const AXIS_WIDTH = 30;
const PLOT_TOP = 14;     // room for the amounts over the bars
const PLOT_BOTTOM = 134; // and for the days under them
const LABELLED_BARS_MAX = 16;

// The top of the axis: the first of 4 × 1, 2, 2.5 or 5 × 10ⁿ that covers the tallest bar.
function axisTop(max: number): number {
    if (max <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(max / 4));
    for (const step of [1, 2, 2.5, 5, 10]) if (step * magnitude * 4 >= max) return step * magnitude * 4;
    return max;
}

function DailyChart({ report, money }: { report: TripReport; money: Money }) {
    const m = report.metrics;
    const maxDay = Math.max(0, ...report.daily.map(d => d.amount));
    if (maxDay === 0 && m.bookedAhead === 0) return null;
    // As on the trip page: a month of hotels would flatten every day beside it, so the bookings'
    // bar stops a quarter above the tallest day, with a break in it; its label says the full sum.
    const cap = maxDay > 0 ? maxDay * 1.25 : m.bookedAhead;
    const cut = m.bookedAhead > cap;
    const bars = [
        ...(m.bookedAhead > 0 ? [{ key: BOOKED_AHEAD, amount: m.bookedAhead, value: cut ? cap : m.bookedAhead }] : []),
        ...report.daily.map(d => ({ key: d.day, amount: d.amount, value: d.amount })),
    ];
    const top = axisTop(Math.max(...bars.map(b => b.value)));
    const plotWidth = CONTENT_WIDTH - AXIS_WIDTH;
    const band = plotWidth / bars.length;
    const barWidth = Math.min(24, band * 0.68);
    const yOf = (v: number) => PLOT_BOTTOM - (v / top) * (PLOT_BOTTOM - PLOT_TOP);
    const xOf = (i: number) => AXIS_WIDTH + i * band + (band - barWidth) / 2;
    const labelled = bars.length <= LABELLED_BARS_MAX;
    const dayStep = labelled ? 1 : Math.ceil(bars.length / 12);
    const firstDay = bars[0].key === BOOKED_AHEAD ? 1 : 0;
    const average = m.onTripPerDay !== null && report.daily.length > 1 ? m.onTripPerDay : null;
    const ticks = [0, 1, 2, 3, 4].map(i => (top * i) / 4);

    const labels: { x: number; y: number; width: number; text: string; color: string; align: 'left' | 'center' | 'right'; solid?: boolean }[] = [];
    ticks.forEach(t => labels.push({ x: 0, y: yOf(t) - 4, width: AXIS_WIDTH - 5, text: t === 0 ? '0' : formatRubCompact(t), color: C.faint, align: 'right' }));
    let lastDayLabel = -Infinity; // the centre of the last label under the bars, which the next must clear
    bars.forEach((b, i) => {
        const center = xOf(i) + barWidth / 2;
        if ((b.key === BOOKED_AHEAD || (i - firstDay) % dayStep === 0) && center - lastDayLabel >= 30) {
            labels.push({ x: center - 20, y: PLOT_BOTTOM + 4, width: 40, text: b.key === BOOKED_AHEAD ? 'Before' : formatDayShort(b.key), color: C.faint, align: 'center' });
            lastDayLabel = center;
        }
        if ((labelled || b.key === BOOKED_AHEAD) && b.amount > 0) {
            // As wide as the amount, on white, so the dashed average doesn't run through it.
            const text = formatRubCompact(b.amount);
            const width = text.length * 3.7 + 4;
            labels.push({ x: center - width / 2, y: yOf(b.value) - 10, width, text, color: C.muted, align: 'center', solid: true });
        }
    });

    return (
        <View wrap={false}>
            <SectionHead
                title="Day by day"
                note={[
                    m.bookedAhead > 0 ? `Before: ${money(m.bookedAhead)} booked ahead${cut ? ', bar cut to fit' : ''}` : null,
                    average !== null ? `dashed: ${money(average)} on an average day there` : null,
                ].filter(Boolean).join(' · ')}
            />
            <View style={{ width: CONTENT_WIDTH, height: CHART_HEIGHT }}>
                <Svg width={CONTENT_WIDTH} height={CHART_HEIGHT} style={{ position: 'absolute', top: 0, left: 0 }}>
                    {ticks.map(t => (
                        <Line key={t} x1={AXIS_WIDTH} x2={CONTENT_WIDTH} y1={yOf(t)} y2={yOf(t)} stroke={t === 0 ? C.line : C.hairline} strokeWidth={0.75} />
                    ))}
                    {bars.map((b, i) => {
                        const height = PLOT_BOTTOM - yOf(b.value);
                        if (height <= 0) return null;
                        return <Rect key={b.key} x={xOf(i)} y={yOf(b.value)} width={barWidth} height={height} rx={Math.min(2.5, barWidth / 3)} fill={b.key === BOOKED_AHEAD ? C.booked : C.day} />;
                    })}
                    {cut && [0, 4].map(dy => (
                        <Line
                            key={dy}
                            x1={xOf(0) - 1} x2={xOf(0) + barWidth + 1}
                            y1={yOf(cap) + 14 + dy} y2={yOf(cap) + 9 + dy}
                            stroke="#ffffff" strokeWidth={1.6}
                        />
                    ))}
                    {average !== null && (
                        <Line
                            x1={AXIS_WIDTH + firstDay * band} x2={CONTENT_WIDTH} y1={yOf(average)} y2={yOf(average)}
                            stroke={C.ink} strokeWidth={0.75} strokeDasharray="3 2" strokeOpacity={0.55}
                        />
                    )}
                </Svg>
                {labels.map((l, i) => (
                    <Text
                        key={i}
                        style={{ position: 'absolute', left: l.x, top: l.y, width: l.width, fontSize: 6.5, lineHeight: 1, color: l.color, textAlign: l.align, ...(l.solid ? { backgroundColor: '#ffffff' } : {}) }}
                    >
                        {l.text}
                    </Text>
                ))}
            </View>
        </View>
    );
}

// ------------------------------------------------------------------ the lists

function Categories({ report, money }: { report: TripReport; money: Money }) {
    const days = report.metrics.daysCovered;
    return (
        <>
            <SectionHead title="Where the money went" note={`${report.categories.length} ${report.categories.length === 1 ? 'category' : 'categories'}`} />
            <View style={s.tableHead}>
                <Text style={{ flex: 1 }}>CATEGORY</Text>
                <Text style={{ width: 74, textAlign: 'right' }}>SPENT</Text>
                <Text style={{ width: 36, textAlign: 'right' }}>SHARE</Text>
                {days > 0 && <Text style={{ width: 62, textAlign: 'right' }}>A DAY</Text>}
            </View>
            {report.categories.map(c => (
                <View key={c.name} style={s.row} wrap={false}>
                    <CategoryChip category={c.name} size={16} />
                    <Text style={{ width: 120, marginLeft: 7, fontSize: 8.5, fontWeight: 600, color: C.ink }}>{c.name}</Text>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                        <View style={s.track}>
                            <View style={{ height: 5, borderRadius: 2.5, width: `${Math.max(1, c.width)}%`, backgroundColor: chipColor(c.name).ink }} />
                        </View>
                    </View>
                    <Text style={[s.amount, { width: 74, textAlign: 'right' }]}>{money(c.amount)}</Text>
                    <Text style={[s.num, { width: 36, textAlign: 'right', fontSize: 8, color: C.muted }]}>{shareLabel(c.share)}</Text>
                    {days > 0 && <Text style={[s.num, { width: 62, textAlign: 'right', fontSize: 8, color: C.muted }]}>{money(c.amount / days)}</Text>}
                </View>
            ))}
        </>
    );
}

function Biggest({ payments, money }: { payments: ReportPayment[]; money: Money }) {
    return (
        <>
            <SectionHead title="Biggest spends" />
            {payments.map((p, i) => (
                <View key={p.id} style={s.row} wrap={false}>
                    <Text style={[s.num, { width: 14, fontSize: 8, color: C.faint }]}>{i + 1}</Text>
                    <CategoryChip category={p.category} size={18} />
                    <View style={{ flex: 1, marginLeft: 8, paddingRight: 8 }}>
                        <Text style={[s.paymentTitle, { fontSize: 8.5, maxLines: 1, textOverflow: 'ellipsis' }]}>{p.title}</Text>
                        {p.note !== '' && <Text style={{ fontSize: 7.5, color: C.muted, maxLines: 1, textOverflow: 'ellipsis' }}>{p.note}</Text>}
                        <Text style={{ fontSize: 7, color: C.faint }}>{p.category} · {dayWithYear(p.day)}</Text>
                    </View>
                    <View style={{ width: 80, alignItems: 'flex-end' }}>
                        <Text style={s.amount}>{money(p.amount)}</Text>
                        {(p.paid || p.whole !== null) && <Text style={s.paid}>{p.whole !== null ? `of ${money(p.whole)}` : p.paid}</Text>}
                    </View>
                </View>
            ))}
        </>
    );
}

const percentChange = (now: number, before: number) => (before > 0 ? Math.round((now / before - 1) * 100) : null);
function Change({ now, before }: { now: number; before: number }) {
    const pct = percentChange(now, before);
    const label = pct === null ? 'new' : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`;
    const color = pct === null || pct > 10 ? C.warn : pct < -10 ? C.brand : C.muted;
    return <Text style={[s.num, { width: 50, textAlign: 'right', fontSize: 8, fontWeight: 600, color }]}>{label}</Text>;
}

function HomeComparison({ report, money }: { report: TripReport; money: Money }) {
    const cmp = report.comparison!;
    return (
        <>
            <SectionHead title="Everyday spending vs. home" note={`${money(cmp.tripPerDay)} a day there · ${money(cmp.homePerDay)} a day at home`} />
            <View style={s.tableHead}>
                <Text style={{ flex: 1 }}>CATEGORY</Text>
                <Text style={{ width: 80, textAlign: 'right' }}>THERE, A DAY</Text>
                <Text style={{ width: 80, textAlign: 'right' }}>AT HOME, A DAY</Text>
                <Text style={{ width: 50, textAlign: 'right' }}>CHANGE</Text>
            </View>
            {cmp.rows.map(r => (
                <View key={r.category} style={s.row} wrap={false}>
                    <Text style={{ flex: 1, fontSize: 8.5, color: C.ink }}>{r.category}</Text>
                    <Text style={[s.amount, { width: 80, textAlign: 'right', fontWeight: 400 }]}>{money(r.tripPerDay)}</Text>
                    <Text style={[s.num, { width: 80, textAlign: 'right', fontSize: 8.5, color: C.muted }]}>{money(r.homePerDay)}</Text>
                    <Change now={r.tripPerDay} before={r.homePerDay} />
                </View>
            ))}
            <Text style={s.footnote}>
                Per day, on the same things: tickets, hotels, tours, visas, rent, bills and big purchases are left out.
                Home is the everyday spending over the {report.metrics.home!.days} days at home before the trip.
            </Text>
        </>
    );
}

function DayBand({ section, money }: { section: ReportSection; money: Money }) {
    return (
        <View style={s.dayBand} wrap={false} minPresenceAhead={30}>
            <Text style={{ fontSize: 8.5, fontWeight: 600, color: C.ink }}>
                {section.title}{section.note && <Text style={{ fontWeight: 400, color: C.muted }}>{'  '}{section.note}</Text>}
            </Text>
            <Text style={[s.amount, { fontSize: 8.5 }]}>{money(section.total)}</Text>
        </View>
    );
}

function PaymentRow({ payment: p, money, dated }: { payment: ReportPayment; money: Money; dated: boolean }) {
    return (
        <View style={s.payment} wrap={false}>
            <View style={[s.dot, { backgroundColor: chipColor(p.category).ink }]} />
            <View style={{ flex: 1 }}>
                <Text style={s.paymentTitle}>{p.title}</Text>
                {p.note !== '' && <Text style={s.paymentNote}>{p.note}</Text>}
            </View>
            <Text style={s.paymentCategory}>{p.category}{dated ? `\n${dayWithYear(p.day)}` : ''}</Text>
            <Text style={s.paymentPaid}>{p.whole !== null ? `of ${money(p.whole)}` : p.paid ?? ''}</Text>
            <Text style={s.paymentAmount}>{money(p.amount)}</Text>
        </View>
    );
}

// The full list starts a page of its own: it runs long, and the summary before it reads as one piece.
function Payments({ report, money }: { report: TripReport; money: Money }) {
    return (
        <>
            <SectionHead title="Every payment, day by day" note={plural(report.paymentCount, 'payment')} newPage />
            {report.sections.flatMap(section => {
                // Inside a day the day is in its heading; bookings and anything after the trip need their own dates.
                const dated = section.key === BOOKED_AHEAD || section.key === 'after';
                return [
                    <DayBand key={`day-${section.key}`} section={section} money={money} />,
                    ...section.payments.map(p => <PaymentRow key={p.id} payment={p} money={money} dated={dated} />),
                ];
            })}
        </>
    );
}

export function TripReportDocument({ report, parts }: { report: TripReport; parts: ReportParts }) {
    const money = reportMoney(report.currency);
    const range = formatTripRangeLong(report.startDate, report.endDate);
    return (
        <Document title={`${report.name} — trip report`} author="Grow Money" creator="Grow Money" producer="Grow Money" language="en">
            <Page size="A4" style={s.page}>
                <Footer report={report} range={range} />
                <Header report={report} range={range} />
                <Totals report={report} money={money} withHome={parts.home} />
                <CurrencyNote report={report} />
                {parts.budget && report.budget && <Budget report={report} money={money} />}
                {parts.chart && <DailyChart report={report} money={money} />}
                {parts.categories && report.categories.length > 0 && <Categories report={report} money={money} />}
                {parts.biggest && report.biggest.length > 0 && <Biggest payments={report.biggest} money={money} />}
                {parts.home && report.comparison && <HomeComparison report={report} money={money} />}
                {parts.payments && report.sections.length > 0 && <Payments report={report} money={money} />}
            </Page>
        </Document>
    );
}

