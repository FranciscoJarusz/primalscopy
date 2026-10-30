import { useState, type ReactNode } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { useApodos, walletCorta } from '@/lib/nicknames';
import { APECHAIN } from '@/lib/cultomizer/contracts';
import { BACKEND_URL } from '@/lib/backend';

// Cambia la imagen de un trait sin cambiarle el nombre: los drops y las
// customizaciones guardadas siguen apuntando a la misma URL.
export async function cambiarImagenTrait(
    token: string,
    url: string,
    archivo: File
) {
    const [, , , category, directory, file] = url.split('/');
    const form = new FormData();
    form.append('category', category);
    form.append('directory', directory);
    form.append('replace', file);
    form.append('file', archivo);
    const r = await fetch(`${BACKEND_URL}/admin/traits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) throw new Error(d?.error || "Couldn't reach the server.");
}

export const extensionDe = (url: string) =>
    url.slice(url.lastIndexOf('.')).toLowerCase();

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
// Los dos botones de elegir: `pestana` sobre el fondo de la pagina (como el
// menu del admin) y `opcion` adentro de un panel.
export const pestana = (activa: boolean) =>
    `rounded-md px-3 pb-1.5 leading-normal! font-accent uppercase cursor-pointer active:scale-97 transition-all duration-300 ${
        activa ? 'bg-yellow text-darkblue' : 'bg-darkblue text-lightblue hover:text-yellow'
    }`;
export const opcion = (activa: boolean) =>
    `rounded-md px-3 pb-1 font-accent uppercase text-sm cursor-pointer active:scale-97 transition-all duration-300 ${
        activa ? 'bg-yellow text-darkblue' : 'bg-blue text-lightblue hover:text-yellow'
    }`;
// Las listas que la usan llevan data-scroll-propio: sin eso Lenis se queda con
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

// Sub-pestañas: se ve una seccion por vez. Las otras se ocultan por su id y no
// se desmontan, asi no se pierde lo que se estaba editando.
export function Indice({ secciones }: { secciones: { id: string; nombre: string }[] }) {
    const [activa, setActiva] = useState(secciones[0]?.id);
    const ocultas = secciones.filter((s) => s.id !== activa).map((s) => `#${s.id}`);
    return (
        <nav aria-label="Sections" className="flex flex-wrap gap-2">
            {ocultas.length > 0 && <style>{`${ocultas.join(',')}{display:none!important}`}</style>}
            {secciones.map((s) => (
                <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiva(s.id)}
                    aria-pressed={activa === s.id}
                    className={pestana(activa === s.id)}
                >
                    {s.nombre}
                </button>
            ))}
        </nav>
    );
}

// Una lista larga que arranca cerrada: el titulo y el resumen se ven siempre,
// y abierta conserva su propio scroll (ver `lista`).
export function Desplegable({
    nombre,
    resumen,
    grande = false,
    children,
}: {
    nombre: string;
    resumen?: ReactNode;
    grande?: boolean;
    children: ReactNode;
}) {
    const [abierto, setAbierto] = useState(false);
    return (
        <div className="flex flex-col">
            <button
                type="button"
                onClick={() => setAbierto((a) => !a)}
                aria-expanded={abierto}
                className="group flex items-center justify-between gap-3 text-left cursor-pointer"
            >
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                        className={
                            grande
                                ? titulo
                                : 'font-accent uppercase text-yellow text-xl leading-none pb-1'
                        }
                    >
                        {nombre}
                    </span>
                    {resumen && <span className="text-lightblue/70 text-sm">{resumen}</span>}
                </span>
                <FiChevronDown
                    aria-hidden="true"
                    className={`w-5 h-5 shrink-0 text-lightblue group-hover:text-yellow transition-all duration-300 ${abierto ? 'rotate-180' : ''}`}
                />
            </button>
            <div
                className={`grid transition-all duration-300 ease-out ${abierto ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'}`}
            >
                <div className="min-h-0 overflow-hidden" inert={!abierto}>
                    {children}
                </div>
            </div>
        </div>
    );
}
