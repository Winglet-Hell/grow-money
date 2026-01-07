import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface CategoryLimitModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: string;
    currentLimit?: number;
    onSave: (amount: number) => void;
    onRemove: () => void;
}

export const CategoryLimitModal: React.FC<CategoryLimitModalProps> = ({
    isOpen,
    onClose,
    category,
    currentLimit,
    onSave,
    onRemove
}) => {
    const [amount, setAmount] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            setAmount(currentLimit ? currentLimit.toString() : '');
            // Lock body scroll
            document.body.style.overflow = 'hidden';
        } else {
            // Unlock body scroll
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
            setAmount('');
        };
    }, [isOpen, currentLimit]);

    if (!isOpen) return null;

    const handleSave = () => {
        const val = parseFloat(amount.replace(/,/g, '.')); // Handle comma as decimal separator
        if (!isNaN(val) && val > 0) {
            onSave(val);
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
                    <h3 className="text-lg font-semibold text-gray-900">
                        Set Limit for <span className="text-emerald-600">{category}</span>
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Monthly Spending Limit
                    </label>
                    <div className="relative rounded-md shadow-sm">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <span className="text-gray-500 sm:text-sm">₽</span>
                        </div>
                        <input
                            type="number"
                            name="limit"
                            id="limit"
                            className="block w-full rounded-md border-gray-300 pl-7 pr-12 focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm py-3 border"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                        />
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                            <span className="text-gray-500 sm:text-sm">RUB</span>
                        </div>
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                        This limit will be compared against your average monthly spending.
                    </p>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex justify-between items-center">
                    {currentLimit !== undefined ? (
                        <button
                            onClick={() => {
                                onRemove();
                                onClose();
                            }}
                            className="text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
                        >
                            Remove Limit
                        </button>
                    ) : (
                        <div></div>
                    )}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                        >
                            Save Limit
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
