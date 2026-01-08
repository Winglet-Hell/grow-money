import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useUserSettings } from '../hooks/useUserSettings';
import { Loader2, Lock, Layout, CheckCircle2, AlertCircle, User } from 'lucide-react';
import * as Icons from 'lucide-react';

const AVATAR_ICONS = ['User', 'Smile', 'Zap', 'Star', 'Heart', 'Ghost', 'Crown', 'Sun', 'Moon', 'Music'];

export function SettingsPage() {
    const [activeTab, setActiveTab] = useState<'profile' | 'account' | 'preferences'>('profile');

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h2 className="text-3xl font-bold text-gray-900">Settings</h2>
                <p className="text-gray-500">Manage your profile, account and personalization</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col md:flex-row min-h-[500px]">
                {/* Sidebar */}
                <div className="w-full md:w-64 bg-gray-50 border-r border-gray-100 p-4 space-y-2">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-colors flex items-center gap-3 ${activeTab === 'profile' ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <User className="w-4 h-4" />
                        Profile
                    </button>
                    <button
                        onClick={() => setActiveTab('account')}
                        className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-colors flex items-center gap-3 ${activeTab === 'account' ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <Lock className="w-4 h-4" />
                        Account
                    </button>
                    <button
                        onClick={() => setActiveTab('preferences')}
                        className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-colors flex items-center gap-3 ${activeTab === 'preferences' ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <Layout className="w-4 h-4" />
                        Preferences
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-8">
                    {activeTab === 'profile' && <ProfileSettings />}
                    {activeTab === 'account' && <AccountSettings />}
                    {activeTab === 'preferences' && <PreferencesSettings />}
                </div>
            </div>
        </div>
    );
}

function ProfileSettings() {
    const { settings, updateProfile, loading: settingsLoading } = useUserSettings();
    const [name, setName] = useState(settings.profile.full_name || '');
    const [selectedIcon, setSelectedIcon] = useState(settings.profile.avatar_icon || 'User');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Sync local state when settings satisfy
    useEffect(() => {
        if (!settingsLoading) {
            setName(settings.profile.full_name || '');
            setSelectedIcon(settings.profile.avatar_icon || 'User');
        }
    }, [settings, settingsLoading]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            await updateProfile({ full_name: name, avatar_icon: selectedIcon });
            setMessage({ type: 'success', text: 'Profile updated successfully' });
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to update profile' });
        } finally {
            setLoading(false);
        }
    };

    const DynamicIcon = ({ name, className }: { name: string, className?: string }) => {
        const IconComponent = (Icons as any)[name] || Icons.User;
        return <IconComponent className={className} />;
    };

    if (settingsLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-emerald-500" /></div>;

    return (
        <div className="max-w-md space-y-8">
            <div>
                <h3 className="text-xl font-bold text-gray-900">Your Profile</h3>
                <p className="text-sm text-gray-500">How you appear in the app.</p>
            </div>

            {message && (
                <div className={`p-4 rounded-xl flex items-start gap-3 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {message.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
                    {message.text}
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
                {/* Avatar Picker */}
                <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">Avatar</label>
                    <div className="flex flex-wrap gap-3">
                        {AVATAR_ICONS.map(iconName => (
                            <button
                                key={iconName}
                                type="button"
                                onClick={() => setSelectedIcon(iconName)}
                                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${selectedIcon === iconName ? 'bg-emerald-100 text-emerald-600 ring-2 ring-emerald-500 ring-offset-2' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                            >
                                <DynamicIcon name={iconName} className="w-6 h-6" />
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Full Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                        placeholder="John Doe"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Changes
                </button>
            </form>
        </div>
    )
}

function AccountSettings() {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            setMessage({ type: 'success', text: 'Password updated successfully' });
            setPassword('');
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md space-y-6">
            <div>
                <h3 className="text-xl font-bold text-gray-900">Change Password</h3>
                <p className="text-sm text-gray-500">Update your password associated with this account.</p>
            </div>

            {message && (
                <div className={`p-4 rounded-xl flex items-start gap-3 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {message.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
                    {message.text}
                </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                    <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                        placeholder="••••••••"
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading || !password}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Update Password
                </button>
            </form>
        </div>
    );
}

function PreferencesSettings() {
    const { settings, updatePreferences } = useUserSettings();

    return (
        <div className="max-w-md space-y-6">
            <div>
                <h3 className="text-xl font-bold text-gray-900">Table Preferences</h3>
                <p className="text-sm text-gray-500">Customize how your transaction table looks.</p>
            </div>

            <div className="space-y-4">
                <Toggle
                    label="Compact Mode"
                    description="Reduce padding to show more rows at once"
                    checked={settings.preferences.tableCompactMode}
                    onChange={v => updatePreferences({ tableCompactMode: v })}
                />
                <Toggle
                    label="Show Notes"
                    description="Display the note column in the table"
                    checked={settings.preferences.tableShowNotes}
                    onChange={v => updatePreferences({ tableShowNotes: v })}
                />
                <Toggle
                    label="Show Account"
                    description="Display the account column in the table"
                    checked={settings.preferences.tableShowAccount}
                    onChange={v => updatePreferences({ tableShowAccount: v })}
                />
                <Toggle
                    label="Show Category"
                    description="Display the category column (icon & badge)"
                    checked={settings.preferences.tableShowCategory}
                    onChange={v => updatePreferences({ tableShowCategory: v })}
                />
            </div>
        </div>
    );
}

function Toggle({ label, description, checked, onChange }: { label: string, description: string, checked?: boolean, onChange: (v: boolean) => void }) {
    return (
        <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 px-2 rounded-lg transition-colors cursor-pointer" onClick={() => onChange(!checked)}>
            <div className="space-y-0.5">
                <div className="font-medium text-gray-900">{label}</div>
                <div className="text-xs text-gray-500">{description}</div>
            </div>
            <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${checked ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
            </div>
        </div>
    );
}
