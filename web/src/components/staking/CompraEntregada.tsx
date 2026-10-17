// El popup de un premio de la tienda que se entrega a mano (los APE): la
// compra ya quedo hecha y el admin lo manda despues. Mismo estilo que el
// "Purchase complete!" de las keys (Ruleta.tsx), pero sin ruleta.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { iconoPremio, type Premio } from '@/lib/staking';

export default function CompraEntregada({
    premio,
    onCerrar,
}: {
    premio: Premio;
    onCerrar: () => void;
}) {
    useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
        window.addEventListener('keydown', alTeclado);
        return () => window.removeEventListener('keydown', alTeclado);
    }, [onCerrar]);

    const icono = iconoPremio(premio);

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={onCerrar}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Purchase complete"
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-md bg-darkblue rounded-2xl p-5 sm:p-6 shadow-lg shadow-darkblue/50 ring-1 ring-lightblue/15 flex flex-col items-center gap-4 text-center"
            >
                <button
                    type="button"
                    onClick={onCerrar}
                    aria-label="Close"
                    className="absolute top-3 right-4 text-lightblue/60 hover:text-yellow text-2xl leading-none cursor-pointer transition-all duration-300"
                >
                    ×
                </button>
                <h2 className="font-accent uppercase text-yellow text-3xl sm:text-4xl">
                    Congratulations!
                </h2>
                <p className="text-lightblue text-base sm:text-lg -mt-2">
                    You got {premio.label}.
                </p>
                {icono && (
                    <img
                        src={icono}
                        alt=""
                        className="size-40 object-contain drop-shadow-xl animate-aparece"
                    />
                )}
                <p className="text-lightblue/80 text-sm sm:text-base">
                    It will be sent to your wallet within the next 24 hours.
                    You can follow it under <span className="text-yellow">Your prizes</span>.
                </p>
                <button
                    onClick={onCerrar}
                    className="bg-yellow text-darkblue font-accent uppercase text-lg leading-normal! rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300"
                >
                    Got it
                </button>
            </div>
        </div>,
        document.body
    );
}
