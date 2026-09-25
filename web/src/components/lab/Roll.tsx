// Pantalla /lab/roll?tokenId=N: conservar traits, rollear y elegir. Misma
// grafica que el customizer. La logica vive en useLab.ts.
import { useEffect, useState } from 'react';
import { goTo, replaceWith, useSearchParam } from '@/lib/navigation';
import {
    useWalletSession,
    useNftOwnership,
} from '@/hooks/cultomizer/useWalletSession';
import { useLab } from './useLab';
import Acceso from './Acceso';
import Cargando from './Cargando';
import Odds from './Odds';
import Opcion from './Opcion';
import Confirmacion from './Confirmacion';
import { card, tituloCard, botonClaro, botonAmarillo, input } from './estilos';
import { BACKEND_BASE_URL, LAYER_ORDER, imagenPublica, urlDeRoll } from './lab';

export default function Roll() {
    const tokenId = useSearchParam('tokenId') ?? '';
    const valido = /^\d{1,10}$/.test(tokenId);

    const session = useWalletSession();
    const { state: ownership } = useNftOwnership(
        valido ? tokenId : null,
        session.token
    );
    const lab = useLab(tokenId, session.token);
    const { status, keep, busy, aviso } = lab;
    const [otro, setOtro] = useState('');
    // Que se esta por confirmar: quedarse con una opcion, o descartar las dos.
    const [pregunta, setPregunta] = useState<
        { tipo: 'elegir'; index: number } | { tipo: 'descartar' } | null
    >(null);

    // Sin un numero valido en la URL no hay nada que mostrar.
    useEffect(() => {
        if (!valido) replaceWith('/lab/select');
    }, [valido]);
    if (!valido) return null;

    const puedeActuar = session.status === 'ready' && ownership === 'owner';
    const imagen = status?.localImage
        ? `${BACKEND_BASE_URL}${status.localImage}`
        : status?.image || imagenPublica(tokenId);

    return (
        <div className="w-full text-white flex flex-col gap-5 sm:gap-8">
            {/* Encabezado */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">
                        Lab: Primal #{tokenId}
                    </h1>
                    <p className="text-lightblue text-base sm:text-lg md:text-xl mt-3 sm:mt-4 max-w-5xl">
                        Keep up to 3 traits and roll the rest. You get two
                        results: keep one, or discard both and your Primal stays
                        as it is.
                    </p>
                    {status?.testMode && (
                        <p className="text-yellow/80 text-sm mt-2">
                            Test mode: rolls are free and changes stay on this
                            server.
                        </p>
                    )}
                </div>
                <a href="/lab/select" className={`${botonAmarillo}`}>
                    My Primals
                </a>
            </div>

            {lab.loading && <Cargando texto="NFT Loading..." />}

            {lab.error && (
                <div className={`${card} max-w-md mx-auto text-center`}>
                    <div className="font-accent uppercase text-red text-lg mb-2">
                        Error
                    </div>
                    <div className="text-lightblue">{lab.error}</div>
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
                        in the Lab.
                    </p>
                </div>
            )}

            {status && status.eligible && status.traits && (
                // Un tercio para el Preview y dos para la derecha: asi cada
                // opcion de un roll sale del mismo tamaño que el Preview.
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-5 sm:gap-8">
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
                            {LAYER_ORDER.map((category) => {
                                const resaltado =
                                    !status.rollableCategories.includes(
                                        category
                                    ) || keep.includes(category);
                                return (
                                    <div
                                        key={category}
                                        className="rounded-md bg-blue/40 px-3 py-1.5 leading-tight"
                                    >
                                        <div className="text-[10px] uppercase text-lightblue/60">
                                            {category}
                                        </div>
                                        <div
                                            className={`text-sm font-semibold truncate ${resaltado ? 'text-yellow' : 'text-lightblue'}`}
                                        >
                                            {status.traits![category] ?? '-'}
                                        </div>
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
                                                            lab.alternarKeep(
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
                                            onClick={lab.rollear}
                                            disabled={
                                                busy !== null ||
                                                !status.available
                                            }
                                            className="self-start shrink-0 bg-yellow text-darkblue font-accent uppercase leading-normal! rounded-md px-3 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 sm:mt-3"
                                        >
                                            {busy === 'roll'
                                                ? 'Rolling...'
                                                : status.testMode
                                                  ? 'Roll (free, test mode)'
                                                  : 'Roll'}
                                        </button>
                                    )}
                                    {!status.available && (
                                        <p className="text-lightblue/60 text-sm">
                                            The Lab is not open yet.
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                                    {status.pending.options.map(
                                        (option, index) => (
                                            <Opcion
                                                key={index}
                                                option={option}
                                                before={status.pending!.before}
                                                probabilities={
                                                    status.probabilities || {}
                                                }
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
                                        className={`self-start text-sm ${botonClaro}`}
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
                        lab.elegir(pregunta.index);
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
                                    <span className="text-yellow font-semibold">
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

            {pregunta?.tipo === 'descartar' && (
                <Confirmacion
                    titulo="Discard both?"
                    textoConfirmar="Discard both"
                    textoCancelar="Go back"
                    onCancelar={() => setPregunta(null)}
                    onConfirmar={() => {
                        setPregunta(null);
                        lab.descartar();
                    }}
                >
                    <p>Your Primal stays as it is. The roll is not refunded.</p>
                </Confirmacion>
            )}
        </div>
    );
}

function Mensaje({ ok, texto }: { ok: boolean; texto: string }) {
    return (
        <p className={`text-sm ${ok ? 'text-yellow' : 'text-red-400'}`}>
            {texto}
        </p>
    );
}
