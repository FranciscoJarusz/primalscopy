import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { RAREZAS, type CartaPack } from '@/lib/packs';
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

export default function Resumen({
    cartas,
    compartir,
    quedan,
    onFin,
}: {
    cartas: CartaPack[];
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
                        className="w-[calc((100%-1.5rem)/3)] sm:w-[calc((100%-5rem)/5)] aspect-1621/2250"
                    >
                        <Frente carta={c} />
                    </div>
                ))}
            </div>
            <p className="mw-titulo text-4xl sm:text-5xl mw-brass-texto">
                +<span ref={contador}>0</span> points
            </p>
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
                {compartir && (
                    <a
                        href={enlaceX(compartir, total)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${botonSecundario} flex items-center gap-2`}
                    >
                        <span
                            aria-hidden="true"
                            className="size-[0.8em] shrink-0 bg-current"
                            style={{
                                mask: 'url(/icons/x.svg) center / contain no-repeat',
                            }}
                        />
                        Share
                    </a>
                )}
                <button
                    type="button"
                    onClick={() => onFin(false)}
                    className={quedan > 0 ? botonSecundario : boton}
                >
                    {quedan > 0 ? 'Back' : 'Done for today'}
                </button>
            </div>
        </div>
    );
}
