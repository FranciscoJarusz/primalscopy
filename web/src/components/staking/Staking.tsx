import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { EVENTO_CANJE } from '@/lib/promo';
import { FiMapPin, FiShoppingBag } from 'react-icons/fi';
import { useUserNFTs, type Nft } from '@/hooks/cultomizer/useUserNFTs';
import { useWalletSession } from '@/hooks/cultomizer/useWalletSession';
import Cargando from '@/components/forge/Cargando';
import { botonClaro } from '@/components/forge/estilos';
import {
    ICONO_FOG_CHICO,
    MOTIVOS,
    TOTAL_PRIMALS,
    bonusPorCantidad,
    diasConBoost,
    fogDelPeriodo,
    rangoEscalon,
    entrenar,
    fog,
    leerConfig,
    leerMapa,
    leerMio,
    miniaturaPrimal,
    nombreInsignia,
    sacar,
    type ConfigStaking,
    type Entrenamiento,
    type MiStaking,
} from '@/lib/staking';
import Mapa, { ZONAS } from './Mapa';
import { demoStaking } from './demo';
import Tienda from './Tienda';
import Recientes from './Recientes';
import Boost from './Boost';
import Mensaje, { type Aviso } from './Mensaje';

const DIA = 24 * 60 * 60 * 1000;

type Panel =
    | { tipo: 'zona'; dias: number }
    | { tipo: 'tienda' }
    | { tipo: 'reglas' }
    | { tipo: 'volver' }
    | null;

// Lo que se le dice a quien no conoce el soft staking: es lo primero que
// pregunta un holder desconfiado.
const CONFIANZA =
    'Your Primals never leave your wallet. Just a signature, no gas.';

// Sin backdrop-blur: con el mapa moviendose debajo en cada vuelo, el navegador
// tenia que volver a desenfocar el fondo de cada panel en cada cuadro.
const flotante = 'bg-darkblue/95 rounded-xl shadow-lg shadow-darkblue/60';
// Sunzone (font-accent) no tiene parte de abajo en su caja de linea: las
// mayusculas quedan 0,19em por debajo del centro. En una caja de alto fijo con
// items-center, un padding de abajo de 0,38em las sube justo eso; para subir
// solo un texto al lado de otras cosas, SUBIR.
const CENTRAR_ACCENT = 'pb-[0.38em]';
const SUBIR = 'relative -top-[0.19em]';
// Los contadores redondos (Restake, My Primals). En una caja de 16 px con
// texto de 12 px, las mayusculas de Sunzone quedan centradas con 4 px de padding
// abajo justos. CENTRAR_ACCENT (0,38em = 4,56 px) las dejaba 0,28 px arriba, y
// con el redondeo de algunas pantallas se notaba. text-box no sirve: Sunzone
// declara mal la altura de sus mayusculas y el numero queda abajo.
const CONTADOR =
    'h-4 min-w-4 inline-flex items-center justify-center leading-none rounded-full px-1 pb-1 font-normal text-xs';
const botonFlotante = `${flotante} pointer-events-auto h-8 inline-flex items-center font-accent uppercase text-sm px-3 ${CENTRAR_ACCENT} cursor-pointer hover:text-yellow active:scale-97 transition-all duration-300`;

export default function Staking() {
    const session = useWalletSession();
    const { nfts, isLoading, error, refreshNfts } = useUserNFTs();

    const [config, setConfig] = useState<ConfigStaking | null>(null);
    const [mio, setMio] = useState<MiStaking | null>(null);
    const [panel, setPanel] = useState<Panel>(null);

    const [poblacion, setPoblacion] = useState<Record<string, string[]>>({});

    // La config y quien esta en el mapa van juntas: cambian al mandar
    // Primals a entrenar. Si el mapa falla, la pagina sigue sin ellos.
    const cargarConfig = useCallback(() => {
        leerMapa()
            .then(setPoblacion)
            .catch(() => {});
        return leerConfig()
            .then(setConfig)
            .catch(() => setConfig(null));
    }, []);

    useEffect(() => {
        cargarConfig();
    }, [cargarConfig]);

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

    // Un codigo canjeado desde el menu de la wallet puede dar FOG o un premio
    // de ruleta: el saldo y "Your prizes" se actualizan sin recargar.
    useEffect(() => {
        window.addEventListener(EVENTO_CANJE, recargar);
        return () => window.removeEventListener(EVENTO_CANJE, recargar);
    }, [recargar]);

    const porToken = useMemo(
        () => new Map((mio?.stakes ?? []).map((s) => [s.tokenId, s])),
        [mio]
    );

    // Los Primals de la wallet que estan entrenando: en el mapa se destacan.
    // Si el mapa todavia no los trae (se leyo antes de mandarlos), se suman.
    const mios = useMemo(
        () =>
            new Set(
                (mio?.stakes ?? [])
                    .filter((s) => !s.finished)
                    .map((s) => s.tokenId)
            ),
        [mio]
    );
    const poblacionConMios = useMemo(() => {
        const todos: Record<string, string[]> = {};
        for (const [dias, ids] of Object.entries(poblacion))
            todos[dias] = [...ids];
        const ya = new Set(Object.values(todos).flat());
        for (const s of mio?.stakes ?? []) {
            if (s.finished || ya.has(s.tokenId)) continue;
            (todos[s.days] ??= []).push(s.tokenId);
        }
        return todos;
    }, [poblacion, mio]);

    // Solo en desarrollo: /staking?demo=600 (ver demo.ts).
    const demo = useMemo(demoStaking, []);

    const total = config?.totals.staking ?? 0;

    // Los que terminaron su periodo y siguen en la wallet: se ofrecen para
    // volver a mandarlos. Los vendidos despues de terminar no aparecen.
    const enWallet = useMemo(() => new Set(nfts.map((n) => n.tokenId)), [nfts]);
    const paraVolver = useMemo(
        () =>
            (mio?.restake ?? []).filter(
                (r) => enWallet.has(r.tokenId) && !mios.has(r.tokenId)
            ),
        [mio, enWallet, mios]
    );
    const diasElegidos = panel?.tipo === 'zona' ? panel.dias : null;

    // "My Primals": los de la wallet que estan entrenando, en el orden de las
    // regiones del mapa, y cual se esta mirando. Elegir uno lleva la camara
    // hasta el y abre su region.
    const poblacionVista = demo?.poblacion ?? poblacionConMios;
    const misVista = demo?.mios ?? mios;
    const misEnMapa = useMemo(
        () =>
            ZONAS.flatMap((z) =>
                (poblacionVista[z.days] ?? [])
                    .filter((id) => misVista.has(id))
                    .map((tokenId) => ({ tokenId, dias: z.days }))
            ),
        [poblacionVista, misVista]
    );
    const [foco, setFoco] = useState<number | null>(null);
    const mirar = (i: number) => {
        const n = misEnMapa.length;
        const j = ((i % n) + n) % n;
        setFoco(j);
        setPanel({ tipo: 'zona', dias: misEnMapa[j].dias });
    };
    useEffect(() => {
        if (foco === null) return;
        if (panel?.tipo !== 'zona' || panel.dias !== misEnMapa[foco]?.dias)
            setFoco(null);
    }, [panel, foco, misEnMapa]);
    const enfocado = foco === null ? null : (misEnMapa[foco]?.tokenId ?? null);

    return (
        // El mapa es el fondo de toda la pantalla: el header del sitio flota encima
        // y lo de esta pagina arranca debajo de el (top-20 / 28 / 36).
        <main className="fixed inset-0 z-0 overflow-hidden bg-darkblue text-white">
            {config ? (
                <Mapa
                    periodos={config.periods}
                    boost={config.boost}
                    dias={diasElegidos}
                    alElegir={(dias) => setPanel({ tipo: 'zona', dias })}
                    poblacion={demo?.poblacion ?? poblacionConMios}
                    mios={demo?.mios ?? mios}
                    miniatura={demo?.miniatura}
                    enfocado={enfocado}
                />
            ) : (
                <div className="absolute inset-0 grid place-items-center">
                    <Cargando texto="Loading the map..." />
                </div>
            )}

            {/* Arriba: el titulo a la izquierda y el FOG con los botones a la
                derecha. El contenedor no toma clicks para no tapar el mapa. */}
            <div className="pointer-events-none absolute inset-x-0 top-20 sm:top-28 lg:top-36 px-4 sm:px-8 lg:px-16 xl:px-30 flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col items-start gap-2">
                    <div className="flex flex-wrap items-stretch gap-2">
                    {/* En el celular el titulo y los numeros van en una sola
                        linea, con el FOG abreviado (900K): cada fila de arriba
                        le saca mapa a la pantalla. */}
                    <div
                        className={`${flotante} px-3 py-2 flex items-baseline gap-2 sm:block`}
                    >
                        <h1 className="font-accent uppercase text-yellow text-lg sm:text-2xl leading-none">
                            Staking
                        </h1>
                        <div className="text-lightblue/70 text-xs sm:mt-1 whitespace-nowrap">
                            {config ? (
                                <>
                                    <span className="sm:hidden">
                                        {`${total} staking · ${porcentaje(total, config.collectionSize)} · ${corto(config.totals.earned)} FOG`}
                                    </span>
                                    <span className="hidden sm:inline">
                                        {`${total} Primal${total === 1 ? '' : 's'} staking (${porcentaje(total, config.collectionSize)}) · ${fog(config.totals.earned)} FOG earned`}
                                    </span>
                                </>
                            ) : (
                                'The Fog lands'
                            )}
                        </div>
                    </div>
                    {config?.boost && <Boost boost={config.boost} />}
                    </div>
                    {/* La leyenda: cada region con su color y su periodo. En
                        el celular no: ocupaba tres filas y repite los nombres
                        del mapa. */}
                    {config && (
                        <div className="hidden sm:flex flex-wrap gap-1.5">
                            {ZONAS.filter((z) =>
                                config.periods.some((p) => p.days === z.days)
                            ).map((z) => {
                                const activa = diasElegidos === z.days;
                                return (
                                    <button
                                        key={z.id}
                                        onClick={() =>
                                            setPanel({
                                                tipo: 'zona',
                                                dias: z.days,
                                            })
                                        }
                                        aria-pressed={activa}
                                        className={`${flotante} pointer-events-auto h-7 flex items-center gap-1.5 font-accent uppercase text-xs pl-2 pr-1.5 cursor-pointer hover:text-yellow active:scale-97 transition-all duration-300 ${
                                            activa
                                                ? 'text-yellow ring-1 ring-yellow'
                                                : 'text-lightblue'
                                        }`}
                                    >
                                        <i
                                            className="size-3 rounded-full"
                                            style={{ background: z.color }}
                                        />
                                        <span className={SUBIR}>
                                            {z.nombre}
                                        </span>
                                        <b
                                            className={`h-4 inline-flex items-center leading-none bg-yellow text-darkblue rounded-full px-1.5 font-normal ${CENTRAR_ACCENT}`}
                                        >
                                            {z.days}d
                                        </b>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap justify-end items-center gap-2">
                    {paraVolver.length > 0 && (
                        <button
                            onClick={() =>
                                setPanel(
                                    panel?.tipo === 'volver'
                                        ? null
                                        : { tipo: 'volver' }
                                )
                            }
                            title="These Primals finished their period and stopped earning"
                            className={`${flotante} pointer-events-auto h-8 hidden sm:inline-flex items-center gap-1.5 px-3 font-accent uppercase text-sm text-darkblue bg-yellow! cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300`}
                        >
                            <span className={SUBIR}>Restake</span>
                            <Contador
                                n={paraVolver.length}
                                className="bg-darkblue text-yellow"
                            />
                        </button>
                    )}
                    <Saldo session={session} mio={mio} />
                    {misEnMapa.length > 0 &&
                        (foco === null ? (
                            // Sin CENTRAR_ACCENT en el boton: subiria tambien la
                            // pastilla, que ya se centra sola. Sube solo el texto.
                            <button
                                onClick={() => mirar(0)}
                                title="Fly to your Primals on the map"
                                aria-label="My Primals"
                                className={`${flotante} pointer-events-auto h-8 inline-flex items-center gap-1.5 px-2.5 sm:px-3 font-accent uppercase text-sm text-yellow cursor-pointer hover:text-lightblue active:scale-97 transition-all duration-300`}
                            >
                                <FiMapPin className="sm:hidden size-4" />
                                <span className={`${SUBIR} hidden sm:inline`}>
                                    My Primals
                                </span>
                                <Contador
                                    n={misEnMapa.length}
                                    className="bg-yellow text-darkblue"
                                />
                            </button>
                        ) : (
                            <div
                                className={`${flotante} pointer-events-auto h-8 flex items-center font-accent uppercase text-sm text-yellow`}
                            >
                                <BotonFlecha
                                    lado="anterior"
                                    onClick={() => mirar(foco - 1)}
                                />
                                <span className={`${SUBIR} whitespace-nowrap`}>
                                    #{misEnMapa[foco].tokenId}
                                    <span className="text-lightblue/60 ml-1.5">
                                        {foco + 1}/{misEnMapa.length}
                                    </span>
                                </span>
                                <BotonFlecha
                                    lado="siguiente"
                                    onClick={() => mirar(foco + 1)}
                                />
                            </div>
                        ))}
                    <button
                        onClick={() =>
                            setPanel(
                                panel?.tipo === 'tienda'
                                    ? null
                                    : { tipo: 'tienda' }
                            )
                        }
                        aria-label="Shop"
                        className={`${botonFlotante} ${panel?.tipo === 'tienda' ? 'text-yellow' : 'text-lightblue'}`}
                    >
                        {/* El icono no lleva el padding de Sunzone: se
                            compensa con el margen negativo. */}
                        <FiShoppingBag className="sm:hidden size-4 mb-[-0.38em]" />
                        <span className="hidden sm:inline">Shop</span>
                    </button>
                    <button
                        onClick={() =>
                            setPanel(
                                panel?.tipo === 'reglas'
                                    ? null
                                    : { tipo: 'reglas' }
                            )
                        }
                        aria-label="How it works"
                        className={`${botonFlotante} ${panel?.tipo === 'reglas' ? 'text-yellow' : 'text-lightblue'}`}
                    >
                        ?
                    </button>
                </div>
            </div>

            {!panel && config && paraVolver.length > 0 && (
                <button
                    onClick={() => setPanel({ tipo: 'volver' })}
                    className={`${flotante} sm:hidden animate-aparece absolute inset-x-16 bottom-4 h-10 flex items-center justify-center gap-2 px-3 font-accent uppercase text-sm text-darkblue bg-yellow! cursor-pointer active:scale-97 transition-all duration-300`}
                >
                    <span className={SUBIR}>
                        {paraVolver.length === 1
                            ? '1 finished · Restake'
                            : `${paraVolver.length} finished · Restake`}
                    </span>
                </button>
            )}

            {!panel && config && (
                <div
                    // En el celular no entra en una linea: se parte y deja
                    // libres los controles del mapa (abajo a la izquierda,
                    // left-4 y ~2.5rem de ancho), con el mismo margen del
                    // otro lado para que quede centrado.
                    className={`${flotante} animate-aparece pointer-events-none absolute inset-x-16 bottom-4 px-4 py-2 text-lightblue text-sm text-center sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:whitespace-nowrap ${
                        paraVolver.length > 0 ? 'hidden sm:block' : ''
                    }`}
                >
                    {config.enabled ? (
                        <>
                            <span className="sm:hidden">
                                Tap a region to stake.
                            </span>
                            <span className="hidden sm:inline">
                                Pick a region to stake your Primals. They never
                                leave your wallet.
                            </span>
                        </>
                    ) : (
                        'Staking opens soon.'
                    )}
                </div>
            )}

            {/* Hasta 1400 px va mas arriba para no pisar el cartel centrado de abajo. */}
            {config && (
                <div className="pointer-events-none hidden sm:flex justify-end absolute right-8 lg:right-16 xl:right-30 bottom-16 min-[1400px]:bottom-4">
                    <Recientes catalogo={config.catalog} />
                </div>
            )}

            {panel && config && (
                <aside
                    className={`${flotante} animate-aparece absolute z-10 inset-x-2 bottom-2 max-h-[65%] sm:inset-x-auto sm:bottom-auto sm:right-8 lg:right-16 xl:right-30 sm:top-44 lg:top-52 sm:max-h-[calc(100%-15rem)] sm:w-96 flex flex-col overflow-hidden`}
                >
                    <button
                        onClick={() => setPanel(null)}
                        aria-label="Close"
                        className="absolute top-2 right-3 text-lightblue/70 hover:text-yellow text-2xl leading-none cursor-pointer transition-all duration-300"
                    >
                        ×
                    </button>
                    {/* data-lenis-prevent: sin esto el scroll suave del sitio
                        se come la rueda y el panel no baja. */}
                    <div
                        data-lenis-prevent
                        className="overflow-y-auto overscroll-contain p-4 flex flex-col gap-4"
                    >
                        {panel.tipo === 'zona' && (
                            <PanelZona
                                key={panel.dias}
                                config={config}
                                dias={panel.dias}
                                session={session}
                                nfts={nfts}
                                cargando={isLoading}
                                error={error}
                                reintentar={refreshNfts}
                                porToken={porToken}
                                enStaking={mio?.quantity.count ?? 0}
                                alEntrenar={(r) => {
                                    setMio(r);
                                    cargarConfig();
                                }}
                            />
                        )}
                        {panel.tipo === 'volver' && (
                            <PanelVolver
                                config={config}
                                session={session}
                                pendientes={paraVolver}
                                alEntrenar={(r) => {
                                    setMio(r);
                                    cargarConfig();
                                }}
                            />
                        )}
                        {panel.tipo === 'tienda' && (
                            <Tienda
                                compacto
                                catalogo={config.catalog}
                                saldo={mio?.balance ?? null}
                                token={session.token}
                                ganados={mio?.prizes}
                                alCanjear={recargar}
                            />
                        )}
                        {panel.tipo === 'reglas' && (
                            <Reglas config={config} mio={mio} />
                        )}
                    </div>
                </aside>
            )}
        </main>
    );
}

// El numero de un contador redondo. El "1" de Sunzone tiene la banderita a la
// izquierda y el palo, que es lo que se ve, cae 0,032em a la derecha del centro
// de su caja: centrado de verdad se ve corrido. Se lo corre esa distancia (el
// "2" y el resto de los digitos son parejos y no lo necesitan).
function Contador({ n, className }: { n: number; className: string }) {
    return (
        <b className={`${CONTADOR} ${className}`}>
            <span className={n === 1 ? 'relative left-[-0.032em]' : undefined}>
                {n}
            </span>
        </b>
    );
}

// 900,063 -> 900K, 1,234,567 -> 1.23M: para la linea corta del celular.
const corto = (n: number) =>
    n.toLocaleString('en-US', {
        notation: 'compact',
        maximumSignificantDigits: 3,
    });

const porcentaje = (n: number, total = TOTAL_PRIMALS) =>
    `${((n / total) * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

function PanelVolver({
    config,
    session,
    pendientes,
    alEntrenar,
}: {
    config: ConfigStaking;
    session: ReturnType<typeof useWalletSession>;
    pendientes: MiStaking['restake'];
    alEntrenar: (r: MiStaking) => void;
}) {
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [aviso, setAviso] = useState<Aviso | null>(null);

    // Si el admin saco ese periodo, no hay a donde volver a mandarlo.
    const conRegion = pendientes.filter((p) =>
        config.periods.some((x) => x.days === p.days)
    );

    const mandar = async (lista: MiStaking['restake'], clave: string) => {
        setAviso(null);
        let token = session.token;
        if (!token) {
            token = await session.signIn();
            if (!token) return;
        }
        setOcupado(clave);
        const porDias = new Map<number, string[]>();
        for (const p of lista) {
            porDias.set(p.days, [...(porDias.get(p.days) ?? []), p.tokenId]);
        }
        let empezados = 0;
        const partes: string[] = [];
        try {
            for (const [dias, ids] of porDias) {
                const r = await entrenar(token, ids, dias);
                alEntrenar(r);
                empezados += r.started.length;
                for (const { tokenId, reason } of r.rejected) {
                    partes.push(
                        `#${tokenId} ${MOTIVOS[reason] ?? "couldn't start"}.`
                    );
                }
            }
            if (empezados) {
                partes.unshift(
                    `${empezados} Primal${empezados === 1 ? ' is' : 's are'} staking again.`
                );
            }
            setAviso({ ok: empezados > 0, texto: partes.join(' ') });
        } catch (err) {
            setAviso({
                ok: false,
                texto: err instanceof Error ? err.message : "Couldn't restake.",
            });
        }
        setOcupado(null);
    };

    return (
        <>
            <div className="pr-6">
                <h2 className="font-accent uppercase text-yellow text-3xl leading-none">
                    Restake
                </h2>
                <div className="text-lightblue/70 text-sm mt-2">
                    These Primals finished their period and stopped earning.
                    Send them back to the same region.
                </div>
            </div>
            {!config.enabled ? (
                <p className="text-lightblue/80 text-sm">
                    Staking is closed right now. Come back in a few days.
                </p>
            ) : (
                <>
                    <div className="flex flex-col gap-2">
                        {pendientes.map((p) => {
                            const zona = ZONAS.find((z) => z.days === p.days);
                            const puede = conRegion.includes(p);
                            return (
                                <div
                                    key={p.tokenId}
                                    className="flex items-center gap-3"
                                >
                                    <img
                                        src={miniaturaPrimal(p.tokenId, 192)}
                                        alt=""
                                        className="size-10 rounded-full ring-1 ring-lightblue/40 object-cover"
                                    />
                                    <div className="flex-1 text-sm leading-tight">
                                        <div className="font-accent uppercase text-yellow">
                                            #{p.tokenId}
                                        </div>
                                        <div className="text-lightblue/70 text-xs">
                                            {zona
                                                ? `${zona.nombre} · ${p.days} days`
                                                : `${p.days} days`}
                                        </div>
                                    </div>
                                    {puede ? (
                                        <button
                                            onClick={() =>
                                                mandar([p], p.tokenId)
                                            }
                                            disabled={ocupado !== null}
                                            className={`text-sm ${botonClaro}`}
                                        >
                                            {ocupado === p.tokenId
                                                ? 'Sending...'
                                                : 'Restake'}
                                        </button>
                                    ) : (
                                        <span className="text-lightblue/50 text-xs text-right max-w-28">
                                            Pick a region on the map
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {conRegion.length > 1 && (
                        <button
                            onClick={() => mandar(conRegion, 'todos')}
                            disabled={ocupado !== null}
                            className="bg-yellow text-darkblue font-accent uppercase leading-normal! rounded-md px-3 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100"
                        >
                            {session.status === 'signing'
                                ? 'Sign in your wallet...'
                                : ocupado === 'todos'
                                  ? 'Sending...'
                                  : `Restake all ${conRegion.length}`}
                        </button>
                    )}
                    <p className="text-lightblue/60 text-xs -mt-1">
                        {CONFIANZA}
                    </p>
                </>
            )}
            {aviso && <Mensaje {...aviso} />}
        </>
    );
}

// Las flechas del paginador de "My Primals". Dibujadas y no con los
// caracteres ‹ ›: cada fuente los pone a su propia altura y no quedan
// centrados.
function BotonFlecha({
    lado,
    onClick,
}: {
    lado: 'anterior' | 'siguiente';
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            aria-label={lado === 'anterior' ? 'Previous Primal' : 'Next Primal'}
            className="h-full px-2.5 grid place-items-center cursor-pointer hover:text-lightblue transition-all duration-300"
        >
            <svg
                viewBox="0 0 8 12"
                className="w-2 h-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path
                    d={
                        lado === 'anterior'
                            ? 'M6.5 1 1.5 6l5 5'
                            : 'M1.5 1l5 5-5 5'
                    }
                />
            </svg>
        </button>
    );
}

function Saldo({
    session,
    mio,
}: {
    session: ReturnType<typeof useWalletSession>;
    mio: MiStaking | null;
}) {
    if (mio) {
        return (
            <div
                className={`${flotante} pointer-events-auto h-8 pl-2 pr-3 flex items-center gap-1.5`}
            >
                <img src={ICONO_FOG_CHICO} alt="" className="size-5" />
                <span
                    className={`font-accent text-yellow text-lg leading-none ${SUBIR}`}
                >
                    {fog(mio.balance)}
                </span>
                <span className="text-lightblue/70 text-xs">FOG</span>
            </div>
        );
    }
    if (session.status === 'needs-signature') {
        return (
            <button
                onClick={session.signIn}
                title="Sign a message to see your FOG. It does not authorize any transaction."
                className={`${botonFlotante} text-yellow`}
            >
                See my FOG
            </button>
        );
    }
    if (session.status === 'signing') {
        return (
            <div
                className={`${flotante} h-8 px-3 flex items-center text-lightblue text-sm`}
            >
                Sign in your wallet...
            </div>
        );
    }
    return null;
}

function PanelZona({
    config,
    dias,
    session,
    nfts,
    cargando,
    error,
    reintentar,
    porToken,
    enStaking,
    alEntrenar,
}: {
    config: ConfigStaking;
    dias: number;
    session: ReturnType<typeof useWalletSession>;
    nfts: Nft[];
    cargando: boolean;
    error: string | null;
    reintentar: () => void;
    porToken: Map<string, Entrenamiento>;
    // Cuantos Primals tiene la wallet en staking ahora, en cualquier region:
    // con los elegidos define el bonus por cantidad.
    enStaking: number;
    alEntrenar: (r: MiStaking) => void;
}) {
    const { isConnected } = useAccount();
    const [elegidos, setElegidos] = useState<Set<string>>(new Set());
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState<Aviso | null>(null);
    // Sacar pide un segundo clic: cual se esta por sacar ('todos' o un id).
    const [confirmar, setConfirmar] = useState<string | null>(null);

    const zona = ZONAS.find((z) => z.days === dias);
    const periodo = config.periods.find((p) => p.days === dias);
    if (!zona || !periodo) return null;

    const ordenados = [...nfts].sort(
        (a, b) => Number(a.tokenId) - Number(b.tokenId)
    );
    const aca = ordenados.filter((n) => {
        const s = porToken.get(n.tokenId);
        return s && !s.finished && s.days === dias;
    });
    const libres = ordenados.filter((n) => {
        const s = porToken.get(n.tokenId);
        return !s || s.finished;
    });

    const alternar = (id: string) =>
        setElegidos((actual) => {
            const nuevo = new Set(actual);
            if (nuevo.has(id)) nuevo.delete(id);
            else nuevo.add(id);
            return nuevo;
        });

    const mandar = async () => {
        if (elegidos.size === 0) return;
        setAviso(null);
        let token = session.token;
        if (!token) {
            token = await session.signIn();
            if (!token) return;
        }
        setOcupado(true);
        try {
            const r = await entrenar(token, [...elegidos], dias);
            alEntrenar(r);
            setElegidos(new Set());
            const partes = [];
            if (r.started.length) {
                partes.push(
                    `${r.started.length} Primal${r.started.length === 1 ? ' is' : 's are'} staking in ${zona.nombre}.`
                );
            }
            for (const { tokenId, reason } of r.rejected) {
                partes.push(
                    `#${tokenId} ${MOTIVOS[reason] ?? "couldn't start"}.`
                );
            }
            setAviso({ ok: r.started.length > 0, texto: partes.join(' ') });
        } catch (err) {
            setAviso({
                ok: false,
                texto:
                    err instanceof Error
                        ? err.message
                        : "Couldn't start staking.",
            });
        }
        setOcupado(false);
    };

    const entrenando = periodo.training ?? 0;

    // El bonus ya ganado (region y cantidad) que se pierde al sacarlo antes
    // de tiempo: todo lo que gano por encima de la tasa base.
    const bonusEnJuego = (ids: string[]) =>
        ids.reduce((n, id) => {
            const s = porToken.get(id);
            return s ? n + s.earned - s.creditedDays * s.baseRate : n;
        }, 0);

    // Lo que ganarian los elegidos: la region mas el escalon que les toca a
    // los que ya estan en staking sumados a estos. Es una estimacion: si
    // despues entran o salen otros, el escalon cambia dia a dia.
    const conElegidos = enStaking + elegidos.size;
    const extra = bonusPorCantidad(config.quantityTiers, conElegidos);
    const porDiaEstimado = Math.floor(
        (config.dailyRate * (100 + periodo.bonus + extra)) / 100
    );
    const boostDias = diasConBoost(config.boost, dias);
    const multiplicador = config.boost?.multiplier ?? 1;
    const totalEstimado = fogDelPeriodo(porDiaEstimado, dias, config.boost);

    const desmandar = async (ids: string[]) => {
        setConfirmar(null);
        setAviso(null);
        let token = session.token;
        if (!token) {
            token = await session.signIn();
            if (!token) return;
        }
        setOcupado(true);
        try {
            const r = await sacar(token, ids);
            alEntrenar(r);
            const partes = [];
            if (r.unstaked.length) {
                const ganado = r.unstaked.reduce((n, u) => n + u.earned, 0);
                partes.push(
                    `${r.unstaked.length} Primal${r.unstaked.length === 1 ? '' : 's'} unstaked. You kept ${fog(ganado)} FOG.`
                );
            }
            for (const { tokenId, reason } of r.rejected) {
                partes.push(
                    `#${tokenId} ${MOTIVOS[reason] ?? "couldn't be unstaked"}.`
                );
            }
            setAviso({ ok: r.unstaked.length > 0, texto: partes.join(' ') });
        } catch (err) {
            setAviso({
                ok: false,
                texto: err instanceof Error ? err.message : "Couldn't unstake.",
            });
        }
        setOcupado(false);
    };

    const avisoSacar = (ids: string[]) => {
        const pierde = bonusEnJuego(ids);
        return pierde > 0
            ? `Unstake? You lose ${fog(pierde)} FOG of bonus.`
            : periodo.bonus > 0
              ? 'Unstake? It loses the region bonus.'
              : 'Unstake? It stops earning.';
    };

    return (
        <>
            <div className="pr-6">
                <div className="flex items-center gap-1.5 text-lightblue/60 text-xs uppercase tracking-wide">
                    <i
                        className="size-2.5 rounded-full"
                        style={{ background: zona.color }}
                    />
                    {zona.lugar}
                </div>
                <h2 className="font-accent uppercase text-yellow text-3xl leading-none mt-1">
                    {zona.titulo}
                </h2>
                <div className="text-lightblue/70 text-sm mt-2">
                    {zona.lema}
                </div>
                <div className="text-lightblue text-sm mt-2">
                    {dias} days · {fog(periodo.perDay)} FOG/day
                    {periodo.bonus > 0 && ` · +${periodo.bonus}% bonus`}
                </div>
                <div className="text-yellow text-sm">
                    {fog(periodo.perDay * dias)} FOG per Primal
                </div>
                <div className="text-lightblue/60 text-xs mt-0.5">
                    {entrenando
                        ? `${entrenando} Primal${entrenando === 1 ? ' is' : 's are'} staking here.`
                        : 'Nobody is staking here yet.'}
                </div>
            </div>

            {aca.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="text-lightblue/80 text-xs uppercase tracking-wide">
                            Your Primals here
                        </div>
                        {aca.length > 1 && (
                            <button
                                onClick={() =>
                                    confirmar === 'todos'
                                        ? desmandar(aca.map((n) => n.tokenId))
                                        : setConfirmar('todos')
                                }
                                onBlur={() =>
                                    setConfirmar((c) =>
                                        c === 'todos' ? null : c
                                    )
                                }
                                disabled={ocupado}
                                className={`text-xs underline underline-offset-4 cursor-pointer transition-all duration-300 ${
                                    confirmar === 'todos'
                                        ? 'text-red-300'
                                        : 'text-lightblue/80 hover:text-yellow'
                                }`}
                            >
                                {confirmar === 'todos'
                                    ? avisoSacar(aca.map((n) => n.tokenId))
                                    : 'Unstake all'}
                            </button>
                        )}
                    </div>
                    {aca.map((n) => {
                        const s = porToken.get(n.tokenId)!;
                        const quedan = Math.max(
                            1,
                            Math.ceil((Date.parse(s.endsAt) - Date.now()) / DIA)
                        );
                        return (
                            <div key={n.id} className="flex items-center gap-3">
                                <img
                                    src={miniaturaPrimal(n.tokenId, 192)}
                                    alt=""
                                    className="size-10 rounded-full ring-1 ring-yellow object-cover"
                                />
                                <div className="flex-1 text-sm leading-tight">
                                    <div className="font-accent uppercase text-yellow">
                                        #{n.tokenId}
                                    </div>
                                    <div className="text-lightblue/70 text-xs">
                                        {quedan} day{quedan === 1 ? '' : 's'}{' '}
                                        left · {fog(s.earned)} FOG
                                    </div>
                                </div>
                                <button
                                    onClick={() =>
                                        confirmar === n.tokenId
                                            ? desmandar([n.tokenId])
                                            : setConfirmar(n.tokenId)
                                    }
                                    onBlur={() =>
                                        setConfirmar((c) =>
                                            c === n.tokenId ? null : c
                                        )
                                    }
                                    disabled={ocupado}
                                    className={`shrink-0 text-xs rounded-md px-2 py-1 cursor-pointer transition-all duration-300 text-right max-w-40 ${
                                        confirmar === n.tokenId
                                            ? 'bg-red-400/20 text-red-300'
                                            : 'text-lightblue/70 hover:text-yellow'
                                    }`}
                                >
                                    {confirmar === n.tokenId
                                        ? avisoSacar([n.tokenId])
                                        : 'Unstake'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {!config.enabled ? (
                <p className="text-lightblue/80 text-sm">
                    Staking opens soon. Come back in a few days.
                </p>
            ) : !isConnected ? (
                <p className="text-lightblue/80 text-sm">
                    Connect your wallet at the top to stake your Primals here.
                </p>
            ) : cargando ? (
                <Cargando texto="Detecting your NFTs..." />
            ) : error ? (
                <div className="flex flex-col gap-2">
                    <p className="text-red-400 text-sm">{error}</p>
                    <button
                        onClick={reintentar}
                        className={`self-start text-sm ${botonClaro}`}
                    >
                        Try again
                    </button>
                </div>
            ) : libres.length === 0 ? (
                <p className="text-lightblue/80 text-sm">
                    {nfts.length === 0
                        ? 'This wallet has no Primals to stake.'
                        : 'All your Primals are already staking.'}
                </p>
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="text-lightblue/80 text-xs uppercase tracking-wide">
                            Send Primals
                        </div>
                        <button
                            onClick={() =>
                                setElegidos(
                                    elegidos.size === libres.length
                                        ? new Set()
                                        : new Set(libres.map((n) => n.tokenId))
                                )
                            }
                            disabled={ocupado}
                            className="text-xs text-lightblue/80 hover:text-yellow underline underline-offset-4 cursor-pointer transition-all duration-300"
                        >
                            {elegidos.size === libres.length
                                ? 'Clear'
                                : 'Select all'}
                        </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {libres.map((n) => {
                            const elegido = elegidos.has(n.tokenId);
                            return (
                                <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => alternar(n.tokenId)}
                                    disabled={ocupado}
                                    aria-pressed={elegido}
                                    title={
                                        n.name || `Primal Cult #${n.tokenId}`
                                    }
                                    className={`relative rounded-lg overflow-hidden bg-blue cursor-pointer active:scale-97 transition-all duration-300 ${
                                        elegido
                                            ? 'ring-2 ring-yellow'
                                            : 'opacity-70 hover:opacity-100'
                                    }`}
                                >
                                    <img
                                        src={miniaturaPrimal(n.tokenId, 192)}
                                        alt=""
                                        loading="lazy"
                                        className="w-full aspect-square object-cover"
                                    />
                                    <span className="absolute inset-x-0 bottom-0 bg-darkblue/80 font-accent text-[10px] text-yellow text-center">
                                        #{n.tokenId}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        onClick={mandar}
                        disabled={elegidos.size === 0 || ocupado}
                        className="bg-yellow text-darkblue font-accent uppercase leading-normal! rounded-md px-3 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100"
                    >
                        {session.status === 'signing'
                            ? 'Sign in your wallet...'
                            : ocupado
                              ? 'Sending...'
                              : elegidos.size === 0
                                ? 'Pick Primals to send'
                                : `Send ${elegidos.size} to ${zona.nombre}`}
                    </button>
                    <p className="text-lightblue/70 text-xs -mt-1">
                        {elegidos.size > 0 &&
                            `Up to ${fog(elegidos.size * totalEstimado)} FOG in ${dias} days${
                                extra > 0
                                    ? `, with +${extra}% for staking ${conElegidos} Primals`
                                    : ''
                            }${
                                boostDias > 0
                                    ? `${extra > 0 ? ' and' : ','} x${multiplicador} on ${boostDias === dias ? 'every day' : `${boostDias} of them`} for ${config.boost!.title}`
                                    : ''
                            }.${
                                periodo.bonus + extra > 0 || boostDias > 0
                                    ? ' Unstake early and you keep only the base FOG.'
                                    : ''
                            } `}
                        {CONFIANZA}
                    </p>
                </div>
            )}
            {aviso && <Mensaje {...aviso} />}
        </>
    );
}

function Reglas({
    config,
    mio,
}: {
    config: ConfigStaking;
    mio: MiStaking | null;
}) {
    const insignias = mio?.badges;
    return (
        <>
            <h2 className="font-accent uppercase text-yellow text-3xl leading-none pr-6">
                How it works
            </h2>
            <ul className="text-lightblue text-sm flex flex-col gap-2 list-disc pl-5 marker:text-yellow">
                <li>
                    Stake your Primals in a region. Each region has its own
                    staking period, and longer ones pay a bigger bonus.
                </li>
                <li>
                    Every full day a Primal is staked earns{' '}
                    {fog(config.dailyRate)} FOG in your wallet, plus the bonus
                    of its region.
                </li>
                {config.boost && (
                    <li>
                        {config.boost.title}: every day of staking that ends
                        before{' '}
                        {new Date(config.boost.endsAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                        })}{' '}
                        earns x{config.boost.multiplier} FOG, bonuses
                        included. Unstake early and you lose it, like the
                        bonus.
                    </li>
                )}
                {config.quantityTiers.some((e) => e.bonus > 0) && (
                    <li>
                        The more Primals you have staking, the more each one
                        earns. This bonus adds to the region&apos;s:{' '}
                        {config.quantityTiers
                            .map((e, i) => ({
                                e,
                                rango: rangoEscalon(config.quantityTiers, i),
                            }))
                            .filter(({ e }) => e.bonus > 0)
                            .map(
                                ({ e, rango }) =>
                                    `${rango} Primals +${e.bonus}%`
                            )
                            .join(', ')}
                        .
                        {mio && mio.quantity.count > 0 && (
                            <span className="text-yellow">
                                {' '}
                                You have {mio.quantity.count} staking
                                {mio.quantity.bonus > 0
                                    ? `: +${mio.quantity.bonus}% each.`
                                    : '.'}
                            </span>
                        )}
                    </li>
                )}
                <li>{CONFIANZA}</li>
                <li>
                    When the period ends the Primal stops earning: come back and
                    restake it.
                </li>
                <li>
                    You can unstake early, but you keep only the base FOG: the
                    region and quantity bonuses are lost. Listing a Primal for
                    sale counts as unstaking.
                </li>
                <li>
                    Selling or transferring a Primal removes it from staking.
                    You keep all the FOG it already earned.
                </li>
                <li>Spend your FOG in the shop.</li>
            </ul>

            <h2 className="font-accent uppercase text-yellow text-2xl leading-none mt-2">
                Badges
            </h2>
            <p className="text-lightblue text-sm">
                Keep at least one Primal staking for{' '}
                {config.badges.join(', ').replace(/, (\d+)$/, ' or $1')} days in
                a row to earn a badge. You have {config.graceDays} days to
                restake between periods. Badges are just for show: they
                don&apos;t add FOG, and you keep them even if the streak ends.
            </p>
            {insignias && (
                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                        {config.badges.map((b) => {
                            const tiene = insignias.earned.includes(b);
                            return (
                                <span
                                    key={b}
                                    className={`h-7 inline-flex items-center rounded-full px-2.5 font-accent uppercase text-sm ${CENTRAR_ACCENT} ${
                                        tiene
                                            ? 'bg-yellow text-darkblue'
                                            : 'ring-1 ring-lightblue/30 text-lightblue/50'
                                    }`}
                                >
                                    {nombreInsignia(b)}
                                </span>
                            );
                        })}
                    </div>
                    <p className="text-lightblue/80 text-sm">
                        {insignias.streakDays > 0
                            ? `Your streak: ${insignias.streakDays} day${insignias.streakDays === 1 ? '' : 's'}.`
                            : 'No streak yet. Stake a Primal to start one.'}
                        {insignias.next &&
                            insignias.streakDays > 0 &&
                            ` ${insignias.next - insignias.streakDays} more for the ${nombreInsignia(insignias.next)} badge.`}
                        {insignias.graceUntil &&
                            ` Restake before ${new Date(insignias.graceUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to keep it.`}
                    </p>
                </div>
            )}
        </>
    );
}
