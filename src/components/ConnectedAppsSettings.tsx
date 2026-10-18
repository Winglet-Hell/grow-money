import { useEffect, useState } from 'react';
import { Bot, Check, Copy, Loader2, Unplug } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MCP_SERVER_URL } from '../lib/supabaseConfig';
import { formatDate } from '../lib/utils';

// Settings → AI apps: the address to give Claude or ChatGPT, and the apps allowed to read the
// account through it (each one allowed on the consent page, /oauth/consent), with a way to take
// that back.

type Grant = NonNullable<Awaited<ReturnType<typeof supabase.auth.oauth.listGrants>>['data']>[number];

export function ConnectedAppsSettings() {
    const [grants, setGrants] = useState<Grant[] | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [reloadKey, setReloadKey] = useState(0); // bumped after a revoke to list them again

    useEffect(() => {
        let cancelled = false;
        supabase.auth.oauth.listGrants().then(({ data, error }) => {
            if (cancelled) return;
            if (error) {
                setProblem(/session missing|not authenticated|jwt/i.test(error.message)
                    ? 'Sign in to see the apps you have connected.'
                    : /disabled/i.test(error.message) ? 'Connecting apps is switched off in Supabase (Authentication → OAuth Server).' : error.message);
                setGrants([]);
            } else {
                setProblem(null);
                setGrants(data ?? []);
            }
        });
        return () => { cancelled = true; };
    }, [reloadKey]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(MCP_SERVER_URL);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard blocked: the address is on screen to select */ }
    };

    const revoke = async (grant: Grant) => {
        setRevoking(grant.client.id);
        const { error } = await supabase.auth.oauth.revokeGrant({ clientId: grant.client.id });
        setRevoking(null);
        if (error) setProblem(error.message);
        else setReloadKey(k => k + 1);
    };

    return (
        <div className="max-w-xl space-y-8">
            <div>
                <h3 className="text-xl font-bold text-gray-900">AI apps</h3>
                <p className="text-sm text-gray-500">
                    Ask Claude or ChatGPT about your money from any device. An app can only read, and only after you allow it.
                </p>
            </div>

            <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Connect</p>
                <p className="text-sm text-gray-500">
                    Add this address as a custom connector — in Claude under Settings → Connectors, in ChatGPT under its connectors —
                    then sign in and press Allow when Grow Money asks.
                </p>
                <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700 break-all select-all">
                        {MCP_SERVER_URL}
                    </code>
                    <button
                        onClick={copy}
                        className="shrink-0 p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-emerald-600 hover:bg-gray-50 transition-colors"
                        title="Copy the address"
                    >
                        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Connected</p>
                {problem && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">{problem}</p>}
                {grants === null ? (
                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                ) : grants.length === 0 ? (
                    !problem && <p className="text-sm text-gray-400">No apps connected yet.</p>
                ) : (
                    <ul className="divide-y divide-gray-100 border border-gray-100 rounded-2xl">
                        {grants.map(grant => (
                            <li key={grant.client.id} className="flex items-center gap-3 p-3">
                                {grant.client.logo_uri ? (
                                    <img src={grant.client.logo_uri} alt="" className="w-9 h-9 rounded-xl object-contain bg-gray-50 border border-gray-100" />
                                ) : (
                                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                        <Bot className="w-5 h-5" />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-gray-900 truncate">{grant.client.name || 'Unnamed app'}</p>
                                    <p className="text-xs text-gray-400">Allowed {formatDate(grant.granted_at)}</p>
                                </div>
                                <button
                                    onClick={() => revoke(grant)}
                                    disabled={revoking === grant.client.id}
                                    className="shrink-0 px-3 py-2 text-xs font-semibold text-red-600 border border-red-100 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {revoking === grant.client.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                                    Revoke
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
