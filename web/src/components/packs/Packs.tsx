import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import { PiFireFill } from 'react-icons/pi';
import { conectarYFirmar, useSesionDe, useWalletActual } from '@/lib/sesion';
import {
    esperarConfirmacion,
    pagoSinInformar,
    recordar,
    transferir,
} from '@/components/forge/pago';
import CompraCompleta from '@/components/shared/CompraCompleta';
import { EVENTO_NICKNAME, walletCorta } from '@/lib/nicknames';
import {
    CARTAS,
    IMAGEN_PACK,
    ORDEN_RAREZAS,
    RAREZAS,
    abrirPack,
    acreditarExtra,
    aplicarConfig,
    cartaPorId,
    chanceCarta,
    formatoChance,
    guardarSolana,
    hacerUpgrade,
    configCompartida,
    leerMio,
    leerRanking,
    packDePrueba,
    recuperarExtras,
    registrarse,
    ErrorPacks,
    type CartaPack,
    type ConfigPacks,
    type FilaChosen,
    type MiPacks,
    type Ranking,
    type Nivel,
    type ResultadoUpgrade,
    type TipoUpgrade,
} from '@/lib/packs';
import Sobre from './Sobre';
import { Dorso, Frente } from './Carta';
import DetalleCarta from './DetalleCarta';
import PacksDesbloqueados from './PacksDesbloqueados';
import Upgrades from './Upgrades';
import UpgradeHecho from './UpgradeHecho';
import { despertar } from './sonidos';
import { CSS } from './cssMudwater';

const cargar3D = () => import('./Apertura3D');
const Apertura3D = lazy(cargar3D);
const precargar3D = () => cargar3D().then((m) => m.precalentar());

const panel = 'mw-marco rounded-xl bg-black/70 p-5 sm:p-6';
const subtitulo = 'mw-titulo uppercase text-mw-champagne text-xl sm:text-2xl';
const botonPrincipal =
    'mw-boton-brillo mw-titulo uppercase text-black text-lg rounded-md px-9 py-3 tracking-wider cursor-pointer hover:scale-105 active:scale-97 transition-all duration-300 disabled:cursor-not-allowed disabled:hover:scale-100';
const entrada =
    'w-full rounded-md bg-black border border-mw-champagne/40 px-3 py-2 text-lg text-mw-mist placeholder:text-mw-fog focus:border-mw-champagne outline-none transition-all duration-300';

function Reinicio() {
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setAhora(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);
    const fin = new Date(ahora);
    fin.setUTCHours(24, 0, 0, 0);
    const s = Math.max(0, Math.floor((fin.getTime() - ahora) / 1000));
    const dos = (n: number) => String(n).padStart(2, '0');
    return (
        <Digitos
            texto={`${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`}
        />
    );
}

function Digitos({ texto }: { texto: string }) {
    return (
        <>
            {[...texto].map((c, i) => (
                <span
                    key={i}
                    className={
                        c === ':' ? '' : 'inline-block w-[0.62em] text-center'
                    }
                >
                    {c}
                </span>
            ))}
        </>
    );
}

const dias = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const puesto = (n: number) =>
    `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

function MarcaChosen({ fila }: { fila?: FilaChosen }) {
    if (!fila) return null;
    const texto = fila.winner
        ? 'Pulled The Chosen · Raffle winner'
        : 'Pulled The Chosen';
    return (
        <span
            title={texto}
            aria-label={texto}
            className={`size-2.5 shrink-0 rotate-45 bg-[#ffe27a] ${fila.winner ? 'shadow-[0_0_10px_rgb(255_226_122/0.9)] ring-2 ring-[#ffe27a]/40' : ''}`}
        />
    );
}

function Racha({ dias, hoy }: { dias: number; hoy: boolean }) {
    if (!dias) return <span className="w-12 shrink-0" />;
    const texto = `${dias}-day streak${hoy ? '' : " · hasn't ripped today"}`;
    return (
        <span
            title={texto}
            aria-label={texto}
            className={`w-12 shrink-0 flex items-center justify-end gap-1 leading-none transition-all duration-300 ${hoy ? 'text-mw-champagne' : 'text-mw-fog/60'}`}
        >
            <PiFireFill className="size-4 shrink-0" />
            <span className="mw-titulo text-base tabular-nums">{dias}</span>
        </span>
    );
}

const NIVELES: { id: Nivel; nombre: string }[] = [
    { id: 'none', nombre: 'everyone' },
    { id: 'holder', nombre: 'holders' },
    { id: 'staker', nombre: 'stakers' },
];
const PAGO_EXTRA = 'packs:extra';
const INTENTO_EXTRA = 'packs:extra-intento';
const DIA_MS = 86_400_000;

function intentoDe(wallet: string) {
    try {
        return (
            Number(
                localStorage.getItem(`${INTENTO_EXTRA}:${wallet.toLowerCase()}`)
            ) || 0
        );
    } catch {
        return 0;
    }
}

function marcarIntento(wallet: string, activo: boolean) {
    try {
        const clave = `${INTENTO_EXTRA}:${wallet.toLowerCase()}`;
        if (activo) localStorage.setItem(clave, String(Date.now()));
        else localStorage.removeItem(clave);
    } catch {
        /* storage bloqueado */
    }
}

const PREMIO_META = 'packs:premio-meta';
const claveMeta = (wallet: string) =>
    `${PREMIO_META}:${wallet.toLowerCase()}:${new Date().toISOString().slice(0, 10)}`;

function premioVisto(wallet: string) {
    try {
        return localStorage.getItem(claveMeta(wallet)) === '1';
    } catch {
        return false;
    }
}

function marcarPremioVisto(wallet: string) {
    try {
        localStorage.setItem(claveMeta(wallet), '1');
    } catch {
        /* storage bloqueado */
    }
}

export default function Packs() {
    const address = useWalletActual();
    const isConnected = !!address;
    const session = useSesionDe(address);
    const [conectando, setConectando] = useState(false);
    const [config, setConfig] = useState<ConfigPacks | null>(null);
    const [fallo, setFallo] = useState(false);
    const [mio, setMio] = useState<MiPacks | null>(null);
    const [ranking, setRanking] = useState<Ranking | null>(null);
    const [apertura, setApertura] = useState<{
        id: string;
        cartas: CartaPack[];
        nuevas?: boolean[];
        completo?: boolean;
        prueba?: boolean;
    } | null>(null);
    const [abriendo, setAbriendo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detalle, setDetalle] = useState<CartaPack | null>(null);
    const [desbloqueado, setDesbloqueado] = useState<Nivel | null>(null);
    const [comprando, setComprando] = useState<string | null>(null);
    const [extraComprado, setExtraComprado] = useState(false);
    const [premioMeta, setPremioMeta] = useState(false);
    const [upgradeHecho, setUpgradeHecho] = useState<{
        carta: CartaPack;
        nueva: boolean;
        completo: boolean;
    } | null>(null);
    useEffect(() => {
        const fuentes = Promise.race([
            Promise.all([
                document.fonts.load('700 1em gardein'),
                document.fonts.load('400 1em acme-gothic-condensed'),
                document.fonts.load('700 1em acme-gothic-extrawide'),
            ]),
            new Promise((ok) => setTimeout(ok, 2500)),
        ]).catch(() => {});
        Promise.all([configCompartida(), fuentes])
            .then(([c]) => {
                aplicarConfig(c);
                setConfig(c);
            })
            .catch(() => setFallo(true));
        const ocioso =
            window.requestIdleCallback ??
            ((f: () => void) => setTimeout(f, 2000));
        const precargar = () => ocioso(() => precargar3D().catch(() => {}));
        if (document.readyState === 'complete') precargar();
        else window.addEventListener('load', precargar, { once: true });
    }, []);

    const entrar = async () => {
        setConectando(true);
        try {
            await conectarYFirmar();
        } finally {
            setConectando(false);
        }
    };

    const recargarRanking = useCallback(() => {
        leerRanking()
            .then(setRanking)
            .catch(() => {});
    }, []);
    useEffect(recargarRanking, [recargarRanking]);

    useEffect(() => {
        setMio(null);
        if (!session.token) return;
        let cancelado = false;
        leerMio(session.token)
            .then((m) => !cancelado && setMio(m))
            .catch(() => {});
        const t = setInterval(() => {
            if (document.hidden) return;
            leerMio(session.token!)
                .then((m) => !cancelado && setMio(m))
                .catch(() => {});
        }, 60_000);
        return () => {
            cancelado = true;
            clearInterval(t);
        };
    }, [session.token]);

    useEffect(() => {
        if (
            mio?.goalRewardToday &&
            address &&
            !apertura &&
            !premioVisto(address)
        ) {
            marcarPremioVisto(address);
            setPremioMeta(true);
        }
    }, [mio, address, apertura]);

    useEffect(() => {
        if (!session.token || !address) return;
        const hash = pagoSinInformar(address, PAGO_EXTRA);
        if (hash) {
            acreditarExtra(session.token, hash)
                .then((m) => {
                    recordar(address, null, PAGO_EXTRA);
                    marcarIntento(address, false);
                    setMio(m);
                    setExtraComprado(true);
                })
                .catch((e) => {
                    if (e instanceof ErrorPacks && e.reason)
                        recordar(address, null, PAGO_EXTRA);
                });
            return;
        }
        const intento = intentoDe(address);
        if (!intento) return;
        if (Date.now() - intento > DIA_MS) {
            marcarIntento(address, false);
            return;
        }
        recuperarExtras(session.token)
            .then(({ recovered, me }) => {
                setMio(me);
                if (recovered) {
                    marcarIntento(address, false);
                    setExtraComprado(true);
                }
            })
            .catch(() => {});
    }, [session.token, address]);

    const [buscandoPago, setBuscandoPago] = useState(false);
    const buscarPago = async () => {
        if (!session.token || !address || buscandoPago) return;
        setError(null);
        setBuscandoPago(true);
        try {
            const { recovered, me } = await recuperarExtras(session.token);
            setMio(me);
            if (recovered) {
                marcarIntento(address, false);
                setExtraComprado(true);
            } else
                setError(
                    "We didn't find a payment missing its pack. If you just paid, wait a minute and check again."
                );
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBuscandoPago(false);
        }
    };

    const restantes = mio
        ? Math.max(0, mio.limit - mio.openedToday) + (mio.bonusPacks ?? 0)
        : 0;

    const comprarExtra = async () => {
        if (!config?.extra || comprando) return;
        setError(null);
        setComprando('Confirm in your wallet...');
        try {
            const token = session.token ?? (await conectarYFirmar());
            if (!token || !address) return;
            const cobro = { required: true as const, ...config.extra };
            marcarIntento(address, true);
            const hash = await transferir(cobro, PAGO_EXTRA);
            setComprando('Confirming payment...');
            await esperarConfirmacion(cobro, hash);
            const me = await acreditarExtra(token, hash);
            recordar(address, null, PAGO_EXTRA);
            marcarIntento(address, false);
            setMio(me);
            setExtraComprado(true);
        } catch (e) {
            if (address && (e as Error).message === 'Payment cancelled.')
                marcarIntento(address, false);
            setError((e as Error).message);
        } finally {
            setComprando(null);
        }
    };

    const abrir = async () => {
        if (!session.token || abriendo) return;
        despertar();
        setError(null);
        setAbriendo(true);
        try {
            const antes = mio?.collection ?? {};
            const { pack, me } = await abrirPack(session.token);
            const vistas = new Set<number>();
            const nuevas = pack.cards.map((id) => {
                const nueva = !antes[id] && !vistas.has(id);
                vistas.add(id);
                return nueva;
            });
            setMio(me);
            setApertura({
                id: pack.id,
                cartas: pack.cards.map(cartaPorId),
                nuevas,
                completo: !!me.collectionComplete && !mio?.collectionComplete,
            });
        } catch (e) {
            setError((e as Error).message);
            leerMio(session.token)
                .then(setMio)
                .catch(() => {});
        } finally {
            setAbriendo(false);
        }
    };

    const upgradear = (tipo: TipoUpgrade, cartas: number[]) =>
        hacerUpgrade(session.token!, tipo, cartas);

    const upgradeListo = ({ upgrade, me }: ResultadoUpgrade) => {
        setUpgradeHecho({
            carta: cartaPorId(upgrade.card),
            nueva: upgrade.new,
            completo: !!me.collectionComplete && !mio?.collectionComplete,
        });
        setMio(me);
    };

    const terminar = (otro: boolean) => {
        setApertura(null);
        recargarRanking();
        if (otro) abrir();
    };

    if (fallo)
        return (
            <main className="mw-texto w-full text-mw-mist py-24 text-center text-xl">
                <style>{CSS}</style>
                Couldn't load the packs. Refresh the page to try again.
            </main>
        );
    if (!config)
        return (
            <main className="w-full min-h-[60vh]">
                <style>{CSS}</style>
            </main>
        );

    const coleccion = mio?.collection ?? {};
    const paraCompletar = CARTAS.filter((c) => c.rareza !== 'chosen');
    const encontradas = paraCompletar.filter((c) => coleccion[c.id]).length;
    const chosen = CARTAS.filter((c) => c.rareza === 'chosen');
    const premioColeccion = config.collectionPrize ?? null;
    const mejor = CARTAS.filter((c) => coleccion[c.id]).sort(
        (a, b) => RAREZAS[b.rareza].tier - RAREZAS[a.rareza].tier
    )[0];
    const yo = address?.toLowerCase();
    const conChosen = new Map(ranking?.chosen.map((c) => [c.wallet, c]));
    const premios = config.prizes ?? [];
    const total = mio ? mio.limit + (mio.bonusPacks ?? 0) : config.tiers.none;
    const extra = config.extra;
    const puedeExtra =
        !!extra &&
        config.status === 'open' &&
        !!mio?.registered &&
        !mio.disqualified &&
        restantes === 0 &&
        mio.extrasToday < extra.max;

    let accion: { texto: ReactNode; alTocar?: () => void } | null = null;
    if (config.status === 'ended') accion = { texto: 'Competition over' };
    else if (conectando || session.status === 'signing')
        accion = { texto: 'Check your wallet...' };
    else if (isConnected && session.status === 'needs-signature')
        accion = { texto: 'Sign in', alTocar: entrar };
    else if (config.status === 'upcoming') accion = { texto: 'Opening soon' };
    else if (!isConnected)
        accion = { texto: 'Connect wallet', alTocar: entrar };
    else if (session.status === 'needs-signature')
        accion = { texto: 'Sign in to play', alTocar: entrar };
    else if (!mio) accion = { texto: 'Loading...' };
    else if (mio.disqualified) accion = { texto: 'Wallet disqualified' };
    else if (mio.registered)
        accion =
            restantes === 0
                ? {
                      texto: (
                          <>
                              New packs in <Reinicio />
                          </>
                      ),
                  }
                : {
                      texto: abriendo ? 'Ripping...' : 'Rip pack',
                      alTocar: abrir,
                  };

    return (
        <main className="mw-texto w-full text-mw-mist flex flex-col gap-12 sm:gap-16">
            <style>{CSS}</style>

            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
                <div>
                    <p className="mw-etiqueta text-sm sm:text-base mw-brass-texto">
                        Primal Cult × Mudwater
                    </p>
                    <h1 className="mw-titulo uppercase text-mw-mist text-5xl sm:text-7xl leading-none mt-3">
                        Rip your packs
                    </h1>
                    <p className="text-lg sm:text-xl text-mw-mist/75 max-w-2xl mt-4">
                        Open free Primal Cult packs every day:{' '}
                        {config.tiers.none} for everyone, {config.tiers.holder}{' '}
                        if you hold a Primal and {config.tiers.staker} if you
                        have Primals staked. Rarer pulls score more points, and
                        the top of the leaderboard wins real Mudwater packs.
                    </p>
                </div>
                <div className={`${panel} flex items-center gap-6 shrink-0`}>
                    <div>
                        <p className="mw-etiqueta text-xs text-mw-fog">
                            Packs today
                        </p>
                        <p className="mw-titulo text-mw-champagne text-5xl leading-none mt-2 tabular-nums">
                            {mio ? restantes : '–'}
                            {mio && (
                                <span className="text-mw-fog text-2xl">
                                    /{total}
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="border-l border-mw-champagne/30 pl-6 text-sm uppercase tracking-wider flex flex-col gap-1">
                        {NIVELES.map((n) => (
                            <span
                                key={n.id}
                                className={
                                    mio?.tier === n.id
                                        ? 'text-mw-champagne'
                                        : 'text-mw-fog'
                                }
                            >
                                {config.tiers[n.id]} for {n.nombre}
                            </span>
                        ))}
                        {!!mio?.extrasToday && (
                            <span className="text-mw-champagne">
                                +{mio.extrasToday} extra today
                            </span>
                        )}
                        {!!mio?.bonusPacks && (
                            <span className="text-mw-champagne">
                                +{mio.bonusPacks} bonus{' '}
                                {mio.bonusPacks === 1 ? 'pack' : 'packs'}
                            </span>
                        )}
                        <span className="text-mw-fog">
                            Resets in <Reinicio />
                        </span>
                        {config.endsAt && config.status === 'open' && (
                            <span className="text-mw-fog">
                                Ends{' '}
                                {new Date(config.endsAt).toLocaleDateString(
                                    'en-US',
                                    { month: 'short', day: 'numeric' }
                                )}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <section className="relative flex flex-col items-center gap-8 min-h-136 justify-center">
                <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgb(174_163_93/0.14),transparent_65%)]" />
                <Sobre className="w-52 sm:w-60 aspect-2212/3490" />
                {mio &&
                !mio.registered &&
                !mio.disqualified &&
                config.status === 'open' ? (
                    <Registro
                        mio={mio}
                        token={session.token!}
                        alGuardar={(m) => {
                            setMio(m);
                            if (m.tier) setDesbloqueado(m.tier);
                            if (address && m.nickname)
                                window.dispatchEvent(
                                    new CustomEvent(EVENTO_NICKNAME, {
                                        detail: {
                                            address,
                                            nickname: m.nickname,
                                        },
                                    })
                                );
                        }}
                    />
                ) : (
                    accion && (
                        <div className="flex flex-col items-center gap-4">
                            <div className="flex flex-wrap items-center justify-center gap-4">
                                <button
                                    type="button"
                                    onClick={accion.alTocar}
                                    onPointerEnter={() =>
                                        precargar3D().catch(() => {})
                                    }
                                    disabled={!accion.alTocar || abriendo}
                                    className={botonPrincipal}
                                >
                                    <span
                                        className="mw-boton-reflejo"
                                        aria-hidden="true"
                                    />
                                    <span className="relative">
                                        {accion.texto}
                                    </span>
                                </button>
                                {puedeExtra && (
                                    <button
                                        type="button"
                                        onClick={comprarExtra}
                                        disabled={!!comprando}
                                        className="mw-marco mw-titulo uppercase text-mw-champagne text-lg rounded-md px-7 py-3 tracking-wider bg-black cursor-pointer hover:scale-105 active:scale-97 disabled:cursor-wait disabled:hover:scale-100 transition-all duration-300"
                                    >
                                        {comprando ??
                                            `1 Extra Pack: ${extra.price} APE`}
                                    </button>
                                )}
                            </div>
                            {puedeExtra && (
                                <p className="text-mw-fog text-center max-w-md">
                                    Extra packs are only for today: they don't
                                    carry over, and you can buy up to{' '}
                                    {extra.max} every day ({mio.extrasToday}/
                                    {extra.max} today).
                                    {extra.boost > 0 &&
                                        ` They have ${extra.boost}% more chance of Rare, Epic and Legendary cards.`}
                                </p>
                            )}
                            {extra &&
                                config.status === 'open' &&
                                mio?.registered &&
                                !mio.disqualified &&
                                restantes === 0 && (
                                    <button
                                        type="button"
                                        onClick={buscarPago}
                                        disabled={buscandoPago}
                                        className="text-mw-fog underline underline-offset-4 cursor-pointer hover:text-mw-champagne disabled:cursor-wait transition-all duration-300"
                                    >
                                        {buscandoPago
                                            ? 'Checking your payments...'
                                            : "Paid and didn't get your pack? Check my payment"}
                                    </button>
                                )}
                        </div>
                    )
                )}
                {(error || session.error) && (
                    <p className="text-mw-champagne text-lg text-center">
                        {error || session.error}
                    </p>
                )}
                {mio?.chosenEntered && !mio.chosenWinner && (
                    <p className="text-mw-champagne text-lg text-center max-w-md">
                        You pulled The Chosen: you're in the raffle for a
                        Mudwater pack.
                    </p>
                )}
                {(mio?.chosenWinner ||
                    (config.status === 'ended' && mio?.winner)) &&
                    session.token && (
                        <Ganador
                            mio={mio}
                            token={session.token}
                            alGuardar={setMio}
                        />
                    )}
                {import.meta.env.DEV && (
                    <button
                        type="button"
                        onClick={() => {
                            despertar();
                            setApertura({
                                id: String(Date.now()),
                                cartas: packDePrueba(),
                                nuevas: [true, false, true, false, true],
                                prueba: true,
                            });
                        }}
                        className="mw-titulo uppercase text-sm rounded-md px-3 py-1.5 border border-dashed border-mw-champagne/40 text-mw-champagne cursor-pointer hover:border-mw-champagne transition-all duration-300"
                    >
                        Test pack: all rarities (dev)
                    </button>
                )}
                {import.meta.env.DEV && (
                    <button
                        type="button"
                        onClick={() => {
                            despertar();
                            const faltante =
                                paraCompletar.find((c) => !coleccion[c.id]) ??
                                paraCompletar[0];
                            const resto = packDePrueba()
                                .filter((c) => c.rareza !== 'chosen')
                                .slice(0, 4);
                            setApertura({
                                id: String(Date.now()),
                                cartas: [...resto, faltante],
                                nuevas: [false, false, false, false, true],
                                completo: true,
                                prueba: true,
                            });
                        }}
                        className="mw-titulo uppercase text-sm rounded-md px-3 py-1.5 border border-dashed border-mw-champagne/40 text-mw-champagne cursor-pointer hover:border-mw-champagne transition-all duration-300"
                    >
                        Test pack: completes the collection (dev)
                    </button>
                )}
                {apertura && (
                    <Suspense fallback={null}>
                        <Apertura3D
                            key={apertura.id}
                            cartas={apertura.cartas}
                            nuevas={apertura.nuevas}
                            completo={apertura.completo}
                            premioColeccion={premioColeccion}
                            compartir={apertura.prueba ? null : apertura.id}
                            quedan={restantes}
                            onFin={terminar}
                        />
                    </Suspense>
                )}
            </section>

            <div className="grid lg:grid-cols-3 gap-6">
                <section className={`${panel} lg:col-span-2 flex flex-col`}>
                    <div className="flex items-baseline justify-between gap-4">
                        <h2 className={subtitulo}>Leaderboard</h2>
                        {ranking && ranking.players > 0 && (
                            <span className="text-sm uppercase tracking-wider text-mw-fog">
                                Top {ranking.limit ?? 100} ·{' '}
                                {ranking.players.toLocaleString('en-US')}{' '}
                                {ranking.players === 1 ? 'player' : 'players'}
                            </span>
                        )}
                    </div>
                    {ranking && ranking.top.length === 0 && (
                        <p className="mt-5 text-lg text-mw-mist/70">
                            No packs opened yet. The first rip takes the top
                            spot.
                        </p>
                    )}
                    <ol
                        data-lenis-prevent
                        className="mt-5 -mx-3 px-3 flex flex-col max-h-130 lg:max-h-none lg:min-h-100 lg:grow lg:basis-0 overflow-y-auto overscroll-contain scrollbar-thin [scrollbar-color:var(--color-mw-champagne)_transparent]"
                    >
                        {ranking?.top.map((f) =>
                            f.rank === 1 ? (
                                <li
                                    key={f.wallet}
                                    className="flex items-center gap-4 -mx-3 px-3 py-3 mb-1 rounded-lg bg-mw-champagne/10 border border-mw-champagne/40"
                                >
                                    <span className="mw-titulo w-8 tabular-nums mw-brass-texto">
                                        1
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-2.5 text-lg text-mw-mist">
                                            <span className="truncate">
                                                {f.nickname ??
                                                    walletCorta(f.wallet)}
                                                {f.wallet === yo && (
                                                    <span className="text-mw-fog">
                                                        {' '}
                                                        (you)
                                                    </span>
                                                )}
                                            </span>
                                            <MarcaChosen
                                                fila={conChosen.get(f.wallet)}
                                            />
                                        </span>
                                        <span className="mw-etiqueta block text-[10px] text-mw-champagne">
                                            {config.status === 'ended'
                                                ? '1st place'
                                                : 'Leading'}{' '}
                                            ·{' '}
                                            <span className="hidden sm:inline">
                                                Prize:{' '}
                                            </span>
                                            {premios[0] ?? 'Mudwater pack'}
                                        </span>
                                    </span>
                                    <Racha dias={f.streak} hoy={!!f.today} />
                                    <img
                                        src="/packs/mudlogo.webp"
                                        alt="Mudwater"
                                        className="hidden sm:block h-9 w-auto shrink-0 drop-shadow-[0_0_12px_rgb(174_163_93/0.35)]"
                                    />
                                    <span className="tabular-nums text-lg mw-brass-texto">
                                        {f.points.toLocaleString('en-US')}
                                    </span>
                                </li>
                            ) : (
                                <li
                                    key={f.wallet}
                                    className={`flex items-center gap-4 py-2.5 border-b border-mw-champagne/15 last:border-0 ${f.wallet === yo ? 'text-mw-champagne' : ''}`}
                                >
                                    <span
                                        className={`mw-titulo w-8 tabular-nums ${premios[f.rank - 1] ? 'text-mw-champagne' : 'text-mw-fog'}`}
                                    >
                                        {f.rank}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-2.5 text-lg">
                                            <span className="truncate relative -top-px">
                                                {f.nickname ??
                                                    walletCorta(f.wallet)}
                                            </span>
                                            <MarcaChosen
                                                fila={conChosen.get(f.wallet)}
                                            />
                                        </span>
                                        {premios[f.rank - 1] && (
                                            <span className="mw-etiqueta block truncate text-[10px] text-mw-champagne">
                                                <span className="hidden sm:inline">
                                                    Prize:{' '}
                                                </span>
                                                {premios[f.rank - 1]}
                                            </span>
                                        )}
                                    </span>
                                    <Racha dias={f.streak} hoy={!!f.today} />
                                    <span className="tabular-nums text-lg relative -top-px">
                                        {f.points.toLocaleString('en-US')}
                                    </span>
                                </li>
                            )
                        )}
                    </ol>
                    {mio?.rank && mio.rank > 10 && (
                        <p className="mt-3 pt-3 border-t border-mw-champagne/30 flex items-center gap-4 text-mw-champagne">
                            <span className="mw-titulo w-8 tabular-nums">
                                {mio.rank}
                            </span>
                            <span className="flex-1 min-w-0 flex items-center gap-2.5 text-lg">
                                <span className="truncate relative -top-px">
                                    {mio.nickname ?? 'You'}
                                </span>
                                {yo && <MarcaChosen fila={conChosen.get(yo)} />}
                            </span>
                            <Racha
                                dias={mio.streak.current}
                                hoy={
                                    mio.openedToday > 0 ||
                                    ranking?.top.some(
                                        (f) => f.wallet === yo && f.today
                                    ) === true
                                }
                            />
                            <span className="tabular-nums text-lg relative -top-px">
                                {mio.points.toLocaleString('en-US')}
                            </span>
                        </p>
                    )}
                </section>

                <section className={`${panel} flex flex-col gap-6`}>
                    <h2 className={subtitulo}>Your run</h2>
                    {mio ? (
                        <dl className="grid grid-cols-2 gap-5">
                            {[
                                ['Points', mio.points.toLocaleString('en-US')],
                                ['Rank', mio.rank ? `#${mio.rank}` : '—'],
                                ['Packs opened', mio.packs],
                                [
                                    'Cards found',
                                    `${encontradas}/${paraCompletar.length}`,
                                ],
                                ['Streak', dias(mio.streak.current)],
                                ['Best streak', dias(mio.streak.best)],
                            ].map(([nombre, valor]) => (
                                <div key={nombre}>
                                    <dt className="mw-etiqueta text-[10px] text-mw-fog">
                                        {nombre}
                                    </dt>
                                    <dd className="mw-titulo text-3xl text-mw-mist mt-1 tabular-nums">
                                        {valor}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <p className="text-lg text-mw-mist/70">
                            Connect your wallet to see your points, rank and
                            collection.
                        </p>
                    )}
                    {mejor && (
                        <div className="flex items-center gap-4">
                            <div className="w-16 shrink-0 aspect-1621/2250">
                                <Frente carta={mejor} chica />
                            </div>
                            <div>
                                <p className="mw-etiqueta text-[10px] text-mw-fog">
                                    Best pull
                                </p>
                                <p className="mw-titulo text-mw-champagne text-lg mt-1">
                                    {mejor.nombre}
                                </p>
                            </div>
                        </div>
                    )}
                    {ranking && (
                        <div className="border-t border-mw-champagne/20 pt-5">
                            <p className="mw-etiqueta text-[10px] text-mw-fog">
                                Pulled The Chosen
                            </p>
                            {ranking.chosen.length === 0 ? (
                                <p className="mt-2 text-mw-mist/70">
                                    Nobody has pulled The Chosen yet.
                                </p>
                            ) : (
                                <ul className="mt-2 flex flex-col gap-1.5">
                                    {ranking.chosen.map((c) => (
                                        <li
                                            key={c.wallet}
                                            className="flex items-center gap-3"
                                        >
                                            <span
                                                className={`flex-1 truncate text-lg ${c.winner ? 'text-[#ffe27a]' : c.wallet === yo ? 'text-mw-champagne' : 'text-mw-mist'}`}
                                            >
                                                {c.nickname ??
                                                    walletCorta(c.wallet)}
                                            </span>
                                            {c.winner ? (
                                                <span className="mw-etiqueta text-[10px] text-black bg-[#ffe27a] rounded-full px-2.5 py-0.5">
                                                    Raffle winner
                                                </span>
                                            ) : (
                                                <span className="text-sm text-mw-fog tabular-nums">
                                                    {new Date(
                                                        c.firstAt
                                                    ).toLocaleDateString(
                                                        'en-US',
                                                        {
                                                            month: 'short',
                                                            day: 'numeric',
                                                        }
                                                    )}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                    <div className="mt-auto border-t border-mw-champagne/20 pt-5">
                        <p className="mw-etiqueta text-[10px] text-mw-fog">
                            Prizes
                        </p>
                        {premios.length > 0 && (
                            <ol className="mt-2 flex flex-col gap-1">
                                {premios.map((p, i) => (
                                    <li key={i} className="flex gap-3">
                                        <span className="mw-titulo w-10 shrink-0 text-mw-champagne tabular-nums">
                                            {puesto(i + 1)}
                                        </span>
                                        <span className="text-mw-mist">
                                            {p}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        )}
                        {premioColeccion && (
                            <p className="mt-3 pt-3 border-t border-mw-champagne/15 flex gap-3">
                                <span className="mw-titulo shrink-0 text-mw-champagne">
                                    {paraCompletar.length}/
                                    {paraCompletar.length}
                                </span>
                                <span className="text-mw-mist">
                                    Raffle for {premioColeccion} among everyone
                                    who completes the collection
                                </span>
                            </p>
                        )}
                        <p className="mt-3 text-sm text-mw-fog">
                            {premios.length > 0
                                ? 'Paid out when the competition ends.'
                                : 'The #1 wins a Mudwater pack when the competition ends.'}{' '}
                            Bots are disqualified.
                        </p>
                    </div>
                </section>
            </div>

            {config.upgrades && config.status !== 'ended' && (
                <Upgrades
                    upgrades={config.upgrades}
                    coleccion={coleccion}
                    activo={
                        config.status === 'open' &&
                        !!session.token &&
                        !!mio?.registered &&
                        !mio.disqualified
                    }
                    onUpgrade={upgradear}
                    onListo={upgradeListo}
                />
            )}

            <section className="flex flex-col gap-8">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <h2 className="mw-titulo uppercase text-mw-mist text-3xl sm:text-4xl">
                            Collection
                        </h2>
                        {premioColeccion && (
                            <p className="text-lg text-mw-mist/75 mt-2">
                                {mio?.collectionComplete
                                    ? `Complete! You're in the raffle for ${premioColeccion}.`
                                    : `Find all ${paraCompletar.length} cards to enter the raffle for ${premioColeccion}.`}
                            </p>
                        )}
                    </div>
                    <span className="mw-titulo text-mw-champagne text-xl tabular-nums shrink-0">
                        {mio?.collectionComplete
                            ? 'Complete'
                            : `${encontradas}/${paraCompletar.length}`}
                    </span>
                </div>
                {[
                    'chosen' as const,
                    ...ORDEN_RAREZAS.filter((r) => r !== 'chosen'),
                ].map((r) => {
                    const cartas =
                        r === 'chosen'
                            ? chosen
                            : paraCompletar.filter((c) => c.rareza === r);
                    if (cartas.length === 0) return null;
                    return (
                        <div
                            key={r}
                            className={
                                r === 'chosen'
                                    ? 'pb-8 border-b border-mw-champagne/40'
                                    : ''
                            }
                        >
                            <div className="flex items-baseline justify-between gap-4 border-b border-mw-champagne/25 pb-2">
                                <h3
                                    className={`mw-titulo uppercase text-lg ${r === 'chosen' ? 'text-[#ffe27a]' : 'text-mw-champagne'}`}
                                >
                                    {r === 'chosen'
                                        ? 'Bonus - Chosen'
                                        : RAREZAS[r].nombre}
                                </h3>
                                <span className="text-sm uppercase tracking-wider text-mw-fog">
                                    {RAREZAS[r].puntos} pts ·{' '}
                                    {formatoChance(chanceCarta(cartas[0]))} each
                                </span>
                            </div>
                            {r === 'chosen' && (
                                <p className="mt-3 text-mw-mist/70">
                                    Not needed to complete the collection. Pull
                                    it to enter the raffle for a Mudwater pack.
                                </p>
                            )}
                            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-3 mt-4">
                                {cartas.map((c) => (
                                    <div
                                        key={c.id}
                                        className="relative aspect-1621/2250"
                                    >
                                        {coleccion[c.id] ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setDetalle(c)
                                                    }
                                                    aria-label={c.nombre}
                                                    className="block w-full h-full cursor-pointer hover:-translate-y-1 hover:scale-103 transition-all duration-300"
                                                >
                                                    <Frente carta={c} chica />
                                                </button>
                                                <span className="absolute -top-2 -right-2 mw-titulo text-xs bg-mw-champagne text-black rounded-full min-w-6 h-6 px-1.5 flex items-center justify-center tabular-nums">
                                                    ×{coleccion[c.id]}
                                                </span>
                                            </>
                                        ) : (
                                            <Dorso className="opacity-35" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </section>
            {extraComprado && (
                <CompraCompleta
                    mudwater
                    imagen={IMAGEN_PACK}
                    titular="+1 Extra pack"
                    texto="It's ready to rip. Extra packs are only for today: they don't carry over."
                    principal={{
                        texto: 'Rip it now',
                        alTocar: () => {
                            setExtraComprado(false);
                            abrir();
                        },
                    }}
                    onCerrar={() => setExtraComprado(false)}
                />
            )}
            {premioMeta && (
                <CompraCompleta
                    mudwater
                    imagen={IMAGEN_PACK}
                    encabezado="Goal achieved!"
                    titular="+1 Primal Event Pack"
                    texto="Fogbound players hit today’s pack goal, and you were one of them. Here’s a bonus pack for today. Bonus packs don’t expire."
                    principal={{
                        texto: 'Rip it now',
                        alTocar: () => {
                            setPremioMeta(false);
                            abrir();
                        },
                    }}
                    onCerrar={() => setPremioMeta(false)}
                />
            )}
            {desbloqueado && (
                <PacksDesbloqueados
                    tier={desbloqueado}
                    config={config}
                    onCerrar={() => setDesbloqueado(null)}
                />
            )}
            {upgradeHecho && (
                <UpgradeHecho
                    carta={upgradeHecho.carta}
                    nueva={upgradeHecho.nueva}
                    completo={upgradeHecho.completo}
                    premioColeccion={premioColeccion}
                    onCerrar={() => {
                        setUpgradeHecho(null);
                        recargarRanking();
                    }}
                />
            )}
            {detalle && (
                <DetalleCarta
                    carta={detalle}
                    cantidad={coleccion[detalle.id] ?? 0}
                    onCerrar={() => setDetalle(null)}
                />
            )}
        </main>
    );
}

function Registro({
    mio,
    token,
    alGuardar,
}: {
    mio: MiPacks;
    token: string;
    alGuardar: (m: MiPacks) => void;
}) {
    const [nickname, setNickname] = useState(mio.nickname ?? '');
    const [x, setX] = useState(mio.x);
    const [discord, setDiscord] = useState(mio.discord);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!x.trim() && !discord.trim())
            return setError('Add your X or Discord username.');
        setGuardando(true);
        try {
            alGuardar(await registrarse(token, { nickname, x, discord }));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <form
            onSubmit={guardar}
            className={`${panel} w-full max-w-md flex flex-col gap-4`}
        >
            <div>
                <h2 className={subtitulo}>Before your first pack</h2>
                <p className="mt-1 text-mw-mist/70">
                    Pick a nickname for the leaderboard and add your X or
                    Discord, so we can reach you if you win.
                </p>
            </div>
            <label className="flex flex-col gap-1">
                <span className="mw-etiqueta text-[10px] text-mw-fog">
                    Nickname
                </span>
                <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="3-20 letters, numbers or _"
                    maxLength={20}
                    required
                    className={entrada}
                />
            </label>
            <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                    <span className="mw-etiqueta text-[10px] text-mw-fog">
                        X
                    </span>
                    <input
                        value={x}
                        onChange={(e) => setX(e.target.value)}
                        placeholder="@username"
                        maxLength={16}
                        className={entrada}
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="mw-etiqueta text-[10px] text-mw-fog">
                        Discord
                    </span>
                    <input
                        value={discord}
                        onChange={(e) => setDiscord(e.target.value)}
                        placeholder="username"
                        maxLength={32}
                        className={entrada}
                    />
                </label>
            </div>
            {error && <p className="text-mw-champagne">{error}</p>}
            <button
                type="submit"
                disabled={guardando}
                className={`${botonPrincipal} self-center`}
            >
                <span className="mw-boton-reflejo" aria-hidden="true" />
                <span className="relative">
                    {guardando ? 'Saving...' : 'Save and play'}
                </span>
            </button>
        </form>
    );
}

function Ganador({
    mio,
    token,
    alGuardar,
}: {
    mio: MiPacks;
    token: string;
    alGuardar: (m: MiPacks) => void;
}) {
    const [direccion, setDireccion] = useState(mio.solana ?? '');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setGuardando(true);
        try {
            const { solana } = await guardarSolana(token, direccion);
            alGuardar({ ...mio, solana });
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <form
            onSubmit={guardar}
            className={`${panel} w-full max-w-md flex flex-col gap-4`}
        >
            <div>
                <h2 className={subtitulo}>
                    {mio.chosenWinner
                        ? 'You won The Chosen raffle'
                        : `You placed #${mio.rank}`}
                </h2>
                <p className="mt-1 text-mw-mist/70">
                    Mudwater packs are sent on Solana. Add the Solana wallet
                    where you want to receive yours.
                </p>
            </div>
            <input
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Solana wallet address"
                className={`${entrada} text-base`}
            />
            {error && <p className="text-mw-champagne">{error}</p>}
            {mio.solana && !error && (
                <p className="text-mw-mist/70">
                    Saved. You can change it until the packs are sent.
                </p>
            )}
            <button
                type="submit"
                disabled={guardando || !direccion.trim()}
                className={`${botonPrincipal} self-center`}
            >
                <span className="mw-boton-reflejo" aria-hidden="true" />
                <span className="relative">
                    {guardando ? 'Saving...' : 'Save wallet'}
                </span>
            </button>
        </form>
    );
}
