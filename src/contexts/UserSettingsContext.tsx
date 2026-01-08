import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface UserPreferences {
    tableCompactMode?: boolean;
    tableShowNotes?: boolean;
    tableShowAccount?: boolean;
    tableShowCategory?: boolean;
}

export interface UserProfile {
    full_name?: string;
    avatar_icon?: string;
}

export interface UserSettings {
    preferences: UserPreferences;
    profile: UserProfile;
}

interface UserSettingsContextType {
    settings: UserSettings;
    loading: boolean;
    updatePreferences: (newPrefs: Partial<UserPreferences>) => Promise<void>;
    updateProfile: (newProfile: Partial<UserProfile>) => Promise<void>;
    refresh: () => Promise<void>;
}

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<UserSettings>({
        preferences: {
            tableCompactMode: false,
            tableShowNotes: true,
            tableShowAccount: true,
            tableShowCategory: true,
        },
        profile: {
            full_name: '',
            avatar_icon: '',
        }
    });
    const [loading, setLoading] = useState(true);

    const fetchSettings = useCallback(async () => {
        try {
            // Use getSession for faster local check instead of network call to getUser()
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                setLoading(false);
                return;
            }
            const user = session.user;

            const { data, error } = await supabase
                .from('user_settings')
                .select('preferences, full_name, avatar_icon')
                .eq('user_id', user.id)
                .single();

            if (error && error.code === 'PGRST116') {
                // Row not found - Lazy Initialization from Metadata
                const meta = user.user_metadata;
                if (meta && (meta.full_name || meta.avatar_icon)) {
                    console.log('Initializing user settings from metadata...');
                    const initialProfile = {
                        full_name: meta.full_name || '',
                        avatar_icon: meta.avatar_icon || 'User'
                    };

                    // Insert the row
                    const { error: insertError } = await supabase
                        .from('user_settings')
                        .insert({
                            user_id: user.id,
                            preferences: settings.preferences,
                            full_name: initialProfile.full_name,
                            avatar_icon: initialProfile.avatar_icon
                        });

                    if (!insertError) {
                        setSettings(prev => ({
                            ...prev,
                            profile: initialProfile
                        }));
                    }
                }
            } else if (data) {
                setSettings(prev => ({
                    preferences: { ...prev.preferences, ...data.preferences },
                    profile: {
                        full_name: data.full_name || '',
                        avatar_icon: data.avatar_icon || ''
                    }
                }));
            }
        } catch (error) {
            console.error('Unexpected error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    }, []); // Removed dependency on settings.preferences to prevent loop

    // Listen for auth changes to re-fetch settings
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
                fetchSettings();
            } else {
                setSettings({
                    preferences: {
                        tableCompactMode: false,
                        tableShowNotes: true,
                        tableShowAccount: true,
                        tableShowCategory: true,
                    },
                    profile: {
                        full_name: '',
                        avatar_icon: '',
                    }
                });
            }
        });
        return () => subscription.unsubscribe();
    }, [fetchSettings]);


    const persistSettings = async (updates: any) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;
            const user = session.user;

            const dbPayload: any = {
                updated_at: new Date().toISOString()
            };

            if (updates.preferences) dbPayload.preferences = updates.preferences;
            if (updates.full_name !== undefined) dbPayload.full_name = updates.full_name;
            if (updates.avatar_icon !== undefined) dbPayload.avatar_icon = updates.avatar_icon;

            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    ...dbPayload
                });

            if (error) console.error('Error saving settings:', error);
        } catch (error) {
            console.error('Unexpected error saving settings:', error);
        }
    };

    const updatePreferences = async (newPrefs: Partial<UserPreferences>) => {
        const updatedPrefs = { ...settings.preferences, ...newPrefs };
        setSettings(prev => ({ ...prev, preferences: updatedPrefs }));
        await persistSettings({ preferences: updatedPrefs });
    };

    const updateProfile = async (newProfile: Partial<UserProfile>) => {
        const updatedProfile = { ...settings.profile, ...newProfile };
        setSettings(prev => ({ ...prev, profile: updatedProfile }));
        await persistSettings({ ...updatedProfile });
    };

    return (
        <UserSettingsContext.Provider value={{ settings, loading, updatePreferences, updateProfile, refresh: fetchSettings }}>
            {children}
        </UserSettingsContext.Provider>
    );
}

export const useUserSettings = () => {
    const context = useContext(UserSettingsContext);
    if (context === undefined) {
        throw new Error('useUserSettings must be used within a UserSettingsProvider');
    }
    return context;
};
