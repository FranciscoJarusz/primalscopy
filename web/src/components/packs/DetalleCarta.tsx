import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { CartaPack } from '@/lib/packs';
import { Frente, PastillaCarta, TituloCarta } from './Carta';

export default function DetalleCarta({
    carta,
    cantidad,
    onCerrar,
}: {
    carta: CartaPack;
    cantidad: number;
    onCerrar: () => void;
}) {
    useEffect(() => {
        const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [onCerrar]);

    return createPortal(
        <div
            onClick={onCerrar}
            data-lenis-prevent
            className="mw-texto fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center gap-6 p-4 animate-aparece cursor-pointer"
        >
            <div className="h-[min(68vh,44rem)] aspect-[1621/2250] max-w-[90vw]">
                <Frente carta={carta} />
            </div>
            <TituloCarta carta={carta} />
            <div className="flex items-center gap-4">
                <PastillaCarta carta={carta} />
                <span className="mw-etiqueta text-xs text-mw-fog">
                    {carta.categoria} · Owned ×{cantidad}
                </span>
            </div>
            <button
                type="button"
                onClick={onCerrar}
                aria-label="Close"
                className="absolute top-5 right-5 mw-etiqueta text-xs text-mw-champagne cursor-pointer hover:text-mw-mist transition-all duration-300"
            >
                Close
            </button>
        </div>,
        document.body
    );
}
