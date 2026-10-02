// Pantalla /forge/roll?tokenId=N: conservar traits, rollear y elegir. Misma
// grafica que el customizer. La logica vive en useForge.ts.
import { useEffect, useState } from 'react';
import { goTo, replaceWith, useSearchParam } from '@/lib/navigation';
import {
    useWalletSession,
    useNftOwnership,
} from '@/hooks/cultomizer/useWalletSession';
import { useForge, type FasePago } from './useForge';
import type { ForgeStatus } from './tipos';
import Acceso from './Acceso';
import Cargando from './Cargando';
import Odds from './Odds';
import Opcion from './Opcion';
import Confirmacion from './Confirmacion';
import Forjado from './Forjado';
import { card, tituloCard, botonClaro, botonAmarillo, input } from './estilos';
import {
    BACKEND_BASE_URL,
    LAYER_ORDER,
    imagenPublica,
    porcentaje,
    urlDeRoll,
} from './forge';
import { rarezaDe } from './rareza';

export default function Roll() {
    const tokenId = useSearchParam('tokenId') ?? '';
    // `?preview=forged` abre el popup del final sin rollear, para ajustar su
    // diseño. Solo en dev: en produccion el parametro no hace nada.
    const previewParam = useSearchParam('preview');
    const preview = import.meta.env.DEV && previewParam === 'forged';
    const valido = /^\d{1,10}$/.test(tokenId);

    const session = useWalletSession();
    const { state: ownership } = useNftOwnership(
        valido ? tokenId : null,
        session.token
    );
    const forge = useForge(tokenId, session.token);
    const { status, keep, busy, aviso, paidRolls, fase } = forge;
    const [otro, setOtro] = useState('');
    // Que se esta por confirmar: quedarse con una opcion, o descartar las dos.
    const [pregunta, setPregunta] = useState<
        { tipo: 'elegir'; index: number } | { tipo: 'descartar' } | null
    >(null);

    // Sin un numero valido en la URL no hay nada que mostrar.
    useEffect(() => {
        if (!valido) replaceWith('/forge/select');
    }, [valido]);
    if (!valido) return null;

    const puedeActuar = session.status === 'ready' && ownership === 'owner';
    const imagen = status?.localImage
        ? `${BACKEND_BASE_URL}${status.localImage}`
        : status?.image || imagenPublica(tokenId);

    return (
        <div className="w-full text-white flex flex-col gap-5 sm:gap-8">
            {/* Encabezado */}
            {/* Sin animaciones de entrada, como el customizer: es una
                herramienta y el contenido ya espera a los datos. Las
                opciones del roll si entran animadas: son el resultado. */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">
                        Forge: Primal #{tokenId}
                    </h1>
                    <p className="text-lightblue text-base sm:text-lg md:text-xl mt-3 sm:mt-4 max-w-5xl">
                        Keep up to 3 traits and roll the rest. You get two
                        results: keep one, or discard both and your Primal stays
                        as it is.
                    </p>
                    {status?.testMode && (
                        <p className="text-yellow/80 text-sm mt-2">
                            {status.payment.required
                                ? 'Test mode: payments are real, but changes stay on this server.'
                                : 'Test mode: rolls are free and changes stay on this server.'}
                        </p>
                    )}
                </div>
                <a href="/forge/select" className={`${botonAmarillo}`}>
                    My Primals
                </a>
            </div>

            {forge.loading && <Cargando texto="NFT Loading..." />}

            {forge.error && (
                <div className={`${card} max-w-md mx-auto text-center`}>
                    <div className="font-accent uppercase text-red text-lg mb-2">
                        Error
                    </div>
                    <div className="text-lightblue">{forge.error}</div>
                </div>
            )}

            {/* Las 1/1 no tienen traits por capas: no se pueden rollear */}
            {status && !status.eligible && (
                <div
                    className={`${card} max-w-md mx-auto flex flex-col items-center gap-4 text-center`}
                >
                    <img
                        src={imagenPublica(tokenId)}
                        alt=""
                        className="w-48 h-48 rounded-lg object-cover"
                    />
                    <div className="font-accent uppercase text-yellow text-xl">
                        One of one
                    </div>
                    <p className="text-lightblue">
                        This Primal is a unique piece and can&apos;t be changed
                        in the Forge.
                    </p>
                </div>
            )}

            {status && status.eligible && status.traits && (
                // Las mismas columnas que el customizer, para que las dos
                // pantallas se vean del mismo tamaño.
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2.85fr)] gap-5 sm:gap-8 items-start">
                    {/* Izquierda: el Primal como esta hoy */}
                    <div
                        className={`${card} flex flex-col gap-4 lg:self-start`}
                    >
                        <h3 className={`${tituloCard} text-center`}>Preview</h3>
                        <img
                            src={imagen}
                            alt={`Primal Cult #${tokenId}`}
                            className="mx-auto w-full max-w-100 lg:max-w-125 aspect-square rounded-lg object-cover"
                            style={{ imageRendering: 'pixelated' }}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            {/* Effect "Standart" lo tienen todos menos uno: no
                                dice nada y deja un casillero suelto. */}
                            {LAYER_ORDER.filter(
                                (category) =>
                                    !(
                                        category === 'Effect' &&
                                        status.traits![category] === 'Standart'
                                    )
                            ).map((category) => {
                                // Lo que no cambia con el roll: Effect, y lo
                                // que se eligio conservar.
                                const resaltado =
                                    !status.rollableCategories.includes(
                                        category
                                    ) || keep.includes(category);
                                const rareza = rarezaDe(
                                    status.collectionShare,
                                    category,
                                    status.traits![category]
                                );
                                return (
                                    <div
                                        key={category}
                                        className={`rounded-md bg-blue/40 px-3 py-1.5 leading-tight ring-1 ${resaltado ? 'ring-yellow/70' : 'ring-transparent'}`}
                                    >
                                        <div className="text-[10px] uppercase text-lightblue/60">
                                            {category}
                                        </div>
                                        <div
                                            className={`text-sm font-semibold truncate ${rareza?.color ?? 'text-lightblue'}`}
                                        >
                                            {status.traits![category] ?? '-'}
                                        </div>
                                        {rareza && (
                                            <div className="text-[10px] text-lightblue/60 truncate">
                                                {porcentaje(rareza.share)} have
                                                it ·{' '}
                                                <span className={rareza.color}>
                                                    {rareza.nombre}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Derecha: conservar y rollear, o elegir */}
                    <div className="flex flex-col gap-5 sm:gap-8">
                        {!status.pending ? (
                            <>
                                <div className={`${card} flex flex-col gap-4`}>
                                    <h3 className={tituloCard}>Keep traits</h3>
                                    <p className="text-lightblue/80 text-sm -mt-2">
                                        Optionally keep up to {status.maxKeep}.
                                        Everything else re-rolls. Effect never
                                        changes.
                                    </p>
                                    <div className="flex flex-wrap gap-2 sm:gap-3">
                                        {status.rollableCategories.map(
                                            (category) => {
                                                const activo =
                                                    keep.includes(category);
                                                const lleno =
                                                    keep.length >=
                                                        status.maxKeep &&
                                                    !activo;
                                                return (
                                                    <button
                                                        key={category}
                                                        type="button"
                                                        onClick={() =>
                                                            forge.alternarKeep(
                                                                category
                                                            )
                                                        }
                                                        disabled={lleno}
                                                        className={`grow shrink-0 basis-auto whitespace-nowrap font-accent uppercase text-sm text-darkblue rounded-md px-3 pb-1.5 pt-0.5 cursor-pointer active:scale-97 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${
                                                            activo
                                                                ? 'bg-yellow'
                                                                : 'bg-lightblue hover:bg-yellow'
                                                        }`}
                                                    >
                                                        {activo
                                                            ? 'Keeping '
                                                            : 'Keep '}
                                                        {category}
                                                    </button>
                                                );
                                            }
                                        )}
                                    </div>
                                    <p className="text-xs uppercase text-lightblue/70">
                                        Keeping{' '}
                                        <span className="font-bold text-lightblue">
                                            {keep.length}/{status.maxKeep}
                                        </span>
                                    </p>
                                    <Odds status={status} keep={keep} />
                                </div>

                                <div className={`${card} flex flex-col gap-4`}>
                                    <h3 className={tituloCard}>Roll</h3>
                                    <p className="text-lightblue/80 text-sm -mt-2">
                                        Will change:{' '}
                                        <span className="text-yellow">
                                            {status.rollableCategories
                                                .filter(
                                                    (c) => !keep.includes(c)
                                                )
                                                .join(', ')}
                                        </span>
                                    </p>
                                    <Acceso
                                        session={session}
                                        ownership={ownership}
                                    />
                                    {puedeActuar && (
                                        <button
                                            onClick={forge.rollear}
                                            disabled={
                                                busy !== null ||
                                                !status.available
                                            }
                                            className="self-start shrink-0 bg-yellow text-darkblue font-accent uppercase leading-normal! rounded-md px-3 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 sm:mt-3"
                                        >
                                            {textoBotonRoll(
                                                status,
                                                busy === 'roll',
                                                fase,
                                                paidRolls
                                            )}
                                        </button>
                                    )}
                                    {puedeActuar &&
                                        status.payment.required &&
                                        (fase === 'confirmando' ||
                                            fase === 'registrando') && (
                                            <p className="text-lightblue/60 text-xs">
                                                Waiting for ApeChain to confirm
                                                your payment. Don&apos;t close
                                                the page. If you do, your paid
                                                roll will be here when you come
                                                back.
                                            </p>
                                        )}
                                    {puedeActuar &&
                                        status.payment.required &&
                                        paidRolls > 0 &&
                                        busy === null && (
                                            <p className="text-yellow text-sm">
                                                You have a paid roll ready.
                                            </p>
                                        )}
                                    {!status.available && (
                                        <p className="text-lightblue/60 text-sm">
                                            The Forge is not open yet.
                                        </p>
                                    )}
                                    {aviso && <Mensaje {...aviso} />}
                                </div>
                            </>
                        ) : (
                            <div
                                className={`${card} flex flex-col gap-4 flex-1`}
                            >
                                <h3 className={tituloCard}>Pick one</h3>
                                <p className="text-lightblue/80 text-sm -mt-2">
                                    Keep one of these, or discard both and your
                                    Primal stays as it is.
                                </p>
                                <div data-anim-stagger="" className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                                    {status.pending.options.map(
                                        (option, index) => (
                                            <Opcion
                                                key={index}
                                                option={option}
                                                before={status.pending!.before}
                                                probabilities={
                                                    status.probabilities || {}
                                                }
                                                shares={status.collectionShare}
                                                puedeActuar={puedeActuar}
                                                aplicando={busy === 'choose'}
                                                deshabilitado={busy !== null}
                                                onElegir={() =>
                                                    setPregunta({
                                                        tipo: 'elegir',
                                                        index,
                                                    })
                                                }
                                            />
                                        )
                                    )}
                                </div>
                                {busy === 'choose' && (
                                    <p className="text-lightblue/60 text-xs">
                                        Building your new Primal. This takes a
                                        few seconds, don&apos;t close the page.
                                    </p>
                                )}
                                <Acceso
                                    session={session}
                                    ownership={ownership}
                                />
                                {puedeActuar && (
                                    <button
                                        onClick={() =>
                                            setPregunta({ tipo: 'descartar' })
                                        }
                                        disabled={busy !== null}
                                        className={`self-start text-sm bg-red text-lightblue font-accent uppercase rounded-md px-3 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red disabled:active:scale-100`}
                                    >
                                        {busy === 'cancel'
                                            ? 'Discarding...'
                                            : 'Discard both (no refund)'}
                                    </button>
                                )}
                                {aviso && <Mensaje {...aviso} />}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {pregunta?.tipo === 'elegir' && status?.pending && (
                <Confirmacion
                    titulo="Keep this option?"
                    textoConfirmar="Keep it"
                    onCancelar={() => setPregunta(null)}
                    onConfirmar={() => {
                        setPregunta(null);
                        forge.elegir(pregunta.index);
                    }}
                >
                    <p>Your Primal gets these new traits:</p>
                    <ul className="mt-2 flex flex-col gap-1">
                        {Object.entries(
                            status.pending.options[pregunta.index].changes
                        ).map(([category, value]) => (
                            <li
                                key={category}
                                className="flex justify-between gap-3"
                            >
                                <span className="text-lightblue/60 text-xs uppercase pt-0.5">
                                    {category}
                                </span>
                                <span>
                                    <span className="text-lightblue/40 line-through text-xs mr-1">
                                        {status.pending!.before[category]}
                                    </span>
                                    <span
                                        className={`font-semibold ${rarezaDe(status.collectionShare, category, value)?.color ?? 'text-yellow'}`}
                                    >
                                        {value}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-3 text-lightblue/70 text-sm">
                        There are no take backs.
                    </p>
                </Confirmacion>
            )}

            {(forge.forjado || (preview && status)) && (
                <Forjado
                    tokenId={tokenId}
                    imagen={imagen}
                    onCerrar={() => {
                        forge.cerrarForjado();
                        if (preview) replaceWith(urlDeRoll(tokenId));
                    }}
                />
            )}

            {pregunta?.tipo === 'descartar' && (
                <Confirmacion
                    titulo="Discard both?"
                    textoConfirmar="Discard both"
                    textoCancelar="Go back"
                    onCancelar={() => setPregunta(null)}
                    onConfirmar={() => {
                        setPregunta(null);
                        forge.descartar();
                    }}
                >
                    <p>Your Primal stays as it is. The roll is not refunded.</p>
                </Confirmacion>
            )}
        </div>
    );
}

function textoBotonRoll(
    status: ForgeStatus,
    rolando: boolean,
    fase: FasePago | null,
    paidRolls: number
) {
    if (fase === 'firmando') return 'Confirm in your wallet...';
    if (fase === 'confirmando' || fase === 'registrando')
        return 'Confirming payment...';
    if (rolando) return 'Rolling...';
    if (!status.payment.required)
        return status.testMode ? 'Roll (free, test mode)' : 'Roll';
    if (paidRolls > 0) return 'Roll (paid)';
    return `Pay ${status.payment.price} APE & roll`;
}

function Mensaje({ ok, texto }: { ok: boolean; texto: string }) {
    return (
        <p className={`text-sm ${ok ? 'text-yellow' : 'text-red-400'}`}>
            {texto}
        </p>
    );
}
