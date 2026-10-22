// La venta de FOG con APE de la Store: abrirla o cerrarla, la tasa, lo
// recaudado y cada compra con su transaccion.
import { useEffect, useState } from 'react';
import { FiPlus, FiX } from 'react-icons/fi';
import { degradado, type Fondo } from '@/lib/staking';
import { formatEther } from 'viem';
import { APECHAIN } from '@/lib/cultomizer/contracts';
import { botonChico, campo, Desplegable, etiqueta, fecha, fog, lista, panel, titulo, useQuien } from './comun';

export type Paquete = Fondo & { ape: number };
export type VentaAdmin = { enabled: boolean; fogPerApe: number; openedAt: string | null; packs: Paquete[] };
type FilaPaquete = Fondo & { ape: string };
const aFilas = (packs: Paquete[]): FilaPaquete[] => packs.map((p) => ({ ...p, ape: String(p.ape) }));
export type Compras = {
    count: number;
    apeWei: string;
    fog: number;
    purchases: { txHash: string; wallet: string; valueWei: string; fog: number; at: string }[];
};

const ape = (wei: string) =>
    Number(formatEther(BigInt(wei))).toLocaleString('en-US', { maximumFractionDigits: 4 });

export default function FogSaleAdmin({
    venta,
    compras,
    enviar,
    alGuardar,
}: {
    venta: VentaAdmin;
    compras: Compras;
    enviar: (cambios: object) => Promise<unknown>;
    alGuardar: () => void;
}) {
    const quien = useQuien();
    const [tasa, setTasa] = useState(String(venta.fogPerApe));
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => setTasa(String(venta.fogPerApe)), [venta.fogPerApe]);
    const [packs, setPacks] = useState<FilaPaquete[]>(aFilas(venta.packs));
    useEffect(() => setPacks(aFilas(venta.packs)), [venta.packs]);
    const editarPack = (i: number, cambio: Partial<FilaPaquete>) =>
        setPacks((ps) => ps.map((p, j) => (j === i ? { ...p, ...cambio } : p)));

    const cambiar = async (cambios: object) => {
        setOcupado(true);
        setError(null);
        try {
            await enviar({ fogSale: cambios });
            alGuardar();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save.");
        }
        setOcupado(false);
    };

    return (
        <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={titulo}>FOG sale</h2>
                <span
                    className={`rounded-md px-2 pb-0.5 text-sm uppercase font-accent ${venta.enabled ? 'bg-green-400/15 text-green-300' : 'bg-lightblue/10 text-lightblue/60'}`}
                >
                    {venta.enabled ? 'Open' : 'Closed'}
                </span>
            </div>
            <p className="text-lightblue/70 text-sm -mt-2">
                Holders send APE to the treasury from the Store and get FOG right away. Bought FOG spends like
                any other and counts in the leaderboard.
            </p>

            <div className="flex flex-wrap items-end gap-3">
                <label className={etiqueta}>
                    FOG per APE
                    <input
                        type="number"
                        min={1}
                        value={tasa}
                        onChange={(e) => setTasa(e.target.value)}
                        className={`${campo} w-40`}
                    />
                </label>
                <button
                    onClick={() => cambiar({ fogPerApe: Number(tasa) })}
                    disabled={ocupado || Number(tasa) === venta.fogPerApe}
                    className={`${botonChico} h-9`}
                >
                    Save rate
                </button>
                <button
                    onClick={() => cambiar({ enabled: !venta.enabled })}
                    disabled={ocupado}
                    className={`${botonChico} h-9 sm:ml-auto`}
                >
                    {venta.enabled ? 'Close the sale' : 'Open the sale'}
                </button>
            </div>
            {error && <p className="text-red-300 text-sm">{error}</p>}

            <div className="flex flex-col gap-3">
                <h3 className="font-accent uppercase text-yellow text-xl leading-none pb-1">Packs</h3>
                <p className="text-lightblue/70 text-sm -mt-1">
                    The cards on the Shop: how much APE each one costs and its two background colors.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {packs.map((p, i) => (
                        <div key={i} className="flex flex-col gap-2 rounded-xl bg-blue/30 p-2.5">
                            <div
                                className="relative h-20 rounded-lg grid place-items-center"
                                style={{ backgroundImage: degradado(p) }}
                            >
                                <span className="font-accent text-white text-lg leading-none pb-1.5 [text-shadow:0_2px_0_rgb(9_0_80/0.35)]">
                                    {fog((Number(p.ape) || 0) * venta.fogPerApe)}
                                </span>
                                {packs.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => setPacks((ps) => ps.filter((_, j) => j !== i))}
                                        aria-label={`Remove the ${p.ape} APE pack`}
                                        className="absolute top-1 right-1 text-white/80 hover:text-red-300 cursor-pointer transition-all duration-300"
                                    >
                                        <FiX className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <label className={etiqueta}>
                                APE
                                <input
                                    type="number"
                                    min={1}
                                    value={p.ape}
                                    onChange={(e) => editarPack(i, { ape: e.target.value })}
                                    className={campo}
                                />
                            </label>
                            <div className="flex items-center gap-1.5">
                                {(['from', 'to'] as const).map((lado) => (
                                    <input
                                        key={lado}
                                        type="color"
                                        value={p[lado]}
                                        onChange={(e) => editarPack(i, { [lado]: e.target.value })}
                                        aria-label={`${p.ape} APE pack, ${lado === 'from' ? 'top' : 'bottom'} color`}
                                        title={lado === 'from' ? 'Top color' : 'Bottom color'}
                                        className="h-9 flex-1 min-w-0 cursor-pointer rounded-md bg-lightblue p-0.5"
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                    {packs.length < 6 && (
                        <button
                            type="button"
                            onClick={() =>
                                setPacks((ps) => [...ps, { ape: '', from: '#00bcff', to: '#1447e6' }])
                            }
                            className="min-h-40 rounded-xl border-2 border-dashed border-lightblue/30 text-lightblue/70 hover:text-yellow hover:border-yellow/60 grid place-items-center cursor-pointer transition-all duration-300"
                        >
                            <span className="inline-flex items-center gap-1.5 font-accent uppercase text-sm leading-none pb-1">
                                <FiPlus className="w-4 h-4" />
                                Add pack
                            </span>
                        </button>
                    )}
                </div>
                <button
                    onClick={() => cambiar({ packs: packs.map((p) => ({ ...p, ape: Number(p.ape) })) })}
                    disabled={ocupado}
                    className={`${botonChico} h-9 self-start`}
                >
                    Save packs
                </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
                {[
                    ['Purchases', compras.count.toLocaleString('en-US')],
                    ['APE received', ape(compras.apeWei)],
                    ['FOG sold', fog(compras.fog)],
                ].map(([nombre, valor]) => (
                    <div key={nombre} className="bg-blue/40 rounded-xl p-3">
                        <div className="text-lightblue/70 text-xs uppercase">{nombre}</div>
                        <div className="font-accent text-yellow text-2xl tabular-nums">{valor}</div>
                    </div>
                ))}
            </div>

            <Desplegable
                nombre="Purchases"
                resumen={`${compras.count.toLocaleString('en-US')} ${compras.count === 1 ? 'purchase' : 'purchases'} · ${ape(compras.apeWei)} APE${compras.count > compras.purchases.length ? ` · showing the last ${compras.purchases.length}` : ''}`}
            >
            {compras.purchases.length === 0 ? (
                <p className="text-lightblue/70">No purchases yet.</p>
            ) : (
                <ul data-scroll-propio className={`${lista} text-sm text-lightblue flex flex-col gap-1.5`}>
                    {compras.purchases.map((c) => (
                        <li key={c.txHash} className="flex flex-wrap gap-x-3">
                            <span className="text-lightblue/60 w-32 shrink-0 whitespace-nowrap">{fecha(c.at)}</span>
                            <span className="font-mono">{quien(c.wallet)}</span>
                            <span className="flex-1 text-right">
                                <b className="text-white font-semibold">{ape(c.valueWei)} APE</b> ·{' '}
                                <span className="text-yellow">{fog(c.fog)} FOG</span> ·{' '}
                                <a
                                    href={`${APECHAIN.explorador}/tx/${c.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-yellow underline underline-offset-4 transition-all duration-300"
                                >
                                    Tx
                                </a>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            </Desplegable>
        </section>
    );
}
