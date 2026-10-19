import React, { useId, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { AlertCircle, ArrowLeft, Bot, Eye, EyeOff, Loader2, Lock, MailCheck, MonitorSmartphone, Wallet } from 'lucide-react';
import { AVATAR_ICON_NAMES } from '../lib/avatarIcons';

// What signing in brings along, for the panel beside the form. Keep it true to what the account
// actually holds: the statement syncs through the account's copy, wallets/goals/trips live in
// Supabase behind owner-only policies, and AI apps read through the consent page.
const ACCOUNT_POINTS = [
    { icon: MonitorSmartphone, title: 'The same statement on every device', text: 'Import it once. Sign in anywhere and it is already there.' },
    { icon: Wallet, title: 'Wallets, goals and trips', text: 'Saved to your account, not to one browser.' },
    { icon: Bot, title: 'Ask Claude about your money', text: 'Read-only access that you grant and can take back.' },
    { icon: Lock, title: 'Yours only', text: 'Every record is locked to your account.' },
];

// Supabase's wording, said the way this page speaks.
function describeError(message: string): string {
    if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
    if (/email not confirmed/i.test(message)) return 'Confirm your email first: the link is in your inbox.';
    if (/already registered/i.test(message)) return 'This email already has an account. Sign in instead.';
    return message;
}

export function Auth({ onLogin, onBack }: { onLogin: () => void; onBack?: () => void }) {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [fullName, setFullName] = useState('');
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [error, setError] = useState<string | null>(null);
    // Set once sign-up went through: the form gives way to "check your inbox".
    const [sentTo, setSentTo] = useState<string | null>(null);
    const ids = useId();

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (mode === 'signup') {
                const randomAvatar = AVATAR_ICON_NAMES[Math.floor(Math.random() * AVATAR_ICON_NAMES.length)];

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
                setSentTo(email);
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                onLogin();
            }
        } catch (err) {
            setError(describeError(err instanceof Error ? err.message : String(err)));
        } finally {
            setLoading(false);
        }
    };

    const switchMode = (next: 'signin' | 'signup') => {
        setMode(next);
        setError(null);
        setSentTo(null);
    };

    return (
        <div className="min-h-screen flex bg-[#F0FDF9]">
            <AccountPanel />

            <div className="flex-1 flex flex-col min-w-0">
                <div className="h-16 px-4 sm:px-6 lg:px-10 flex items-center">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="-ml-2 px-2 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-medium text-emerald-900/60 hover:text-emerald-950 hover:bg-emerald-900/5 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </button>
                    )}
                </div>

                <div className="flex-1 flex items-center justify-center px-5 sm:px-6 pb-16">
                    <div key={sentTo ? 'sent' : mode} className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <p className="lg:hidden mb-10 text-xl font-bold tracking-tight text-emerald-950">
                            Grow <span className="text-emerald-600">money</span>
                        </p>

                        {sentTo ? (
                            <div className="space-y-6">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                                    <MailCheck className="w-6 h-6" />
                                </div>
                                <div className="space-y-2">
                                    <h1 className="text-3xl font-bold tracking-tight text-emerald-950">Check your inbox</h1>
                                    <p className="text-emerald-900/60 leading-relaxed">
                                        We sent a link to <span className="font-semibold text-emerald-950 break-all">{sentTo}</span>. Open it to finish creating your account, then sign in here.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => switchMode('signin')}
                                    className="w-full h-12 rounded-xl bg-white border border-emerald-900/10 text-emerald-900 font-semibold hover:bg-emerald-50 transition-colors"
                                >
                                    Back to sign in
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2 mb-8">
                                    <h1 className="text-3xl font-bold tracking-tight text-emerald-950">
                                        {mode === 'signin' ? 'Sign in' : 'Create an account'}
                                    </h1>
                                    <p className="text-emerald-900/60">
                                        {mode === 'signin'
                                            ? 'Pick up where you left off.'
                                            : 'It takes a minute. We will email you a link to confirm.'}
                                    </p>
                                </div>

                                <form onSubmit={handleAuth} className="space-y-5">
                                    {mode === 'signup' && (
                                        <Field id={`${ids}-name`} label="Name">
                                            <input
                                                id={`${ids}-name`}
                                                type="text"
                                                required
                                                autoFocus
                                                autoComplete="name"
                                                value={fullName}
                                                onChange={e => setFullName(e.target.value)}
                                                className={INPUT}
                                            />
                                        </Field>
                                    )}

                                    <Field id={`${ids}-email`} label="Email">
                                        <input
                                            id={`${ids}-email`}
                                            type="email"
                                            required
                                            autoFocus={mode === 'signin'}
                                            autoComplete="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            className={INPUT}
                                            placeholder="you@example.com"
                                        />
                                    </Field>

                                    <Field
                                        id={`${ids}-password`}
                                        label="Password"
                                        hint={mode === 'signup' ? 'At least 6 characters.' : undefined}
                                    >
                                        <div className="relative">
                                            <input
                                                id={`${ids}-password`}
                                                type={showPassword ? 'text' : 'password'}
                                                required
                                                minLength={6}
                                                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                className={`${INPUT} pr-12`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(s => !s)}
                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                                            >
                                                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                                            </button>
                                        </div>
                                    </Field>

                                    {error && (
                                        <p role="alert" className="flex items-start gap-2 text-sm font-medium text-red-600 animate-in fade-in duration-300">
                                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                            {error}
                                        </p>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full h-12 mt-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.99] disabled:opacity-60 flex items-center justify-center"
                                    >
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (mode === 'signin' ? 'Sign in' : 'Create account')}
                                    </button>
                                </form>

                                <p className="mt-8 text-sm text-emerald-900/60">
                                    {mode === 'signin' ? 'New to Grow Money? ' : 'Already have an account? '}
                                    <button
                                        type="button"
                                        onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                                        className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline underline-offset-4"
                                    >
                                        {mode === 'signin' ? 'Create an account' : 'Sign in'}
                                    </button>
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const INPUT = 'w-full h-12 px-4 rounded-xl bg-white border border-emerald-900/10 text-base text-emerald-950 placeholder:text-gray-400 outline-none transition-shadow focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15';

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="block text-sm font-medium text-emerald-950/80">{label}</label>
            {children}
            {hint && <p className="text-xs text-emerald-900/50">{hint}</p>}
        </div>
    );
}

// Desktop only: the brand and what the account gives, with a rising line along the bottom.
function AccountPanel() {
    return (
        <aside className="hidden lg:flex relative w-[44%] max-w-xl shrink-0 flex-col justify-between overflow-hidden bg-emerald-950 px-12 py-10 text-white">
            <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
            <div className="absolute top-1/3 -right-32 w-80 h-80 rounded-full bg-teal-400/10 blur-3xl pointer-events-none" />
            <svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden className="absolute inset-x-0 bottom-0 w-full h-48 pointer-events-none">
                <defs>
                    <linearGradient id="auth-growth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#34d399" stopOpacity="0.22" />
                        <stop offset="1" stopColor="#34d399" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d="M0 114 C 40 110, 70 116, 110 102 S 170 104, 210 82 S 280 84, 320 54 S 370 36, 400 22 L 400 120 L 0 120 Z" fill="url(#auth-growth)" />
                <path d="M0 114 C 40 110, 70 116, 110 102 S 170 104, 210 82 S 280 84, 320 54 S 370 36, 400 22" fill="none" stroke="#34d399" strokeOpacity="0.55" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>

            <p className="relative text-xl font-bold tracking-tight">
                Grow <span className="text-emerald-400">money</span>
            </p>

            <div className="relative space-y-10 py-12">
                <h2 className="text-4xl xl:text-[2.75rem] font-bold leading-[1.1] tracking-tight">
                    See where your money goes,{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-200">and where it grows.</span>
                </h2>
                <ul className="space-y-5">
                    {ACCOUNT_POINTS.map(({ icon: Icon, title, text }) => (
                        <li key={title} className="flex items-start gap-4">
                            <span className="shrink-0 w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/10 flex items-center justify-center text-emerald-300">
                                <Icon className="w-5 h-5" />
                            </span>
                            <span className="space-y-0.5">
                                <span className="block font-semibold text-white">{title}</span>
                                <span className="block text-sm text-emerald-100/60">{text}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>

            <p className="relative text-xs font-medium uppercase tracking-widest text-emerald-100/40">© 2026 Grow Money</p>
        </aside>
    );
}
