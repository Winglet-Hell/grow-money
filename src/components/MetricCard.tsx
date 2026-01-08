import React from 'react';
import { cn } from '../lib/utils';

interface MetricCardProps {
    title: string;
    amount: number;
    icon: React.ReactNode;
    trend?: string;
    isPrivacy?: boolean;
    className?: string;
    description?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
    title,
    amount,
    icon,
    trend,
    isPrivacy,
    className,
    description
}) => {
    const formattedAmount = new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0
    }).format(amount);

    return (
        <div className={cn(
            "bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between transition-all hover:shadow-md",
            className
        )}>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-500 mb-1 truncate">{title}</p>
                <h3 className="text-2xl font-bold text-gray-900">
                    {isPrivacy ? '••••••' : formattedAmount}
                </h3>
                {trend && (
                    <p className="text-xs text-emerald-600 mt-2 font-medium flex items-center gap-1">
                        {trend}
                    </p>
                )}
                {description && (
                    <p className="text-xs text-gray-400 mt-1">{description}</p>
                )}
            </div>
            <div className="flex-shrink-0 ml-4">
                {icon}
            </div>
        </div>
    );
};
