// El cierre del Forge: aparece despues de quedarse con una opcion, con el
// Primal nuevo y dos salidas, verlo en OpenSea o contarlo en X.
import { useEffect, useRef } from 'react';
import { urlOpenSea } from './forge';

export default function Forjado({
    tokenId,
    imagen,
    onCerrar,
}: {
    tokenId: string;
    imagen: string;
    onCerrar: () => void;
}) {
    const cerrar = useRef(onCerrar);
    cerrar.current = onCerrar;

    useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => {
            if (e.key === 'Escape') cerrar.current();
        };
        window.addEventListener('keydown', alTeclado);
        return () => window.removeEventListener('keydown', alTeclado);
    }, []);

    // X no deja adjuntar la imagen desde un link: arma la tarjeta con la
    // ultima URL del texto. Va la de OpenSea, que muestra el Primal.
    const tweet = new URL('https://x.com/intent/tweet');
    tweet.searchParams.set(
        'text',
        `I just forged my Primal Cult #${tokenId} 🔥\n\nForge yours at primalcult.xyz/forge`
    );
    tweet.searchParams.set('url', urlOpenSea(tokenId));

    const boton =
        'whitespace-nowrap font-accent uppercase leading-normal! rounded-md px-4 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 outline-none focus-visible:ring-2';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={onCerrar}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="forjado-titulo"
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-lg bg-darkblue rounded-2xl p-5 sm:p-6 shadow-lg shadow-darkblue/50 ring-1 ring-lightblue/15 flex flex-col items-center gap-4 text-center"
            >
                <button
                    type="button"
                    onClick={onCerrar}
                    aria-label="Close"
                    className="absolute top-3 right-4 text-lightblue/60 hover:text-yellow text-2xl leading-none cursor-pointer transition-colors"
                >
                    ×
                </button>
                <h2
                    id="forjado-titulo"
                    className="font-accent uppercase text-yellow text-3xl sm:text-4xl"
                >
                    Done!
                </h2>
                <p className="text-lightblue text-base sm:text-lg -mt-2">
                    Your new Primal has been forged.
                </p>
                <img
                    src={imagen}
                    alt={`Primal Cult #${tokenId}`}
                    className="w-full max-w-72 aspect-square rounded-lg object-cover ring-2 ring-yellow/70"
                    style={{ imageRendering: 'pixelated' }}
                />
                <div className="font-accent uppercase text-lightblue text-lg">
                    Primal Cult #{tokenId}
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                    <a
                        href={urlOpenSea(tokenId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${boton} bg-lightblue text-darkblue hover:bg-yellow focus-visible:ring-yellow`}
                    >
                        Check on OpenSea
                    </a>
                    <a
                        href={tweet.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${boton} bg-yellow text-darkblue focus-visible:ring-lightblue`}
                    >
                        Tweet your creation
                    </a>
                </div>
                <p className="text-lightblue/50 text-xs">
                    OpenSea may take a few minutes to show the new look.
                </p>
            </div>
        </div>
    );
}
