// La Shop: comprar FOG con APE y gastarlo en el catalogo. El pago es una
// transferencia al treasury, igual que un roll del Forge; el backend la
// verifica y acredita el FOG con la tasa del admin.
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseEther } from 'viem';
import { useWalletSession } from '@/hooks/cultomizer/useWalletSession';
import {
    fog,
    informarCompra,
    leerConfig,
    leerMio,
    ICONO_FOG,
    ICONO_FOG_CHICO,
    degradado,
    type ConfigStaking,
    type MiStaking,
    type VentaFog,
} from '@/lib/staking';
import { EVENTO_CANJE } from '@/lib/promo';
import { card, botonClaro } from '@/components/forge/estilos';
import {
    esperarConfirmacion,
    pagoSinInformar,
    recordar,
    transferir,
    PagoError,
} from '@/components/forge/pago';
import Tienda from '@/components/staking/Tienda';
import Mensaje, { type Aviso } from '@/components/staking/Mensaje';

const PREFIJO = 'store:fog';

// [izquierda %, arriba %, tamaño %] de cada moneda de la pila.
const PILAS = [
    [[50, 52, 58]],
    [
        [36, 58, 46],
        [64, 58, 46],
        [50, 36, 46],
    ],
    [
        [28, 62, 40],
        [50, 64, 40],
        [72, 62, 40],
        [39, 42, 40],
        [61, 42, 40],
    ],
    [
        [22, 66, 36],
        [41, 68, 36],
        [60, 68, 36],
        [79, 66, 36],
        [31, 48, 36],
        [50, 48, 36],
        [69, 48, 36],
        [50, 28, 36],
    ],
];

type Session = ReturnType<typeof useWalletSession>;

export default function Store() {
    const session = useWalletSession();
    const [config, setConfig] = useState<ConfigStaking | null>(null);
    const [fallo, setFallo] = useState(false);
    const [mio, setMio] = useState<MiStaking | null>(null);

    useEffect(() => {
        leerConfig()
            .then(setConfig)
            .catch(() => setFallo(true));
    }, []);

    const recargar = useCallback(async () => {
        if (!session.token) return setMio(null);
        try {
            setMio(await leerMio(session.token));
        } catch {
            setMio(null);
        }
    }, [session.token]);

    useEffect(() => {
        recargar();
    }, [recargar]);

    useEffect(() => {
        window.addEventListener(EVENTO_CANJE, recargar);
        return () => window.removeEventListener(EVENTO_CANJE, recargar);
    }, [recargar]);

    return (
        <main className="w-full text-white flex flex-col gap-6 sm:gap-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="font-accent uppercase text-yellow text-5xl sm:text-7xl">
                        Shop
                    </h1>
                    <p className="text-lightblue text-base sm:text-lg md:text-xl mt-3 sm:mt-4 max-w-3xl">
                        Get FOG with APE, or earn it by staking your Primals.
                        Spend it on keys, rerolls and more.
                    </p>
                </div>
                <Saldo session={session} saldo={mio?.balance ?? null} />
            </div>

            {fallo && (
                <p className="text-lightblue/70">
                    The shop is unavailable right now. Try again in a moment.
                </p>
            )}
            {!config && !fallo && (
                <p className="text-lightblue/70">Loading...</p>
            )}

            {config && (
                <Pestanas
                    config={config}
                    session={session}
                    mio={mio}
                    recargar={recargar}
                />
            )}
        </main>
    );
}

// El FOG de la wallet, siempre a la vista para saber cuanto se puede gastar.
function Saldo({ session, saldo }: { session: Session; saldo: number | null }) {
    if (!session.isConnected) return null;
    const pastilla =
        'h-11 shrink-0 self-start sm:self-auto inline-flex items-center gap-2 bg-darkblue rounded-full pl-1.5 pr-4 shadow-lg shadow-darkblue/50';
    if (saldo !== null) {
        return (
            <div className={pastilla} aria-label={`Your FOG: ${fog(saldo)}`}>
                <img src={ICONO_FOG} alt="" className="size-8 object-contain" />
                <span className="font-accent text-yellow text-2xl leading-none pb-1.5 tabular-nums">
                    {fog(saldo)}
                </span>
                <span className="font-accent uppercase text-lightblue text-base leading-none pb-1">
                    FOG
                </span>
            </div>
        );
    }
    if (session.status === 'needs-signature') {
        return (
            <button
                onClick={session.signIn}
                className={`${pastilla} cursor-pointer hover:-translate-y-0.5 active:scale-97 transition-all duration-300`}
            >
                <img src={ICONO_FOG} alt="" className="size-8 object-contain" />
                <span className="font-accent uppercase text-lightblue text-base leading-none pb-1">
                    See your FOG
                </span>
            </button>
        );
    }
    return null;
}

function PilaDeFog({ nivel }: { nivel: number }) {
    return (
        <div aria-hidden="true" className="relative w-full flex-1 min-h-0">
            {PILAS[nivel].map(([x, y, lado], i) => (
                <img
                    key={i}
                    src={ICONO_FOG}
                    alt=""
                    className="absolute -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-xl"
                    style={{ left: `${x}%`, top: `${y}%`, width: `${lado}%` }}
                />
            ))}
        </div>
    );
}

type Pestana = 'fog' | 'items' | 'premios';

// Comprar FOG, la tienda y lo ganado en una sola tarjeta: cada pestaña desliza
// a su panel. Se corre con margin y no con transform: un transform haria que
// los popups (position: fixed) de la tienda queden atrapados adentro.
function Pestanas({
    config,
    session,
    mio,
    recargar,
}: {
    config: ConfigStaking;
    session: Session;
    mio: MiStaking | null;
    recargar: () => void;
}) {
    const pestanas: { id: Pestana; nombre: string }[] = [
        ...(config.fogSale.enabled
            ? [{ id: 'fog' as const, nombre: 'Buy FOG' }]
            : []),
        { id: 'items', nombre: 'Item shop' },
        { id: 'premios', nombre: 'History' },
    ];
    const [activa, setActiva] = useState<Pestana>(pestanas[0].id);
    const indice = Math.max(
        0,
        pestanas.findIndex((p) => p.id === activa)
    );
    const paneles = useRef<(HTMLDivElement | null)[]>([]);
    const [alto, setAlto] = useState<number | null>(null);

    useEffect(() => {
        const panel = paneles.current[indice];
        if (!panel) return;
        const medir = () => setAlto(panel.offsetHeight);
        medir();
        const observador = new ResizeObserver(medir);
        observador.observe(panel);
        return () => observador.disconnect();
    }, [indice, pestanas.length]);

    const tienda = (seccion: 'items' | 'premios') => (
        <Tienda
            vitrina
            seccion={seccion}
            catalogo={config.catalog}
            saldo={mio?.balance ?? null}
            token={session.token}
            ganados={mio?.prizes}
            compras={mio?.purchases}
            alCanjear={recargar}
        />
    );

    return (
        <section className={`${card} flex flex-col gap-4 sm:gap-5`}>
            <div
                role="tablist"
                className="grid gap-2 sm:gap-3"
                style={{
                    gridTemplateColumns: `repeat(${pestanas.length}, minmax(0, 1fr))`,
                }}
            >
                {pestanas.map((p) => (
                    <button
                        key={p.id}
                        role="tab"
                        aria-selected={p.id === activa}
                        onClick={() => setActiva(p.id)}
                        className={`h-11 sm:h-12 rounded-xl font-accent uppercase text-sm sm:text-lg leading-none pb-1 px-2 cursor-pointer transition-all duration-300 ${
                            p.id === activa
                                ? 'bg-yellow text-darkblue'
                                : 'bg-blue/60 text-lightblue hover:text-yellow'
                        }`}
                    >
                        {p.nombre}
                    </button>
                ))}
            </div>

            <div
                className="overflow-hidden transition-all duration-300 ease-out"
                style={alto === null ? undefined : { height: alto }}
            >
                <div
                    className="w-full flex items-start transition-all duration-300 ease-out"
                    style={{ marginLeft: `-${indice * 100}%` }}
                >
                    {pestanas.map((p, i) => (
                        <div
                            key={p.id}
                            ref={(el) => {
                                paneles.current[i] = el;
                            }}
                            role="tabpanel"
                            inert={i !== indice}
                            className="w-full shrink-0"
                        >
                            {p.id === 'fog' && config.fogSale.enabled ? (
                                <ComprarFog
                                    venta={config.fogSale}
                                    session={session}
                                />
                            ) : (
                                tienda(p.id === 'premios' ? 'premios' : 'items')
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

type Paso = 'quieto' | 'firmando' | 'confirmando';

function ComprarFog({
    venta,
    session,
}: {
    venta: Extract<VentaFog, { enabled: true }>;
    session: Session;
}) {
    const [comprando, setComprando] = useState<number | null>(null);
    const [paso, setPaso] = useState<Paso>('quieto');
    const [aviso, setAviso] = useState<Aviso | null>(null);
    const [otro, setOtro] = useState(false);
    const [ape, setApe] = useState('');

    const acreditar = useCallback(
        async (token: string, hash: `0x${string}`) => {
            setPaso('confirmando');
            try {
                const r = await informarCompra(token, hash);
                if (session.address) recordar(session.address, null, PREFIJO);
                setAviso({
                    ok: true,
                    texto: `${fog(r.purchase.fog)} FOG added to your wallet.`,
                });
            } catch (err) {
                if (
                    (err as { definitivo?: boolean }).definitivo &&
                    session.address
                ) {
                    recordar(session.address, null, PREFIJO);
                }
                setAviso({
                    ok: false,
                    texto:
                        err instanceof Error
                            ? err.message
                            : 'The payment was not accepted.',
                });
            }
            setPaso('quieto');
            setComprando(null);
        },
        [session.address]
    );

    // Un pago que salio pero no se llego a informar (se cerro la pestaña).
    useEffect(() => {
        if (!session.token || !session.address) return;
        const hash = pagoSinInformar(session.address, PREFIJO);
        if (hash) acreditar(session.token, hash);
    }, [session.token, session.address, acreditar]);

    const comprar = async (monto: number) => {
        if (!Number.isInteger(monto) || monto < venta.minApe) return;
        const cobro = {
            required: true as const,
            chainId: venta.chainId,
            treasury: venta.treasury,
            priceWei: parseEther(String(monto)).toString(),
            price: String(monto),
            confirmations: venta.confirmations,
        };
        setAviso(null);
        let token = session.token;
        if (!token) token = await session.signIn();
        if (!token) return;
        setComprando(monto);
        setPaso('firmando');
        let hash: `0x${string}`;
        try {
            hash = await transferir(cobro, PREFIJO);
            setPaso('confirmando');
            await esperarConfirmacion(cobro, hash);
        } catch (err) {
            setPaso('quieto');
            setComprando(null);
            setAviso({
                ok: false,
                texto:
                    err instanceof PagoError
                        ? err.message
                        : 'The payment could not be sent.',
            });
            return;
        }
        await acreditar(token, hash);
    };

    const ocupado = paso !== 'quieto';
    const estado = paso === 'firmando' ? 'Confirm in wallet' : 'Confirming...';
    const montoOtro = Number(ape);
    const otroValido = Number.isInteger(montoOtro) && montoOtro >= venta.minApe;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex justify-end">
                <p className="text-lightblue/80 text-sm inline-flex items-center gap-1">
                    1 APE = {fog(venta.fogPerApe)}
                    <img src={ICONO_FOG_CHICO} alt="" className="size-4" />
                    FOG
                </p>
            </div>

            <div
                className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-[repeat(var(--paquetes),minmax(0,1fr))]"
                style={
                    {
                        '--paquetes': Math.min(4, venta.packs.length),
                    } as React.CSSProperties
                }
            >
                {venta.packs.map(({ ape: monto, ...fondo }, i) => (
                    <button
                        key={monto}
                        onClick={() => comprar(monto)}
                        disabled={ocupado || !session.isConnected}
                        aria-label={`Buy ${fog(monto * venta.fogPerApe)} FOG for ${monto} APE`}
                        style={{ backgroundImage: degradado(fondo) }}
                        className={`group relative aspect-3/4 rounded-2xl overflow-hidden shadow-lg shadow-darkblue/50 flex flex-col items-center cursor-pointer hover:-translate-y-1 active:scale-97 transition-all duration-300 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:active:scale-100 ${ocupado && comprando !== monto ? 'opacity-50' : ''}`}
                    >
                        <span
                            aria-hidden="true"
                            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.4),transparent_62%)]"
                        />
                        <PilaDeFog
                            nivel={Math.min(
                                PILAS.length - 1,
                                Math.round(
                                    (i * (PILAS.length - 1)) /
                                        Math.max(1, venta.packs.length - 1)
                                )
                            )}
                        />
                        <span className="relative flex flex-col items-center gap-0.5 px-2">
                            <span className="font-accent text-white text-2xl md:text-xl lg:text-3xl xl:text-4xl leading-none pb-1.5 tabular-nums [text-shadow:0_2px_0_rgb(9_0_80/0.35)]">
                                {fog(monto * venta.fogPerApe)}
                            </span>
                            <span className="font-accent uppercase text-white/90 text-base leading-none pb-1">
                                FOG
                            </span>
                        </span>
                        <span className="relative w-[85%] h-10 lg:h-11 my-3 lg:my-4 rounded-lg bg-yellow text-darkblue font-accent uppercase text-base md:text-sm lg:text-xl leading-none pb-1.5 inline-flex items-center justify-center shadow-md">
                            {comprando === monto ? estado : `${monto} APE`}
                        </span>
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-3">
                {otro ? (
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 h-9">
                            <input
                                type="number"
                                inputMode="numeric"
                                min={venta.minApe}
                                step={1}
                                value={ape}
                                onChange={(e) => setApe(e.target.value)}
                                disabled={ocupado}
                                aria-label="APE to spend"
                                autoFocus
                                className="h-9 w-28 bg-lightblue text-darkblue font-accent text-lg leading-none rounded-md px-3 pb-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-yellow transition-all duration-300"
                            />
                            <span className="font-accent uppercase text-lightblue text-lg leading-none pb-1.5">
                                APE
                            </span>
                        </label>
                        <span className="h-9 inline-flex items-center gap-2 font-accent uppercase text-lg leading-none">
                            <span className="text-lightblue pb-1.5">=</span>
                            <img
                                src={ICONO_FOG_CHICO}
                                alt=""
                                className="size-5"
                            />
                            <span className="text-yellow tabular-nums pb-1.5">
                                {otroValido
                                    ? fog(montoOtro * venta.fogPerApe)
                                    : '—'}
                            </span>
                            <span className="text-lightblue pb-1.5">FOG</span>
                        </span>
                        <button
                            onClick={() => comprar(montoOtro)}
                            disabled={
                                !otroValido || ocupado || !session.isConnected
                            }
                            className={`h-9 ${botonClaro}`}
                        >
                            {comprando === montoOtro && ocupado
                                ? estado
                                : 'Buy'}
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setOtro(true)}
                        className="self-start text-lightblue hover:text-yellow text-sm underline underline-offset-4 cursor-pointer transition-all duration-300"
                    >
                        Other amount
                    </button>
                )}

                {otro && ape !== '' && !otroValido && (
                    <p className="text-red-300 text-sm">
                        Enter a whole number of APE, {venta.minApe} or more.
                    </p>
                )}
                {!session.isConnected && (
                    <p className="text-lightblue/60 text-sm">
                        Connect your wallet to buy FOG.
                    </p>
                )}
                {session.status === 'needs-signature' && (
                    <p className="text-lightblue/60 text-sm">
                        You will sign a message to verify your wallet first. It
                        does not authorize any transaction.
                    </p>
                )}
                {aviso && <Mensaje ok={aviso.ok} texto={aviso.texto} />}
            </div>
        </div>
    );
}
