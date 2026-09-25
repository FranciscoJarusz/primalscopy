import { useEffect, useRef, type ReactNode } from 'react';
import { botonClaro } from './estilos';

export default function Confirmacion({
    titulo,
    children,
    textoConfirmar,
    textoCancelar = 'Cancel',
    onConfirmar,
    onCancelar,
}: {
    titulo: string;
    children: ReactNode;
    textoConfirmar: string;
    textoCancelar?: string;
    onConfirmar: () => void;
    onCancelar: () => void;
}) {
    const confirmar = useRef<HTMLButtonElement>(null);
    const cancelar = useRef(onCancelar);
    cancelar.current = onCancelar;

    useEffect(() => {
        confirmar.current?.focus();
        const alTeclado = (e: KeyboardEvent) => {
            if (e.key === 'Escape') cancelar.current();
        };
        window.addEventListener('keydown', alTeclado);
        return () => window.removeEventListener('keydown', alTeclado);
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={onCancelar}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirmacion-titulo"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-darkblue rounded-2xl p-5 sm:p-6 shadow-lg shadow-darkblue/50 ring-1 ring-lightblue/15 flex flex-col gap-4"
            >
                <h2
                    id="confirmacion-titulo"
                    className="font-accent uppercase text-yellow text-2xl"
                >
                    {titulo}
                </h2>
                <div className="text-lightblue text-sm sm:text-base">
                    {children}
                </div>
                <div className="flex flex-col-reverse min-[420px]:flex-row min-[420px]:justify-end gap-3 mt-1">
                    <button onClick={onCancelar} className={botonClaro}>
                        {textoCancelar}
                    </button>
                    <button
                        ref={confirmar}
                        onClick={onConfirmar}
                        className="bg-yellow text-darkblue font-accent uppercase leading-normal rounded-md px-4 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-lightblue"
                    >
                        {textoConfirmar}
                    </button>
                </div>
            </div>
        </div>
    );
}
