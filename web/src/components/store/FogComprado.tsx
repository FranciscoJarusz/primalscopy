import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fog, ICONO_FOG } from '@/lib/staking';

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
                    Purchase complete!
                </h2>
                <img
                    src={ICONO_FOG}
                    alt=""
                    className="size-36 object-contain drop-shadow-xl animate-aparece"
                />
                <p className="font-accent text-yellow text-4xl leading-none pb-2">
                    +{fog(cantidad)} FOG
                </p>
                <p className="text-lightblue/80 text-sm sm:text-base -mt-2">
                    Added to your wallet. Spend it on keys, rerolls and more in
                    the Item shop.
                </p>
                <div className="flex flex-col-reverse min-[420px]:flex-row gap-3">
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
