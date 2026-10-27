import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiArrowUpRight, FiTrash2 } from 'react-icons/fi';
import { APECHAIN } from '@/lib/cultomizer/contracts';
import { BACKEND_URL } from '@/lib/backend';
import { Indice } from './comun';
import ExiledAdmin from './ExiledAdmin';

type Nickname = { address: string; nickname: string; updatedAt: string };

export default function NicknamesAdmin({ token }: { token: string }) {
    const [lista, setLista] = useState<Nickname[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState('');
    const [borrando, setBorrando] = useState<string | null>(null);

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

    const borrar = async (n: Nickname) => {
        if (
            !confirm(
                `Delete the nickname "${n.nickname}"? The wallet will be able to choose a new one.`
            )
        )
            return;
        setBorrando(n.address);
        try {
            const respuesta = await fetch(
                `${BACKEND_URL}/admin/nicknames/${n.address}`,
                {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                }
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

    return (
        <main className="flex flex-col gap-5 sm:gap-8">
            <div>
                <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">
                    Community
                </h1>
                <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                    What holders show on the site: nicknames and profile bios,
                    plus the code of the Exiled easter egg on the home page.
                </p>
            </div>
            <Indice
                secciones={[
                    { id: 'nicknames', nombre: 'Nicknames' },
                    { id: 'bios', nombre: 'Profile bios' },
                    { id: 'exiled', nombre: 'Exiled code' },
                ]}
            />

            <section
                id="nicknames"
                className="scroll-mt-32 flex flex-col gap-4 bg-darkblue rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-lg shadow-darkblue/50"
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <input
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Search by nickname or wallet..."
                        className="w-full sm:max-w-md bg-lightblue text-darkblue placeholder-darkblue/60 font-accent rounded-md px-3 pt-1 pb-1.5 focus:outline-none"
                    />
                    {lista && (
                        <span className="text-sm text-lightblue/70">
                            {lista.length} nickname
                            {lista.length === 1 ? '' : 's'}
                        </span>
                    )}
                </div>

                {error && <p className="text-sm text-red-300">{error}</p>}

                {!filtrada ? (
                    <p className="text-lightblue/70">Loading...</p>
                ) : filtrada.length === 0 ? (
                    <p className="text-lightblue/70">
                        {busqueda
                            ? 'No matches.'
                            : 'Nobody has chosen a nickname yet.'}
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
                                        className="flex items-center gap-1 w-fit font-mono text-xs text-lightblue/60 hover:text-yellow transition-all duration-300 truncate"
                                    >
                                        {n.address}
                                        <FiArrowUpRight className="shrink-0 w-3 h-3" />
                                    </a>
                                </div>
                                <span className="hidden sm:block text-xs text-lightblue/50 shrink-0">
                                    {new Date(n.updatedAt).toLocaleDateString(
                                        'en-US',
                                        {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                        }
                                    )}
                                </span>
                                <button
                                    onClick={() => borrar(n)}
                                    disabled={borrando === n.address}
                                    aria-label={`Delete ${n.nickname}`}
                                    title="Delete nickname"
                                    className="shrink-0 rounded-md p-2 text-lightblue hover:text-red-300 hover:bg-red-400/10 cursor-pointer transition-all duration-300 disabled:opacity-40"
                                >
                                    <FiTrash2 className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <Bios token={token} />
            <ExiledAdmin token={token} />
        </main>
    );
}

type Bio = { address: string; bio: string; updatedAt: string };

function Bios({ token }: { token: string }) {
    const [lista, setLista] = useState<Bio[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [borrando, setBorrando] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;
        fetch(`${BACKEND_URL}/admin/bios`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then(setLista)
            .catch(() => setError("Couldn't load the bios."));
    }, [token]);

    const borrar = async (b: Bio) => {
        if (
            !confirm(
                'Delete this bio? The holder will be able to write a new one.'
            )
        )
            return;
        setBorrando(b.address);
        try {
            const respuesta = await fetch(
                `${BACKEND_URL}/admin/bios/${b.address}`,
                {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
            if (!respuesta.ok && respuesta.status !== 404) throw new Error();
            setLista((l) => l?.filter((x) => x.address !== b.address) ?? null);
        } catch {
            setError("Couldn't delete that bio.");
        } finally {
            setBorrando(null);
        }
    };

    return (
        <section
            id="bios"
            className="scroll-mt-32 flex flex-col gap-4 bg-darkblue rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-lg shadow-darkblue/50"
        >
            <h2 className="font-accent uppercase text-yellow text-2xl sm:text-3xl">
                Profile bios
            </h2>
            {error && <p className="text-sm text-red-300">{error}</p>}
            {!lista ? (
                <p className="text-lightblue/70">Loading...</p>
            ) : lista.length === 0 ? (
                <p className="text-lightblue/70">
                    Nobody has written a bio yet.
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {lista.map((b) => (
                        <li
                            key={b.address}
                            className="flex items-center gap-3 rounded-xl border border-lightblue/10 bg-lightblue/5 px-4 py-2.5"
                        >
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                <span className="text-sm text-lightblue whitespace-pre-line wrap-break-word">
                                    {b.bio}
                                </span>
                                <a
                                    href={`/holder/${b.address}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 w-fit font-mono text-xs text-lightblue/60 hover:text-yellow transition-all duration-300 truncate"
                                >
                                    {b.address}
                                    <FiArrowUpRight className="shrink-0 w-3 h-3" />
                                </a>
                            </div>
                            <button
                                onClick={() => borrar(b)}
                                disabled={borrando === b.address}
                                aria-label="Delete bio"
                                title="Delete bio"
                                className="shrink-0 rounded-md p-2 text-lightblue hover:text-red-300 hover:bg-red-400/10 cursor-pointer transition-all duration-300 disabled:opacity-40"
                            >
                                <FiTrash2 className="w-4 h-4" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
