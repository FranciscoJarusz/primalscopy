import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiArrowUpRight, FiCheck, FiCopy, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { getAddress } from 'viem';
import { BACKEND_URL } from '@/lib/backend';
import { walletCorta } from '@/lib/nicknames';
import { ICONO_FOG_CHICO } from '@/lib/staking';
import { botonChico, campo, fog, Indice, opcion, panel } from './comun';
import ExiledAdmin from './ExiledAdmin';

type Holder = { wallet: string; primals: number; nickname: string | null; fog: number };
type Edicion = { wallet: string; campo: 'nombre' | 'fog'; valor: string };
const POR_PAGINA = 60;
const FILTROS = [
    { id: 'all', nombre: 'All' },
    { id: 'named', nombre: 'With name' },
    { id: 'unnamed', nombre: 'Without name' },
] as const;

export default function NicknamesAdmin({ token }: { token: string }) {
    return (
        <main className="flex flex-col gap-5 sm:gap-8">
            <div>
                <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">
                    Community
                </h1>
                <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                    Every holder with their name and FOG, the profile bios and
                    the code of the Exiled easter egg on the home page.
                </p>
            </div>
            <Indice
                secciones={[
                    { id: 'holders', nombre: 'Holders' },
                    { id: 'bios', nombre: 'Profile bios' },
                    { id: 'exiled', nombre: 'Exiled code' },
                ]}
            />
            <Holders token={token} />
            <Bios token={token} />
            <ExiledAdmin token={token} />
        </main>
    );
}

// Todas las wallets con Primals, tengan nombre o no. El nombre que se pone
// aca es provisorio: el holder lo puede cambiar desde el sitio. El FOG se
// deja en un monto exacto, por ejemplo para pasar el que tenia en Discord.
function Holders({ token }: { token: string }) {
    const [lista, setLista] = useState<Holder[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState('');
    const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('all');
    const [mostrar, setMostrar] = useState(POR_PAGINA);
    const [edicion, setEdicion] = useState<Edicion | null>(null);
    const [ocupado, setOcupado] = useState(false);

    const pedir = useCallback(
        async (ruta: string, init: RequestInit = {}) => {
            const r = await fetch(`${BACKEND_URL}/admin${ruta}`, {
                ...init,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(init.body ? { 'content-type': 'application/json' } : {}),
                },
            }).catch(() => null);
            const d = await r?.json().catch(() => ({}));
            if (!r?.ok) throw new Error(d?.error || "Couldn't reach the server.");
            return d;
        },
        [token]
    );

    useEffect(() => {
        if (!token) return;
        pedir('/holders')
            .then(setLista)
            .catch(() => setError("Couldn't load the holders."));
    }, [token, pedir]);

    const filtrada = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return (lista ?? []).filter(
            (h) =>
                (filtro === 'all' || (filtro === 'named') === Boolean(h.nickname)) &&
                (!q || h.wallet.includes(q) || Boolean(h.nickname?.toLowerCase().includes(q)))
        );
    }, [lista, busqueda, filtro]);

    const cambiar = (wallet: string, cambio: Partial<Holder>) =>
        setLista((l) => l?.map((h) => (h.wallet === wallet ? { ...h, ...cambio } : h)) ?? null);

    const guardar = async () => {
        if (!edicion) return;
        const { wallet, campo: c, valor } = edicion;
        setOcupado(true);
        setError(null);
        try {
            if (c === 'fog') {
                const r = await pedir(`/fog/${wallet}`, {
                    method: 'PUT',
                    body: JSON.stringify({ balance: Number(valor.replace(/[,\s]/g, '')) }),
                });
                cambiar(wallet, { fog: r.balance });
            } else if (valor.trim() === '') {
                await pedir(`/nicknames/${wallet}`, { method: 'DELETE' });
                cambiar(wallet, { nickname: null });
            } else {
                const r = await pedir(`/nicknames/${wallet}`, {
                    method: 'PUT',
                    body: JSON.stringify({ nickname: valor.trim() }),
                });
                cambiar(wallet, { nickname: r.nickname });
            }
            setEdicion(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save.");
        }
        setOcupado(false);
    };

    const sinNombre = lista?.filter((h) => !h.nickname).length ?? 0;

    return (
        <section id="holders" className={panel}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <input
                    value={busqueda}
                    onChange={(e) => {
                        setBusqueda(e.target.value);
                        setMostrar(POR_PAGINA);
                    }}
                    placeholder="Search by name or wallet..."
                    className={`${campo} sm:max-w-md`}
                />
                <div className="flex flex-wrap items-center gap-2">
                    {FILTROS.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                                setFiltro(f.id);
                                setMostrar(POR_PAGINA);
                            }}
                            className={opcion(filtro === f.id)}
                        >
                            {f.nombre}
                        </button>
                    ))}
                </div>
            </div>
            {lista && (
                <p className="text-sm text-lightblue/70 -mt-1">
                    {fog(lista.length)} wallets, {fog(sinNombre)} without a name. A name set here is
                    provisional: the holder can change it on the site.
                </p>
            )}
            {error && <p className="text-sm text-red-300">{error}</p>}

            {!lista ? (
                !error && <p className="text-lightblue/70">Loading...</p>
            ) : filtrada.length === 0 ? (
                <p className="text-lightblue/70">No matches.</p>
            ) : (
                <>
                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {filtrada.slice(0, mostrar).map((h) => (
                            <Tarjeta
                                key={h.wallet}
                                h={h}
                                edicion={edicion?.wallet === h.wallet ? edicion : null}
                                ocupado={ocupado}
                                editar={(c, valor) => {
                                    setError(null);
                                    setEdicion({ wallet: h.wallet, campo: c, valor });
                                }}
                                setValor={(valor) => setEdicion((e) => (e ? { ...e, valor } : e))}
                                guardar={guardar}
                                cancelar={() => setEdicion(null)}
                            />
                        ))}
                    </ul>
                    {filtrada.length > mostrar && (
                        <button
                            type="button"
                            onClick={() => setMostrar((m) => m + POR_PAGINA)}
                            className={`${botonChico} self-center`}
                        >
                            Show more ({fog(filtrada.length - mostrar)} left)
                        </button>
                    )}
                </>
            )}
        </section>
    );
}

function Tarjeta({
    h,
    edicion,
    ocupado,
    editar,
    setValor,
    guardar,
    cancelar,
}: {
    h: Holder;
    edicion: Edicion | null;
    ocupado: boolean;
    editar: (campo: Edicion['campo'], valor: string) => void;
    setValor: (valor: string) => void;
    guardar: () => void;
    cancelar: () => void;
}) {
    const iconoEditar =
        'shrink-0 size-7 grid place-items-center rounded-md text-lightblue hover:text-yellow hover:bg-lightblue/10 cursor-pointer transition-all duration-300';
    const editor = (tipo: 'text' | 'number', placeholder: string) => (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                guardar();
            }}
            className="flex items-center gap-2"
        >
            <input
                autoFocus
                type={tipo}
                min={tipo === 'number' ? 0 : undefined}
                value={edicion?.valor ?? ''}
                placeholder={placeholder}
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && cancelar()}
                className={`${campo} py-1!`}
            />
            <button type="submit" disabled={ocupado} className={botonChico}>
                Save
            </button>
            <button
                type="button"
                onClick={cancelar}
                className="text-sm text-lightblue/70 hover:text-yellow cursor-pointer transition-all duration-300"
            >
                Cancel
            </button>
        </form>
    );

    return (
        <li className="flex flex-col gap-3 rounded-xl border border-lightblue/10 bg-lightblue/5 p-4 min-w-0">
            <div className="flex flex-col gap-1 min-w-0">
                {edicion?.campo === 'nombre' ? (
                    editor('text', 'Empty removes the name')
                ) : (
                    <div className="flex items-center gap-2 min-w-0">
                        <span
                            className={`font-accent uppercase text-lg leading-none pb-1 truncate ${
                                h.nickname ? 'text-yellow' : 'text-lightblue/40'
                            }`}
                        >
                            {h.nickname ?? 'No name'}
                        </span>
                        <button
                            type="button"
                            onClick={() => editar('nombre', h.nickname ?? '')}
                            aria-label="Edit name"
                            title="Edit name"
                            className={iconoEditar}
                        >
                            <FiEdit2 className="size-3.5" />
                        </button>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <a
                        href={`/holder/${h.wallet}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={h.wallet}
                        className="flex items-center gap-1 w-fit font-mono text-xs text-lightblue/60 hover:text-yellow transition-all duration-300"
                    >
                        {walletCorta(h.wallet)}
                        <FiArrowUpRight className="shrink-0 size-3" />
                    </a>
                    <CopiarWallet wallet={h.wallet} />
                </div>
            </div>
            <div className="border-t border-dashed border-lightblue/20" />
            <div className="flex flex-col gap-2 text-sm">
                <span className="text-lightblue/70">
                    Primals: <b className="text-white font-semibold">{h.primals}</b>
                </span>
                {edicion?.campo === 'fog' ? (
                    editor('number', 'FOG balance')
                ) : (
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-lightblue/70">
                            <img src={ICONO_FOG_CHICO} alt="" className="size-4" />
                            FOG Balance: <b className="text-white font-semibold tabular-nums">{fog(h.fog)}</b>
                        </span>
                        <button
                            type="button"
                            onClick={() => editar('fog', String(h.fog))}
                            aria-label="Edit FOG balance"
                            title="Set the FOG balance"
                            className={iconoEditar}
                        >
                            <FiEdit2 className="size-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </li>
    );
}

function CopiarWallet({ wallet }: { wallet: string }) {
    const [copiada, setCopiada] = useState(false);
    const copiar = () => {
        let w = wallet;
        try {
            w = getAddress(wallet);
        } catch {}
        navigator.clipboard?.writeText(w);
        setCopiada(true);
        setTimeout(() => setCopiada(false), 1500);
    };
    return (
        <button
            type="button"
            onClick={copiar}
            aria-label="Copy the address"
            title="Copy the address"
            className="shrink-0 inline-flex items-center gap-1 text-xs text-lightblue/60 hover:text-yellow cursor-pointer transition-all duration-300"
        >
            {copiada ? (
                <>
                    <FiCheck className="size-3.5 text-green-300" />
                    <span className="text-green-300">Copied</span>
                </>
            ) : (
                <FiCopy className="size-3.5" />
            )}
        </button>
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
                                <div className="flex items-center gap-2 min-w-0">
                                    <a
                                        href={`/holder/${b.address}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 w-fit font-mono text-xs text-lightblue/60 hover:text-yellow transition-all duration-300 truncate"
                                    >
                                        {b.address}
                                        <FiArrowUpRight className="shrink-0 w-3 h-3" />
                                    </a>
                                    <CopiarWallet wallet={b.address} />
                                </div>
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
