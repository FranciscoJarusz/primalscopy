// src/app/recent/page.tsx
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

"use client"

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

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

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001/api';
const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://localhost:3001';

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
    const router = useRouter();
    const searchParams = useSearchParams();

    // Con que primal venia el usuario. El customizer lo manda en la URL; si se
    // llego aca de otra forma queda el ultimo que se estuvo mirando en esta
    // pestaña. Sin ninguno de los dos, volver al customizer pelado mostraria
    // "Token ID not specified", asi que en ese caso se va al selector.
    const [backTokenId, setBackTokenId] = useState<string | null>(searchParams.get('from'));

    useEffect(() => {
        if (backTokenId) return;
        try {
            setBackTokenId(sessionStorage.getItem('cultomizer:lastTokenId'));
        } catch {
            // Modo privado: se queda sin respaldo y vuelve al selector.
        }
    }, [backTokenId]);

    const backHref = backTokenId ? `/customizer?tokenId=${backTokenId}` : '/selector-nft';

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
            if (data.serverTime) setClockOffsetMs(Date.now() - new Date(data.serverTime).getTime());
        } catch {
            setError('Could not load recent customizations. Try again in a moment.');
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

        router.push(query ? `/recent?${query}` : '/recent');
        // Cambiar de pagina deja la vista donde estaba, o sea al pie de la
        // grilla anterior. Sin esto, la pagina nueva arranca por la mitad.
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Los "X mins ago" se quedarian congelados en lo que decian al abrir la
    // pagina; este tick los mantiene al dia sin volver a pedirle nada al server.
    const [, forceTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => forceTick(tick => tick + 1), 60000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white px-4 py-6 sm:p-8">
            <div className="max-w-7xl mx-auto flex flex-col gap-8">
                <div>
                    <div className="flex flex-wrap items-center gap-4">
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                            Recent Customizations
                        </h1>
                        {/* Link y no boton: asi se ve a donde lleva al pasar el
                            mouse y se puede abrir en otra pestaña. */}
                        <Link
                            href={backHref}
                            className="rounded-xl bg-yellow-300 px-5 py-2 font-bold text-black transition-colors duration-200 hover:bg-yellow-200"
                        >
                            Go Back to Cultomizer
                        </Link>
                    </div>
                    <p className="text-blue-200 mt-2 max-w-3xl">
                        These are the latest artworks updated onchain, you can take a look at different
                        community customized Primals and take inspiration for your next creation.
                    </p>
                </div>

                <hr className="border-white/10" />

                {loading && (
                    <div className="text-center py-16">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <div className="text-blue-200 text-xl">Loading...</div>
                    </div>
                )}

                {!loading && error && (
                    <div className="text-center py-16">
                        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-6 max-w-md mx-auto">
                            <div className="text-red-400 text-lg mb-2">Error</div>
                            <div className="text-red-300 mb-4">{error}</div>
                            <button
                                onClick={() => { setLoading(true); load(currentPage); }}
                                className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg font-semibold transition-all duration-200"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                )}

                {!loading && !error && items.length === 0 && (
                    <div className="text-center py-16 text-blue-200">
                        <div className="text-xl mb-2">No customizations yet</div>
                        <div className="text-blue-300/70">Be the first one to update a Primal onchain.</div>
                    </div>
                )}

                {!loading && !error && items.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
                        {items.map(item => (
                            <button
                                key={item.id}
                                onClick={() => router.push('/customizer?tokenId=' + item.tokenId)}
                                title={'Open Primal #' + item.tokenId + ' in the Cultomizer'}
                                className="text-left bg-white/5 border border-white/10 rounded-xl p-3 transition-all duration-200 hover:border-blue-500/60 hover:bg-white/10"
                            >
                                <div className="relative">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={BACKEND_BASE_URL + item.thumbnailUrl}
                                        alt={'Primal Cult #' + item.tokenId}
                                        loading="lazy"
                                        className="w-full aspect-square object-cover rounded-lg bg-black/40"
                                    />
                                    <span className="absolute top-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-semibold">
                                        #{item.tokenId}
                                    </span>
                                </div>
                                <div className="mt-3 font-bold">Primal Cult #{item.tokenId}</div>
                                <div className="text-xs text-blue-200/80 mt-1 break-all">
                                    Creator: {shortWallet(item.wallet)}
                                </div>
                                <div className="text-xs text-blue-200/60">
                                    {timeAgo(item.createdAt, clockOffsetMs)}
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Paginado. Aparece solo si hay mas de una pagina: con 30
                    customizaciones en total, los botones no aportan nada. */}
                {!loading && !error && totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-center gap-3 pb-4">
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 font-semibold transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/5"
                        >
                            Previous
                        </button>

                        <span className="text-blue-200 text-sm px-2">
                            Page {currentPage} of {totalPages}
                            <span className="text-blue-200/50"> · {total} customizations</span>
                        </span>

                        <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 font-semibold transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/5"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// useSearchParams obliga a tener un limite de Suspense, igual que en el
// customizer: sin esto, el build de Next falla al prerenderizar la pagina.
export default function RecentCustomizationsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <div className="text-2xl text-blue-200">Loading...</div>
                </div>
            </div>
        }>
            <RecentCustomizationsContent />
        </Suspense>
    );
}
