import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface PrivacyContextType {
    isPrivacyMode: boolean;
    togglePrivacyMode: () => void;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export const PrivacyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isPrivacyMode, setIsPrivacyMode] = useState(false);

    // Initialize from localStorage
    useEffect(() => {
        const savedMode = localStorage.getItem('privacyMode');
        if (savedMode === 'true') {
            setIsPrivacyMode(true);
        }
    }, []);

    const togglePrivacyMode = () => {
        setIsPrivacyMode((prev) => {
            const newValue = !prev;
            localStorage.setItem('privacyMode', String(newValue));
            return newValue;
        });
    };

    return (
        <PrivacyContext.Provider value={{ isPrivacyMode, togglePrivacyMode }}>
            {children}
        </PrivacyContext.Provider>
    );
};

export const usePrivacy = () => {
    const context = useContext(PrivacyContext);
    if (context === undefined) {
        throw new Error('usePrivacy must be used within a PrivacyProvider');
    }
    return context;
};
