import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';

// Una grilla de 4x3 que pasa de a una pagina, como las carpetas del menu de
// Windows: la rueda o el dedo bajan una pagina entera y los puntos de la
// derecha dicen en cual se esta. Cada tarjeta mide `lado` de imagen mas
// `altoExtra` fijo abajo. Con `ajustarAlAlto`, en la compu las tarjetas se
// achican hasta que entren las tres filas en el alto del contenedor, que lo
// tiene que tener definido; si no, salen del ancho.
const COLUMNAS = 4;
const FILAS = 3;
const ESPACIO = 16;

export default function PaginasGrilla<T>({
    items,
    clave,
    render,
    altoExtra,
    inicial = 0,
    ajustarAlAlto = false,
    alSalir,
}: {
    items: T[];
    clave: (item: T) => string;
    render: (item: T, lado: number) => ReactNode;
    altoExtra: number;
    inicial?: number;
    ajustarAlAlto?: boolean;
    alSalir?: () => void;
}) {
    const marco = useRef<HTMLDivElement>(null);
    const caja = useRef<HTMLDivElement>(null);
    const [medidas, setMedidas] = useState({ ancho: 0, alto: 0, compu: false });
    const [pagina, setPagina] = useState(0);
    const ubicada = useRef(false);

    useEffect(() => {
        const el = marco.current;
        if (!el) return;
        const medir = () =>
            setMedidas({
                ancho: el.clientWidth,
                alto: el.clientHeight,
                compu: window.matchMedia('(min-width: 1024px)').matches,
            });
        medir();
        const observador = new ResizeObserver(medir);
        observador.observe(el);
        return () => observador.disconnect();
    }, []);

    const porPagina = COLUMNAS * FILAS;
    const paginas = Array.from(
        { length: Math.ceil(items.length / porPagina) },
        (_, i) => items.slice(i * porPagina, (i + 1) * porPagina)
    );
    const lado = Math.max(
        40,
        Math.floor(
            Math.min(
                (medidas.ancho - 8 - (COLUMNAS - 1) * ESPACIO) / COLUMNAS,
                ajustarAlAlto && medidas.compu
                    ? (medidas.alto - 8 - (FILAS - 1) * ESPACIO) / FILAS -
                          altoExtra
                    : Infinity
            )
        )
    );
    const altoPagina = FILAS * (lado + altoExtra) + (FILAS - 1) * ESPACIO;
    // Entre pagina y pagina queda un espacio vacio: al bajar no asoma nada de
    // la anterior.
    const paso = altoPagina + ESPACIO;

    useLayoutEffect(() => {
        const el = caja.current;
        if (!el || !medidas.ancho) return;
        const destino = ubicada.current
            ? Math.min(pagina, Math.max(0, paginas.length - 1))
            : Math.max(0, Math.floor(inicial / porPagina));
        ubicada.current = true;
        el.scrollTop = destino * paso;
        setPagina(destino);
    }, [paso]);

    const ir = (p: number) =>
        caja.current?.scrollTo({ top: p * paso, behavior: 'smooth' });

    // El padding deja lugar al borde de la tarjeta marcada, que el overflow
    // cortaria.
    return (
        <div
            ref={marco}
            className={`flex gap-3 sm:gap-4 min-w-0 ${ajustarAlAlto ? 'lg:flex-1 lg:min-h-0' : ''}`}
        >
            <div
                ref={caja}
                data-scroll-propio
                onPointerLeave={alSalir}
                onScroll={(e) =>
                    setPagina(Math.round(e.currentTarget.scrollTop / paso))
                }
                style={{ height: altoPagina + 8 }}
                className="flex-1 min-w-0 overflow-y-auto snap-y snap-mandatory scroll-pt-1 lg:overscroll-contain -m-1 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {paginas.map((grupo, i) => (
                    <div
                        key={i}
                        className="snap-start grid content-start"
                        style={{
                            height: altoPagina,
                            marginBottom: ESPACIO,
                            gap: ESPACIO,
                            gridTemplateColumns: `repeat(${COLUMNAS}, minmax(0, 1fr))`,
                        }}
                    >
                        {grupo.map((item) => (
                            <div key={clave(item)} className="min-w-0">
                                {render(item, lado)}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            {paginas.length > 1 && (
                <div className="flex flex-col justify-center gap-2.5">
                    {paginas.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            aria-label={`Page ${i + 1} of ${paginas.length}`}
                            aria-current={i === pagina || undefined}
                            onClick={() => ir(i)}
                            className={`size-2.5 rounded-full bg-yellow cursor-pointer transition-all duration-300 ${
                                i === pagina
                                    ? 'opacity-100 scale-125'
                                    : 'opacity-30 hover:opacity-70'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
