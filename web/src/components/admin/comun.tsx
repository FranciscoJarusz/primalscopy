import { useApodos, walletCorta } from '@/lib/nicknames';
import { APECHAIN } from '@/lib/cultomizer/contracts';

export const campo =
    'w-full bg-lightblue text-darkblue placeholder-darkblue/50 font-medium text-base leading-normal! rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow';
export const etiqueta = 'flex flex-col gap-1 text-sm text-lightblue/80';
export const botonChico =
    'bg-lightblue text-darkblue font-accent uppercase text-sm rounded-md px-3 pb-1 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300 disabled:opacity-40';
export const botonGuardar =
    'bg-yellow text-darkblue font-accent uppercase rounded-md px-6 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 disabled:opacity-40';
export const panel =
    'flex flex-col gap-4 bg-darkblue rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-lg shadow-darkblue/50';
export const titulo = 'font-accent uppercase text-yellow text-2xl';
// Las listas que la usan llevan data-lenis-prevent: sin eso Lenis se queda con
// la rueda y no bajan.
export const lista = 'max-h-96 overflow-y-auto overscroll-contain pr-2';

export const fog = (n: number) => n.toLocaleString('en-US');
export const fecha = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

export function useQuien() {
    const apodos = useApodos();
    return (w: string) => {
        const link = (
            <a
                href={`${APECHAIN.explorador}/address/${w}`}
                target="_blank"
                rel="noopener noreferrer"
                title="View on ApeScan"
                className="hover:text-yellow underline-offset-4 hover:underline transition-all duration-300"
            >
                {walletCorta(w)}
            </a>
        );
        return apodos[w.toLowerCase()] ? (
            <>
                <b className="text-white font-semibold">{apodos[w.toLowerCase()]}</b>{' '}
                <span className="text-lightblue/60">· {link}</span>
            </>
        ) : (
            link
        );
    };
}
