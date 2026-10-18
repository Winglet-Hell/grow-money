import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Bot, Eye, Loader2, Lock, Undo2, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Auth } from '../components/Auth';

// Where Supabase Auth sends someone connecting Claude, ChatGPT or another app to Grow Money (the
// OAuth server's authorization path): sign in if needed, see which app asks, allow or deny. An
// allowed app reads through the online MCP server, which can't change anything (mcp/remote.ts).

interface Request {
    id: string;
    app: string;
    appUri: string | null;
    logoUri: string | null;
    email: string;
    scope: string;
}

type State =
    | { status: 'loading' }
    | { status: 'ask'; request: Request; deciding?: 'allow' | 'deny' }
    | { status: 'leaving'; app: string }
    | { status: 'error'; message: string };

export function OAuthConsentPage({ session, authReady }: { session: Session | null; authReady: boolean }) {
    const [params] = useSearchParams();
    const authorizationId = params.get('authorization_id');
    const [state, setState] = useState<State>({ status: 'loading' });

    useEffect(() => {
        if (!session || !authorizationId) return;
        let cancelled = false;
        supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
            if (cancelled) return;
            if (error || !data) {
                setState({ status: 'error', message: error?.message ?? 'This request is no longer valid.' });
            } else if (data.redirect_url) {
                // Allowed before: Supabase hands back where to go straight away.
                setState({ status: 'leaving', app: data.client?.name ?? 'the app' });
                window.location.assign(data.redirect_url);
            } else {
                setState({
                    status: 'ask',
                    request: {
                        id: data.authorization_id,
                        app: data.client?.name || 'An app',
                        appUri: data.client?.uri || null,
                        logoUri: data.client?.logo_uri || null,
                        email: data.user?.email ?? session.user.email ?? '',
                        scope: data.scope,
                    },
                });
            }
        });
        return () => { cancelled = true; };
    }, [session, authorizationId]);

    if (!authReady) return <Centered><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></Centered>;
    if (!session) return <Auth onLogin={() => undefined} />;

    if (!authorizationId) {
        return <Problem message="This link is missing the request it should carry. Start connecting again from Claude or ChatGPT." />;
    }
    if (state.status === 'loading') return <Centered><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></Centered>;
    if (state.status === 'error') return <Problem message={`${state.message} Start connecting again from Claude or ChatGPT.`} />;
    if (state.status === 'leaving') {
        return (
            <Card>
                <div className="flex flex-col items-center text-center gap-4 py-6">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                    <p className="font-semibold text-gray-900">Returning to {state.app}…</p>
                </div>
            </Card>
        );
    }

    const { request, deciding } = state;
    const decide = async (choice: 'allow' | 'deny') => {
        setState({ status: 'ask', request, deciding: choice });
        const options = { skipBrowserRedirect: true };
        const { data, error } = choice === 'allow'
            ? await supabase.auth.oauth.approveAuthorization(request.id, options)
            : await supabase.auth.oauth.denyAuthorization(request.id, options);
        if (error || !data?.redirect_url) {
            setState({ status: 'error', message: error?.message ?? 'Supabase did not say where to go next.' });
            return;
        }
        setState({ status: 'leaving', app: request.app });
        window.location.assign(data.redirect_url);
    };

    return (
        <Card>
            <div className="flex flex-col items-center text-center gap-4">
                {request.logoUri ? (
                    <img src={request.logoUri} alt="" className="w-14 h-14 rounded-2xl object-contain bg-gray-50 border border-gray-100" />
                ) : (
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Bot className="w-7 h-7" />
                    </div>
                )}
                <div className="space-y-1.5">
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Allow {request.app} to read your finances?</h1>
                    <p className="text-sm text-gray-500">
                        {request.app} asks to use Grow Money as <span className="font-medium text-gray-700">{request.email}</span>.
                    </p>
                </div>
            </div>

            <ul className="space-y-3 text-sm text-gray-600">
                <Point icon={<Eye className="w-4 h-4" />}>It sees your operations, wallets, trips, goals, budgets and milestones.</Point>
                <Point icon={<Lock className="w-4 h-4" />}>Read only: it can't change or delete anything.</Point>
                <Point icon={<Undo2 className="w-4 h-4" />}>You can take access back at any time in Settings → AI apps.</Point>
            </ul>

            {(request.appUri || request.scope) && (
                <p className="text-xs text-gray-400 break-words">
                    {request.appUri && <>From {request.appUri}. </>}
                    {request.scope && <>Asks for: {request.scope}.</>}
                </p>
            )}

            <div className="flex gap-3">
                <button
                    onClick={() => decide('deny')}
                    disabled={!!deciding}
                    className="flex-1 py-3.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-2xl hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {deciding === 'deny' && <Loader2 className="w-4 h-4 animate-spin" />}
                    Deny
                </button>
                <button
                    onClick={() => decide('allow')}
                    disabled={!!deciding}
                    autoFocus
                    className="flex-1 py-3.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl transition-colors shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {deciding === 'allow' && <Loader2 className="w-4 h-4 animate-spin" />}
                    Allow
                </button>
            </div>

            <p className="text-center text-xs text-gray-400">
                Not you?{' '}
                <button onClick={() => supabase.auth.signOut()} className="text-emerald-600 font-semibold hover:underline">
                    Sign in with another account
                </button>
            </p>
        </Card>
    );
}

function Centered({ children }: { children: ReactNode }) {
    return <div className="min-h-screen flex items-center justify-center bg-white md:bg-gray-50">{children}</div>;
}

function Card({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-white md:bg-gray-50 px-0 md:px-4 py-0 md:py-8">
            <div className="w-full max-w-md bg-white md:rounded-3xl md:shadow-2xl p-6 md:p-10 space-y-6 animate-in fade-in duration-300">
                {children}
            </div>
        </div>
    );
}

function Point({ icon, children }: { icon: ReactNode; children: ReactNode }) {
    return (
        <li className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-emerald-600">{icon}</span>
            <span>{children}</span>
        </li>
    );
}

function Problem({ message }: { message: string }) {
    return (
        <Card>
            <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
                    <XCircle className="w-5 h-5" />
                </div>
                <div className="space-y-1.5 text-sm text-gray-600 min-w-0">
                    <p className="text-base font-semibold text-gray-900">Couldn't connect the app</p>
                    <p className="break-words">{message}</p>
                </div>
            </div>
        </Card>
    );
}
