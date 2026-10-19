// El panel de admin entero: una sola entrada con el token y, adentro, las
// pestañas de cada herramienta.
//
// Cambiar de pestaña no recarga la pagina: la seccion aparece con un fundido y
// la URL cambia igual (/admin/traits, /admin/staking...), asi un link directo
// o el boton de atras siguen llevando a la seccion correcta. Cada seccion se
// monta la primera vez que se abre y despues queda viva aunque se cambie de
// pestaña: volver es instantaneo y no se pierde lo que se estaba editando.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FiLogOut } from 'react-icons/fi';
import { ADMIN_SECCIONES, alRegalar } from '@/lib/admin';
import { AdminLogin, useAdminToken } from './Acceso';
import TraitsAdmin from './TraitsAdmin';
import NicknamesAdmin from './NicknamesAdmin';
import PromoAdmin from './PromoAdmin';
import StakingAdmin from './StakingAdmin';
import ShopAdmin from './ShopAdmin';

const PANELES: Record<string, (props: { token: string }) => ReactNode> = {
    traits: TraitsAdmin,
    nicknames: NicknamesAdmin,
    promo: PromoAdmin,
    staking: StakingAdmin,
    shop: ShopAdmin,
};

function seccionDeLaUrl() {
    const id = location.pathname.split('/')[2];
    return ADMIN_SECCIONES.some((s) => s.id === id) ? id : ADMIN_SECCIONES[0].id;
}

export default function AdminApp() {
    const acceso = useAdminToken();
    const [seccion, setSeccion] = useState(seccionDeLaUrl);
    const [abiertas, setAbiertas] = useState(() => new Set([seccion]));

    const mostrar = (id: string) => {
        setSeccion(id);
        setAbiertas((antes) => (antes.has(id) ? antes : new Set(antes).add(id)));
    };

    const ir = (id: string) => {
        if (id === seccion) return;
        const destino = ADMIN_SECCIONES.find((s) => s.id === id)!;
        history.pushState(null, '', destino.href);
        mostrar(id);
        window.scrollTo({ top: 0 });
    };

    const irRef = useRef(ir);
    irRef.current = ir;
    useEffect(() => alRegalar(() => irRef.current('promo')), []);

    // Atras y adelante del navegador.
    useEffect(() => {
        const alVolver = () => mostrar(seccionDeLaUrl());
        window.addEventListener('popstate', alVolver);
        return () => window.removeEventListener('popstate', alVolver);
    }, []);

    useEffect(() => {
        const nombre = ADMIN_SECCIONES.find((s) => s.id === seccion)?.nombre;
        document.title = `${nombre} - Admin - Primal Cult`;
    }, [seccion]);

    const salir = () => {
        acceso.salir();
        setAbiertas(new Set([seccion]));
    };

    if (acceso.restaurando) return null;
    if (!acceso.token) return <AdminLogin titulo="Admin" acceso={acceso} />;

    return (
        <div className="flex-1 flex flex-col gap-6 sm:gap-10">
            <nav
                className="flex flex-wrap items-center gap-2 font-accent uppercase"
                aria-label="Admin sections"
            >
                {ADMIN_SECCIONES.map((s) => (
                    <a
                        key={s.id}
                        href={s.href}
                        onClick={(e) => {
                            // Con Ctrl o el boton del medio, que abra otra pestaña.
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            ir(s.id);
                        }}
                        aria-current={s.id === seccion ? 'page' : undefined}
                        className={`rounded-md px-3 pb-1.5 leading-normal! transition-all duration-300 ${
                            s.id === seccion
                                ? 'bg-yellow text-darkblue'
                                : 'bg-darkblue text-lightblue hover:text-yellow'
                        }`}
                    >
                        {s.nombre}
                    </a>
                ))}
                <button
                    onClick={salir}
                    className="ml-auto flex items-center gap-2 rounded-md px-3 pb-1.5 leading-normal! uppercase text-lightblue hover:text-yellow cursor-pointer transition-all duration-300"
                >
                    <FiLogOut className="size-4 mt-1" aria-hidden="true" />
                    Log out
                </button>
            </nav>

            {ADMIN_SECCIONES.filter((s) => abiertas.has(s.id)).map((s) => {
                const Panel = PANELES[s.id];
                return (
                    <Seccion key={s.id} visible={s.id === seccion}>
                        <Panel token={acceso.token} />
                    </Seccion>
                );
            })}
        </div>
    );
}

// Una seccion que entra con un fundido cada vez que se muestra.
function Seccion({ visible, children }: { visible: boolean; children: ReactNode }) {
    const [entrando, setEntrando] = useState(true);

    useEffect(() => {
        if (!visible) return;
        setEntrando(true);
        // Dos cuadros: el primero pinta la seccion transparente, el segundo
        // arranca la transicion.
        let segundo = 0;
        const primero = requestAnimationFrame(() => {
            segundo = requestAnimationFrame(() => setEntrando(false));
        });
        return () => {
            cancelAnimationFrame(primero);
            cancelAnimationFrame(segundo);
        };
    }, [visible]);

    return (
        <div
            hidden={!visible}
            className={`flex-1 flex flex-col transition-all duration-300 ${
                entrando ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
            }`}
        >
            {children}
        </div>
    );
}
