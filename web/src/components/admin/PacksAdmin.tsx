import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { BACKEND_URL } from '@/lib/backend';
import { APECHAIN } from '@/lib/cultomizer/contracts';
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
    adjust?: { points: number; reason: string; at: string } | null;
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
        extraBoost?: number;
        winners: number | null;
        prizes?: string[];
        collectionPrize?: string | null;
        rarities: Record<Rareza, { chance: number; points: number }>;
    };
    cardsByRarity: Record<Rareza, number>;
    pulledByRarity?: Record<Rareza, { count: number; expected: number }>;
    totals: { players: number; packs: number; today: number; playersToday: number; extras: number; extrasToday: number; extraApe: string; gifted?: number };
    players: Jugador[];
    daily?: { day: string; players: number; newPlayers: number; packs: number; extras: number; goalRewards?: number; wallets?: JugadorDia[] }[];
    credited?: { txHash: string; wallet: string; at: string; valueWei: string; source: 'admin' | 'recovered' }[];
    chosen: {
        entrants: { wallet: string; nickname: string | null; pulls: number; firstAt: string }[];
        raffle: { winner: string; drawnAt: string; entrants: number } | null;
    };
    goal?: Meta | null;
    collectors?: { wallet: string; nickname: string | null; at: string; packs: number }[];
};
type Meta = {
    title: string;
    reward: string;
    target: number;
    daily?: boolean;
    progress: number;
    from: string;
    to: string | null;
    status: 'running' | 'reached' | 'missed';
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
                        <PorDia datos={datos} />
                        <Competencia datos={datos} ocupado={ocupado} configurar={configurar} />
                        <PremiosRanking datos={datos} ocupado={ocupado} configurar={configurar} />
                        <PremioColeccion datos={datos} ocupado={ocupado} configurar={configurar} />
                        <MetaComunitaria datos={datos} ocupado={ocupado} configurar={configurar} />
                        <AcreditarExtra datos={datos} ocupado={ocupado} pedir={pedir} />
                    </div>
                    <div id="packs-ranking">
                        <Jugadores datos={datos} ocupado={ocupado} pedir={pedir} />
                    </div>
                    <div id="packs-reglas">
                        <Reglas datos={datos} ocupado={ocupado} configurar={configurar} />
                    </div>
                    <div id="packs-chosen">
                        <SorteoChosen datos={datos} ocupado={ocupado} pedir={pedir} />
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
            ['Packs given', totals.gifted ?? 0],
        ]],
    ];
    return (
        <section className={panel}>
            {grupos.map(([grupo, filas]) => (
                <div key={grupo} className="flex flex-col gap-3">
                    <h3 className={subtitulo}>{grupo}</h3>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
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
            {datos.pulledByRarity && (
                <div className="flex flex-col gap-3">
                    <h3 className={subtitulo}>Cards pulled</h3>
                    <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                        {RAREZAS.map((r) => (
                            <div key={r} className="bg-blue rounded-xl px-4 py-3">
                                <dt className="text-sm text-lightblue/70 capitalize">{r}</dt>
                                <dd className="font-accent text-yellow text-2xl">{fog(datos.pulledByRarity![r].count)}</dd>
                                <dd className="text-sm text-lightblue/70">
                                    Expected {datos.pulledByRarity![r].expected.toLocaleString('en-US')}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
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

function PremiosRanking({ datos, ocupado, configurar }: Props) {
    const guardados = datos.config.prizes ?? [];
    const [texto, setTexto] = useState(guardados.join('\n'));
    const lineas = texto.split('\n').map((l) => l.trim());
    while (lineas.length && !lineas[lineas.length - 1]) lineas.pop();

    return (
        <section className={panel}>
            <div>
                <h2 className={titulo}>Leaderboard prizes</h2>
                <p className="text-sm text-lightblue/70 mt-1">
                    One line per place, starting with 1st. They show next to each place in the leaderboard. Leave it empty to hide them.
                </p>
            </div>
            <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={Math.max(5, lineas.length + 1)}
                placeholder={'Mudwater pack + 5 Primals\n4 Primals\n3 Primals'}
                aria-label="Leaderboard prizes"
                className={`${campo} font-mono`}
            />
            <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={ocupado || lineas.join('\n') === guardados.join('\n')} onClick={() => configurar({ prizes: lineas })} className={botonGuardar}>
                    Save prizes
                </button>
            </div>
        </section>
    );
}

function PremioColeccion({ datos, ocupado, configurar }: Props) {
    const guardado = datos.config.collectionPrize ?? '';
    const [premio, setPremio] = useState(guardado);
    const lista = datos.collectors ?? [];
    const quien = useQuien();
    const cartas = Object.entries(datos.cardsByRarity).reduce((n, [r, k]) => n + (r === 'chosen' ? 0 : k), 0);

    return (
        <section className={panel}>
            <div>
                <h2 className={titulo}>Full collection raffle</h2>
                <p className="text-sm text-lightblue/70 mt-1">
                    The prize raffled among everyone who finds all {cartas} cards. The Chosen doesn't count. Leave it empty to hide it.
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <input
                    value={premio}
                    onChange={(e) => setPremio(e.target.value)}
                    maxLength={120}
                    placeholder="1 Primal"
                    aria-label="Full collection prize"
                    className={`${campo} flex-1 min-w-0`}
                />
                <button type="button" disabled={ocupado || premio.trim() === guardado} onClick={() => configurar({ collectionPrize: premio })} className={botonGuardar}>
                    Save
                </button>
            </div>
            <div>
                <p className="text-sm text-lightblue/70">
                    {lista.length === 0 ? 'Nobody has completed it yet.' : `${lista.length} completed it (disqualified wallets are left out):`}
                </p>
                {lista.length > 0 && (
                    <ol className="mt-2 flex flex-col gap-1 text-lightblue">
                        {lista.map((c) => (
                            <li key={c.wallet} className="flex flex-wrap gap-x-3">
                                <span className="text-yellow">{quien(c.wallet)}</span>
                                <span className="text-lightblue/70">
                                    {fecha(c.at)} · {c.packs} packs
                                </span>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </section>
    );
}

function MetaComunitaria({ datos, ocupado, configurar }: Props) {
    const meta = datos.goal ?? null;
    const [nombreMeta, setNombreMeta] = useState(meta?.title ?? '');
    const [premio, setPremio] = useState(meta?.reward ?? '');
    const [objetivo, setObjetivo] = useState(meta ? String(meta.target) : '200');
    const [diaria, setDiaria] = useState(meta ? Boolean(meta.daily) : true);
    const [desde, setDesde] = useState(aLocal(meta?.from ?? new Date().toISOString()));
    const [conFin, setConFin] = useState(Boolean(meta?.to));
    const [hasta, setHasta] = useState(aLocal(meta?.to ?? new Date(Date.now() + 7 * 86400000).toISOString()));

    const guardar = () =>
        configurar({
            goal: {
                title: nombreMeta,
                reward: premio,
                target: Number(objetivo),
                ...(diaria
                    ? { daily: true }
                    : { from: new Date(desde).toISOString(), to: conFin ? new Date(hasta).toISOString() : null }),
            },
        });

    return (
        <section className={panel}>
            <div>
                <h2 className={titulo}>Community goal</h2>
                <p className="text-sm text-lightblue/70 mt-1">
                    {meta
                        ? `${fog(meta.progress)} of ${fog(meta.target)} packs opened${meta.daily ? ' today' : ''}${meta.status === 'reached' ? ': reached!' : meta.status === 'missed' ? ': ended without reaching it.' : '.'} It shows on the home page while packs are open.`
                        : 'A goal everyone pushes together: packs opened between two dates. It shows on the home page while packs are open.'}
                </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className={etiqueta}>
                    Title (optional)
                    <input value={nombreMeta} onChange={(e) => setNombreMeta(e.target.value)} maxLength={80} placeholder={`Open ${objetivo || 'N'} packs`} className={campo} />
                </label>
                <label className={etiqueta}>
                    What it unlocks
                    <input value={premio} onChange={(e) => setPremio(e.target.value)} maxLength={120} placeholder="A free pack for every player" className={campo} />
                </label>
                <label className={etiqueta}>
                    Packs to open
                    <input type="number" min={1} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} className={campo} />
                </label>
                <label className="flex items-center gap-2 text-lightblue cursor-pointer sm:col-span-2">
                    <input type="checkbox" checked={diaria} onChange={(e) => setDiaria(e.target.checked)} className="size-4 accent-yellow" />
                    Daily: resets every day at 00:00 UTC, with the packs
                </label>
                {!diaria && (
                    <>
                        <label className={etiqueta}>
                            Counts packs from (your time)
                            <input type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} />
                        </label>
                        <label className="flex items-center gap-2 text-lightblue cursor-pointer">
                            <input type="checkbox" checked={conFin} onChange={(e) => setConFin(e.target.checked)} className="size-4 accent-yellow" />
                            Ends on a date
                        </label>
                        {conFin && (
                            <input type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Goal end" className={campo} />
                        )}
                    </>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={ocupado || !premio.trim() || !(Number(objetivo) > 0)} onClick={guardar} className={botonGuardar}>
                    {meta ? 'Save goal' : 'Start goal'}
                </button>
                {meta && (
                    <button type="button" disabled={ocupado} onClick={() => configurar({ goal: null })} className={botonChico}>
                        Remove goal
                    </button>
                )}
            </div>
        </section>
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
    const [boostExtra, setBoostExtra] = useState(String(config.extraBoost ?? 0));
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
                            extraBoost: Number(boostExtra),
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
                    <Tarjeta nombre="Extra packs" texto="Bought with APE on top of the free ones. Better odds multiplies the chance of Rare, Epic and Legendary in them; Commons make up the difference.">
                        <div className="grid grid-cols-3 gap-3 w-full">
                            <label className={etiqueta}>
                                Price (APE)
                                <input type="number" min={0} step="0.1" value={precioExtra} onChange={(e) => setPrecioExtra(e.target.value)} className={campo} />
                            </label>
                            <label className={etiqueta}>
                                Max per day
                                <input type="number" min={0} max={10} value={maxExtra} onChange={(e) => setMaxExtra(e.target.value)} className={campo} />
                            </label>
                            <label className={etiqueta}>
                                Better odds (%)
                                <input type="number" min={0} max={300} value={boostExtra} onChange={(e) => setBoostExtra(e.target.value)} className={campo} />
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
    const [ajuste, setAjuste] = useState<Record<string, { points: string; reason: string }>>({});
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
                                    {p.adjust && (
                                        <p>
                                            Points adjusted by {p.adjust.points > 0 ? '+' : ''}
                                            {fog(p.adjust.points)} on {fecha(p.adjust.at)}
                                            {p.adjust.reason && `: ${p.adjust.reason}`}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-lightblue">Add or take away points:</span>
                                        <input
                                            type="number"
                                            step={1}
                                            value={ajuste[p.wallet]?.points ?? String(p.adjust?.points ?? 0)}
                                            onChange={(e) => setAjuste((a) => ({ ...a, [p.wallet]: { reason: a[p.wallet]?.reason ?? p.adjust?.reason ?? '', points: e.target.value } }))}
                                            title="Added to the points from packs. Negative takes points away, 0 removes the adjustment."
                                            className={`${campo} max-w-32`}
                                        />
                                        <input
                                            value={ajuste[p.wallet]?.reason ?? p.adjust?.reason ?? ''}
                                            onChange={(e) => setAjuste((a) => ({ ...a, [p.wallet]: { points: a[p.wallet]?.points ?? String(p.adjust?.points ?? 0), reason: e.target.value } }))}
                                            placeholder="Why (optional)"
                                            className={`${campo} max-w-xs`}
                                        />
                                        <button
                                            type="button"
                                            disabled={ocupado}
                                            onClick={() =>
                                                pedir(`/players/${p.wallet}/adjust`, {
                                                    method: 'PUT',
                                                    body: JSON.stringify({
                                                        points: Number(ajuste[p.wallet]?.points ?? p.adjust?.points ?? 0),
                                                        reason: ajuste[p.wallet]?.reason ?? p.adjust?.reason ?? '',
                                                    }),
                                                })
                                            }
                                            className={botonChico}
                                        >
                                            Save points
                                        </button>
                                        <span className="text-sm text-lightblue/70">
                                            {(() => {
                                                const nuevo = Math.trunc(Number(ajuste[p.wallet]?.points ?? p.adjust?.points ?? 0)) || 0;
                                                const dePacks = p.points - (p.adjust?.points ?? 0);
                                                return `${fog(dePacks)} from packs ${nuevo < 0 ? '−' : '+'} ${fog(Math.abs(nuevo))} = ${fog(dePacks + nuevo)} pts`;
                                            })()}
                                        </span>
                                    </div>
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

function AcreditarExtra({ datos, ocupado, pedir }: { datos: Datos; ocupado: boolean; pedir: (ruta: string, init?: RequestInit) => Promise<boolean> }) {
    const quien = useQuien();
    const acreditados = datos.credited ?? [];
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
                If someone paid for an extra pack and it didn't show up, paste the wallet that paid and the transaction. The payment is checked on chain and the pack is added for today. Players can also recover it themselves with "Check my payment" on the packs page.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
                <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Wallet (0x...)" className={`${campo} flex-1 min-w-0`} />
                <input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="Transaction hash (0x...)" className={`${campo} flex-1 min-w-0`} />
                <button type="button" disabled={ocupado || !wallet || !txHash} onClick={acreditar} className={botonChico}>
                    Credit
                </button>
            </div>
            {listo && <p className="text-green-400 text-sm">Extra pack credited.</p>}
            {acreditados.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className={etiqueta}>Credited after a lost payment ({fog(acreditados.length)})</h3>
                    <ul data-scroll-propio className={`${lista} flex flex-col`}>
                        {acreditados.map((e) => (
                            <li
                                key={e.txHash}
                                className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[9.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1 py-2.5 text-sm border-t border-lightblue/15"
                            >
                                <span className="text-lightblue/60 whitespace-nowrap col-span-2 sm:col-span-1">{fecha(e.at)}</span>
                                <span className="text-lightblue truncate">{quien(e.wallet)}</span>
                                <span className="text-lightblue/80 whitespace-nowrap">{e.source === 'admin' ? 'By hand' : 'Found by the site'}</span>
                                <a
                                    href={`${APECHAIN.explorador}/tx/${e.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-lightblue/60 hover:text-lightblue underline underline-offset-4 whitespace-nowrap transition-all duration-300"
                                >
                                    Tx
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}

type JugadorDia = { wallet: string; isNew: boolean; packs: number; points: number; extras: number; daysPlayed: number };

function PorDia({ datos }: { datos: Datos }) {
    const dias = datos.daily ?? [];
    const [abierto, setAbierto] = useState<string | null>(null);
    const quien = useQuien();
    if (!dias.length) return null;
    const nombreDia = (d: string) =>
        new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    return (
        <section className={panel}>
            <h2 className={titulo}>By day</h2>
            <p className="text-lightblue/70 text-sm -mt-2">
                Days in UTC. New are wallets that opened their first pack that day.
            </p>
            <ol className={`${lista} flex flex-col`} data-scroll-propio>
                {dias.map((d) => (
                    <li key={d.day} className="py-4 border-b border-lightblue/15 last:border-0">
                        <button
                            type="button"
                            onClick={() => setAbierto(abierto === d.day ? null : d.day)}
                            aria-expanded={abierto === d.day}
                            className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 text-left cursor-pointer"
                        >
                            <span className="font-accent uppercase text-yellow min-w-32 leading-none relative top-[-0.19em]">{nombreDia(d.day)}</span>
                            <span className="flex-1 min-w-48 text-sm text-lightblue/80">
                                {d.newPlayers} new · {d.players - d.newPlayers} returning · {fog(d.packs)} packs
                                {d.extras > 0 && ` · ${d.extras} ${d.extras === 1 ? 'extra' : 'extras'}`}
                                {!!d.goalRewards && ` · goal reached: ${d.goalRewards} got a bonus pack`}
                            </span>
                            <span className="font-accent text-yellow leading-none relative top-[-0.19em]">
                                {fog(d.players)} {d.players === 1 ? 'player' : 'players'}
                            </span>
                            <FiChevronDown
                                className={`size-5 text-lightblue transition-all duration-300 ${abierto === d.day ? 'rotate-180' : ''}`}
                            />
                        </button>
                        {abierto === d.day && (
                            <ul className="flex flex-col mt-4 mb-1 rounded-xl bg-white/10 px-4 py-1 text-sm text-lightblue/80">
                                {(d.wallets ?? []).map((w) => (
                                    <li key={w.wallet} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 border-t border-white/10 first:border-0">
                                        <span className="flex-1 min-w-48 text-lightblue">{quien(w.wallet)}</span>
                                        {w.isNew && <span className="font-accent uppercase text-yellow leading-none relative top-[-0.19em]">New</span>}
                                        <span>
                                            {w.packs} {w.packs === 1 ? 'pack' : 'packs'}
                                            {w.extras > 0 && ` (${w.extras} extra)`} · {fog(w.points)} pts · day {w.daysPlayed}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </li>
                ))}
            </ol>
        </section>
    );
}
