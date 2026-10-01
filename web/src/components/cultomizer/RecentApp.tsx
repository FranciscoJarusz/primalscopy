// Pantalla de "Recent Customizations" (isla de React).
//
// "Recent Customizations": las ultimas customizaciones que se publicaron
// on-chain, para ver que esta armando la comunidad.
//
// Es un feed de eventos y no un listado de tokens: si alguien actualizo el
// mismo primal tres veces, aparece tres veces, una por cada version que armo.
// Por eso la key de cada tarjeta es el id de la entrada y nunca el tokenId.
//
// Las miniaturas son JPEG del primer frame y no los GIF: diez GIF de 2000px en
// una misma pantalla son decenas de MB y la grilla tardaria una eternidad en
// aparecer.
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { scrollToTop } from '@/lib/lenis';
import { goTo, useSearchParams } from '@/lib/navigation';

interface RecentItem {
    id: string;
    tokenId: string;
    wallet: string | null;
    createdAt: string;
    thumbnailUrl: string;
}

// De a 50 por pagina, que es lo que devuelve el backend por defecto. El
// historial guarda hasta 1000, o sea 20 paginas.
const PER_PAGE = 50;

const BACKEND_URL =
    import.meta.env.PUBLIC_BACKEND_URL || 'http://localhost:3001/api';
const BACKEND_BASE_URL =
    import.meta.env.PUBLIC_BACKEND_BASE_URL || BACKEND_URL.replace(/\/api\/?$/, '');

// De donde saca las entradas el `?demo=N` de dev (ver mas abajo).
const DEMO_FEED_BASE_URL = 'https://primalscopy-production.up.railway.app';

// 0x9828...e5d6, que es como aparece en el mockup del cliente y como se muestra
// una wallet en todos lados.
function shortWallet(wallet: string | null): string {
    if (!wallet) return 'unknown';
    if (wallet.length <= 12) return wallet;
    return wallet.slice(0, 6) + '...' + wallet.slice(-4);
}

// El "hace cuanto" se calcula contra la hora del server y no contra la del
// visitante: con el reloj corrido, algo recien hecho se veria como "in 3 hours".
function timeAgo(createdAt: string, clockOffsetMs: number): string {
    const elapsed = Date.now() - clockOffsetMs - new Date(createdAt).getTime();
    const mins = Math.floor(elapsed / 60000);

    if (mins < 1) return 'just now';
    if (mins === 1) return '1 min ago';
    if (mins < 60) return mins + ' mins ago';

    const hours = Math.floor(mins / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return hours + ' hours ago';

    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day ago' : days + ' days ago';
}

function RecentCustomizationsContent() {
    const searchParams = useSearchParams();

    // Con que primal venia el usuario. El customizer lo manda en la URL; si se
    // llego aca de otra forma queda el ultimo que se estuvo mirando en esta
    // pestaña. Sin ninguno de los dos, volver al customizer pelado mostraria
    // "Token ID not specified", asi que en ese caso se va al selector.
    const [backTokenId, setBackTokenId] = useState<string | null>(
        searchParams.get('from')
    );

    useEffect(() => {
        if (backTokenId) return;
        try {
            setBackTokenId(sessionStorage.getItem('cultomizer:lastTokenId'));
        } catch {
            // Modo privado: se queda sin respaldo y vuelve al selector.
        }
    }, [backTokenId]);

    const backHref = backTokenId
        ? `/cultomizer/edit?tokenId=${backTokenId}`
        : '/cultomizer/select';

    // La pagina vive en la URL y no solo en el estado: asi el boton de atras
    // del navegador funciona y se puede compartir el link de una pagina.
    const currentPage = Math.max(1, Number(searchParams.get('page')) || 1);

    const [items, setItems] = useState<RecentItem[]>([]);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [total, setTotal] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    // Cuanto adelanta el reloj del visitante respecto del server.
    const [clockOffsetMs, setClockOffsetMs] = useState<number>(0);

    const load = useCallback(async (pageToLoad: number) => {
        setError(null);
        try {
            // Sin cache: la gracia de esta pantalla es mostrar lo ultimo.
            const response = await fetch(
                `${BACKEND_URL}/nft/recent-customizations?page=${pageToLoad}&perPage=${PER_PAGE}`,
                { cache: 'no-store' }
            );
            if (!response.ok) throw new Error('Error ' + response.status);
            const data = await response.json();

            setItems(Array.isArray(data.items) ? data.items : []);
            setTotalPages(Math.max(1, Number(data.pages) || 1));
            setTotal(Number(data.total) || 0);
            if (data.serverTime)
                setClockOffsetMs(
                    Date.now() - new Date(data.serverTime).getTime()
                );
        } catch {
            setError(
                'Could not load recent customizations. Try again in a moment.'
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        load(currentPage);
    }, [load, currentPage]);

    const goToPage = (destino: number) => {
        const acotada = Math.min(Math.max(1, destino), totalPages);
        if (acotada === currentPage) return;

        const params = new URLSearchParams();
        if (backTokenId) params.set('from', backTokenId);
        // La pagina 1 va sin parametro, para que la URL quede limpia.
        if (acotada > 1) params.set('page', String(acotada));
        const query = params.toString();

        goTo(query ? `/cultomizer/recent?${query}` : '/cultomizer/recent');
        // Cambiar de pagina deja la vista donde estaba, o sea al pie de la
        // grilla anterior. Sin esto, la pagina nueva arranca por la mitad.
        scrollToTop();
    };

    // Los "X mins ago" se quedarian congelados en lo que decian al abrir la
    // pagina; este tick los mantiene al dia sin volver a pedirle nada al server.
    const [, forceTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => forceTick((tick) => tick + 1), 60000);
        return () => clearInterval(timer);
    }, []);

    // `?demo=N` en dev llena la grilla con N entradas del feed de produccion,
    // para ver el layout con el feed local vacio. Son las customizaciones
    // reales con sus JPEG, repetidas si hacen falta mas: asi el demo muestra
    // lo mismo que la pantalla de verdad y no los GIF. Solo lee, no escribe.
    // En produccion no existe.
    const demo = import.meta.env.DEV
        ? Math.min(Number(searchParams.get('demo')) || 0, PER_PAGE)
        : 0;
    const [demoItems, setDemoItems] = useState<RecentItem[] | null>(null);
    useEffect(() => {
        if (!demo) return;
        fetch(`${DEMO_FEED_BASE_URL}/api/nft/recent-customizations?perPage=${PER_PAGE}`)
            .then((r) => r.json())
            .then((data) => {
                const reales: RecentItem[] = Array.isArray(data.items)
                    ? data.items
                    : [];
                if (!reales.length) return setDemoItems([]);
                setDemoItems(
                    Array.from({ length: demo }, (_, i) => {
                        const real = reales[i % reales.length];
                        return {
                            ...real,
                            id: real.id + '-' + i,
                            thumbnailUrl: DEMO_FEED_BASE_URL + real.thumbnailUrl,
                        };
                    })
                );
                if (data.serverTime)
                    setClockOffsetMs(
                        Date.now() - new Date(data.serverTime).getTime()
                    );
            })
            .catch(() => setDemoItems([]));
    }, [demo]);
    const visibles: RecentItem[] = demo > 0 ? (demoItems ?? []) : items;
    const cargando = demo > 0 ? demoItems === null : loading;
    const fallo = demo > 0 ? null : error;

    return (
        <main className="w-full text-white flex flex-col gap-5 sm:gap-8">
            <div data-anim="intro" className="flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="font-accent uppercase text-yellow text-4xl sm:text-6xl lg:text-7xl">
                        Recent customizations
                    </h1>
                    <p className="text-lightblue text-base sm:text-lg md:text-xl mt-3 sm:mt-4 max-w-5xl">
                        These are the latest artworks updated onchain, you can
                        take a look at different community customized Primals
                        and take inspiration for your next creation.
                    </p>
                </div>
                <button
                    onClick={() => goTo(backHref)}
                    className="self-start shrink-0 bg-yellow text-darkblue font-accent uppercase rounded-md px-3 pb-1.5 cursor-pointer hover:scale-102 active:scale-97 transition-all duration-300 sm:mt-3"
                >
                    {backTokenId ? 'Back to customizing' : 'Select your NFT'}
                </button>
            </div>

            {cargando && (
                <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow mx-auto mb-4"></div>
                    <div className="text-lightblue text-xl">Loading...</div>
                </div>
            )}

            {!cargando && fallo && (
                <div className="text-center py-16">
                    <div className="bg-darkblue rounded-2xl p-6 max-w-md mx-auto flex flex-col items-center gap-3 shadow-lg shadow-darkblue/50">
                        <div className="font-accent uppercase text-red text-lg">
                            Error
                        </div>
                        <div className="text-lightblue">{fallo}</div>
                        <button
                            onClick={() => {
                                setLoading(true);
                                load(currentPage);
                            }}
                            className="bg-lightblue text-darkblue font-accent uppercase rounded-md px-3 pb-1.5 cursor-pointer hover:bg-yellow active:scale-97 transition-all duration-300"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {!cargando && !fallo && visibles.length === 0 && (
                <div className="text-center py-16">
                    <div className="bg-darkblue rounded-2xl p-6 sm:p-8 max-w-md mx-auto shadow-lg shadow-darkblue/50">
                        <div className="font-accent uppercase text-yellow text-xl mb-2">
                            No customizations yet
                        </div>
                        <div className="text-lightblue/80">
                            Be the first one to update a Primal onchain.
                        </div>
                    </div>
                </div>
            )}

            {!cargando && !fallo && visibles.length > 0 && (
                <div data-anim-stagger="" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5 lg:gap-6">
                    {visibles.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                                goTo('/cultomizer/edit?tokenId=' + item.tokenId)
                            }
                            title={
                                'Open Primal #' +
                                item.tokenId +
                                ' in the Cultomizer'
                            }
                            className="group shadow-lg shadow-darkblue/50 bg-darkblue rounded-xl sm:rounded-2xl p-2 pb-3 sm:p-3 sm:pb-4 flex flex-col items-center gap-2 cursor-pointer outline-none ring-yellow hover:ring-2 focus-visible:ring-2 hover:-translate-y-1 active:scale-97 transition-all duration-300"
                        >
                            <img
                                src={
                                    item.thumbnailUrl.startsWith('http')
                                        ? item.thumbnailUrl
                                        : BACKEND_BASE_URL + item.thumbnailUrl
                                }
                                alt={'Primal Cult #' + item.tokenId}
                                loading="lazy"
                                className="w-full aspect-square object-cover rounded-lg bg-blue mb-1"
                            />
                            <h3 className="font-accent uppercase text-yellow text-sm sm:text-base leading-none text-center">
                                Primal Cult #{item.tokenId}
                            </h3>
                            <p className="text-xs text-lightblue/80 leading-none break-all">
                                Creator: {shortWallet(item.wallet)}
                            </p>
                            <p className="text-xs text-lightblue/60 leading-none">
                                {timeAgo(item.createdAt, clockOffsetMs)}
                            </p>
                        </button>
                    ))}
                </div>
            )}

            {/* Paginado. Aparece solo si hay mas de una pagina: con 30
          customizaciones en total, los botones no aportan nada. */}
            {!cargando && !fallo && demo === 0 && totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 font-accent uppercase text-sm text-lightblue">
                    <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="bg-lightblue text-darkblue rounded-md px-3 pb-1.5 cursor-pointer hover:bg-yellow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-lightblue transition-colors duration-200"
                    >
                        Previous
                    </button>

                    <span>
                        Page {currentPage} of {totalPages}
                        <span className="text-lightblue/50">
                            {' '}
                            · {total} customizations
                        </span>
                    </span>

                    <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="bg-lightblue text-darkblue rounded-md px-3 pb-1.5 cursor-pointer hover:bg-yellow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-lightblue transition-colors duration-200"
                    >
                        Next
                    </button>
                </div>
            )}
        </main>
    );
}

// El envoltorio de Suspense que habia aca existia solo porque el
// useSearchParams de Next lo exigia para poder prerenderizar. El equivalente
// propio lee la URL en un efecto y no suspende, asi que no hace falta.
export default RecentCustomizationsContent;
