import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BACKEND_URL } from '@/lib/backend';
import type { Rareza } from '@/lib/packs';
import {
    botonChico,
    botonGuardar,
    campo,
    etiqueta,
    fecha,
    fog,
    Indice,
    lista,
    opcion,
    panel,
    titulo,
    useQuien,
} from './comun';

type Estado = 'upcoming' | 'open' | 'ended';
type Jugador = {
    wallet: string;
    rank: number | null;
    nickname: string | null;
    x: string;
    discord: string;
    points: number;
    packs: number;
    days: number;
    streak: { current: number; best: number };
    firstAt: string;
    lastAt: string;
    disqualified: { at: string; reason: string } | null;
    solana: { address: string; at: string } | null;
};
type Datos = {
    status: Estado;
    config: {
        status: Estado;
        endsAt: string | null;
        tiers: { none: number; holder: number; staker: number };
        extraPrice: number;
        extraMax: number;
        winners: number | null;
        rarities: Record<Rareza, { chance: number; points: number }>;
    };
    cardsByRarity: Record<Rareza, number>;
    totals: { players: number; packs: number; today: number; playersToday: number; extras: number; extrasToday: number; extraApe: string };
    players: Jugador[];
    chosen: {
        entrants: { wallet: string; nickname: string | null; pulls: number; firstAt: string }[];
        raffle: { winner: string; drawnAt: string; entrants: number } | null;
    };
};

const RAREZAS: Rareza[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'chosen'];
const ESTADOS: Record<Estado, { nombre: string; clase: string }> = {
    upcoming: { nombre: 'Not open', clase: 'bg-lightblue/20 text-lightblue' },
    open: { nombre: 'Live', clase: 'bg-yellow text-darkblue' },
    ended: { nombre: 'Ended', clase: 'bg-red text-white' },
};

const aLocal = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function csv(filas: Jugador[]) {
    const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cabecera = ['rank', 'nickname', 'wallet', 'x', 'discord', 'points', 'packs', 'days', 'solana', 'disqualified'];
    const cuerpo = filas.map((f) =>
        [f.rank, f.nickname, f.wallet, f.x, f.discord, f.points, f.packs, f.days, f.solana?.address, f.disqualified?.reason ?? (f.disqualified ? 'yes' : '')]
            .map(celda)
            .join(',')
    );
    const url = URL.createObjectURL(new Blob([[cabecera.join(','), ...cuerpo].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `packs-leaderboard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function PacksAdmin({ token }: { token: string }) {
    const [datos, setDatos] = useState<Datos | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);

    const pedir = useCallback(
        async (ruta: string, init: RequestInit = {}) => {
            setOcupado(true);
            setError(null);
            try {
                const r = await fetch(`${BACKEND_URL}/admin/packs${ruta}`, {
                    ...init,
                    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                });
                const d = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(d.error || "Couldn't reach the server.");
                setDatos(d);
                return true;
            } catch (e) {
                setError((e as Error).message);
                return false;
            } finally {
                setOcupado(false);
            }
        },
        [token]
    );
    const configurar = (cambios: object) =>
        pedir('/config', { method: 'PATCH', body: JSON.stringify(cambios) });

    useEffect(() => {
        pedir('');
    }, [pedir]);

    return (
        <main className="flex flex-col gap-5 sm:gap-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-4">
                        <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">Packs</h1>
                        {datos && (
                            <span className={`font-accent uppercase text-lg rounded-md px-3 pb-1 ${ESTADOS[datos.status].clase}`}>
                                {ESTADOS[datos.status].nombre}
                            </span>
                        )}
                    </div>
                    <p className="text-base sm:text-lg text-lightblue mt-3 max-w-2xl">
                        The Mudwater pack competition: open and close it, set the rules, check the leaderboard and draw The Chosen.
                    </p>
                </div>
                <button type="button" disabled={ocupado} onClick={() => pedir('')} className={botonChico}>
                    Refresh
                </button>
            </div>
            <Indice
                secciones={[
                    { id: 'packs-resumen', nombre: 'Overview' },
                    { id: 'packs-ranking', nombre: 'Leaderboard' },
                    { id: 'packs-reglas', nombre: 'Rules' },
                    { id: 'packs-chosen', nombre: 'The Chosen' },
                ]}
            />
            {error && <p className="text-red bg-darkblue rounded-xl px-4 py-3">{error}</p>}
            {!datos && !error && <p className="text-lightblue/70">Loading...</p>}
            {datos && (
                <>
                    <div id="packs-resumen" className="flex flex-col gap-4 sm:gap-5">
                        <Numeros datos={datos} />
                        <Competencia datos={datos} ocupado={ocupado} configurar={configurar} />
                    </div>
                    <div id="packs-ranking">
                        <Jugadores datos={datos} ocupado={ocupado} pedir={pedir} />
                    </div>
                    <div id="packs-reglas">
                        <Reglas datos={datos} ocupado={ocupado} configurar={configurar} />
                    </div>
                    <div id="packs-chosen">
                        <SorteoChosen datos={datos} ocupado={ocupado} pedir={pedir} />
                        <AcreditarExtra ocupado={ocupado} pedir={pedir} />
                    </div>
                </>
            )}
        </main>
    );
}

type Props = { datos: Datos; ocupado: boolean; configurar: (cambios: object) => Promise<boolean> };

const subtitulo = 'font-accent uppercase text-lightblue text-lg';

function Tarjeta({ nombre, texto, children }: { nombre: string; texto?: string; children: ReactNode }) {
    return (
        <section className={panel}>
            <div>
                <h2 className={titulo}>{nombre}</h2>
                {texto && <p className="text-sm text-lightblue/70 mt-1">{texto}</p>}
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-3">{children}</div>
        </section>
    );
}

function Numeros({ datos }: { datos: Datos }) {
    const { totals } = datos;
    const grupos: [string, [string, string | number][]][] = [
        ['Today', [
            ['Packs opened', totals.today],
            ['Players', totals.playersToday],
            ['Extras sold', totals.extrasToday],
        ]],
        ['All time', [
            ['Packs opened', totals.packs],
            ['Players', totals.players],
            ['Extras sold', totals.extras],
            ['APE from extras', Number(totals.extraApe).toLocaleString('en-US')],
        ]],
    ];
    return (
        <section className={panel}>
            {grupos.map(([grupo, filas]) => (
                <div key={grupo} className="flex flex-col gap-3">
                    <h3 className={subtitulo}>{grupo}</h3>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {filas.map(([nombre, valor]) => (
                            <div key={nombre} className="bg-blue rounded-xl px-4 py-3">
                                <dt className="text-sm text-lightblue/70">{nombre}</dt>
                                <dd className="font-accent text-yellow text-2xl">
                                    {typeof valor === 'number' ? fog(valor) : valor}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            ))}
        </section>
    );
}

function Competencia({ datos, ocupado, configurar }: Props) {
    const { config, status } = datos;
    const [conFecha, setConFecha] = useState(Boolean(config.endsAt));
    const [fin, setFin] = useState(config.endsAt ? aLocal(config.endsAt) : aLocal(new Date(Date.now() + 14 * 86400000).toISOString()));
    const [confirmar, setConfirmar] = useState(false);
    const [ganadores, setGanadores] = useState(config.winners ? String(config.winners) : '');

    return (
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
                <Tarjeta
                    nombre="Status"
                    texto={
                        confirmar
                            ? 'Nobody will be able to open packs. Sure?'
                            : status === 'open'
                              ? 'Packs are open. Ending it stops all openings.'
                              : status === 'ended'
                                ? 'The competition is over. Reopening lets people open packs again.'
                                : "Packs are closed: nobody can open them yet."
                    }
                >
                    {status !== 'open' && (
                        <button type="button" disabled={ocupado} onClick={() => configurar({ status: 'open' })} className={botonGuardar}>
                            {status === 'ended' ? 'Reopen' : 'Open packs'}
                        </button>
                    )}
                    {status === 'open' &&
                        (confirmar ? (
                            <>
                                <button
                                    type="button"
                                    disabled={ocupado}
                                    onClick={() => configurar({ status: 'ended' }).then(() => setConfirmar(false))}
                                    className={botonGuardar}
                                >
                                    End now
                                </button>
                                <button type="button" onClick={() => setConfirmar(false)} className={botonChico}>
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <button type="button" onClick={() => setConfirmar(true)} className={botonChico}>
                                End competition
                            </button>
                        ))}
                </Tarjeta>
                <Tarjeta
                    nombre="End date"
                    texto={config.endsAt ? `Ends ${fecha(config.endsAt)}.` : 'No end date: it runs until you end it.'}
                >
                    <label className="flex items-center gap-2 text-lightblue cursor-pointer w-full">
                        <input type="checkbox" checked={conFecha} onChange={(e) => setConFecha(e.target.checked)} className="size-4 accent-yellow" />
                        Ends on a date (your time)
                    </label>
                    {conFecha && (
                        <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className={`${campo} flex-1 min-w-0`} />
                    )}
                    <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => configurar({ endsAt: conFecha ? new Date(fin).toISOString() : null })}
                        className={botonChico}
                    >
                        Save date
                    </button>
                </Tarjeta>
                <Tarjeta
                    nombre="Winners"
                    texto="How many from the top win. Set it when it ends: they'll be asked for a Solana wallet."
                >
                    <input
                        type="number"
                        min={1}
                        value={ganadores}
                        onChange={(e) => setGanadores(e.target.value)}
                        placeholder="Not set"
                        aria-label="Winners"
                        className={`${campo} flex-1 min-w-0`}
                    />
                    <button type="button" disabled={ocupado} onClick={() => configurar({ winners: ganadores || null })} className={botonChico}>
                        Save
                    </button>
                </Tarjeta>
            </div>
    );
}

function SorteoChosen({ datos, ocupado, pedir }: { datos: Datos; ocupado: boolean; pedir: (ruta: string, init?: RequestInit) => Promise<boolean> }) {
    const { entrants, raffle } = datos.chosen;
    const quien = useQuien();
    return (
        <section className={panel}>
            <h2 className={titulo}>The Chosen raffle</h2>
            <p className="text-lightblue/70 text-sm -mt-2">
                Everyone who pulled The Chosen (#53) gets one entry, no matter how many times they pulled it. Disqualified wallets are left out.
            </p>
            {raffle ? (
                <div className="flex flex-wrap items-center gap-3">
                    <p className="text-lightblue">
                        Winner: <span className="text-yellow">{quien(raffle.winner)}</span> · drawn {fecha(raffle.drawnAt)} among {raffle.entrants}
                    </p>
                    <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => confirm('Undo the draw and pick again later?') && pedir('/chosen/draw', { method: 'DELETE' })}
                        className={botonChico}
                    >
                        Undo draw
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    disabled={ocupado || entrants.length === 0}
                    onClick={() => pedir('/chosen/draw', { method: 'POST' })}
                    className={`${botonGuardar} self-start`}
                >
                    Draw a winner ({entrants.length} {entrants.length === 1 ? 'entry' : 'entries'})
                </button>
            )}
            {entrants.length > 0 && (
                <ul className={lista}>
                    {entrants.map((e) => (
                        <li key={e.wallet} className="flex justify-between gap-3 text-lightblue text-sm py-1">
                            <span className="truncate">{quien(e.wallet)}</span>
                            <span className="text-lightblue/70 shrink-0">
                                {e.pulls}× · {fecha(e.firstAt)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function Reglas({ datos, ocupado, configurar }: Props) {
    const { config, cardsByRarity } = datos;
    const [niveles, setNiveles] = useState({
        none: String(config.tiers.none),
        holder: String(config.tiers.holder),
        staker: String(config.tiers.staker),
    });
    const [precioExtra, setPrecioExtra] = useState(String(config.extraPrice));
    const [maxExtra, setMaxExtra] = useState(String(config.extraMax));
    const [rarezas, setRarezas] = useState(() =>
        Object.fromEntries(RAREZAS.map((r) => [r, { chance: String(config.rarities[r].chance / 100), points: String(config.rarities[r].points) }]))
    );
    const suma = RAREZAS.reduce((s, r) => s + Math.round(Number(rarezas[r].chance) * 100), 0);
    const cambiar = (r: Rareza, campo: 'chance' | 'points', valor: string) =>
        setRarezas((a) => ({ ...a, [r]: { ...a[r], [campo]: valor } }));

    return (
        <div className="flex flex-col gap-4 sm:gap-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-lightblue">
                    Changes apply to packs opened from now on. Points already won stay as they were.
                </p>
                <button
                    type="button"
                    disabled={ocupado || suma !== 10000}
                    onClick={() =>
                        configurar({
                            tiers: { none: Number(niveles.none), holder: Number(niveles.holder), staker: Number(niveles.staker) },
                            extraPrice: Number(precioExtra),
                            extraMax: Number(maxExtra),
                            rarities: Object.fromEntries(
                                RAREZAS.map((r) => [r, { chance: Math.round(Number(rarezas[r].chance) * 100), points: Number(rarezas[r].points) }])
                            ),
                        })
                    }
                    className={botonGuardar}
                >
                    Save rules
                </button>
            </div>
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
                <div className="flex flex-col gap-4 sm:gap-5">
                    <Tarjeta nombre="Free packs per day" texto="Depends on what the wallet holds.">
                        <div className="grid grid-cols-3 gap-3 w-full">
                            {([
                                ['none', 'No Primals'],
                                ['holder', 'Holders'],
                                ['staker', 'Stakers'],
                            ] as const).map(([nivel, nombre]) => (
                                <label key={nivel} className={etiqueta}>
                                    {nombre}
                                    <input
                                        type="number"
                                        min={0}
                                        max={50}
                                        value={niveles[nivel]}
                                        onChange={(e) => setNiveles((n) => ({ ...n, [nivel]: e.target.value }))}
                                        className={campo}
                                    />
                                </label>
                            ))}
                        </div>
                    </Tarjeta>
                    <Tarjeta nombre="Extra packs" texto="Bought with APE on top of the free ones.">
                        <div className="grid grid-cols-2 gap-3 w-full">
                            <label className={etiqueta}>
                                Price (APE)
                                <input type="number" min={0} step="0.1" value={precioExtra} onChange={(e) => setPrecioExtra(e.target.value)} className={campo} />
                            </label>
                            <label className={etiqueta}>
                                Max per day
                                <input type="number" min={0} max={10} value={maxExtra} onChange={(e) => setMaxExtra(e.target.value)} className={campo} />
                            </label>
                        </div>
                    </Tarjeta>
                </div>
                <Tarjeta nombre="Rarities" texto="Chance of each card in a pack. They must add up to 100%.">
                    <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-3 gap-y-2 items-center w-full">
                        <span />
                        <span className="text-sm text-lightblue/70">Chance %</span>
                        <span className="text-sm text-lightblue/70">Points</span>
                        <span className="text-sm text-lightblue/70">Cards</span>
                        {RAREZAS.map((r) => (
                            <div key={r} className="contents">
                                <span className="font-accent uppercase text-lightblue">{r}</span>
                                <input type="number" step="0.01" min={0} max={100} value={rarezas[r].chance} onChange={(e) => cambiar(r, 'chance', e.target.value)} className={campo} />
                                <input type="number" min={0} value={rarezas[r].points} onChange={(e) => cambiar(r, 'points', e.target.value)} className={campo} />
                                <span className="text-lightblue text-center">{cardsByRarity[r]}</span>
                            </div>
                        ))}
                        <span className="col-span-4 h-px bg-lightblue/20 my-1" />
                        <span className="font-accent uppercase text-lightblue">Total</span>
                        <span className={`px-3 font-medium ${suma === 10000 ? 'text-lightblue' : 'text-red-300'}`}>
                            {suma / 100}%
                        </span>
                        <span className="col-span-2 text-sm text-red-300">{suma === 10000 ? '' : 'Must be exactly 100%'}</span>
                    </div>
                </Tarjeta>
            </div>
        </div>
    );
}

function Jugadores({
    datos,
    ocupado,
    pedir,
}: { datos: Datos; ocupado: boolean; pedir: (ruta: string, init?: RequestInit) => Promise<boolean> }) {
    const quien = useQuien();
    const [buscar, setBuscar] = useState('');
    const [motivo, setMotivo] = useState<Record<string, string>>({});
    const [abierto, setAbierto] = useState<string | null>(null);

    const filas = useMemo(() => {
        const q = buscar.trim().toLowerCase();
        return q
            ? datos.players.filter((p) => [p.wallet, p.nickname, p.x, p.discord].some((v) => v?.toLowerCase().includes(q)))
            : datos.players;
    }, [datos.players, buscar]);
    const corte = datos.config.winners;

    return (
        <section className={panel}>
            <h2 className={titulo}>Leaderboard</h2>
            <p className="text-lightblue/70 text-sm -mt-2">
                Highlighted rows are winners (set how many in Overview). Disqualified wallets leave the ranking and
                can&apos;t open packs.
            </p>
            <div className="flex flex-wrap items-center gap-3">
                <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Search wallet, nickname, X or Discord" className={`${campo} sm:max-w-xs`} />
                <button type="button" onClick={() => csv(datos.players)} className={`${botonChico} sm:ml-auto`}>
                    Export CSV
                </button>
            </div>
            <ol className={`${lista} flex flex-col gap-2`} data-scroll-propio>
                {filas.length === 0 && <li className="text-lightblue/70">Nobody yet.</li>}
                {filas.map((p) => {
                    const gana = corte !== null && p.rank !== null && p.rank <= corte;
                    return (
                        <li key={p.wallet} className={`rounded-xl px-4 py-3 ${p.disqualified ? 'bg-blue/40 opacity-60' : gana ? 'bg-yellow/15' : 'bg-blue'}`}>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                <span className="font-accent text-yellow w-10">{p.rank ?? '—'}</span>
                                <span className="flex-1 min-w-48 text-lightblue">{quien(p.wallet)}</span>
                                <span className="text-sm text-lightblue/80">
                                    {p.x && `X @${p.x}`}
                                    {p.x && p.discord && ' · '}
                                    {p.discord && `Discord ${p.discord}`}
                                </span>
                                <span className="font-accent text-yellow">{fog(p.points)} pts</span>
                                <button type="button" onClick={() => setAbierto(abierto === p.wallet ? null : p.wallet)} className={opcion(abierto === p.wallet)}>
                                    More
                                </button>
                            </div>
                            {abierto === p.wallet && (
                                <div className="flex flex-col gap-3 mt-3 text-sm text-lightblue/80">
                                    <p>
                                        {p.packs} packs · played {p.days} {p.days === 1 ? 'day' : 'days'} · streak {p.streak.current} (best{' '}
                                        {p.streak.best}) · first pack {fecha(p.firstAt)} · last points {fecha(p.lastAt)}
                                    </p>
                                    {p.solana && <p className="break-all">Solana: {p.solana.address}</p>}
                                    {p.disqualified && (
                                        <p>
                                            Disqualified {fecha(p.disqualified.at)}
                                            {p.disqualified.reason && `: ${p.disqualified.reason}`}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-2">
                                        {p.disqualified ? (
                                            <button
                                                type="button"
                                                disabled={ocupado}
                                                onClick={() => pedir(`/players/${p.wallet}/disqualified`, { method: 'PUT', body: JSON.stringify({ disqualified: false }) })}
                                                className={botonChico}
                                            >
                                                Restore
                                            </button>
                                        ) : (
                                            <>
                                                <input
                                                    value={motivo[p.wallet] ?? ''}
                                                    onChange={(e) => setMotivo((m) => ({ ...m, [p.wallet]: e.target.value }))}
                                                    placeholder="Reason (optional)"
                                                    className={`${campo} max-w-xs`}
                                                />
                                                <button
                                                    type="button"
                                                    disabled={ocupado}
                                                    onClick={() =>
                                                        pedir(`/players/${p.wallet}/disqualified`, {
                                                            method: 'PUT',
                                                            body: JSON.stringify({ reason: motivo[p.wallet] ?? '' }),
                                                        })
                                                    }
                                                    className={botonChico}
                                                >
                                                    Disqualify
                                                </button>
                                            </>
                                        )}
                                        {(p.x || p.discord) && (
                                            <button
                                                type="button"
                                                disabled={ocupado}
                                                onClick={() => pedir(`/players/${p.wallet}/social`, { method: 'DELETE' })}
                                                title="Frees the X and Discord so another wallet can use them. This wallet will have to add one again to keep playing."
                                                className={botonChico}
                                            >
                                                Free X / Discord
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}

function AcreditarExtra({ ocupado, pedir }: { ocupado: boolean; pedir: (ruta: string, init?: RequestInit) => Promise<boolean> }) {
    const [wallet, setWallet] = useState('');
    const [txHash, setTxHash] = useState('');
    const [listo, setListo] = useState(false);
    const acreditar = async () => {
        setListo(false);
        if (await pedir('/extras', { method: 'POST', body: JSON.stringify({ wallet, txHash }) })) {
            setListo(true);
            setWallet('');
            setTxHash('');
        }
    };
    return (
        <section className={panel}>
            <h2 className={titulo}>Credit an extra pack</h2>
            <p className="text-lightblue/70 text-sm -mt-2">
                If someone paid for an extra pack and it didn't show up, paste the wallet that paid and the transaction. The payment is checked on chain and the pack is added for today.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
                <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Wallet (0x...)" className={`${campo} flex-1 min-w-0`} />
                <input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="Transaction hash (0x...)" className={`${campo} flex-1 min-w-0`} />
                <button type="button" disabled={ocupado || !wallet || !txHash} onClick={acreditar} className={botonChico}>
                    Credit
                </button>
            </div>
            {listo && <p className="text-green-400 text-sm">Extra pack credited.</p>}
        </section>
    );
}
