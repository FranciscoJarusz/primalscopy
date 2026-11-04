import { useCallback, useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { FiArrowUpRight } from 'react-icons/fi';
import { BACKEND_URL } from '@/lib/backend';
import { APECHAIN } from '@/lib/cultomizer/contracts';
import { botonChico, fecha, fog, lista, opcion, panel, titulo, useQuien } from './comun';

type Total = { count: number; apeWei: string };
type Pago = {
    kind: 'forge' | 'fog';
    at: string;
    wallet: string;
    valueWei: string;
    txHash: string;
    chainId?: number | null;
    status?: string;
    tokenId?: string | null;
    fog?: number;
};
type Datos = {
    totals: Record<'all' | 'days30' | 'days7', { forge: Total; fog: Total }>;
    wallets: number;
    payments: Pago[];
    more: number;
};

const ape = (wei: string | bigint) =>
    Number(formatEther(BigInt(wei))).toLocaleString('en-US', { maximumFractionDigits: 4 });
const PERIODOS = [
    { id: 'all', nombre: 'All time' },
    { id: 'days30', nombre: '30 days' },
    { id: 'days7', nombre: '7 days' },
] as const;
const FILTROS = [
    { id: 'all', nombre: 'All' },
    { id: 'forge', nombre: 'Forge' },
    { id: 'fog', nombre: 'FOG' },
] as const;

function Linea({ nombre, t, unidad }: { nombre: string; t: Total; unidad: [string, string] }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <dt className="text-lightblue/70">{nombre}</dt>
            <dd className="text-lightblue tabular-nums text-right">
                {ape(t.apeWei)} APE{' '}
                <span className="text-lightblue/50">
                    · {fog(t.count)} {t.count === 1 ? unidad[0] : unidad[1]}
                </span>
            </dd>
        </div>
    );
}

export default function PagosApe({ token }: { token: string }) {
    const [datos, setDatos] = useState<Datos | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('all');
    const quien = useQuien();

    const cargar = useCallback(async () => {
        try {
            const r = await fetch(`${BACKEND_URL}/admin/ape-payments`, { headers: { Authorization: `Bearer ${token}` } });
            if (!r.ok) throw new Error();
            setDatos(await r.json());
            setError(null);
        } catch {
            setError("Couldn't load the APE payments.");
        }
    }, [token]);

    useEffect(() => {
        if (token) cargar();
    }, [token, cargar]);

    if (error) return <p className="text-red-300">{error}</p>;
    if (!datos) return null;

    const visibles = datos.payments.filter((p) => filtro === 'all' || p.kind === filtro);

    return (
        <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={titulo}>APE payments</h2>
                <button onClick={cargar} className={botonChico}>
                    Refresh
                </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
                {PERIODOS.map(({ id, nombre }) => {
                    const t = datos.totals[id];
                    return (
                        <div key={id} className="flex flex-col gap-3 rounded-xl bg-lightblue/5 border border-lightblue/10 px-4 pt-3 pb-4">
                            <p className="text-lightblue/70 text-xs uppercase tracking-wider">{nombre}</p>
                            <p className="font-accent text-yellow text-4xl leading-none tabular-nums pb-1">
                                {ape(BigInt(t.forge.apeWei) + BigInt(t.fog.apeWei))} <span className="text-xl">APE</span>
                            </p>
                            <dl className="flex flex-col gap-1 text-sm border-t border-lightblue/10 pt-3">
                                <Linea nombre="Forge rolls" t={t.forge} unidad={['roll', 'rolls']} />
                                <Linea nombre="FOG bought" t={t.fog} unidad={['purchase', 'purchases']} />
                            </dl>
                        </div>
                    );
                })}
            </div>
            <p className="text-lightblue/70 text-sm">
                {fog(datos.wallets)} {datos.wallets === 1 ? 'wallet has' : 'wallets have'} paid in total. Rolls paid with a code or with FOG aren't counted.
            </p>

            <div className="flex flex-wrap gap-2 border-t border-lightblue/15 pt-4">
                {FILTROS.map((f) => (
                    <button
                        key={f.id}
                        onClick={() => setFiltro(f.id)}
                        className={opcion(filtro === f.id)}
                    >
                        {f.nombre} ({fog(f.id === 'all' ? datos.payments.length : datos.payments.filter((p) => p.kind === f.id).length)})
                    </button>
                ))}
            </div>
            {visibles.length === 0 ? (
                <p className="text-lightblue/70 text-sm">No payments yet.</p>
            ) : (
                <div className="flex flex-col">
                    <div className="hidden sm:grid grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)_6rem_1rem] gap-x-4 pb-2 pr-2 text-lightblue/70 text-xs uppercase tracking-wider">
                        <span>Date</span>
                        <span>Wallet</span>
                        <span>What</span>
                        <span className="text-right">APE</span>
                        <span />
                    </div>
                    <ul data-scroll-propio className={`${lista} flex flex-col`}>
                        {visibles.map((p) => (
                            <li
                                key={p.txHash}
                                className="grid grid-cols-[minmax(0,1fr)_auto_1rem] sm:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)_6rem_1rem] items-center gap-x-4 gap-y-1 py-2.5 text-sm border-t border-lightblue/15"
                            >
                                <span className="text-lightblue/60 whitespace-nowrap col-span-3 sm:col-span-1">{fecha(p.at)}</span>
                                <span className="text-lightblue truncate">{quien(p.wallet)}</span>
                                <span className="flex items-center gap-2 min-w-0 row-start-3 col-span-3 sm:row-start-auto sm:col-span-1">
                                    <span
                                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                                            p.kind === 'fog' ? 'bg-lightblue/10 text-lightblue' : 'bg-yellow/15 text-yellow'
                                        }`}
                                    >
                                        {p.kind === 'fog' ? 'FOG' : 'Forge'}
                                    </span>
                                    <span className="text-lightblue/80 truncate">
                                        {p.kind === 'fog'
                                            ? `${fog(p.fog ?? 0)} FOG`
                                            : p.tokenId
                                              ? `Roll on #${p.tokenId}`
                                              : 'Roll, not used yet'}
                                        {p.chainId === 31337 && ' · local test'}
                                    </span>
                                </span>
                                <span className="text-yellow tabular-nums text-right whitespace-nowrap">{ape(p.valueWei)} APE</span>
                                {p.chainId !== 31337 ? (
                                    <a
                                        href={`${APECHAIN.explorador}/tx/${p.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="View on ApeScan"
                                        className="text-lightblue/60 hover:text-yellow transition-all duration-300"
                                    >
                                        <FiArrowUpRight />
                                    </a>
                                ) : (
                                    <span />
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {datos.more > 0 && (
                <p className="text-lightblue/70 text-sm">Showing the last {fog(datos.payments.length)}; {fog(datos.more)} older ones aren't listed.</p>
            )}
        </section>
    );
}
