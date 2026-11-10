import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { CARTAS, RAREZAS, type CartaPack } from '@/lib/packs';
import { Frente } from './Carta';

const boton =
    'mw-titulo uppercase bg-mw-champagne text-black rounded-md px-6 py-2.25 tracking-wider cursor-pointer hover:bg-mw-mist hover:scale-102 active:scale-97 transition-all duration-300';
const botonSecundario =
    'mw-titulo uppercase border border-mw-champagne text-mw-champagne rounded-md px-6 py-2.25 tracking-wider cursor-pointer hover:bg-mw-champagne hover:text-black hover:scale-102 active:scale-97 transition-all duration-300';

function enlaceX(id: string, puntos: number) {
    const tweet = new URL('https://x.com/intent/tweet');
    tweet.searchParams.set(
        'text',
        `Ripped a Primal Cult x Mudwater pack: +${puntos} points. Rate my pull 🃏

${window.location.origin}/mudwater/pull/${id}

#CultNeverDies #PrimalCult @primal_cult`
    );
    return tweet.href;
}

function enlaceColeccion(compartir: string | null, premio: string | null) {
    const total = CARTAS.filter((c) => c.rareza !== 'chosen').length;
    const link = compartir
        ? `${window.location.origin}/mudwater/pull/${compartir}`
        : `${window.location.origin}/mudwater`;
    const tweet = new URL('https://x.com/intent/tweet');
    tweet.searchParams.set(
        'text',
        `Collection complete: I found all ${total} Primal Cult x Mudwater cards 🃏${premio ? `\nNow I'm in the raffle for ${premio}.` : ''}

${link}

#CultNeverDies #PrimalCult @primal_cult`
    );
    return tweet.href;
}

export function EtiquetaNueva({ className = '' }: { className?: string }) {
    return (
        <span
            className={`mw-etiqueta inline-flex items-center justify-center h-5 text-[10px] leading-none text-black bg-mw-champagne rounded-full px-2.5 pb-px shadow-[0_0_14px_rgb(174_163_93/0.6)] ${className}`}
        >
            New
        </span>
    );
}

export default function Resumen({
    cartas,
    nuevas = [],
    completo = false,
    premioColeccion = null,
    compartir,
    quedan,
    onFin,
}: {
    cartas: CartaPack[];
    nuevas?: boolean[];
    completo?: boolean;
    premioColeccion?: string | null;
    compartir: string | null;
    quedan: number;
    onFin: (otro: boolean) => void;
}) {
    const raiz = useRef<HTMLDivElement>(null);
    const contador = useRef<HTMLSpanElement>(null);
    const total = cartas.reduce((s, c) => s + RAREZAS[c.rareza].puntos, 0);

    useLayoutEffect(() => {
        const cuenta = { n: 0 };
        const anims = [
            gsap.from(raiz.current!.querySelectorAll('[data-carta]'), {
                y: 60,
                opacity: 0,
                rotationX: -40,
                stagger: 0.08,
                duration: 0.5,
                ease: 'back.out(1.5)',
            }),
            gsap.to(cuenta, {
                n: total,
                duration: 1.2,
                delay: 0.4,
                ease: 'power2.out',
                onUpdate: () => {
                    if (contador.current)
                        contador.current.textContent = String(
                            Math.round(cuenta.n)
                        );
                },
            }),
        ];
        return () => anims.forEach((a) => a.kill());
    }, []);

    return (
        <div ref={raiz} className="flex flex-col items-center gap-8">
            <div className="flex flex-wrap justify-center gap-3 sm:gap-5 w-[min(92vw,56rem)] perspective-[1000px]">
                {cartas.map((c, i) => (
                    <div
                        key={i}
                        data-carta
                        className="relative w-[calc((100%-1.5rem)/3)] sm:w-[calc((100%-5rem)/5)] aspect-1621/2250"
                    >
                        <Frente carta={c} />
                        {nuevas[i] && (
                            <EtiquetaNueva className="absolute -top-2 left-1/2 -translate-x-1/2 z-10" />
                        )}
                    </div>
                ))}
            </div>
            <p className="mw-titulo text-4xl sm:text-5xl mw-brass-texto">
                +<span ref={contador}>0</span> points
            </p>
            {completo && (
                <div className="flex flex-col items-center gap-1 text-center">
                    <p className="mw-titulo uppercase text-xl sm:text-2xl text-mw-champagne">
                        Collection complete: you found every card
                    </p>
                    {premioColeccion && (
                        <p className="text-lg text-mw-mist/80">
                            You're in the raffle for {premioColeccion}.
                        </p>
                    )}
                </div>
            )}
            {cartas.some((c) => c.rareza === 'chosen') && (
                <p className="mw-titulo uppercase text-xl sm:text-2xl text-[#ffe27a] text-center">
                    You pulled The Chosen: you're in the Mudwater pack raffle
                </p>
            )}
            <div className="flex flex-wrap justify-center gap-3">
                {quedan > 0 && (
                    <button
                        type="button"
                        onClick={() => onFin(true)}
                        className="mw-boton-brillo mw-titulo uppercase text-black rounded-md px-6 py-2.25 tracking-wider cursor-pointer hover:scale-105 active:scale-97 transition-all duration-300"
                    >
                        <span className="mw-boton-reflejo" aria-hidden="true" />
                        <span className="relative">Open next pack</span>
                    </button>
                )}
                {(compartir || completo) && (
                    <a
                        href={
                            completo
                                ? enlaceColeccion(compartir, premioColeccion)
                                : enlaceX(compartir!, total)
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${completo ? boton : botonSecundario} flex items-center gap-2`}
                    >
                        <span
                            aria-hidden="true"
                            className="size-[0.8em] shrink-0 bg-current"
                            style={{
                                mask: 'url(/icons/x.svg) center / contain no-repeat',
                            }}
                        />
                        {completo ? 'Share on X' : 'Share'}
                    </a>
                )}
                <button
                    type="button"
                    onClick={() => onFin(false)}
                    className={quedan > 0 || completo ? botonSecundario : boton}
                >
                    {quedan > 0 ? 'Back' : 'Done for today'}
                </button>
            </div>
        </div>
    );
}
