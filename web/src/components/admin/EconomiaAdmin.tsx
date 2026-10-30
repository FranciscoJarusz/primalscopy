import { useCallback, useEffect, useState } from 'react';
import { BACKEND_URL } from '@/lib/backend';
import { botonChico, fog, Indice, panel, titulo } from './comun';
import PagosApe from './PagosApe';

type Linea = { id: string; label: string; fog: number };
type Economia = {
    totals: { earned: number; spent: number; circulating: number };
    perDay: number;
    windows: { days: number; spent: number; bought: number; granted: number; spentPerDay: number }[];
    sources: Record<string, number>;
    sinks: Linea[];
    unaccounted: { earned: number; spent: number };
    holders: { withBalance: number; median: number; top10Share: number };
    affordability: { id: string; label: string; price: number; wallets: number }[];
};

const ORIGENES: Record<string, string> = {
    staking: 'Staking',
    bought: 'Bought with APE',
    wheels: 'Key prizes',
    'promo-codes': 'Promo codes',
    'raffle-prizes': 'Raffle prizes',
    admin: 'Set by admin',
};
const DESTINOS: Record<string, string> = {
    'trait-drops': 'Trait drops',
    raffles: 'Raffle tickets',
};

function Barras({ lineas }: { lineas: Linea[] }) {
    const total = lineas.reduce((n, l) => n + Math.max(0, l.fog), 0);
    if (!total) return <p className="text-lightblue/70 text-sm">Nothing yet.</p>;
    return (
        <ul className="flex flex-col gap-3">
            {lineas.map((l) => {
                const parte = Math.max(0, l.fog) / total;
                return (
                    <li key={l.id} className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="text-white">{l.label}</span>
                            <span className="text-lightblue/80 tabular-nums">
                                {fog(l.fog)} · {Math.round(parte * 100)}%
                            </span>
                        </div>
                        <div className="h-2 rounded-full bg-lightblue/15 overflow-hidden">
                            <div className="h-full rounded-full bg-yellow" style={{ width: `${parte * 100}%` }} />
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

function Tarjeta({ nombre, valor, detalle }: { nombre: string; valor: string; detalle: string }) {
    return (
        <section className={panel}>
            <span className="text-lightblue/70 text-xs uppercase">{nombre}</span>
            <span className="font-accent uppercase text-3xl leading-none pb-1.5 text-white tabular-nums">{valor}</span>
            <p className="text-lightblue/80 text-sm">{detalle}</p>
        </section>
    );
}

// Que tanto de lo que entra por dia (staking, compras con APE y premios) se
// gasta: menos de 80% es que el FOG se junta, mas de 120% que se va.
function veredicto(absorbe: number) {
    if (absorbe < 80)
        return `FOG is piling up: people spend ${absorbe}% of the FOG that comes in each day. More things to spend it on would help.`;
    if (absorbe > 120)
        return `FOG is draining: people spend ${absorbe}% of the FOG that comes in each day, so balances are going down.`;
    return `Balanced: people spend ${absorbe}% of the FOG that comes in each day.`;
}

export default function EconomiaAdmin({ token }: { token: string }) {
    const [eco, setEco] = useState<Economia | null>(null);
    const [error, setError] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        try {
            const r = await fetch(`${BACKEND_URL}/admin/economy`, { headers: { Authorization: `Bearer ${token}` } });
            if (!r.ok) throw new Error();
            setEco(await r.json());
            setError(null);
        } catch {
            setError("Couldn't load the economy.");
        }
    }, [token]);

    useEffect(() => {
        if (token) cargar();
    }, [token, cargar]);

    const semana = eco?.windows.find((w) => w.days === 7);
    const entraPorDia = eco && semana ? eco.perDay + (semana.bought + semana.granted) / 7 : 0;
    const absorbe = semana && entraPorDia > 0 ? Math.round((semana.spentPerDay / entraPorDia) * 100) : null;

    return (
        <main className="flex flex-col gap-5 sm:gap-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">Economy</h1>
                    <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                        Where FOG comes from, where it goes and who has it, plus the APE paid on the site.
                    </p>
                </div>
                <button onClick={cargar} className={botonChico}>
                    Refresh
                </button>
            </div>
            <Indice
                secciones={[
                    { id: 'overview', nombre: 'Overview' },
                    { id: 'flow', nombre: 'In & out' },
                    { id: 'holders', nombre: 'Holders' },
                    { id: 'ape', nombre: 'APE payments' },
                ]}
            />
            {error && <p className="text-red-300">{error}</p>}
            {!eco && !error && <p className="text-lightblue/70">Loading...</p>}
            {eco && (
                <>
                    <div id="overview" className="flex flex-col gap-4 sm:gap-5">
                        {absorbe !== null && (
                            <section className={panel}>
                                <h2 className={titulo}>How it&apos;s doing</h2>
                                <p className="text-white">{veredicto(absorbe)}</p>
                            </section>
                        )}
                        <div className="grid gap-4 sm:gap-5 sm:grid-cols-3">
                            <Tarjeta
                                nombre="In circulation"
                                valor={fog(eco.totals.circulating)}
                                detalle="FOG sitting in wallets right now."
                            />
                            <Tarjeta
                                nombre="Made per day"
                                valor={fog(eco.perDay)}
                                detalle="What staking pays per day today, boosts included."
                            />
                            <Tarjeta
                                nombre="Spent per day"
                                valor={fog(semana?.spentPerDay ?? 0)}
                                detalle="Average of the last 7 days."
                            />
                        </div>
                        <div className="grid gap-4 sm:gap-5 sm:grid-cols-2">
                            <Tarjeta
                                nombre="Earned, all time"
                                valor={fog(eco.totals.earned)}
                                detalle="All the FOG ever given, bought FOG included."
                            />
                            <Tarjeta
                                nombre="Spent, all time"
                                valor={fog(eco.totals.spent)}
                                detalle="All the FOG ever spent, refunds taken out."
                            />
                        </div>
                    </div>

                    <div id="flow" className="flex flex-col gap-4 sm:gap-5">
                        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
                            <section className={panel}>
                                <h2 className={titulo}>Where it comes from</h2>
                                <Barras
                                    lineas={Object.entries(eco.sources)
                                        .map(([id, n]) => ({ id, label: ORIGENES[id] ?? id, fog: n }))
                                        .sort((a, b) => b.fog - a.fog)}
                                />
                            </section>
                            <section className={panel}>
                                <h2 className={titulo}>Where it goes</h2>
                                <Barras lineas={eco.sinks.map((s) => ({ ...s, label: DESTINOS[s.id] ?? s.label }))} />
                            </section>
                        </div>
                        <section className={panel}>
                            <h2 className={titulo}>Last days</h2>
                            <table className="w-full text-sm">
                                <thead className="text-lightblue/70 text-xs uppercase text-left">
                                    <tr>
                                        <th className="font-normal pb-2"></th>
                                        <th className="font-normal pb-2 text-right">Spent</th>
                                        <th className="font-normal pb-2 text-right">Bought</th>
                                        <th className="font-normal pb-2 text-right">Prizes</th>
                                    </tr>
                                </thead>
                                <tbody className="tabular-nums">
                                    {eco.windows.map((w) => (
                                        <tr key={w.days} className="border-t border-lightblue/15">
                                            <td className="py-2 text-white">{w.days} days</td>
                                            <td className="py-2 text-right text-lightblue">{fog(w.spent)}</td>
                                            <td className="py-2 text-right text-lightblue">{fog(w.bought)}</td>
                                            <td className="py-2 text-right text-lightblue">{fog(w.granted)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="text-lightblue/70 text-sm">
                                Bought is FOG paid with APE. Prizes are FOG won in keys, codes and raffles.
                            </p>
                        </section>
                        {(eco.unaccounted.earned !== 0 || eco.unaccounted.spent !== 0) && (
                            <p className="text-lightblue/70 text-sm">
                                {fog(eco.unaccounted.earned)} FOG earned and {fog(eco.unaccounted.spent)} FOG spent don't
                                show up in the history, so they're left out of the breakdowns.
                            </p>
                        )}
                    </div>

                    <div id="holders" className="flex flex-col gap-4 sm:gap-5">
                        <div className="grid gap-4 sm:gap-5 sm:grid-cols-3">
                            <Tarjeta
                                nombre="Wallets with FOG"
                                valor={fog(eco.holders.withBalance)}
                                detalle="Wallets with any FOG right now."
                            />
                            <Tarjeta
                                nombre="Median balance"
                                valor={fog(eco.holders.median)}
                                detalle="Half of those wallets have less than this."
                            />
                            <Tarjeta
                                nombre="Top 10 wallets"
                                valor={`${eco.holders.top10Share}%`}
                                detalle="Of the FOG in circulation."
                            />
                        </div>
                        <section className={panel}>
                            <h2 className={titulo}>Who can afford it</h2>
                            <p className="text-lightblue/70 text-sm -mt-2">
                                How many wallets have enough FOG for each thing in the shop.
                            </p>
                            <ul className="flex flex-col">
                                {eco.affordability.map((i) => (
                                    <li
                                        key={i.id}
                                        className="flex items-baseline justify-between gap-3 py-2 text-sm border-t border-lightblue/15 first:border-t-0"
                                    >
                                        <span className="text-white">
                                            {i.label} <span className="text-lightblue/60">· {fog(i.price)} FOG</span>
                                        </span>
                                        <span className="text-lightblue tabular-nums">
                                            {fog(i.wallets)} {i.wallets === 1 ? 'wallet' : 'wallets'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>
                </>
            )}
            <div id="ape">
                <PagosApe token={token} />
            </div>
        </main>
    );
}
