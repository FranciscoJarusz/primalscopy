// Panel de apodos: lista los que eligieron los holders y deja borrar los que
// no corresponden. Usa el mismo token que el panel de traits, guardado en la
// misma clave de sessionStorage: entrar en una pestaña sirve para las dos.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiArrowUpRight, FiTrash2 } from 'react-icons/fi';
import { APECHAIN } from '@/lib/cultomizer/contracts';

const BACKEND_URL =
    import.meta.env.PUBLIC_BACKEND_URL || 'http://localhost:3001/api';
const TOKEN_STORAGE_KEY = 'primal_admin_token';

type Nickname = { address: string; nickname: string; updatedAt: string };

export default function NicknamesAdmin() {
    const [token, setToken] = useState('');
    const [tokenInput, setTokenInput] = useState('');
    const [authError, setAuthError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);

    const [lista, setLista] = useState<Nickname[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState('');
    const [borrando, setBorrando] = useState<string | null>(null);

    const validar = async (candidato: string) => {
        const respuesta = await fetch(`${BACKEND_URL}/admin/session`, {
            headers: { Authorization: `Bearer ${candidato}` },
        }).catch(() => null);
        return respuesta?.ok ?? false;
    };

    useEffect(() => {
        const guardado = sessionStorage.getItem(TOKEN_STORAGE_KEY);
        if (!guardado) return;
        validar(guardado).then((ok) =>
            ok ? setToken(guardado) : sessionStorage.removeItem(TOKEN_STORAGE_KEY)
        );
    }, []);

    const cargar = useCallback(async () => {
        setError(null);
        try {
            const respuesta = await fetch(`${BACKEND_URL}/admin/nicknames`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!respuesta.ok) throw new Error();
            setLista(await respuesta.json());
        } catch {
            setError("Couldn't load the nicknames.");
        }
    }, [token]);

    useEffect(() => {
        if (token) cargar();
    }, [token, cargar]);

    const entrar = async (e: React.FormEvent) => {
        e.preventDefault();
        const candidato = tokenInput.trim();
        if (!candidato) return;
        setChecking(true);
        setAuthError(null);
        if (await validar(candidato)) {
            sessionStorage.setItem(TOKEN_STORAGE_KEY, candidato);
            setToken(candidato);
            setTokenInput('');
        } else {
            setAuthError('Invalid token.');
        }
        setChecking(false);
    };

    const borrar = async (n: Nickname) => {
        if (!confirm(`Delete the nickname "${n.nickname}"? The wallet will be able to choose a new one.`)) return;
        setBorrando(n.address);
        try {
            const respuesta = await fetch(
                `${BACKEND_URL}/admin/nicknames/${n.address}`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
            );
            if (!respuesta.ok && respuesta.status !== 404) throw new Error();
            setLista((l) => l?.filter((x) => x.address !== n.address) ?? null);
        } catch {
            setError(`Couldn't delete "${n.nickname}".`);
        } finally {
            setBorrando(null);
        }
    };

    const filtrada = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!lista || !q) return lista;
        return lista.filter(
            (n) => n.nickname.toLowerCase().includes(q) || n.address.includes(q)
        );
    }, [lista, busqueda]);

    if (!token) {
        return (
            <main className="flex flex-1 items-center justify-center py-10">
                <form
                    onSubmit={entrar}
                    className="flex flex-col items-center gap-5 bg-darkblue p-8 sm:p-10 rounded-2xl sm:rounded-3xl shadow-lg shadow-darkblue/50 text-center max-w-md w-full"
                >
                    <img src="/brand/logo-icon.svg" alt="Primal Cult" className="w-14 h-auto" />
                    <h1 className="font-accent uppercase text-yellow text-4xl sm:text-5xl">
                        Nicknames Admin
                    </h1>
                    <p className="text-lightblue/80">Enter the admin token to continue</p>
                    <input
                        type="password"
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        placeholder="ADMIN_TOKEN"
                        autoFocus
                        className="w-full bg-lightblue text-darkblue placeholder-darkblue/50 font-accent leading-tight rounded-md px-3 pb-1.5 text-center focus:outline-none"
                    />
                    {authError && <p className="text-sm text-red-300">{authError}</p>}
                    <button
                        type="submit"
                        disabled={checking || !tokenInput.trim()}
                        className="w-full bg-yellow text-darkblue font-accent uppercase rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        {checking ? 'Verifying...' : 'Enter'}
                    </button>
                </form>
            </main>
        );
    }

    return (
        <main className="flex flex-col gap-5 sm:gap-8">
            <div>
                <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">
                    Nicknames
                </h1>
                <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                    The nicknames holders chose for the Top Holders list. Delete
                    any that shouldn't be there.
                </p>
            </div>

            <section className="flex flex-col gap-4 bg-darkblue rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-lg shadow-darkblue/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <input
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Search by nickname or wallet..."
                        className="w-full sm:max-w-md bg-lightblue text-darkblue placeholder-darkblue/60 font-accent rounded-md px-3 pt-1 pb-1.5 focus:outline-none"
                    />
                    {lista && (
                        <span className="text-sm text-lightblue/70">
                            {lista.length} nickname{lista.length === 1 ? '' : 's'}
                        </span>
                    )}
                </div>

                {error && <p className="text-sm text-red-300">{error}</p>}

                {!filtrada ? (
                    <p className="text-lightblue/70">Loading...</p>
                ) : filtrada.length === 0 ? (
                    <p className="text-lightblue/70">
                        {busqueda ? 'No matches.' : 'Nobody has chosen a nickname yet.'}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {filtrada.map((n) => (
                            <li
                                key={n.address}
                                className="flex items-center gap-3 rounded-xl border border-lightblue/10 bg-lightblue/5 px-4 py-2.5"
                            >
                                <div className="flex-1 min-w-0 flex flex-col">
                                    <span className="font-accent text-lg text-lightblue leading-none pb-1 truncate">
                                        {n.nickname}
                                    </span>
                                    <a
                                        href={`${APECHAIN.explorador}/address/${n.address}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 w-fit font-mono text-xs text-lightblue/60 hover:text-yellow transition-colors duration-300 truncate"
                                    >
                                        {n.address}
                                        <FiArrowUpRight className="shrink-0 w-3 h-3" />
                                    </a>
                                </div>
                                <span className="hidden sm:block text-xs text-lightblue/50 shrink-0">
                                    {new Date(n.updatedAt).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })}
                                </span>
                                <button
                                    onClick={() => borrar(n)}
                                    disabled={borrando === n.address}
                                    aria-label={`Delete ${n.nickname}`}
                                    title="Delete nickname"
                                    className="shrink-0 rounded-md p-2 text-lightblue hover:text-red-300 hover:bg-red-400/10 cursor-pointer transition-colors duration-300 disabled:opacity-40"
                                >
                                    <FiTrash2 className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}
