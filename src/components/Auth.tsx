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
        <div className="min-h-screen flex items-center justify-center bg-white md:bg-gray-50 px-0 md:px-4 py-0 md:py-8">
            <div className="w-full max-w-md bg-white md:rounded-3xl md:shadow-2xl p-6 md:p-10 space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-bottom-0 md:zoom-in-95 duration-500">
                <div className="text-center space-y-1 md:space-y-2">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                        {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
                    </h1>
                    <p className="text-sm md:text-base text-gray-500 font-medium px-4">
                        {mode === 'signin'
                            ? 'Sign in to manage your finances securely'
                            : 'Join us to start tracking your wealth'}
                    </p>
                </div>

                {message && (
                    <div className={`mx-2 p-3 rounded-2xl flex items-start gap-3 text-sm animate-in slide-in-from-top-2 duration-300 ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                        {message.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0 opacity-70" /> : <CheckCircle2 className="w-5 h-5 shrink-0 opacity-70" />}
                        <span className="font-medium">{message.text}</span>
                    </div>
                )}

                <form onSubmit={handleAuth} className="space-y-4 md:space-y-5">
                    <div className="space-y-3 md:space-y-4">
                        {mode === 'signup' && (
                            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Full Name</label>
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                                    <input
                                        type="text"
                                        required={mode === 'signup'}
                                        value={fullName}
                                        onChange={e => setFullName(e.target.value)}
                                        className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder:text-gray-400 text-base"
                                        placeholder="John Doe"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Email Address</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder:text-gray-400 text-base"
                                    placeholder="name@example.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 transition-colors group-focus-within:text-emerald-500" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder:text-gray-400 text-base"
                                    placeholder="••••••••"
                                    minLength={6}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 space-y-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 text-base"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (mode === 'signin' ? 'Sign In' : 'Create Account')}
                        </button>

                        <div className="text-center">
                            <p className="text-sm text-gray-500 font-medium">
                                {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode(mode === 'signin' ? 'signup' : 'signin');
                                        setMessage(null);
                                    }}
                                    className="text-emerald-600 font-bold hover:underline ml-1"
                                >
                                    {mode === 'signin' ? 'Sign up' : 'Sign in'}
                                </button>
                            </p>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
