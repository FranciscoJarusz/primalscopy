import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import type { CartaPack } from '@/lib/packs';
import { Dorso, Frente, TituloCarta } from './Carta';
import { EtiquetaNueva } from './Resumen';
import { sonar } from './sonidos';

const cara = 'absolute inset-0 [backface-visibility:hidden]';

export default function UpgradeHecho({
    carta,
    nueva,
    completo,
    premioColeccion,
    onCerrar,
}: {
    carta: CartaPack;
    nueva: boolean;
    completo: boolean;
    premioColeccion: string | null;
    onCerrar: () => void;
}) {
    const giro = useRef<HTMLDivElement>(null);
    const info = useRef<HTMLDivElement>(null);
    const frente = useRef<HTMLDivElement>(null);
    const dorso = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const html = document.documentElement;
        const antes = html.style.overflow;
        html.style.overflow = 'hidden';
        const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
        window.addEventListener('keydown', tecla);
        return () => {
            html.style.overflow = antes;
            window.removeEventListener('keydown', tecla);
        };
    }, [onCerrar]);

    useLayoutEffect(() => {
        const suave = matchMedia('(prefers-reduced-motion: reduce)').matches;
        gsap.set(info.current, { opacity: 0, y: 12 });
        gsap.set(frente.current, { autoAlpha: 0 });
        const tl = gsap.timeline();
        tl.fromTo(
            giro.current,
            { rotateY: 180, scale: 0.7, autoAlpha: 0 },
            { autoAlpha: 1, duration: 0.3 }
        )
            .to(giro.current, {
                rotateY: 90,
                scale: 0.85,
                duration: suave ? 0.01 : 0.35,
                delay: 0.35,
                ease: 'power2.in',
            })
            .set(frente.current, { autoAlpha: 1 })
            .set(dorso.current, { autoAlpha: 0 })
            .call(() => {
                sonar(`impacto-${carta.rareza}`);
                try {
                    navigator.vibrate?.(
                        carta.rareza === 'legendary' ? [40, 40, 70] : 30
                    );
                } catch {}
            })
            .to(giro.current, {
                rotateY: 0,
                scale: 1,
                duration: suave ? 0.01 : 0.6,
                ease: 'back.out(1.6)',
            })
            .to(info.current, { opacity: 1, y: 0, duration: 0.35 });
        return () => {
            tl.kill();
        };
    }, []);

    return createPortal(
        <div
            data-lenis-prevent
            className="mw-texto fixed inset-0 z-70 bg-black/90 backdrop-blur-sm text-mw-mist flex flex-col items-center justify-center gap-6 p-4 animate-aparece"
        >
            <div className="relative h-[min(56vh,38rem)] aspect-1621/2250 max-w-[80vw] perspective-[1400px]">
                <div
                    ref={giro}
                    className="relative w-full h-full transform-3d"
                >
                    <div ref={frente} className={cara}>
                        <Frente carta={carta} />
                    </div>
                    <div
                        ref={dorso}
                        className={`${cara} transform-[rotateY(180deg)]`}
                    >
                        <Dorso />
                    </div>
                </div>
            </div>
            <div ref={info} className="flex flex-col items-center gap-4 text-center">
                {nueva && <EtiquetaNueva />}
                <TituloCarta carta={carta} />
                <p className="mw-etiqueta text-xs text-mw-fog">
                    Upgraded · Added to your collection
                </p>
                {completo && (
                    <p className="text-mw-champagne text-lg max-w-md">
                        Collection complete!
                        {premioColeccion &&
                            ` You're in the raffle for ${premioColeccion}.`}
                    </p>
                )}
                <button
                    type="button"
                    onClick={onCerrar}
                    className="mw-titulo uppercase bg-mw-champagne text-black rounded-md px-6 py-2.25 tracking-wider cursor-pointer hover:bg-mw-mist hover:scale-102 active:scale-97 transition-all duration-300"
                >
                    Done
                </button>
            </div>
        </div>,
        document.body
    );
}
