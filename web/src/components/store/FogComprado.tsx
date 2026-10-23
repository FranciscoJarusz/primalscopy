import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { fog, ICONO_FOG } from '@/lib/staking';

const CSS = `
@keyframes fog-rayos { to { rotate: 360deg } }
@keyframes fog-pop { 0% { scale: .4; opacity: 0 } 60% { scale: 1.1; opacity: 1 } 100% { scale: 1 } }
@keyframes fog-flota { 0%, 100% { translate: 0 0 } 50% { translate: 0 -6px } }
@keyframes fog-confeti {
  0% { translate: 0 0; rotate: 0deg; opacity: 1 }
  100% { translate: var(--dx) var(--dy); rotate: var(--giro); opacity: 0 }
}
.fog-rayos { animation: fog-rayos 14s linear infinite }
.fog-pop { animation: fog-pop .6s cubic-bezier(.2,.9,.3,1.3) both }
.fog-flota { animation: fog-flota 3s ease-in-out .7s infinite }
.fog-confeti { animation: fog-confeti 1.4s cubic-bezier(.15,.7,.35,1) both }
@media (prefers-reduced-motion: reduce) {
  .fog-rayos, .fog-flota { animation: none }
  .fog-confeti { display: none }
}
`;

export default function FogComprado({
    cantidad,
    onGastar,
    onCerrar,
}: {
    cantidad: number;
    onGastar: () => void;
    onCerrar: () => void;
}) {
    useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
        window.addEventListener('keydown', alTeclado);
        return () => window.removeEventListener('keydown', alTeclado);
    }, [onCerrar]);

    const confeti = useMemo(
        () =>
            Array.from({ length: 36 }, (_, i) => {
                const angulo = (i / 36) * Math.PI * 2 + Math.random() * 0.3;
                const lejos = 120 + Math.random() * 140;
                return {
                    dx: `${Math.cos(angulo) * lejos}px`,
                    dy: `${Math.sin(angulo) * lejos + 60}px`,
                    giro: `${Math.random() * 720 - 360}deg`,
                    color: ['#fdf468', '#7cf2c4', '#dfe8ff'][i % 3],
                    demora: `${0.15 + Math.random() * 0.15}s`,
                    ancho: 6 + Math.random() * 6,
                };
            }),
        []
    );

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 transition-all duration-300 ease-out starting:opacity-0"
            onClick={onCerrar}
        >
            <style>{CSS}</style>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Purchase complete"
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-md bg-darkblue rounded-2xl p-5 sm:p-6 shadow-lg shadow-darkblue/50 ring-1 ring-lightblue/15 flex flex-col items-center gap-4 text-center overflow-hidden transition-all duration-300 ease-out starting:opacity-0 starting:scale-95 starting:translate-y-4"
            >
                <button
                    type="button"
                    onClick={onCerrar}
                    aria-label="Close"
                    className="absolute top-3 right-4 z-10 text-lightblue/60 hover:text-yellow text-2xl leading-none cursor-pointer transition-all duration-300"
                >
                    ×
                </button>
                <h2 className="fog-pop font-accent uppercase text-yellow text-3xl sm:text-4xl">
                    Purchase complete!
                </h2>

                <div className="relative grid place-items-center py-2 w-full">
                    <div
                        className="fog-rayos pointer-events-none absolute size-96 rounded-full"
                        style={{
                            background: 'repeating-conic-gradient(#7cf2c455 0deg 10deg, transparent 10deg 24deg)',
                            maskImage: 'radial-gradient(circle, black 20%, transparent 68%)',
                        }}
                    />
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                        {confeti.map((c, i) => (
                            <i
                                key={i}
                                className="fog-confeti absolute rounded-xs"
                                style={
                                    {
                                        width: c.ancho,
                                        height: c.ancho * 0.45,
                                        background: c.color,
                                        animationDelay: c.demora,
                                        '--dx': c.dx,
                                        '--dy': c.dy,
                                        '--giro': c.giro,
                                    } as React.CSSProperties
                                }
                            />
                        ))}
                    </div>
                    <div className="fog-pop relative" style={{ animationDelay: '.1s' }}>
                        <img src={ICONO_FOG} alt="" className="fog-flota size-36 object-contain drop-shadow-xl" />
                    </div>
                </div>

                <p
                    className="fog-pop font-accent text-yellow text-4xl leading-none pb-2"
                    style={{ animationDelay: '.2s' }}
                >
                    +{fog(cantidad)} FOG
                </p>
                <p
                    className="fog-pop text-lightblue/80 text-sm sm:text-base -mt-2"
                    style={{ animationDelay: '.25s' }}
                >
                    Added to your wallet. Spend it on keys, rerolls and more in
                    the Item shop.
                </p>
                <div
                    className="fog-pop flex flex-col-reverse min-[420px]:flex-row gap-3"
                    style={{ animationDelay: '.3s' }}
                >
                    <button
                        onClick={onCerrar}
                        className="bg-lightblue text-darkblue font-accent uppercase text-lg leading-normal! rounded-md px-6 pb-1.5 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300"
                    >
                        Got it
                    </button>
                    <button
                        onClick={onGastar}
                        className="bg-yellow text-darkblue font-accent uppercase text-lg leading-normal! rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300"
                    >
                        Go to Item shop
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
