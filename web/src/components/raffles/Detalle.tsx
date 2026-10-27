import { useCallback, useEffect, useState } from 'react';
import { useAppKit } from '@reown/appkit/react';
import { useApodos, nombreWallet, walletCorta } from '@/lib/nicknames';
import { fog, ICONO_FOG_CHICO, miniaturaPrimal } from '@/lib/staking';
import { entrar, leerRaffle, type MiRaffles, type Raffle, type RaffleDetalle } from '@/lib/raffles';
import { card, tituloCard } from '@/components/forge/estilos';

const principal =
    'bg-yellow text-darkblue font-accent uppercase text-lg leading-normal! rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300';
const secundario =
    'bg-lightblue text-darkblue font-accent uppercase text-lg leading-normal! rounded-md px-6 pb-1.5 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300';
import Mensaje, { type Aviso } from '@/components/staking/Mensaje';
import Dato from '@/components/shared/Dato';
import Ganaste from './Ganaste';
import {
    BarraEntradas,
    Estado,
    HojaTickets,
    Imagen,
    deshabilitable,
    entradasTexto,
    jugadoresTexto,
    fechaCorta,
    filasPremios,
    textoEntrada,
    lleno,
    odds,
    pastilla,
    puesto,
    reloj,
    useAhora,
    useAvatares,
    useEsperandoSorteo,
    useMio,
    URGENTE,
    type Session,
} from './comun';

export default function Detalle({ id, inicial }: { id: string; inicial: RaffleDetalle | null }) {
    const [raffle, setRaffle] = useState<RaffleDetalle | null>(inicial);
    const [fallo, setFallo] = useState(false);
    const [tickets, setTickets] = useState(false);
    const { session, mio, recargar } = useMio();

    const cargar = useCallback(() => {
        leerRaffle(id)
            .then((r) => {
                setRaffle(r);
                setFallo(false);
            })
            .catch(() => setFallo(true));
    }, [id]);

    const esperando = useEsperandoSorteo(raffle ? [raffle] : [], recargar);

    useEffect(() => {
        cargar();
        const t = setInterval(cargar, esperando ? 2_000 : 30_000);
        return () => clearInterval(t);
    }, [cargar, esperando]);

    const alCambiar = () => {
        cargar();
        recargar();
    };

    if (!raffle) {
        return (
            <p className="text-lightblue/70">
                {fallo ? 'This raffle is unavailable right now. Try again in a moment.' : 'Loading...'}
            </p>
        );
    }

    return (
        <main className="w-full text-lightblue flex flex-col gap-5 sm:gap-6">
            <nav aria-label="Breadcrumb" className="text-sm">
                <a href="/raffles" className="hover:text-yellow transition-all duration-300">
                    Raffles
                </a>
                <span className="mx-2 text-lightblue/50">/</span>
                <span className="text-white">{raffle.title}</span>
            </nav>

            <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
                <div className="flex flex-col gap-5 sm:gap-6 min-w-0">
                    <div className={`${card} p-3! sm:p-4!`}>
                        <Imagen raffle={raffle} className="aspect-square w-full rounded-xl" />
                    </div>
                    <Datos raffle={raffle} />
                </div>

                <Panel
                    raffle={raffle}
                    mio={mio}
                    session={session}
                    alCambiar={alCambiar}
                    alComprarTickets={() => setTickets(true)}
                />

                <Participantes raffle={raffle} miWallet={session.address} />
            </div>

            {tickets && session.token && mio && (
                <HojaTickets
                    raffle={raffle}
                    mio={mio}
                    token={session.token}
                    alCambiar={alCambiar}
                    alCerrar={() => setTickets(false)}
                />
            )}
            <Ganaste mio={mio} wallet={session.address} />
        </main>
    );
}

function Datos({ raffle }: { raffle: Raffle }) {
    const premios = filasPremios(raffle).length;
    const filas: [string, string][] = [
        ...filasPremios(raffle),
        ['Entry', textoEntrada(raffle)],
        ['Entry limit', raffle.maxEntries === null ? 'No limit' : fog(raffle.maxEntries)],
        ...(raffle.openedAt ? ([['Opened', fechaCorta(raffle.openedAt)]] as [string, string][]) : []),
        [
            'Closes',
            raffle.endsAt
                ? `${fechaCorta(raffle.endsAt)}, ${new Date(raffle.endsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                : 'When the team draws it',
        ],
    ];

    return (
        <dl className={`${card} m-0 flex flex-col`}>
            {raffle.description && <p className="pb-4 mb-1 border-b border-lightblue/12 whitespace-pre-line">{raffle.description}</p>}
            {filas.map(([dt, dd], i) => (
                <div key={dt} className="flex justify-between gap-4 py-3 border-b border-lightblue/12 last:border-0 text-sm sm:text-base">
                    <dt>{dt}</dt>
                    <dd className={`m-0 text-right font-semibold ${i < premios ? 'text-yellow' : 'text-white'}`}>{dd}</dd>
                </div>
            ))}
        </dl>
    );
}

function Panel({
    raffle,
    mio,
    session,
    alCambiar,
    alComprarTickets,
}: {
    raffle: Raffle;
    mio: MiRaffles | null;
    session: Session;
    alCambiar: () => void;
    alComprarTickets: () => void;
}) {
    const ahora = useAhora();
    const resta = raffle.endsAt ? Date.parse(raffle.endsAt) - ahora : null;
    const sorteado = raffle.status === 'drawn';
    const cerrado = sorteado || raffle.status === 'drawing' || (resta !== null && resta <= 0);

    return (
        <aside
            aria-label="Raffle"
            className="lg:row-span-2 lg:sticky lg:top-32 flex flex-col gap-5 sm:gap-6 min-w-0"
        >
            <section className={`${pastilla} p-6 sm:p-7 flex flex-col gap-5`}>
                <div className="flex flex-col gap-3 items-start">
                    <Estado raffle={raffle} />
                    <h1 className="font-accent uppercase text-yellow text-4xl sm:text-5xl leading-none pb-2 wrap-break-word">
                        {raffle.title}
                    </h1>
                </div>

                {!sorteado && (
                    <div className="flex flex-col gap-1 pt-4 border-t border-lightblue/12">
                        <span className="text-sm">{resta === null ? 'Closes' : cerrado ? 'Entries closed' : 'Closes in'}</span>
                        <span
                            className={`font-accent text-4xl sm:text-5xl leading-none pb-2 tabular-nums ${
                                resta !== null && resta > 0 && resta <= URGENTE ? 'text-red-300' : 'text-white'
                            }`}
                        >
                            {resta === null ? 'When drawn' : cerrado ? 'Drawing' : reloj(resta)}
                        </span>
                    </div>
                )}

                <div className="flex flex-col gap-2 pt-4 border-t border-lightblue/12">
                    <div className="flex items-baseline justify-between gap-3">
                        <span>
                            <span className="font-accent text-white text-3xl leading-none tabular-nums">{fog(raffle.totalEntries)}</span>
                            {raffle.maxEntries !== null && <span className="text-sm"> / {fog(raffle.maxEntries)} entries</span>}
                            {raffle.maxEntries === null && <span className="text-sm"> entries</span>}
                        </span>
                        <span className="text-sm">{jugadoresTexto(raffle.participants)}</span>
                    </div>
                    <BarraEntradas raffle={raffle} alto="h-2" />
                </div>

                {sorteado ? (
                    <Ganadores raffle={raffle} />
                ) : (
                    <Tuyo
                        raffle={raffle}
                        mio={mio}
                        session={session}
                        cerrado={cerrado}
                        alCambiar={alCambiar}
                        alComprarTickets={alComprarTickets}
                    />
                )}
            </section>
        </aside>
    );
}

function Tuyo({
    raffle,
    mio,
    session,
    cerrado,
    alCambiar,
    alComprarTickets,
}: {
    raffle: Raffle;
    mio: MiRaffles | null;
    session: Session;
    cerrado: boolean;
    alCambiar: () => void;
    alComprarTickets: () => void;
}) {
    const { open } = useAppKit();
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState<Aviso | null>(null);
    const mia = mio?.entries[raffle.id];

    if (!session.token || !mio) {
        const conectada = session.isConnected;
        return (
            <div className="flex flex-col gap-3 pt-4 border-t border-lightblue/12 items-start">
                <p className="text-sm">
                    {cerrado
                        ? 'Entries are closed. The winners will be drawn soon.'
                        : `One entry per wallet${raffle.holdersFree ? ', free for holders' : ''}. Raffle Tickets add more.`}
                </p>
                {!cerrado && (
                    <button
                        onClick={() => (conectada ? session.signIn() : open())}
                        disabled={session.status === 'signing'}
                        className={`${principal} ${deshabilitable}`}
                    >
                        {!conectada ? 'Connect wallet' : session.status === 'signing' ? 'Check your wallet' : 'Sign in to enter'}
                    </button>
                )}
            </div>
        );
    }

    const gratis = raffle.holdersFree && mio.holder === true;
    const soloHolders = !gratis && raffle.publicPrice === null;
    const precio = gratis ? 0 : (raffle.publicPrice ?? 0);
    const faltaFog = !gratis && !soloHolders && mio.balance < precio;
    const entradas = mia?.entries ?? 0;

    const entrarAhora = async () => {
        setOcupado(true);
        setAviso(null);
        try {
            await entrar(session.token!, raffle.id);
            alCambiar();
            setAviso({ ok: true, texto: "You're in. Good luck!" });
        } catch (err) {
            setAviso({ ok: false, texto: err instanceof Error ? err.message : 'Something went wrong.' });
        }
        setOcupado(false);
    };

    return (
        <div className="flex flex-col gap-4 pt-4 border-t border-lightblue/12">
            <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-3 sm:gap-4">
                <Dato label="Your FOG" valor={fog(mio.balance)} icono={ICONO_FOG_CHICO} />
                <Dato label="Your entries" valor={fog(entradas)} />
                <Dato label="Your odds" valor={odds(entradas, raffle.totalEntries)} />
            </div>

            {!cerrado && (
                <div className="flex flex-wrap items-center gap-3">
                    {mia?.base ? (
                        <button onClick={alComprarTickets} disabled={lleno(raffle)} className={`${principal} ${deshabilitable}`}>
                            {lleno(raffle) ? 'Raffle full' : 'Add Raffle Tickets'}
                        </button>
                    ) : (
                        <button
                            onClick={entrarAhora}
                            disabled={ocupado || soloHolders || faltaFog || lleno(raffle)}
                            className={`${principal} ${deshabilitable}`}
                        >
                            {ocupado
                                ? 'Entering...'
                                : lleno(raffle)
                                  ? 'Raffle full'
                                  : soloHolders
                                    ? 'Holders only'
                                    : precio === 0
                                      ? 'Enter for free'
                                      : `Enter for ${fog(precio)} FOG`}
                        </button>
                    )}
                    <a href="/shop" className={secundario}>
                        Buy FOG
                    </a>
                </div>
            )}

            {cerrado && <p className="text-sm">Entries are closed. The winners will be drawn soon.</p>}
            {!cerrado && faltaFog && <p className="text-sm">You need {fog(precio - mio.balance)} more FOG to enter.</p>}
            {!cerrado && soloHolders && <p className="text-sm">This raffle is only for wallets holding a Primal.</p>}
            {!cerrado && !mia?.base && !faltaFog && !soloHolders && (
                <p className="text-sm text-lightblue/70">
                    {gratis ? 'You hold a Primal, so your entry is free.' : 'One entry per wallet.'} Raffle Tickets add more.
                </p>
            )}
            {aviso && <Mensaje ok={aviso.ok} texto={aviso.texto} />}
        </div>
    );
}

function Ganadores({ raffle }: { raffle: Raffle }) {
    const apodos = useApodos();
    const avatares = useAvatares();
    const [primero, ...resto] = raffle.winners;
    const avatar = (w: string, clase: string) => (
        <span className={`${clase} shrink-0 rounded-lg overflow-hidden bg-blue`}>
            {avatares[w] && <img src={miniaturaPrimal(avatares[w], 192)} alt="" className="w-full h-full object-cover" />}
        </span>
    );

    if (!primero) {
        return <p className="pt-4 border-t border-lightblue/12">Nobody entered this raffle, so there is no winner.</p>;
    }

    return (
        <div className="flex flex-col gap-3 pt-4 border-t border-lightblue/12">
            <div className="rounded-xl bg-yellow text-darkblue p-5 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                    <span className="font-accent uppercase text-2xl leading-none pb-[0.38em]">Winner</span>
                    <span className="h-7 inline-flex items-center font-accent uppercase rounded-md bg-darkblue text-yellow px-2.5 pb-[0.38em] leading-none">
                        {primero.status === 'sent' ? 'Prize delivered' : 'Delivery pending'}
                    </span>
                </div>
                <a href={`/holder/${primero.wallet}`} className="group flex items-center gap-4 min-w-0">
                    {avatar(primero.wallet, 'size-16 sm:size-20')}
                    <span className="flex flex-col gap-1.5 min-w-0">
                        <span className="font-accent text-3xl leading-none pb-[0.38em] wrap-break-word group-hover:underline underline-offset-4">
                            {nombreWallet(primero.wallet, apodos)}
                        </span>
                        <span className="text-sm">
                            {primero.prize}: {entradasTexto(primero.entries)}, {odds(primero.entries, raffle.totalEntries)} chance
                        </span>
                    </span>
                </a>
            </div>
            {resto.length > 0 && (
                <ul className="flex flex-col">
                    {resto.map((w) => (
                        <li key={w.slot} className="flex items-center gap-3 py-2.5 border-b border-lightblue/12 last:border-0 text-sm">
                            <span className="w-9 shrink-0 font-accent uppercase text-yellow leading-none pb-1">{puesto(w.slot)}</span>
                            <span className="flex-1 min-w-0 truncate text-white">{w.prize}</span>
                            <a href={`/holder/${w.wallet}`} className="shrink-0 inline-flex items-center gap-2 hover:text-yellow transition-all duration-300">
                                {avatar(w.wallet, 'size-7')}
                                {nombreWallet(w.wallet, apodos)}
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function Participantes({ raffle, miWallet }: { raffle: RaffleDetalle; miWallet?: string }) {
    const apodos = useApodos();
    const avatares = useAvatares();
    const yo = miWallet?.toLowerCase();
    const ganadores = new Map(raffle.winners.map((w) => [w.wallet, w.slot]));

    return (
        <section className={`${card} flex flex-col gap-5 min-w-0`}>
            <div className="flex items-baseline justify-between gap-3">
                <h2 className={tituloCard}>Players</h2>
                <span className="text-xs sm:text-sm text-lightblue/60">{jugadoresTexto(raffle.entrants.length)}</span>
            </div>
            {raffle.entrants.length === 0 ? (
                <p>No one has entered yet. Be the first.</p>
            ) : (
                <ol data-scroll-propio className="flex flex-col gap-2 max-h-136 overflow-y-auto overscroll-contain pr-2">
                    {raffle.entrants.map((p, i) => {
                        const gano = ganadores.get(p.wallet);
                        const soy = p.wallet === yo;
                        const avatar = avatares[p.wallet];
                        return (
                            <li key={p.wallet}>
                                <a
                                    href={`/holder/${p.wallet}`}
                                    className={`group flex items-center gap-2.5 sm:gap-4 rounded-xl border px-3 sm:px-4 py-2.5 transition-all duration-300 hover:border-yellow/60 ${
                                        gano !== undefined ? 'border-yellow/40 bg-yellow/10' : 'border-lightblue/10 bg-lightblue/5'
                                    }`}
                                >
                                    <span className="w-7 sm:w-8 shrink-0 text-center font-accent text-base sm:text-lg pb-1 text-lightblue/60">
                                        #{i + 1}
                                    </span>
                                    <span className="size-10 sm:size-12 shrink-0 rounded-lg overflow-hidden bg-blue">
                                        {avatar && (
                                            <img src={miniaturaPrimal(avatar, 96)} alt="" loading="lazy" className="w-full h-full object-cover" />
                                        )}
                                    </span>
                                    <span className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                        {apodos[p.wallet] || soy ? (
                                            <span className="flex flex-col min-w-0">
                                                <span className="font-accent text-lg text-lightblue leading-none pb-1 truncate group-hover:text-yellow transition-all duration-300">
                                                    {soy ? 'You' : apodos[p.wallet]}
                                                </span>
                                                <span className="hidden sm:block font-mono text-xs text-lightblue/50">{walletCorta(p.wallet)}</span>
                                            </span>
                                        ) : (
                                            <span className="font-mono text-sm text-lightblue truncate group-hover:text-yellow transition-all duration-300">
                                                {walletCorta(p.wallet)}
                                            </span>
                                        )}
                                        {gano !== undefined && (
                                            <span className="w-fit font-accent uppercase text-xs rounded-md bg-yellow text-darkblue px-2 pb-1.5 leading-none">
                                                Won {puesto(gano)}
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex flex-col items-end shrink-0">
                                        <span className="font-accent text-xl text-yellow leading-none pb-1">{fog(p.entries)}</span>
                                        <span className="text-xs text-lightblue/60">{odds(p.entries, raffle.totalEntries)}</span>
                                    </span>
                                </a>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}
