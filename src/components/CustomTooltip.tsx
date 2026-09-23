import type React from 'react';

interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
    isPrivacy?: boolean;
    valuePrefix?: string;
    valueSuffix?: string;
    formatter?: (value: any) => string;
    labelFormatter?: (label: string) => string; // e.g. "Sep 2026 · so far" for a month still running
    footer?: (label: string) => React.ReactNode; // extra lines under the values, e.g. the month's milestones
}

export const CustomTooltip = ({
    active,
    payload,
    label,
    isPrivacy,
    valuePrefix = '₽',
    valueSuffix = '',
    formatter,
    labelFormatter,
    footer
}: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        const extra = footer && label ? footer(label) : null;
        return (
            <div className="bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-xl border border-gray-100 flex flex-col gap-2 min-w-[140px]">
                {label && (
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-1.5 mb-0.5">
                        {labelFormatter ? labelFormatter(label) : label}
                    </p>
                )}
                <div className="flex flex-col gap-1.5">
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-2 h-2 rounded-full ring-2 ring-white"
                                    style={{ backgroundColor: entry.color || entry.fill || '#10b981' }}
                                />
                                <span className="text-xs font-medium text-gray-500">{entry.name}</span>
                            </div>
                            <span className="text-xs font-bold text-gray-900">
                                {isPrivacy ? '••••••' : (
                                    formatter ? formatter(entry.value) :
                                        `${valuePrefix}${Math.round(entry.value).toLocaleString('ru-RU')}${valueSuffix}`
                                )}
                            </span>
                        </div>
                    ))}
                </div>
                {extra && <div className="border-t border-gray-50 pt-1.5">{extra}</div>}
            </div>
        );
    }

    return null;
};
