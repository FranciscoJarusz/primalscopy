// Pantalla /lab/select: elegir el Primal a rollear, como "Select your NFT".
import { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { goTo } from '@/lib/navigation';
import { useUserNFTs, type Nft } from '@/hooks/cultomizer/useUserNFTs';
import Cargando from './Cargando';
import { card, botonClaro, input } from './estilos';
import { imagenPublica, urlDeRoll } from './lab';

export default function Selector() {
    const { isConnected, status } = useAccount();
    const { nfts, isLoading, error, balance, refreshNfts } = useUserNFTs();
    const [busqueda, setBusqueda] = useState('');
    const [orden, setOrden] = useState<'id' | 'name'>('id');

    const visibles = useMemo(() => {
        const filtrados = busqueda
            ? nfts.filter(
                  (nft) =>
                      nft.tokenId.includes(busqueda) ||
                      nft.name?.toLowerCase().includes(busqueda.toLowerCase())
              )
            : nfts;
        return [...filtrados].sort((a, b) =>
            orden === 'id'
                ? Number(a.tokenId) - Number(b.tokenId)
                : (a.name || '').localeCompare(b.name || '')
        );
    }, [nfts, busqueda, orden]);

    // Un numero que no esta en la wallet igual se puede abrir: sirve para
    // mirar las chances de cualquier Primal, y el backend decide quien rollea.
    const abrirPorNumero =
        /^\d+$/.test(busqueda) && !nfts.some((n) => n.tokenId === busqueda);

    const conectando = status === 'connecting' || status === 'reconnecting';

    return (
        <main className="w-full text-white flex flex-col gap-6 sm:gap-8">
            <div>
                <h1 className="font-accent uppercase text-yellow text-5xl sm:text-7xl">
                    Lab
                </h1>
                <p className="text-lightblue text-base sm:text-lg md:text-xl mt-3 sm:mt-4 max-w-3xl">
                    Pick the Primal you want to roll. Keep up to 3 traits, roll
                    the rest and choose one of two results.
                </p>
            </div>

            {conectando && <Cargando texto="Connecting wallet..." />}

            {!isConnected && !conectando && (
                <div className={`${card} max-w-md`}>
                    <div className="font-accent uppercase text-yellow text-xl mb-2">
                        Connect your wallet
                    </div>
                    <p className="text-lightblue/80">
                        Use the button at the top to see your Primals.
                    </p>
                </div>
            )}

            {isConnected && (
                <div className={`${card} px-4 py-4 sm:px-5`}>
                    <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                        <form
                            className="flex flex-1 gap-3 sm:max-w-2xl"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (/^\d+$/.test(busqueda))
                                    goTo(urlDeRoll(busqueda));
                            }}
                        >
                            <input
                                type="text"
                                placeholder="Search by token ID or name..."
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                className={`flex-1 min-w-0 ${input}`}
                            />
                            {abrirPorNumero && (
                                <button
                                    type="submit"
                                    className={`shrink-0 ${botonClaro}`}
                                >
                                    Open #{busqueda}
                                </button>
                            )}
                        </form>
                        <div className="flex items-center justify-between gap-6 sm:ml-auto">
                            <div className="relative">
                                <select
                                    value={orden}
                                    onChange={(e) =>
                                        setOrden(
                                            e.target.value as 'id' | 'name'
                                        )
                                    }
                                    className="appearance-none bg-lightblue text-darkblue font-accent leading-tight rounded-md pl-3 pr-8 pt-1 pb-1.5 cursor-pointer focus:outline-none hover:bg-yellow transition-all duration-200"
                                >
                                    <option value="id">Sort by ID</option>
                                    <option value="name">Sort by Name</option>
                                </select>
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-darkblue"
                                >
                                    <path d="M5 8l5 5 5-5" />
                                </svg>
                            </div>
                            <div className="text-xs text-lightblue/80 whitespace-nowrap sm:min-w-28 sm:text-right">
                                {visibles.length} of {nfts.length} NFTs
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isConnected && isLoading && (
                <div className="flex items-center gap-3 rounded-2xl bg-darkblue px-4 py-3 shadow-lg shadow-darkblue/50">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow shrink-0"></div>
                    <span className="text-lightblue">
                        Detecting your NFTs...
                    </span>
                    <span className="text-lightblue/60 text-sm ml-auto whitespace-nowrap">
                        {balance} found
                    </span>
                </div>
            )}

            {isConnected && error && (
                <div
                    className={`${card} max-w-md mx-auto flex flex-col items-center gap-3 text-center`}
                >
                    <div className="font-accent uppercase text-red text-lg">
                        Error
                    </div>
                    <div className="text-lightblue">{error}</div>
                    <button onClick={refreshNfts} className={botonClaro}>
                        Try again
                    </button>
                </div>
            )}

            {isConnected && !isLoading && !error && nfts.length === 0 && (
                <div className={`${card} max-w-md mx-auto text-center`}>
                    <div className="font-accent uppercase text-yellow text-xl mb-2">
                        No NFTs found
                    </div>
                    <div className="text-lightblue/80">
                        This wallet has no Primals.
                    </div>
                </div>
            )}

            {isConnected && !isLoading && !error && visibles.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5 lg:gap-6">
                    {visibles.map((nft) => (
                        <TarjetaDePrimal key={nft.id} nft={nft} />
                    ))}
                </div>
            )}
        </main>
    );
}

function TarjetaDePrimal({ nft }: { nft: Nft }) {
    return (
        <a
            href={urlDeRoll(nft.tokenId)}
            className="shadow-lg shadow-darkblue/50 group bg-darkblue rounded-xl sm:rounded-2xl p-2 pb-3 sm:p-3 sm:pb-4 flex flex-col items-center gap-2 sm:gap-3 cursor-pointer outline-none ring-yellow hover:ring-2 focus-visible:ring-2 hover:-translate-y-1 active:scale-97 transition-all duration-300"
        >
            <div className="w-full aspect-square rounded-lg overflow-hidden bg-blue">
                <img
                    src={nft.imageUrl || imagenPublica(nft.tokenId)}
                    alt={nft.name || `Primal Cult #${nft.tokenId}`}
                    loading="lazy"
                    className="w-full h-full object-cover"
                />
            </div>
            <h3 className="font-accent uppercase text-yellow text-sm sm:text-base leading-none text-center">
                {nft.name || `Primal Cult #${nft.tokenId}`}
            </h3>
            <p className="text-xs text-lightblue/70 leading-none">
                Click to roll
            </p>
        </a>
    );
}
