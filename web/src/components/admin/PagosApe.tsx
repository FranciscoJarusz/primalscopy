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

function Celda({ t }: { t: Total }) {
    return (
        <td className="py-2 text-right text-lightblue">
            {ape(t.apeWei)} <span className="text-lightblue/50">· {fog(t.count)}</span>
        </td>
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
            <table className="w-full text-sm">
                <thead className="text-lightblue/70 text-xs uppercase text-left">
                    <tr>
                        <th className="font-normal pb-2"></th>
                        <th className="font-normal pb-2 text-right">Forge rolls</th>
                        <th className="font-normal pb-2 text-right">FOG bought</th>
                        <th className="font-normal pb-2 text-right">Total APE</th>
                    </tr>
                </thead>
                <tbody className="tabular-nums">
                    {PERIODOS.map(({ id, nombre }) => {
                        const t = datos.totals[id];
                        return (
                            <tr key={id} className="border-t border-lightblue/15">
                                <td className="py-2 text-white">{nombre}</td>
                                <Celda t={t.forge} />
                                <Celda t={t.fog} />
                                <td className="py-2 text-right text-yellow">
                                    {ape(BigInt(t.forge.apeWei) + BigInt(t.fog.apeWei))}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <p className="text-lightblue/70 text-sm">
                APE · number of payments. {fog(datos.wallets)} {datos.wallets === 1 ? 'wallet has' : 'wallets have'} paid.
                Rolls paid with a code or with FOG aren't here.
            </p>

            <div className="flex flex-wrap gap-2 border-t border-lightblue/15 pt-4">
                {FILTROS.map((f) => (
                    <button
                        key={f.id}
                        onClick={() => setFiltro(f.id)}
                        className={opcion(filtro === f.id)}
                    >
                        {f.nombre}
                    </button>
                ))}
            </div>
            {visibles.length === 0 ? (
                <p className="text-lightblue/70 text-sm">No payments yet.</p>
            ) : (
                <ul data-scroll-propio className={`${lista} flex flex-col`}>
                    {visibles.map((p) => (
                        <li
                            key={p.txHash}
                            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm border-t border-lightblue/15 first:border-t-0"
                        >
                            <span className="text-lightblue/60 w-28 shrink-0">{fecha(p.at)}</span>
                            <span className="flex-1 min-w-40 text-lightblue">
                                {quien(p.wallet)}
                                <span className="text-lightblue/60">
                                    {' · '}
                                    {p.kind === 'fog'
                                        ? `bought ${fog(p.fog ?? 0)} FOG`
                                        : p.tokenId
                                          ? `Forge roll on #${p.tokenId}`
                                          : 'Forge roll, not used yet'}
                                    {p.chainId === 31337 && ' · local test'}
                                </span>
                            </span>
                            <span className="text-yellow tabular-nums">{ape(p.valueWei)} APE</span>
                            {p.chainId !== 31337 && (
                                <a
                                    href={`${APECHAIN.explorador}/tx/${p.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="View on ApeScan"
                                    className="text-lightblue/60 hover:text-yellow transition-all duration-300"
                                >
                                    <FiArrowUpRight />
                                </a>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {datos.more > 0 && (
                <p className="text-lightblue/70 text-sm">Showing the last {fog(datos.payments.length)}; {fog(datos.more)} older ones aren't listed.</p>
            )}
        </section>
    );
}
