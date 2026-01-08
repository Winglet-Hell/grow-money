import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Mail, Lock, AlertCircle, CheckCircle2, User } from 'lucide-react';

const AVATAR_ICONS = ['User', 'Smile', 'Zap', 'Star', 'Heart', 'Ghost', 'Crown', 'Sun', 'Moon', 'Music'];

export function Auth({ onLogin }: { onLogin: () => void }) {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            if (mode === 'signup') {
                const randomAvatar = AVATAR_ICONS[Math.floor(Math.random() * AVATAR_ICONS.length)];

                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: fullName,
                            avatar_icon: randomAvatar
                        }
                    }
                });
                if (error) throw error;
                setMessage({ type: 'success', text: 'Check your email for the confirmation link!' });
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                onLogin();
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6 animate-in fade-in zoom-in-95 duration-500">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
                    </h1>
                    <p className="text-gray-500">
                        {mode === 'signin' ? 'Sign in to manage your finances securely' : 'Join us to start tracking your wealth'}
                    </p>
                </div>

                {message && (
                    <div className={`p-4 rounded-xl flex items-start gap-3 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                        {message.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleAuth} className="space-y-4">
                    {mode === 'signup' && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                            <label className="text-sm font-medium text-gray-700">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    required={mode === 'signup'}
                                    value={fullName}
                                    onChange={e => setFullName(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-gray-400"
                                    placeholder="John Doe"
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-gray-400"
                                placeholder="name@example.com"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-gray-400"
                                placeholder="••••••••"
                                minLength={6}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                        {mode === 'signin' ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <div className="text-center text-sm text-gray-500">
                    {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
                    <button
                        onClick={() => {
                            setMode(mode === 'signin' ? 'signup' : 'signin');
                            setMessage(null);
                        }}
                        className="text-emerald-600 font-semibold hover:underline"
                    >
                        {mode === 'signin' ? 'Sign up' : 'Sign in'}
                    </button>
                </div>
            </div>
        </div>
    );
}
