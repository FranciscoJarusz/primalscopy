// El popup despues de mandar Primals a entrenar: confirma que salio y deja
// twittearlo. La primera vez que la wallet stakea es una bienvenida, con
// rayos y confeti como el premio de una ruleta.
import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { miniaturaPrimal } from '@/lib/staking';

export type Stakeado = {
    tokenIds: string[];
    dias: number;
    zona: string | null;
    primera: boolean;
};

const CSS = `
@keyframes stake-rayos { to { rotate: 360deg } }
@keyframes stake-pop { 0% { scale: .4; opacity: 0 } 60% { scale: 1.1; opacity: 1 } 100% { scale: 1 } }
@keyframes stake-confeti {
  0% { translate: 0 0; rotate: 0deg; opacity: 1 }
  100% { translate: var(--dx) var(--dy); rotate: var(--giro); opacity: 0 }
}
.stake-rayos { animation: stake-rayos 14s linear infinite }
.stake-pop { animation: stake-pop .6s cubic-bezier(.2,.9,.3,1.3) both }
.stake-confeti { animation: stake-confeti 1.4s cubic-bezier(.15,.7,.35,1) both }
@media (prefers-reduced-motion: reduce) {
  .stake-rayos { animation: none }
  .stake-confeti { display: none }
}
`;

const MAX_MINIATURAS = 5;

export default function StakeCompartir({
    tokenIds,
    dias,
    zona,
    primera,
    onCerrar,
}: Stakeado & { onCerrar: () => void }) {
    useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
        window.addEventListener('keydown', alTeclado);
        return () => window.removeEventListener('keydown', alTeclado);
    }, [onCerrar]);

    const n = tokenIds.length;
    const primals = `${n} Primal${n === 1 ? '' : 's'}`;
    const texto = `Now staking and summoning FOG for ${dias} days with my ${primals}! Stake yours here: ${window.location.origin}/staking\n\n#CultNeverDies #PrimalCult`;
    const tweet = new URL('https://x.com/intent/tweet');
    tweet.searchParams.set('text', texto);

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
                    demora: `${Math.random() * 0.15}s`,
                    ancho: 6 + Math.random() * 6,
                };
            }),
        []
    );

    const visibles = tokenIds.slice(0, MAX_MINIATURAS);
    const resto = n - visibles.length;

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 transition-all duration-300 ease-out starting:opacity-0"
            onClick={onCerrar}
        >
            <style>{CSS}</style>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={primera ? 'Welcome to the Fog' : 'Staking started'}
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
                <h2 className="stake-pop font-accent uppercase text-yellow text-3xl sm:text-4xl">
                    {primera ? 'Welcome to the Fog!' : 'Staking started!'}
                </h2>

                <div className="relative grid place-items-center py-3 w-full">
                    {primera && (
                        <>
                            <div
                                className="stake-rayos pointer-events-none absolute size-96 rounded-full"
                                style={{
                                    background: 'repeating-conic-gradient(#7cf2c455 0deg 10deg, transparent 10deg 24deg)',
                                    maskImage: 'radial-gradient(circle, black 20%, transparent 68%)',
                                }}
                            />
                            <div className="pointer-events-none absolute inset-0 grid place-items-center">
                                {confeti.map((c, i) => (
                                    <i
                                        key={i}
                                        className="stake-confeti absolute rounded-xs"
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
                        </>
                    )}
                    <div className="stake-pop relative flex items-center justify-center" style={{ animationDelay: '.1s' }}>
                        {visibles.map((id, i) => (
                            <img
                                key={id}
                                src={miniaturaPrimal(id, 192)}
                                alt={`Primal #${id}`}
                                className={`size-20 sm:size-24 rounded-xl object-cover ring-2 ring-darkblue shadow-lg shadow-darkblue/50 bg-blue ${i > 0 ? '-ml-6 sm:-ml-8' : ''}`}
                                style={{ zIndex: visibles.length - i }}
                            />
                        ))}
                        {resto > 0 && (
                            <span className="-ml-6 sm:-ml-8 size-20 sm:size-24 rounded-xl ring-2 ring-darkblue bg-blue grid place-items-center font-accent text-yellow text-2xl leading-none pb-1.5">
                                +{resto}
                            </span>
                        )}
                    </div>
                </div>

                <p className="stake-pop text-lightblue text-base sm:text-lg" style={{ animationDelay: '.2s' }}>
                    {primals} {n === 1 ? 'is' : 'are'} training
                    {zona ? (
                        <>
                            {' '}in <span className="text-yellow">{zona}</span>
                        </>
                    ) : null}{' '}
                    for {dias} days.
                    {primera && ' Come back when the period ends to keep earning FOG.'}
                </p>

                <div className="stake-pop flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: '.3s' }}>
                    <a
                        href={tweet.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-yellow text-darkblue font-accent uppercase text-lg leading-normal! rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300"
                    >
                        Share on X
                    </a>
                    <button
                        onClick={onCerrar}
                        className="text-lightblue hover:text-yellow font-accent uppercase text-lg leading-normal! px-3 pb-1.5 cursor-pointer transition-all duration-300"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
